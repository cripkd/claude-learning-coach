#!/usr/bin/env node
/**
 * build-dashboard.mjs — deterministic dashboard build artifact generator.
 *
 * Pipeline: read state.json → migrate (if pre-2.0) → validate (ajv) → render.
 * The dashboard at courses/{slug}/dashboard/index.html is a pure build artifact:
 * never hand-written, always derived from data/state.json + templates/dashboard-template.html.
 *
 * Usage:
 *   node scripts/build-dashboard.mjs <slug>              # migrate + validate + write index.html
 *   node scripts/build-dashboard.mjs <slug> --validate   # migrate + validate only (no write)
 *   node scripts/build-dashboard.mjs --state <path>      # build from an arbitrary state file path
 *                                                       # (slug derived from path; dashboard sibling of state file)
 *
 * Exit codes:
 *   0  — success (or no-op for --validate)
 *   1  — usage error
 *   2  — validation failure (state.json does not conform to schema after migration)
 *   3  — IO error (file missing, unreadable, etc.)
 *
 * On failure, no partial dashboard is ever written. The previous index.html is left intact.
 *
 * Requires: Node >=18, ajv (see package.json).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = resolve(__dirname, '..');

const SCHEMA_PATH   = join(REPO_ROOT, 'templates', 'state-schema.json');
const TEMPLATE_PATH = join(REPO_ROOT, 'templates', 'dashboard-template.html');
const PLACEHOLDER   = '__STATE_PLACEHOLDER__';
const CURRENT_VERSION = '2.1';

// Calibration debias parameters
const CALIB_MIN_SAMPLES = 5;    // Below this, fall back to the prior (no debias)
const PRIOR_STDDEV      = 7;    // Default ±% exam-day noise prior
const MIN_STDDEV        = 3;    // Observed stdev clamped here to avoid overconfident probabilities

// ─── CLI parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { slug: null, statePath: null, validateOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--validate' || a === '--validate-only') args.validateOnly = true;
    else if (a === '--state') args.statePath = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('--') && !args.slug) args.slug = a;
    else { args.error = `unknown argument: ${a}`; }
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/build-dashboard.mjs <slug> [--validate]',
    '       node scripts/build-dashboard.mjs --state <path> [--validate]',
    '',
    'Builds courses/<slug>/dashboard/index.html from courses/<slug>/data/state.json.',
    'Migrates schemaVersion < 2.0 to 2.0 (adds examProfile with v1-equivalent defaults).',
    'Validates against templates/state-schema.json; refuses to write on validation failure.',
  ].join('\n');
}

// ─── Migration chain ─────────────────────────────────────────────────────────

function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

function deriveExamProfile(state) {
  // Map caseMode → scenarioRecallRatio (orthogonal axis: caseMode stays as-is).
  // "recall" exam = 0.0; scenario-based ("exam-defined" / "pool-derived") = 1.0.
  const caseMode = state?.exam?.caseMode;
  const scenarioRecallRatio = caseMode === 'recall' ? 0.0 : 1.0;

  return {
    profile: 'mcq',
    scenarioRecallRatio,
    blueprint: { mode: 'weighted' },
    scoring:   { model: 'fixed_percent', scaleMin: null, scaleMax: null },
    questionFormat: { optionCount: 4, multipleCorrect: false, partialCredit: 'all_or_nothing' },
    adaptive: false,
  };
}

// 1.x → 2.0: introduce examProfile derived from existing fields.
function migrateTo20(state) {
  if (!state.examProfile) state.examProfile = deriveExamProfile(state);
  state.schemaVersion = '2.0';
  return state;
}

// 2.0 → 2.1: introduce readiness debias fields. Defaults preserve v2.0 numbers.
function migrateTo21(state) {
  const r = state.readiness || {};
  state.readiness = {
    ...r,
    biasCorrectionPercent: r.biasCorrectionPercent ?? 0,
    sampleSize:            r.sampleSize ?? 0,
    // Debiased defaults to the raw estimate until computeReadiness runs.
    debiasedEstimatePercent: r.debiasedEstimatePercent ?? r.coldWaterEstimatePercent ?? null,
    qualitativeBand:       r.qualitativeBand ?? null,
  };
  state.schemaVersion = '2.1';
  return state;
}

function migrate(state) {
  let migrated = false;
  // The chain. Each step is idempotent and only runs if the file predates the target.
  if (!state.examProfile || compareVersions(state.schemaVersion || '0', '2.0') < 0) {
    state = migrateTo20(state); migrated = true;
  }
  if (compareVersions(state.schemaVersion || '0', '2.1') < 0) {
    state = migrateTo21(state); migrated = true;
  }
  return { state, migrated };
}

// ─── Readiness math (script-owned) ───────────────────────────────────────────

function normalCDF(z) {
  // Abramowitz & Stegun 26.2.17 — accurate to ~7.5e-8 for |z| ≤ 7.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.39894228 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function meanAndStdev(values) {
  if (values.length === 0) return { mean: 0, stdev: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (values.length === 1) return { mean, stdev: 0 };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return { mean, stdev: Math.sqrt(variance) };
}

function qualitativeBandFor(estimate) {
  if (estimate === null || estimate === undefined) return null;
  if (estimate >= 85) return 'Strong — comfortable margin';
  if (estimate >= 75) return 'Likely passing';
  if (estimate >= 65) return 'Marginal — could go either way';
  return 'Weak — more work needed';
}

// Recomputes the script-owned readiness fields. Pure: returns a new readiness
// object without mutating the input. Coach-owned fields (coldWaterEstimatePercent,
// summary, lastUpdated) are passed through unchanged.
function computeReadiness(state) {
  const r = state.readiness || {};
  const cal = state.calibration || [];
  const deltas = cal.map(c => c?.delta).filter(d => typeof d === 'number' && Number.isFinite(d));
  const sampleSize = deltas.length;

  let bias = 0;
  let stdDev = PRIOR_STDDEV;
  if (sampleSize >= CALIB_MIN_SAMPLES) {
    const stats = meanAndStdev(deltas);
    bias = stats.mean;
    stdDev = Math.max(MIN_STDDEV, stats.stdev);
  }

  const coldWater = r.coldWaterEstimatePercent;
  const debiased = (coldWater === null || coldWater === undefined)
    ? null
    : clamp(coldWater + bias, 0, 100);

  const passMark = state?.exam?.passMarkPercent;
  const scoringModel = state?.examProfile?.scoring?.model || 'fixed_percent';

  let margin = null;
  let prob = null;
  let band = null;

  if (scoringModel === 'pass_fail_unknown') {
    // No cut → qualitative only
    band = qualitativeBandFor(debiased);
  } else if (debiased !== null && typeof passMark === 'number') {
    // fixed_percent / scaled — both math in percent space
    margin = round2(debiased - passMark);
    const z = (passMark - debiased) / stdDev;
    prob = clamp(round3(1 - normalCDF(z)), 0, 1);
  }

  return {
    ...r,
    debiasedEstimatePercent: debiased === null ? null : round2(debiased),
    marginOverCutPercent: margin,
    noiseModelStdDevPercent: round2(stdDev),
    passProbabilityRoughEstimate: prob,
    biasCorrectionPercent: round2(bias),
    sampleSize,
    qualitativeBand: band,
  };
}

function round2(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }

// ─── Validation ──────────────────────────────────────────────────────────────

async function loadSchema() {
  const text = await readFile(SCHEMA_PATH, 'utf8');
  return JSON.parse(text);
}

function buildValidator(schema) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

function formatAjvErrors(errors) {
  if (!errors || errors.length === 0) return '(no errors)';
  return errors.map(e => {
    const where = e.instancePath || '(root)';
    let detail = '';
    if (e.params) {
      if (e.params.additionalProperty) detail = ` — additionalProperty: '${e.params.additionalProperty}'`;
      else if (e.params.allowedValues) detail = ` — allowed: ${JSON.stringify(e.params.allowedValues)}`;
      else if (e.params.missingProperty) detail = ` — missingProperty: '${e.params.missingProperty}'`;
      else if (e.params.allowedValue !== undefined) detail = ` — allowed: ${JSON.stringify(e.params.allowedValue)}`;
    }
    return `  ${where} ${e.message}${detail}`;
  }).join('\n');
}

// ─── Render ──────────────────────────────────────────────────────────────────

// Match the entire <script type="application/json" id="state">…</script> block.
// We replace only the *contents* of this block — leaving the script tag verbatim,
// because dashboard.js reads it by id="state".
const STATE_BLOCK_RE = /(<script type="application\/json" id="state">)([\s\S]*?)(<\/script>)/;

function injectState(templateHtml, state) {
  const match = templateHtml.match(STATE_BLOCK_RE);
  if (!match) {
    throw new Error(`Template missing <script type="application/json" id="state"> block — refusing to write a dashboard with no state.`);
  }
  if (!match[2].includes(PLACEHOLDER)) {
    throw new Error(`State block does not contain ${PLACEHOLDER} marker — template may already be filled in or has drifted.`);
  }
  const stateJson = JSON.stringify(state, null, 2);
  return templateHtml.replace(STATE_BLOCK_RE, (_, open, _body, close) => `${open}\n${stateJson}\n${close}`);
}

// ─── Path helpers ────────────────────────────────────────────────────────────

function resolveCoursePaths({ slug, statePath }) {
  if (statePath) {
    const abs = resolve(statePath);
    const dataDir = dirname(abs);
    const courseDir = dirname(dataDir);
    return {
      statePath: abs,
      dashboardDir: join(courseDir, 'dashboard'),
      dashboardOut: join(courseDir, 'dashboard', 'index.html'),
      slug: basename(courseDir),
    };
  }
  if (!slug) throw new Error('No slug or --state path provided.');
  const courseDir = join(REPO_ROOT, 'courses', slug);
  return {
    statePath:    join(courseDir, 'data', 'state.json'),
    dashboardDir: join(courseDir, 'dashboard'),
    dashboardOut: join(courseDir, 'dashboard', 'index.html'),
    slug,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return 0; }
  if (args.error) { console.error(args.error); console.error(usage()); return 1; }
  if (!args.slug && !args.statePath) { console.error(usage()); return 1; }

  let paths;
  try {
    paths = resolveCoursePaths(args);
  } catch (e) {
    console.error(`Path resolution failed: ${e.message}`);
    return 1;
  }

  if (!existsSync(paths.statePath)) {
    console.error(`state.json not found: ${paths.statePath}`);
    return 3;
  }

  let rawState;
  try {
    const text = await readFile(paths.statePath, 'utf8');
    rawState = JSON.parse(text);
  } catch (e) {
    console.error(`Failed to read/parse ${paths.statePath}: ${e.message}`);
    return 3;
  }

  // Migrate-then-recompute-then-validate. Migration is a one-shot lift to the
  // current schema. Readiness recomputation runs on every build so the
  // dashboard's headline numbers track calibration history deterministically.
  const beforeJson = JSON.stringify(rawState);
  const migrateResult = migrate(rawState);
  let state = migrateResult.state;
  const migrated = migrateResult.migrated;

  state = { ...state, readiness: computeReadiness(state) };

  let schema;
  try { schema = await loadSchema(); }
  catch (e) { console.error(`Failed to load schema: ${e.message}`); return 3; }

  const validate = buildValidator(schema);
  const valid = validate(state);
  if (!valid) {
    console.error(`Validation failed for ${paths.statePath} (after migration + readiness recompute):`);
    console.error(formatAjvErrors(validate.errors));
    return 2;
  }

  if (args.validateOnly) {
    console.log(`✓ ${paths.slug}: state.json valid${migrated ? ' (migrated to ' + CURRENT_VERSION + ' in-memory)' : ''}.`);
    return 0;
  }

  // Persist the updated state when anything changed (migration or readiness
  // recompute). Comparing serialized strings is sufficient because the script
  // preserves key order between reads/writes after the first build.
  const afterJson = JSON.stringify(state);
  if (beforeJson !== afterJson) {
    try {
      await writeFile(paths.statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
    } catch (e) {
      console.error(`State write failed for ${paths.statePath}: ${e.message}`);
      return 3;
    }
  }

  let templateHtml;
  try { templateHtml = await readFile(TEMPLATE_PATH, 'utf8'); }
  catch (e) { console.error(`Failed to read template: ${e.message}`); return 3; }

  let html;
  try { html = injectState(templateHtml, state); }
  catch (e) { console.error(`Render failed: ${e.message}`); return 3; }

  try {
    if (!existsSync(paths.dashboardDir)) await mkdir(paths.dashboardDir, { recursive: true });
    await writeFile(paths.dashboardOut, html, 'utf8');
  } catch (e) {
    console.error(`Failed to write dashboard: ${e.message}`);
    return 3;
  }

  console.log(`✓ ${paths.slug}: built ${paths.dashboardOut}${migrated ? ' (migrated to ' + CURRENT_VERSION + ')' : ''}.`);
  return 0;
}

main().then(code => process.exit(code)).catch(err => {
  console.error('Unexpected error:', err);
  process.exit(3);
});
