#!/usr/bin/env node
/**
 * state-write-hook.mjs — Claude Code PostToolUse hook entry point.
 *
 * Wired in .claude/settings.json (PostToolUse, matcher Write|Edit|MultiEdit).
 * Receives the tool payload on stdin, filters for writes to
 * courses/{slug}/data/state.json, then delegates to build-dashboard.mjs.
 *
 * Anything that isn't a state.json write is a silent no-op (exit 0).
 *
 * The hook exits 0 on success so it never blocks the coach; build failures
 * are logged to stderr (visible in the Claude Code session) but do not abort
 * the conversation. The previous dashboard remains intact on failure.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = resolve(__dirname, '..');
const BUILDER    = join(__dirname, 'build-dashboard.mjs');

// ─── Read JSON payload from stdin ────────────────────────────────────────────

async function readStdin() {
  return new Promise((resolveP) => {
    let buf = '';
    if (process.stdin.isTTY) { resolveP(''); return; }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { buf += chunk; });
    process.stdin.on('end',  () => resolveP(buf));
    process.stdin.on('error', () => resolveP(buf));
  });
}

// ─── Path matching ───────────────────────────────────────────────────────────

// Matches `<anything>/courses/<slug>/data/state.json` and captures the slug.
// Slug must be alphanumeric/dash/underscore (matches /init-coach's slug rules).
const STATE_PATH_RE = /(?:^|\/)courses\/([a-zA-Z0-9_-]+)\/data\/state\.json$/;

function extractSlug(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const m = filePath.match(STATE_PATH_RE);
  return m ? m[1] : null;
}

function collectPaths(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return [];
  // Write/Edit/MultiEdit all expose a single file_path field.
  if (typeof toolInput.file_path === 'string') return [toolInput.file_path];
  // Defensive: future-proof if a tool ever passes a list.
  if (Array.isArray(toolInput.file_paths)) return toolInput.file_paths.filter(s => typeof s === 'string');
  return [];
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

function runBuilder(absStatePath) {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [BUILDER, '--state', absStatePath], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit', (code) => resolveP(code ?? 1));
    child.on('error', () => resolveP(1));
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw) return 0;

  let payload;
  try { payload = JSON.parse(raw); }
  catch { return 0; } // not JSON — nothing for us to do

  const paths = collectPaths(payload.tool_input);
  // Keep only paths matching courses/*/data/state.json; dedupe.
  const stateFiles = [...new Set(paths.filter(p => extractSlug(p)))];
  if (stateFiles.length === 0) return 0;

  for (const stateFile of stateFiles) {
    const code = await runBuilder(stateFile);
    if (code !== 0) {
      // Logged by builder via stderr; we still exit 0 so the hook never blocks.
      const slug = extractSlug(stateFile);
      console.error(`state-write-hook: build-dashboard failed for course '${slug}' (exit ${code}).`);
    }
  }
  return 0;
}

main().then(code => process.exit(code)).catch(err => {
  console.error('state-write-hook: unexpected error:', err);
  process.exit(0); // hooks are non-blocking
});
