#!/usr/bin/env node
/**
 * build-embeddings.mjs — ingest courses/<slug>/sources/ and bank/ into a local vector index.
 *
 * Usage:
 *   node scripts/build-embeddings.mjs <slug>           embed course
 *   node scripts/build-embeddings.mjs <slug> --model <id>
 *   node scripts/build-embeddings.mjs --warmup         download model, no slug needed
 *   node scripts/build-embeddings.mjs --help
 *
 * Runtime guard: if @huggingface/transformers is not installed, prints guidance and exits 0.
 * Never hard-fails on missing/stale _index.md — warns and falls back to untagged chunks.
 *
 * Exit codes:
 *   0 — success (also: runtime missing, --warmup)
 *   1 — usage error
 *   2 — IO error (course not found, unreadable files)
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = resolve(__dirname, '..');

const DEFAULT_MODEL   = 'Xenova/all-MiniLM-L6-v2';
const CACHE_DIR       = join(REPO_ROOT, '.cache', 'transformers');
const CHUNK_MAX_CHARS = 1500;

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { slug: null, warmup: false, help: false, model: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--warmup')                  out.warmup = true;
    else if (a === '--help' || a === '-h') out.help   = true;
    else if (a === '--model')              out.model  = argv[++i];
    else if (!a.startsWith('--'))          { if (!out.slug) out.slug = a; }
    else                                   out.error  = `unknown argument: ${a}`;
  }
  return out;
}

function usage() {
  return [
    'Usage: node scripts/build-embeddings.mjs <slug> [--model <id>]',
    '       node scripts/build-embeddings.mjs --warmup',
    '',
    'Embeds courses/<slug>/sources/ and bank/ into courses/<slug>/data/embeddings.ndjson.',
    'Requires @huggingface/transformers — run `npm run setup:retrieval` first.',
    '',
    'Options:',
    '  --model <id>   Override model (default: Xenova/all-MiniLM-L6-v2)',
    '  --warmup       Download model to local cache without embedding a course',
    '  --help         Show this message',
  ].join('\n');
}

// ─── Runtime guard ────────────────────────────────────────────────────────────

async function tryImportTransformers() {
  try { return await import('@huggingface/transformers'); }
  catch { return null; }
}

// ─── Config ───────────────────────────────────────────────────────────────────

async function loadConfig(courseDir) {
  try {
    return JSON.parse(await readFile(join(courseDir, 'data', 'retrieval-config.json'), 'utf8'));
  } catch { return {}; }
}

// ─── State (domain lookup) ────────────────────────────────────────────────────

async function loadState(courseDir) {
  try {
    return JSON.parse(await readFile(join(courseDir, 'data', 'state.json'), 'utf8'));
  } catch { return null; }
}

function buildTsDomainMap(state) {
  const map = new Map();
  for (const domain of state?.domains || []) {
    for (const ts of domain.taskStatements || []) {
      map.set(ts, domain.id);
    }
  }
  return map;
}

// ─── _index.md front-matter ───────────────────────────────────────────────────

function parseFrontMatter(text) {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const endIdx = lines.indexOf('---', 1);
  if (endIdx < 0) return null;
  const block = lines.slice(1, endIdx);
  const result = { indexed_at: null, indexed_files: [] };
  const atM = block.join('\n').match(/^indexed_at:\s*["']?([^"'\n]+)["']?/m);
  if (atM) result.indexed_at = atM[1].trim();
  let cur = null;
  for (const line of block) {
    const pm = line.match(/^\s+-\s+path:\s*["']?([^"'\n]+)["']?/);
    const mm = line.match(/^\s+mtime:\s*["']?([^"'\n]+)["']?/);
    if (pm) { cur = { path: pm[1].trim() }; result.indexed_files.push(cur); }
    else if (mm && cur) cur.mtime = mm[1].trim();
  }
  return result;
}

// ─── _index.md body: task-statement → line-range mapping ─────────────────────

// Returns Map<taskStatementId, Array<{file: relToCourseRoot, start, end}>>
function parseIndexBody(text) {
  const map = new Map();
  const lines = text.split('\n');
  let bodyStart = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end >= 0) bodyStart = end + 1;
  }

  let currentTs = null;
  // Task statement heading: ## D1-T1.1 — Some name  (em-dash, en-dash, or hyphen)
  const tsHeadRe = /^##\s+([A-Za-z0-9][A-Za-z0-9_.-]*)\s+[—–-]/;
  // Line-range bullet: - `sources/file.md` L10–50 — description
  const rangeRe  = /^\s*[-*]\s+`([^`]+)`\s+L(\d+)[–\-—](\d+)/;

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      const hm = line.match(tsHeadRe);
      currentTs = hm ? hm[1] : null;
      if (currentTs && !map.has(currentTs)) map.set(currentTs, []);
      continue;
    }
    if (!currentTs) continue;
    const rm = line.match(rangeRe);
    if (rm) {
      map.get(currentTs).push({
        file:  rm[1],
        start: parseInt(rm[2], 10),
        end:   parseInt(rm[3], 10),
      });
    }
  }
  return map;
}

// Find taskStatements for a source chunk by line-range overlap
function findSourceTags(indexMap, relPath, lineStart, lineEnd) {
  const tags = [];
  for (const [tsId, entries] of indexMap) {
    for (const e of entries) {
      if (e.file === relPath && lineStart <= e.end && lineEnd >= e.start) {
        if (!tags.includes(tsId)) tags.push(tsId);
        break;
      }
    }
  }
  return tags;
}

// ─── File walking ─────────────────────────────────────────────────────────────

async function walkMarkdown(dir) {
  const results = [];
  async function recurse(d) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const full = join(d, e.name);
      if (e.isDirectory())                                 await recurse(full);
      else if (e.isFile() && extname(e.name) === '.md')   results.push(full);
    }
  }
  if (existsSync(dir)) await recurse(dir);
  return results;
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

function chunkMarkdown(text) {
  const rawLines = text.split('\n');
  const sections = [];
  let curHeading = '(intro)';
  let curStart   = 1;
  let curLines   = [];

  const flush = (endLine) => {
    const t = curLines.join('\n').trim();
    if (t) sections.push({ heading: curHeading, start: curStart, end: endLine, text: t });
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line    = rawLines[i];
    const lineNum = i + 1;
    if (/^#{1,3} /.test(line)) {
      flush(lineNum - 1);
      curHeading = line.replace(/^#+\s*/, '').trim();
      curStart   = lineNum;
      curLines   = [line];
    } else {
      curLines.push(line);
    }
  }
  flush(rawLines.length);

  // Sub-split sections that exceed CHUNK_MAX_CHARS at paragraph boundaries
  const chunks = [];
  for (const sec of sections) {
    if (sec.text.length <= CHUNK_MAX_CHARS) { chunks.push(sec); continue; }
    const paragraphs = sec.text.split(/\n{2,}/);
    let acc      = '';
    let accStart = sec.start;
    let linePos  = sec.start;
    for (const para of paragraphs) {
      if (acc && acc.length + para.length + 2 > CHUNK_MAX_CHARS) {
        chunks.push({ heading: sec.heading, start: accStart, end: linePos - 1, text: acc.trim() });
        acc      = para;
        accStart = linePos;
      } else {
        acc = acc ? acc + '\n\n' + para : para;
      }
      linePos += para.split('\n').length + 1;
    }
    if (acc.trim()) chunks.push({ heading: sec.heading, start: accStart, end: sec.end, text: acc.trim() });
  }
  return chunks;
}

// Extract domain ID from bank question heading, e.g. "Q-001 [domain: D1]" → "D1"
function extractBankDomain(heading) {
  const m = heading.match(/\[domain:\s*([^\]]+)\]/i);
  return m ? m[1].trim() : null;
}

// ─── Incremental manifest ─────────────────────────────────────────────────────

async function loadManifest(dataDir) {
  try {
    return JSON.parse(await readFile(join(dataDir, '.embeddings-manifest.json'), 'utf8'));
  } catch { return {}; }
}

async function saveManifest(dataDir, manifest) {
  await writeFile(join(dataDir, '.embeddings-manifest.json'), JSON.stringify(manifest, null, 2));
}

function fileHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

// ─── Load existing NDJSON records ─────────────────────────────────────────────

async function loadExistingRecords(dataDir) {
  const byPath = new Map();
  try {
    const text = await readFile(join(dataDir, 'embeddings.ndjson'), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (!byPath.has(rec.path)) byPath.set(rec.path, []);
        byPath.get(rec.path).push(rec);
      } catch {}
    }
  } catch {}
  return byPath;
}

// ─── Embedding pipeline ───────────────────────────────────────────────────────

async function initPipeline(transformers, modelName) {
  const { pipeline, env } = transformers;
  env.cacheDir = CACHE_DIR;
  const embedder = await pipeline('feature-extraction', modelName, { device: 'cpu' });
  env.allowRemoteModels = false; // offline after first load
  return embedder;
}

function extractVector(output) {
  // Handles @huggingface/transformers v2 and v3 output shapes after mean pooling
  if (output?.data instanceof Float32Array) return Array.from(output.data);
  if (Array.isArray(output?.data))          return output.data;
  if (typeof output?.tolist === 'function') {
    const list = output.tolist();
    return Array.isArray(list[0]) ? list[0] : list;
  }
  if (output?.[0]?.data) return Array.from(output[0].data);
  throw new Error('cannot extract vector from pipeline output — unexpected shape');
}

async function embedText(embedder, text) {
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return extractVector(output);
}

// ─── Warmup ───────────────────────────────────────────────────────────────────

async function warmup(transformers, modelName) {
  console.error(`build-embeddings: warming up model ${modelName} (first run downloads ~23 MB to ${CACHE_DIR})`);
  const embedder = await initPipeline(transformers, modelName);
  await embedText(embedder, 'warmup');
  console.error('build-embeddings: model ready');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help)  { console.log(usage()); process.exit(0); }
  if (args.error) { console.error(`build-embeddings: ${args.error}\n${usage()}`); process.exit(1); }

  const transformers = await tryImportTransformers();
  if (!transformers) {
    console.error('build-embeddings: @huggingface/transformers not installed — run `npm run setup:retrieval` to enable vector mode');
    process.exit(0);
  }

  if (args.warmup) {
    await warmup(transformers, args.model || DEFAULT_MODEL);
    process.exit(0);
  }

  if (!args.slug) {
    console.error(`build-embeddings: slug required\n${usage()}`);
    process.exit(1);
  }

  const courseDir  = join(REPO_ROOT, 'courses', args.slug);
  const sourcesDir = join(courseDir, 'sources');
  const bankDir    = join(courseDir, 'bank');
  const dataDir    = join(courseDir, 'data');

  if (!existsSync(courseDir)) {
    console.error(`build-embeddings: course not found: courses/${args.slug}`);
    process.exit(2);
  }

  const config       = await loadConfig(courseDir);
  const resolvedModel = args.model || config.model || DEFAULT_MODEL;
  const state        = await loadState(courseDir);
  const tsDomainMap  = buildTsDomainMap(state);

  // ── Staleness guard ──────────────────────────────────────────────────────────
  const indexPath = join(sourcesDir, '_index.md');
  let indexMap       = new Map();
  let indexAvailable = false;

  if (!existsSync(indexPath)) {
    console.error('build-embeddings: sources/_index.md not found — run /index-sources first (proceeding with untagged chunks)');
  } else {
    const indexText = await readFile(indexPath, 'utf8');
    const fm = parseFrontMatter(indexText);
    if (!fm?.indexed_at) {
      console.error('build-embeddings: _index.md has no indexed_at — run /index-sources first (proceeding with untagged chunks)');
    } else {
      const indexedAt = new Date(fm.indexed_at);
      const sourceFiles = await walkMarkdown(sourcesDir);
      let stale = false;
      for (const f of sourceFiles) {
        const s = await stat(f);
        if (s.mtimeMs > indexedAt.getTime()) { stale = true; break; }
      }
      if (stale) {
        console.error('build-embeddings: _index.md may be stale (source files modified after indexed_at) — run /index-sources for accurate tags (proceeding with current index)');
      }
      indexMap       = parseIndexBody(indexText);
      indexAvailable = true;
    }
  }

  // ── Collect files ─────────────────────────────────────────────────────────────
  const sourceFiles = await walkMarkdown(sourcesDir);
  const bankFiles   = await walkMarkdown(bankDir);
  const allFiles = [
    ...sourceFiles.map(f => ({ abs: f, tier: 'source' })),
    ...bankFiles.map(f =>   ({ abs: f, tier: 'bank'   })),
  ];

  if (allFiles.length === 0) {
    console.error(`build-embeddings: no markdown files found under courses/${args.slug}/sources/ or bank/`);
    process.exit(0);
  }

  // ── Incremental setup ─────────────────────────────────────────────────────────
  const manifest     = await loadManifest(dataDir);
  const oldRecords   = await loadExistingRecords(dataDir);
  const newManifest  = {};
  const allRecords   = [];

  // ── Load model ────────────────────────────────────────────────────────────────
  console.error(`build-embeddings: loading model ${resolvedModel}…`);
  const embedder = await initPipeline(transformers, resolvedModel);

  // ── Process each file ─────────────────────────────────────────────────────────
  let embedded = 0, reused = 0;

  for (const { abs, tier } of allFiles) {
    const relPath = relative(courseDir, abs);   // "sources/exam-guide.md"
    const content = await readFile(abs, 'utf8');
    const hash    = fileHash(content);
    newManifest[relPath] = hash;

    if (manifest[relPath] === hash && oldRecords.has(relPath)) {
      allRecords.push(...oldRecords.get(relPath));
      reused++;
      continue;
    }

    const chunks = chunkMarkdown(content);
    for (const chunk of chunks) {
      if (!chunk.text) continue;

      const id = `${tier}:${relPath}:${chunk.start}`;
      let taskStatements = [];
      let domain         = null;
      const tagConfidence = tier === 'bank' ? 'high' : 'low';

      if (tier === 'bank') {
        domain = extractBankDomain(chunk.heading);
        if (domain && state) {
          const domObj = (state.domains || []).find(d => d.id === domain);
          taskStatements = domObj?.taskStatements || [];
        }
      } else {
        if (indexAvailable) {
          taskStatements = findSourceTags(indexMap, relPath, chunk.start, chunk.end);
          if (taskStatements.length > 0) domain = tsDomainMap.get(taskStatements[0]) || null;
        }
      }

      const vector = await embedText(embedder, chunk.text);

      allRecords.push({
        id,
        path: relPath,
        tier,
        heading: chunk.heading,
        lineStart: chunk.start,
        lineEnd: chunk.end,
        domain,
        taskStatements,
        tagConfidence,
        text: chunk.text,
        vector,
      });
    }
    embedded++;
  }

  // ── Write output ──────────────────────────────────────────────────────────────
  await mkdir(dataDir, { recursive: true });
  const ndjson = allRecords.map(r => JSON.stringify(r)).join('\n') + '\n';
  await writeFile(join(dataDir, 'embeddings.ndjson'), ndjson, 'utf8');
  await saveManifest(dataDir, newManifest);

  const totalSize = Buffer.byteLength(ndjson, 'utf8');
  const sizeLabel = totalSize > 1_048_576
    ? `${(totalSize / 1_048_576).toFixed(1)} MB`
    : `${Math.round(totalSize / 1024)} KB`;
  console.error(
    `build-embeddings: done — ${allRecords.length} chunks, ${embedded} files embedded, ${reused} reused` +
    ` → courses/${args.slug}/data/embeddings.ndjson (${sizeLabel})`
  );
}

main().catch(err => {
  console.error('build-embeddings: unexpected error:', err);
  process.exit(2);
});
