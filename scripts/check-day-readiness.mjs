#!/usr/bin/env node
/**
 * check-day-readiness.mjs — Compute reading coverage for a study day.
 *
 * Usage:
 *   node scripts/check-day-readiness.mjs --course <slug> --day <N> --transcript <path> [--json]
 *
 * Inputs:
 *   - courses/{slug}/sources/_dayplan.md — required ranges per day
 *   - transcript JSONL                   — current Claude Code session transcript;
 *                                          all Read tool calls are extracted from it
 *
 * Logic:
 *   - Parse _dayplan.md for Day N's required reading list.
 *   - Scan transcript for assistant `tool_use` blocks with name "Read";
 *     compute each read's effective line window.
 *   - For each required (file, start, end), compute coverage as |union ∩ [start,end]| / span.
 *   - Range satisfied if coverage ≥ COVERAGE_THRESHOLD (default 0.9).
 *
 * Exit:
 *   - 0 with "OK" / {ok:true} when every required range is satisfied (or none required).
 *   - 1 with a missing report otherwise.
 *   - 2 on argument or infra errors (don't block delivery on infra failures).
 *
 * --json: machine-readable output (used by the Stop hook).
 */

import { promises as fs } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT  = resolve(dirname(__filename), '..');
const COVERAGE_THRESHOLD = 0.9;
const DEFAULT_READ_LIMIT = 2000;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--course')          out.course     = argv[++i];
    else if (a === '--day')        out.day        = parseInt(argv[++i], 10);
    else if (a === '--transcript') out.transcript = argv[++i];
    else if (a === '--json')       out.json       = true;
  }
  return out;
}

async function parseDayplan(path, day) {
  const text = await fs.readFile(path, 'utf8');
  const lines = text.split('\n');
  const required = [];
  let inDayBlock = false;
  let inReadingList = false;
  const dayHeaderRe = /^## Day (\d+)\b/;
  const lineRe = /^- `([^`]+)` L(\d+)[–\-](\d+)\s*$/;

  for (const raw of lines) {
    const m = raw.match(dayHeaderRe);
    if (m) {
      inDayBlock = (parseInt(m[1], 10) === day);
      inReadingList = false;
      continue;
    }
    if (!inDayBlock) continue;
    if (raw.startsWith('**Required reading:**')) {
      inReadingList = !/_none\b/i.test(raw);
      continue;
    }
    if (inReadingList) {
      const lm = raw.match(lineRe);
      if (lm) {
        required.push({ path: lm[1], start: parseInt(lm[2],10), end: parseInt(lm[3],10) });
      } else if (raw.trim() === '' || raw.startsWith('## ')) {
        inReadingList = false;
      }
    }
  }
  return required;
}

// Extract Read tool calls from a Claude Code transcript JSONL.
// Returns [{ absPath, startLine, endLine }, ...]
async function readsFromTranscript(transcriptPath) {
  let text;
  try { text = await fs.readFile(transcriptPath, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const msg = obj.message || obj;
    if (!msg || !Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (!part || part.type !== 'tool_use' || part.name !== 'Read') continue;
      const inp = part.input || {};
      const fp = inp.file_path;
      if (typeof fp !== 'string') continue;
      const offset = Number.isInteger(inp.offset) ? inp.offset : undefined;
      const limit  = Number.isInteger(inp.limit)  ? inp.limit  : undefined;
      let startLine, endLine;
      if (offset === undefined) {
        startLine = 1;
        endLine   = DEFAULT_READ_LIMIT;
      } else {
        startLine = offset;
        endLine   = offset + (limit ?? DEFAULT_READ_LIMIT) - 1;
      }
      out.push({ absPath: resolve(fp), startLine, endLine });
    }
  }
  return out;
}

function mergeIntervals(intervals) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of sorted) {
    if (merged.length === 0 || s > merged[merged.length - 1][1] + 1) merged.push([s, e]);
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
  }
  return merged;
}

function overlapSum(union, rs, re) {
  let total = 0;
  for (const [s, e] of union) {
    const lo = Math.max(s, rs), hi = Math.min(e, re);
    if (hi >= lo) total += (hi - lo + 1);
  }
  return total;
}

function computeCoverage(required, reads, courseDir) {
  const byPath = new Map();
  for (const r of reads) {
    if (!r.absPath.startsWith(courseDir)) continue; // ignore reads outside the course
    const rel = r.absPath.slice(courseDir.length + 1); // strip "<courseDir>/"
    if (!byPath.has(rel)) byPath.set(rel, []);
    byPath.get(rel).push([r.startLine, r.endLine]);
  }
  const unions = new Map();
  for (const [p, ivs] of byPath) unions.set(p, mergeIntervals(ivs));

  return required.map(req => {
    const union = unions.get(req.path) || [];
    const span  = req.end - req.start + 1;
    const covered = overlapSum(union, req.start, req.end);
    const fraction = span > 0 ? covered / span : 0;
    return {
      path: req.path, start: req.start, end: req.end,
      span, coveredLines: covered, coverage: fraction,
      satisfied: fraction >= COVERAGE_THRESHOLD,
    };
  });
}

function renderHuman(report) {
  const lines = [];
  lines.push(`Day ${report.day} readiness check — course: ${report.course}`);
  lines.push(`Threshold: ${(COVERAGE_THRESHOLD * 100).toFixed(0)}% coverage per range`);
  lines.push(`Transcript: ${report.transcript || '(none)'}`);
  lines.push('');
  if (report.required.length === 0) {
    lines.push('No required reading for this day. OK.');
    return lines.join('\n');
  }
  for (const c of report.coverage) {
    const mark = c.satisfied ? '✓' : '✗';
    const pct  = (c.coverage * 100).toFixed(0).padStart(3);
    lines.push(`  ${mark} ${pct}%  \`${c.path}\` L${c.start}–${c.end}  (${c.coveredLines}/${c.span} lines)`);
  }
  lines.push('');
  lines.push(report.ok
    ? 'OK — all required ranges read.'
    : `MISSING — ${report.missing.length} of ${report.required.length} ranges have insufficient coverage.`);
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.course || !Number.isInteger(args.day) || !args.transcript) {
    console.error('Usage: check-day-readiness.mjs --course <slug> --day <N> --transcript <path> [--json]');
    process.exit(2);
  }
  const courseDir   = `${REPO_ROOT}/courses/${args.course}`;
  const dayplanPath = `${courseDir}/sources/_dayplan.md`;
  const transcript  = isAbsolute(args.transcript) ? args.transcript : resolve(args.transcript);

  let required;
  try { required = await parseDayplan(dayplanPath, args.day); }
  catch (err) {
    console.error(`check-day-readiness: cannot read ${dayplanPath}: ${err.message}`);
    process.exit(2);
  }

  const reads = await readsFromTranscript(transcript);
  const coverage = computeCoverage(required, reads, courseDir);
  const missing = coverage.filter(c => !c.satisfied);
  const ok = missing.length === 0;

  const report = { course: args.course, day: args.day, transcript, required, coverage, missing, ok };
  process.stdout.write((args.json ? JSON.stringify(report, null, 2) : renderHuman(report)) + '\n');
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error('check-day-readiness: unexpected error:', err);
  process.exit(2);
});
