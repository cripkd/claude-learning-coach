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
import { promises as fs } from 'node:fs';
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

// ─── Day-transition audit ────────────────────────────────────────────────────
// After the dashboard rebuild, diff the new state against a per-course snapshot.
// For any day whose status transitioned to "in-progress" or "complete", verify
// that the current session's transcript contains a day-start marker for that
// day. If not, emit a stderr warning. We never block the write (PostToolUse
// hooks fire after the write); this is an audit trail signal only.

const DELIVERED_STATUSES = new Set(['in-progress', 'partial', 'complete']);

function snapshotPath(slug) {
  return `${REPO_ROOT}/courses/${slug}/.state-snapshot.json`;
}

async function loadJSON(path) {
  try { return JSON.parse(await fs.readFile(path, 'utf8')); }
  catch { return null; }
}

function dayStatusMap(state) {
  const m = new Map();
  for (const phase of state?.phases || []) {
    for (const d of phase.days || []) {
      if (Number.isInteger(d.day)) m.set(d.day, d.status || 'pending');
    }
  }
  return m;
}

async function markerPresentInTranscript(transcriptPath, slug, day) {
  if (!transcriptPath) return false;
  let text;
  try { text = await fs.readFile(transcriptPath, 'utf8'); } catch { return false; }
  const re = new RegExp(`^\\s*<!--\\s*coach:day-start\\s+course=${slug}\\s+day=${day}\\s*-->`);
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const msg = obj.message || obj;
    if (!msg || !Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part?.type !== 'text' || typeof part.text !== 'string') continue;
      if (re.test(part.text)) return true;
    }
  }
  return false;
}

async function auditTransitions(slug, statePath, transcriptPath) {
  const current = await loadJSON(statePath);
  if (!current) return;
  const snapPath = snapshotPath(slug);
  const prior = await loadJSON(snapPath);
  const curMap = dayStatusMap(current);
  const priorMap = prior ? dayStatusMap(prior) : new Map();

  const warnings = [];
  for (const [day, status] of curMap) {
    if (!DELIVERED_STATUSES.has(status)) continue;
    const wasDelivered = DELIVERED_STATUSES.has(priorMap.get(day) || 'pending');
    if (wasDelivered) continue; // not a fresh transition
    // Skip days with no required reading (phase exams, case practice, etc.) —
    // a marker for those isn't expected. Cheap check: title contains "Exam"
    // or topics is empty.
    const dayObj = (current.phases || []).flatMap(p => p.days || []).find(d => d.day === day);
    const topics = (dayObj?.topics || []).join(' ');
    if (!topics || /Exam|Case practice|simulation|Rest day|Exam day|Watchlist|Cold-water/i.test(topics)) continue;

    const present = await markerPresentInTranscript(transcriptPath, slug, day);
    if (!present) {
      warnings.push(`Day ${day} (${topics.split(';')[0].trim()})`);
    }
  }

  if (warnings.length > 0) {
    console.error(`state-write-hook: AUDIT WARNING — course '${slug}': day(s) transitioned to a delivered status without a day-start marker in the current session transcript:`);
    for (const w of warnings) console.error(`  - ${w}`);
    console.error('  (Expected `<!-- coach:day-start course=' + slug + ' day=N -->` at the start of the assistant message that delivered the day. The state.json write was not blocked.)');
  }

  // Save snapshot for next diff
  try {
    await fs.writeFile(snapPath, JSON.stringify(current, null, 2));
  } catch (err) {
    console.error(`state-write-hook: failed to save snapshot ${snapPath}: ${err.message}`);
  }
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

  const transcriptPath = payload.transcript_path;

  // Exit code 4 from build-dashboard.mjs = topic-drift detected. We surface it
  // as a blocking PostToolUse error (exit 2 + stderr) so the model is forced
  // to fix the topic string before continuing. Other nonzero codes (schema
  // validation failure, render errors) are logged but non-blocking to preserve
  // the existing "hook never blocks on infra failures" safety.
  const DRIFT_EXIT_CODE = 4;
  let driftFailures = 0;

  for (const stateFile of stateFiles) {
    const slug = extractSlug(stateFile);
    const code = await runBuilder(stateFile);
    if (code === DRIFT_EXIT_CODE) {
      driftFailures++;
      console.error(`state-write-hook: BLOCKING — topic drift in course '${slug}'. Fix day.topics strings to byte-match domain.taskStatements (see build-dashboard output above), then re-write state.json.`);
      continue;
    }
    if (code !== 0) {
      console.error(`state-write-hook: build-dashboard failed for course '${slug}' (exit ${code}).`);
      continue; // don't audit a state we couldn't validate
    }
    try { await auditTransitions(slug, stateFile, transcriptPath); }
    catch (err) {
      console.error(`state-write-hook: audit failed for course '${slug}': ${err.message}`);
    }
  }
  return driftFailures > 0 ? 2 : 0;
}

main().then(code => process.exit(code)).catch(err => {
  console.error('state-write-hook: unexpected error:', err);
  process.exit(0); // unexpected infra errors are non-blocking; only topic drift blocks (exit 2 returned by main)
});
