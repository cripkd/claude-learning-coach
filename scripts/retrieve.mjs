#!/usr/bin/env node
/**
 * retrieve.mjs — query the local vector index for a course.
 *
 * Usage:
 *   node scripts/retrieve.mjs <slug> "<query>" [--domain Dx] [--k N]
 *
 * Outputs a JSON array to stdout. Each result:
 *   { path, heading, lineStart, lineEnd, score, text }
 *
 * Soft re-rank (when --domain is given and blueprint.mode !== "none"):
 *   - bank chunk + domain mismatch → hard-excluded (tagConfidence: "high" → reliable)
 *   - source chunk + domain or taskStatement match → score boost only (drifty tags)
 *   A source chunk with a missing/wrong tag still surfaces if semantically relevant.
 *
 * Reads topK / byteBudget / model from retrieval-config.json; sane defaults if absent.
 *
 * Runtime guard: if @huggingface/transformers is not installed, exits 0 with guidance.
 *
 * Exit codes: 0 success / runtime missing; 1 usage; 2 IO error
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, DEFAULT_MODEL, tryImportTransformers, initPipeline, embedText } from './_embed-utils.mjs';

const DEFAULT_TOP_K      = 8;
const DEFAULT_BYTE_BUDGET = 24000;
const DOMAIN_BOOST        = 0.1;  // added to cosine score for matching source chunks

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { slug: null, query: null, domain: null, k: null, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h')  out.help   = true;
    else if (a === '--domain')         out.domain = argv[++i];
    else if (a === '--k')              out.k      = parseInt(argv[++i], 10);
    else if (!a.startsWith('--')) {
      if (!out.slug)        out.slug  = a;
      else if (!out.query)  out.query = a;
      else                  out.error = `unexpected argument: ${a}`;
    } else {
      out.error = `unknown option: ${a}`;
    }
  }
  return out;
}

function usage() {
  return [
    'Usage: node scripts/retrieve.mjs <slug> "<query>" [--domain Dx] [--k N]',
    '',
    'Queries courses/<slug>/data/embeddings.ndjson and prints JSON results to stdout.',
    'Requires @huggingface/transformers — run `npm run setup:retrieval` first.',
    '',
    'Options:',
    '  --domain Dx   Filter/boost by domain ID (bank chunks hard-filtered; source chunks boosted)',
    '  --k N         Number of results (default: 8, or topK from retrieval-config.json)',
  ].join('\n');
}

// ─── Config + state ───────────────────────────────────────────────────────────

async function loadConfig(courseDir) {
  try {
    return JSON.parse(await readFile(join(courseDir, 'data', 'retrieval-config.json'), 'utf8'));
  } catch { return {}; }
}

async function loadState(courseDir) {
  try {
    return JSON.parse(await readFile(join(courseDir, 'data', 'state.json'), 'utf8'));
  } catch { return null; }
}

// Set of taskStatement IDs belonging to a given domain
function domainTsSet(state, domainId) {
  const s = new Set();
  const dom = (state?.domains || []).find(d => d.id === domainId);
  for (const ts of dom?.taskStatements || []) s.add(ts);
  return s;
}

// ─── Load NDJSON records ──────────────────────────────────────────────────────

async function loadRecords(dataDir) {
  const records = [];
  const ndjsonPath = join(dataDir, 'embeddings.ndjson');
  const text = await readFile(ndjsonPath, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); } catch {}
  }
  return records;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function dotProduct(a, b) {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

function scoreRecord(record, queryVector, domainFilter, tsSet, blueprintMode) {
  const base = dotProduct(record.vector, queryVector);

  // No domain filter in effect
  if (!domainFilter || blueprintMode === 'none') {
    return { score: base, include: true };
  }

  // Bank chunk: reliable tags → hard-exclude on mismatch
  if (record.tier === 'bank' && record.tagConfidence === 'high') {
    return { score: base, include: record.domain === domainFilter };
  }

  // Source chunk: drifty tags → boost on match, never exclude
  const domainMatch = record.domain === domainFilter;
  const tsMatch     = (record.taskStatements || []).some(ts => tsSet.has(ts));
  return { score: base + (domainMatch || tsMatch ? DOMAIN_BOOST : 0), include: true };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help)  { console.log(usage()); process.exit(0); }
  if (args.error) { console.error(`retrieve: ${args.error}\n${usage()}`); process.exit(1); }
  if (!args.slug || !args.query) {
    console.error(`retrieve: slug and query are required\n${usage()}`);
    process.exit(1);
  }

  const transformers = await tryImportTransformers();
  if (!transformers) {
    console.error('retrieve: @huggingface/transformers not installed — run `npm run setup:retrieval` to enable vector mode');
    process.exit(0);
  }

  const courseDir = join(REPO_ROOT, 'courses', args.slug);
  if (!existsSync(courseDir)) {
    console.error(`retrieve: course not found: courses/${args.slug}`);
    process.exit(2);
  }

  const dataDir = join(courseDir, 'data');
  const ndjsonPath = join(dataDir, 'embeddings.ndjson');
  if (!existsSync(ndjsonPath)) {
    console.error(`retrieve: embeddings.ndjson not found — run \`npm run embeddings:build -- ${args.slug}\` first`);
    process.exit(0);
  }

  const config        = await loadConfig(courseDir);
  const state         = await loadState(courseDir);
  const blueprintMode = state?.examProfile?.blueprint?.mode ?? 'weighted';
  const topK          = args.k ?? config.topK ?? DEFAULT_TOP_K;
  const byteBudget    = config.byteBudget ?? DEFAULT_BYTE_BUDGET;
  const modelName     = config.model ?? DEFAULT_MODEL;

  const tsSet = args.domain ? domainTsSet(state, args.domain) : new Set();

  // Load records and embed query
  const records = await loadRecords(dataDir);
  if (records.length === 0) {
    process.stdout.write('[]\n');
    process.exit(0);
  }

  console.error(`retrieve: loading model ${modelName}…`);
  const embedder    = await initPipeline(transformers, modelName);
  const queryVector = await embedText(embedder, args.query);

  // Score + filter
  const scored = [];
  for (const rec of records) {
    if (!Array.isArray(rec.vector) || rec.vector.length === 0) continue;
    const { score, include } = scoreRecord(rec, queryVector, args.domain, tsSet, blueprintMode);
    if (include) scored.push({ rec, score });
  }

  // Sort descending by score, take top-k
  scored.sort((a, b) => b.score - a.score);
  const topKItems = scored.slice(0, topK);

  // Apply byte budget (always include at least one result)
  let bytesSoFar = 0;
  const results = [];
  for (const { rec, score } of topKItems) {
    const itemBytes = Buffer.byteLength(rec.text, 'utf8');
    if (results.length > 0 && bytesSoFar + itemBytes > byteBudget) break;
    results.push({
      path:      rec.path,
      heading:   rec.heading,
      lineStart: rec.lineStart,
      lineEnd:   rec.lineEnd,
      score:     Math.round(score * 1000) / 1000,
      text:      rec.text,
    });
    bytesSoFar += itemBytes;
  }

  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}

main().catch(err => {
  console.error('retrieve: unexpected error:', err);
  process.exit(2);
});
