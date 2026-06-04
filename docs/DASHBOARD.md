# Dashboard Guide

> The dashboard (`courses/{slug}/dashboard/index.html`) is a self-contained visual snapshot of your study state. It is a **build artifact** rebuilt automatically by a `.claude` hook whenever `data/state.json` is written — after the state has passed schema validation. It works offline via `file://` — no server required.

> **Worked example available.** [`courses/example-saa-c03/dashboard/index.html`](../courses/example-saa-c03/dashboard/index.html) is a synthetic but fully-populated dashboard you can open right now — it exercises every section described below (header, debiased readiness with bias correction, progress bar, phase breakdown with a completed phase exam, calibration table with bank+synthetic source badges, weighted domain coverage, coverage-vs-blueprint gap, watchlist with both trap + confusion entries). It's also the regression fixture for the build script (`npm run validate-example`).

---

## How to open it

Double-click `courses/{slug}/dashboard/index.html`, or in your terminal:

```
open courses/{slug}/dashboard/index.html       # macOS
xdg-open courses/{slug}/dashboard/index.html  # Linux
start courses/{slug}/dashboard/index.html      # Windows
```

The dashboard renders immediately in your browser. No build step, no `npm install`, no server.

**Note:** The dashboard is a snapshot, not a live view. Refresh the browser tab after each coach session to see the latest state.

---

## What it shows

The dashboard surfaces 11 sections, in order of visual prominence:

1. **Header strip** — exam name, exam date, days remaining until exam, current day, current phase
2. **Headline readiness** — cold-water estimate %, margin over pass mark, rough pass probability (with formula shown)
3. **Progress bar** — % of total study days complete
4. **Phase breakdown** — each phase as a row with day-status pills (✅ complete / 🟡 in progress / ⬜ pending) and phase exam score when available
5. **Calibration chart** — predicted vs actual % over time (line/scatter)
6. **Domain coverage** — weighted bar chart (% of days complete × domain weight), reflects exam blueprint
6b. **Coverage vs Blueprint** — per-domain effort share vs declared weight, flags under-drilled high-weight domains (see [Coverage vs Blueprint](#coverage-vs-blueprint) below)
7. **Recent quiz scores** — last 5 quizzes with score and date
8. **Repeat-Miss Watchlist** — numbered list with occurrence count and most-recent date per item
9. **Recent misses** — last 5 misses added, by date
10. **Source priority strip** — primary/secondary/tertiary source count + last-touched dates

---

## How it gets updated

`data/state.json` is the canonical source of truth. The coach writes to it on any **structural change**:

- Marking a day complete or partial
- Recording a quiz score
- Logging a calibration entry (predicted vs actual)
- Adding or merging a `misses.md` entry
- Promoting a miss to the Repeat-Miss Watchlist
- Updating the cold-water readiness estimate
- Completing a phase exam
- Recording diagnostic results

Each write to `courses/{slug}/data/state.json` fires a `.claude/settings.json` PostToolUse hook that runs `scripts/build-dashboard.mjs {slug}`. The script validates the new state against `templates/state-schema.json` and rebuilds the HTML. If validation fails, no partial dashboard is written; the previous `index.html` stays intact and the error is logged.

The coach does NOT touch the dashboard for narrative-only changes (memory reflections, cheatsheet prose expansions) — those don't write `state.json`.

At the end of any session where state changed, the coach says: *"Dashboard updated; open `courses/{slug}/dashboard/index.html` to view current state."*

---

## Build flow

`scripts/build-dashboard.mjs` runs three steps in order:

1. **Migrate.** If `state.json`'s `schemaVersion` predates the current schema (or required-but-absent fields like `examProfile` are missing), the script lifts the file to the current version using v1-equivalent defaults, then persists the migrated state.
2. **Validate.** The migrated state is validated against `templates/state-schema.json` with `ajv` (draft-07). On failure, the script exits with a non-zero code, logs the offending instance path, and does **not** write the dashboard. The previous `index.html` remains untouched.
3. **Render.** If validation passes, the script reads `templates/dashboard-template.html`, replaces the body of the `<script type="application/json" id="state">…</script>` block with the validated state, and writes the result to `courses/{slug}/dashboard/index.html`. The `id="state"` tag is preserved verbatim so `dashboard.js` keeps working.

No templating engine — pure string substitution scoped to the state-injection block. The source template is never overwritten.

You can run the script manually:

```
node scripts/build-dashboard.mjs saa-c03            # build courses/saa-c03/dashboard/index.html
node scripts/build-dashboard.mjs saa-c03 --validate # validate only, no write
node scripts/build-dashboard.mjs --state /path/to/state.json   # build from an arbitrary path
```

The build script requires Node ≥ 18 and `ajv` (run `npm install` once after cloning).

---

## Why inline JSON instead of fetching `data/state.json`

Browsers block `fetch()` calls on `file://` URLs due to CORS policy. If the dashboard tried to `fetch('data/state.json')`, it would fail silently when opened as a local file.

Instead, the JSON state is embedded inside a `<script type="application/json" id="state">` block in the HTML. The dashboard's JavaScript reads it with:

```javascript
const state = JSON.parse(document.getElementById('state').textContent);
```

The canonical JSON file (`courses/{slug}/data/state.json`) is the source of truth; the inline JSON in `index.html` is a frozen copy from the last successful build.

---

## State schema

The full JSON schema for `data/state.json` lives at `templates/state-schema.json`. Key structure:

```
state.json
├── schemaVersion
├── exam            — name, date, pass mark, case mode
├── student         — name, learning style
├── plan            — total days, start date, current day, days remaining
├── domains[]       — id, name, weight, task statements
├── phases[]        — id, title, day range, days[], phase exam
│   └── days[]      — day number, date, topics, status, quiz score, notes
├── calibration[]   — date, label, predicted %, actual %, delta, interpretation
├── misses[]        — id, label, domain, occurrences[], count, watchlist status
├── watchlist[]     — position, miss id, label, occurrence count, diagnostic
├── sources         — primary[], secondary[], tertiary[]
├── diagnostic      — completed, date, per-domain results
├── readiness       — cold-water estimate, margin, pass probability, noise model
└── lastUpdated
```

All percent fields are integers or floats in 0–100 range (not decimals: `83`, not `0.83`).

---

## Pass probability — honest framing (script-computed and debiased)

The dashboard shows a **rough pass probability** computed deterministically by `scripts/build-dashboard.mjs` on every build. The coach writes the raw cold-water estimate and a one-line summary; the script handles all the math.

```
debiased_estimate = clamp(cold_water + bias, 0..100)
P(score ≥ pass_mark) = 1 - Φ((pass_mark - debiased_estimate) / std_dev)
```

Where:
- `cold_water` = `readiness.coldWaterEstimatePercent` (coach-written; raw vibes-based estimate)
- `bias`      = `readiness.biasCorrectionPercent` (script: mean of `calibration[].delta` when there are ≥ 5 entries; else 0)
- `std_dev`   = `readiness.noiseModelStdDevPercent` (script: observed stdev of `delta` when ≥ 5 entries, clamped to a 3% floor; else the ±7% prior)
- `pass_mark` = `exam.passMarkPercent`
- `Φ`         = standard normal CDF (Abramowitz & Stegun 26.2.17 approximation)

Why debias? An overconfident student keeps predicting higher than they actually score. Over time `calibration[].delta` accumulates negative deltas; the script averages them and subtracts the bias from the headline number. The user sees both: the **debiased estimate** in the headline plus a transparency line — *"Raw cold-water 85%; debiased by −7.2% (overconfident over 5 quizzes)."* — so the correction is auditable.

**Below 5 calibration points, the script falls back to bias = 0 and the ±7% prior** to avoid overfitting on small samples. The dashboard labels which mode it's in: `(±7% noise, prior)` vs `(±3% noise, from 5 quizzes)`.

**Scoring-model variants (`examProfile.scoring.model`):**
- `fixed_percent` (default) — `passMarkPercent` is a raw percent (e.g., 72%). Margin and probability computed as above.
- `scaled` — `passMarkPercent` is the percent-equivalent of the scaled cutoff; `scaleMin`/`scaleMax` give the scale (e.g., 100–1000). The dashboard labels the cutoff as *"720 of 1000 (72%)"* via linear interpolation. Math runs in percent space — if the actual scoring curve is non-linear (AWS's actually is), the displayed scaled number is an approximation, not a forecast.
- `pass_fail_unknown` — no published cut. Margin and probability are both suppressed; the dashboard shows a **qualitative band** instead (Strong / Likely passing / Marginal / Weak), derived from the debiased estimate alone.

**Color coding (numeric probability):**
- ≥ 0.95 (95%) → green
- ≥ 0.75 (75%) → amber
- < 0.75 → red

---

## Coverage vs Blueprint

The Coverage vs Blueprint card closes the loop on the data that **Domain Coverage** already collects: it doesn't just show how far along each domain is — it asks whether actual effort is being spent in proportion to the exam blueprint.

The card branches on `examProfile.blueprint.mode`:

| Mode | What "expected" means | Card behavior |
|---|---|---|
| `weighted` | `domain.weight / sum(weights)` (% share) | Show effort vs expected per domain; flag deltas ≥ ±5pp |
| `unweighted` | `1 / domains.length` (equal split) | Show effort vs equal share; flag deltas ≥ ±5pp |
| `none` | — | Section is hidden entirely — nothing to compare against |

**Effort share** = (completed days that touch domain D) / (sum of completed-day touches across all domains). Days that touch multiple domains — phase-exam days especially — count once per domain they cover. That's deliberate: a phase exam genuinely spans all the domains it covers, so its effort should be credited to each.

**Topic matching** reuses the exact same `day.topics ↔ domain.taskStatements` overlap rule that **Domain Coverage** uses (extracted into a shared `computeDomainDays()` helper), so the two cards never disagree about which days touch which domains.

**Sample-size floor.** Below 3 total completed days, the card shows a "not enough data yet" message and does not render bars or flags. Gap analysis on 1–2 days is dominated by which day was completed first, not by drift from the blueprint.

**Flag threshold** is ±5 percentage points of share. Anything closer is labeled `on track`; anything farther is labeled `under-drilled` (effort below blueprint) or `over-drilled` (effort above). The footer lists the under-drilled domains explicitly so the coach can read it at a glance during session start.

**Surfacing it during sessions.** The per-course `CLAUDE.md` (rendered from `CLAUDE.md.template`) includes a step in the session-start protocol that tells the coach to glance at this card and call out any under-drilled high-weight domain before announcing the next day's topic.

## Calibration chart

The calibration chart plots predicted % vs actual % for each quiz/phase exam logged in `calibration[]`. Good calibration = points near the diagonal. Points above the diagonal = underconfident (actual > predicted). Points below = overconfident (actual < predicted).

**Delta color coding per entry:**
- `|delta| ≤ 3` → green (well calibrated)
- `|delta| ≤ 7` → amber (mild bias)
- `|delta| > 7` → red (significant miscalibration)

---

## Charts library

By default, the calibration and domain-coverage charts use [Chart.js](https://www.chartjs.org/) loaded via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

Chart.js loads from a CDN on first view; if you open the dashboard fully offline the chart degrades gracefully (the calibration data still renders as a table — only the line plot is skipped). For permanent offline operation, comment out the CDN `<script>` tag in `templates/dashboard-template.html` and substitute hand-rolled SVG chart functions in `dashboard/dashboard.js`. The render functions are designed to be swapped without affecting other sections.

---

## Modifying the dashboard

The rendering logic lives in `dashboard/dashboard.js`. Each section is a separate function:

```
renderHeaderStrip()
renderReadinessCard()
renderProgressBar()
renderPhaseBreakdown()
renderCalibrationChart()
renderDomainCoverage()
renderCoverageGap()
renderRecentQuizzes()
renderWatchlist()
renderRecentMisses()
renderSourcePriority()
renderLastUpdated()
```

Functions are intentionally small and independent. You can update one without touching the others.

After modifying `dashboard.js` or `dashboard.css`, run `node scripts/build-dashboard.mjs {slug}` (or write any field in `state.json` to fire the hook) so the rebuilt `index.html` picks up the new render code.

**Keep dashboard changes scoped.** Major extensions (drill-down views, PDF export, live reload, theming) are deliberately out of scope until the core flow has been validated in a real prep cycle.
