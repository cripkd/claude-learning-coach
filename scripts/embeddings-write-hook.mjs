#!/usr/bin/env node
/**
 * embeddings-write-hook.mjs — Claude Code PostToolUse hook for re-embedding on source changes.
 *
 * Wired in .claude/settings.json (PostToolUse, matcher Write|Edit|MultiEdit).
 * Receives the tool payload on stdin, filters for writes to
 * courses/{slug}/sources/** or courses/{slug}/bank/**, then delegates
 * to build-embeddings.mjs <slug> if vector mode is active and the runtime
 * is installed.
 *
 * Always exits 0 — never blocks the coach.
 *
 * Silent no-op (no stderr) when:
 *   - path doesn't match sources/ or bank/
 *   - retrieval-config.json is absent or mode !== "vector"
 *   - @huggingface/transformers runtime is not installed
 *
 * Does NOT regenerate _index.md (that's a manual /index-sources run).
 */

import { spawn }      from 'node:child_process';
import { readFile }   from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = resolve(__dirname, '..');
const EMBEDDER   = join(__dirname, 'build-embeddings.mjs');

// ─── Stdin ────────────────────────────────────────────────────────────────────

async function readStdin() {
  return new Promise((resolveP) => {
    let buf = '';
    if (process.stdin.isTTY) { resolveP(''); return; }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data',  c => { buf += c; });
    process.stdin.on('end',   () => resolveP(buf));
    process.stdin.on('error', () => resolveP(buf));
  });
}

// ─── Path matching ────────────────────────────────────────────────────────────

// Matches courses/<slug>/sources/... or courses/<slug>/bank/...
const SOURCE_PATH_RE = /(?:^|\/)courses\/([a-zA-Z0-9_-]+)\/(?:sources|bank)\//;

function extractSlug(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const m = filePath.match(SOURCE_PATH_RE);
  return m ? m[1] : null;
}

function collectPaths(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return [];
  if (typeof toolInput.file_path === 'string') return [toolInput.file_path];
  if (Array.isArray(toolInput.file_paths))     return toolInput.file_paths.filter(s => typeof s === 'string');
  return [];
}

// ─── Guards ───────────────────────────────────────────────────────────────────

async function isVectorModeActive(slug) {
  try {
    const cfg = JSON.parse(
      await readFile(join(REPO_ROOT, 'courses', slug, 'data', 'retrieval-config.json'), 'utf8')
    );
    return cfg?.mode === 'vector';
  } catch { return false; }
}

async function isRuntimeInstalled() {
  try { await import('@huggingface/transformers'); return true; }
  catch { return false; }
}

// ─── Delegate ─────────────────────────────────────────────────────────────────

function runEmbedder(slug) {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [EMBEDDER, slug], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit',  (code) => resolveP(code ?? 1));
    child.on('error', ()     => resolveP(1));
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const raw = await readStdin();
  if (!raw) return;

  let payload;
  try { payload = JSON.parse(raw); } catch { return; }

  const paths = collectPaths(payload.tool_input);
  const slugs = [...new Set(paths.map(extractSlug).filter(Boolean))];
  if (slugs.length === 0) return; // not a sources/bank write — silent no-op

  for (const slug of slugs) {
    if (!await isVectorModeActive(slug)) continue;  // silent no-op
    if (!await isRuntimeInstalled())     continue;  // silent no-op

    const code = await runEmbedder(slug);
    if (code !== 0) {
      console.error(`embeddings-write-hook: build-embeddings failed for course '${slug}' (exit ${code})`);
    }
  }
  // Always exit 0 regardless
}

main().then(() => process.exit(0)).catch(err => {
  console.error('embeddings-write-hook: unexpected error:', err);
  process.exit(0);
});
