#!/usr/bin/env node
/**
 * day-delivery-gate.mjs — Claude Code Stop hook.
 *
 * Refuses to end the assistant turn when:
 *   - the last assistant message contains a day-start marker
 *     `<!-- coach:day-start course=<slug> day=<N> -->`, AND
 *   - check-day-readiness reports any required range with coverage <90%.
 *
 * On block: emits `{ "decision": "block", "reason": "<missing report>" }`.
 * Claude must continue the turn and address the missing reads.
 *
 * On pass (marker absent OR all ranges read): emits nothing and exits 0.
 *
 * Loop guard: if `stop_hook_active` is true (we already fired this stop),
 * exit 0 silently. Prevents an infinite block→retry→block cycle.
 *
 * Hook envelope: { session_id, transcript_path, hook_event_name, stop_hook_active }
 */

import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = resolve(__dirname, '..');
const CHECKER    = join(__dirname, 'check-day-readiness.mjs');

// Marker must appear at the very start of the message (optionally after blank lines).
// This prevents prose mentions / docs / example markers buried in the middle of
// a summary message from triggering the gate.
const MARKER_RE = /^\s*<!--\s*coach:day-start\s+course=([a-zA-Z0-9_-]+)\s+day=(\d+)\s*-->/;

async function readStdin() {
  return new Promise((resolveP) => {
    let buf = '';
    if (process.stdin.isTTY) { resolveP(''); return; }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { buf += c; });
    process.stdin.on('end',  () => resolveP(buf));
    process.stdin.on('error',() => resolveP(buf));
  });
}

// Extract the most recent assistant message text from the transcript JSONL.
async function lastAssistantText(transcriptPath) {
  let text;
  try { text = await fs.readFile(transcriptPath, 'utf8'); }
  catch { return ''; }
  const lines = text.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let obj;
    try { obj = JSON.parse(lines[i]); } catch { continue; }
    // Claude Code transcript: messages have `type` and a `message` field with role+content.
    const msg = obj.message || obj;
    if ((obj.type === 'assistant' || msg.role === 'assistant') && msg.content) {
      const content = msg.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .filter(part => part && (part.type === 'text' || typeof part.text === 'string'))
          .map(part => part.text || '')
          .join('\n');
      }
    }
  }
  return '';
}

function runChecker({ course, day, transcript }) {
  return new Promise((resolveP) => {
    const args = [CHECKER, '--course', course, '--day', String(day), '--transcript', transcript, '--json'];
    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    child.stdout.on('data', c => { out += c; });
    child.stderr.on('data', c => { err += c; });
    child.on('exit', code => resolveP({ code: code ?? 1, out, err }));
    child.on('error', e => resolveP({ code: 1, out, err: e.message }));
  });
}

function renderBlockReason(report) {
  const lines = [];
  lines.push(`Day ${report.day} delivery gate: required-reading check failed.`);
  lines.push('');
  lines.push(`You emitted a day-start marker for Day ${report.day}, but ${report.missing.length} of ${report.required.length} required source ranges have <90% coverage in this session's Read log.`);
  lines.push('');
  lines.push('Missing ranges:');
  for (const m of report.missing) {
    const pct = (m.coverage * 100).toFixed(0);
    lines.push(`  - \`${m.path}\` L${m.start}–${m.end}  (${pct}% read, ${m.coveredLines}/${m.span} lines)`);
  }
  lines.push('');
  lines.push('Read the missing ranges with the Read tool (use offset+limit, or read the whole file), then re-emit the Day delivery. Per the source-grounding protocol in CLAUDE.md, you may not deliver Core Concepts grounded in unread sources.');
  lines.push('');
  lines.push('If you need to deliver a partial-coverage day intentionally (e.g., split a multi-day task statement across days), hand-edit `sources/_dayplan.md` for this day first.');
  return lines.join('\n');
}

async function main() {
  const raw = await readStdin();
  if (!raw) return 0;
  let payload;
  try { payload = JSON.parse(raw); } catch { return 0; }

  if (payload.stop_hook_active === true) return 0; // loop guard

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) return 0;

  const text = await lastAssistantText(transcriptPath);
  if (!text) return 0;

  const m = text.match(MARKER_RE);
  if (!m) return 0; // no day-start marker -> nothing to gate

  const course = m[1];
  const day    = parseInt(m[2], 10);

  const { code, out, err } = await runChecker({ course, day, transcript: transcriptPath });

  // Exit 0 from checker = OK (or no required reading). Allow stop.
  if (code === 0) return 0;
  // Exit 2 = checker error (bad args, missing dayplan). Don't block on infra failure.
  if (code === 2) {
    console.error(`day-delivery-gate: checker error (course=${course} day=${day}): ${err.trim()}`);
    return 0;
  }

  // Exit 1 = missing ranges. Parse and emit block decision.
  let report;
  try { report = JSON.parse(out); }
  catch {
    console.error(`day-delivery-gate: cannot parse checker output: ${out.slice(0, 200)}`);
    return 0;
  }
  const blockMsg = renderBlockReason(report);
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: blockMsg,
  }));
  return 0;
}

main().then(c => process.exit(c)).catch(err => {
  console.error('day-delivery-gate: unexpected error:', err);
  process.exit(0);
});
