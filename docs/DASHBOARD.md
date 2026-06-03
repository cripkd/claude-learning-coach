# Dashboard Guide

> The dashboard (`courses/{slug}/dashboard/index.html`) is a self-contained visual snapshot of your study state. It is a **build artifact** rebuilt automatically by a `.claude` hook whenever `data/state.json` is written — after the state has passed schema validation. It works offline via `file://` — no server required.

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

The dashboard surfaces 10 sections, in order of visual prominence:

1. **Header strip** — exam name, exam date, days remaining until exam, current day, current phase
2. **Headline readiness** — cold-water estimate %, margin over pass mark, rough pass probability (with formula shown)
3. **Progress bar** — % of total study days complete
4. **Phase breakdown** — each phase as a row with day-status pills (✅ complete / 🟡 in progress / ⬜ pending) and phase exam score when available
5. **Calibration chart** — predicted vs actual % over time (line/scatter)
6. **Domain coverage** — weighted bar chart (% of days complete × domain weight), reflects exam blueprint
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

## Pass probability — honest framing

The dashboard shows a **rough pass probability** computed as:

```
P(score ≥ pass_mark) = 1 - Φ((pass_mark - estimate) / std_dev)
```

Where:
- `estimate` = `readiness.coldWaterEstimatePercent` (Claude's honest assessment)
- `pass_mark` = `exam.passMarkPercent`
- `std_dev` = `readiness.noiseModelStdDevPercent` (default: 7%)
- `Φ` = the standard normal CDF

**This is labeled in the dashboard as: "Rough pass probability (assuming ±7% exam-day noise)"**

The standard deviation is a heuristic — exam-day variance depends on sleep, question sampling, and factors the model can't know. The formula is shown next to the number so the student understands this is not a forecast. The noise model std dev is configurable in `state.json` under `readiness.noiseModelStdDevPercent`.

Claude computes this value when updating readiness. The dashboard renders it as-is; it does not recompute from raw fields.

**Color coding:**
- ≥ 0.95 (95%) → green
- ≥ 0.75 (75%) → amber
- < 0.75 → red

---

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
renderRecentQuizzes()
renderWatchlist()
renderRecentMisses()
renderSourcePriority()
renderLastUpdated()
```

Functions are intentionally small and independent. You can update one without touching the others.

After modifying `dashboard.js` or `dashboard.css`, run `node scripts/build-dashboard.mjs {slug}` (or write any field in `state.json` to fire the hook) so the rebuilt `index.html` picks up the new render code.

**Keep dashboard changes scoped.** Major extensions (drill-down views, PDF export, live reload, theming) are deliberately out of scope until the core flow has been validated in a real prep cycle.
