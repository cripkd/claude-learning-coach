# Exam Coach Template

A Claude Code-powered study coach for scenario-based multiple-choice certification exams — the kind with a published, weighted domain blueprint (AWS, Azure, GCP, Anthropic, and similar vendors). Clone it, run one slash command, answer ~10 questions — you have a personalized study coach that maintains memory across sessions, tracks progress, runs scenario-MCQ quizzes, and calibrates against your exam date.

**See it before you set it up.** A fully-populated worked-example course lives at [`courses/example-saa-c03/`](courses/example-saa-c03/) — open `courses/example-saa-c03/dashboard/index.html` in any browser to see what a mid-prep dashboard looks like (5-day SAA-C03 slice, debiased readiness, watchlist, coverage gap, bank-vs-synthetic calibration split). It's synthetic — the student "Alex" doesn't exist — and it's also the canonical regression fixture for the build script (`npm run validate-example`).

---

## Scope

What this template targets today, what's planned, and what it isn't trying to do.

**Supported now**
- Scenario-based multiple-choice certification exams with tiered textual sources (primary / secondary / tertiary).
- Blueprint variants: **weighted** (e.g., AWS / Azure / GCP / Anthropic cert exams with published per-domain weights), **unweighted** (domains listed without weights — equal allocation), and **no blueprint** (domains emerge from the diagnostic and early sessions).
- Scoring variants: **fixed percent**, **scaled score** (e.g., 720 of 1000), and **pass/fail with no published cut** (qualitative readiness band).
- Question formats: 4 or 5 options, single-correct (default) or **multiple-correct** with all-or-nothing or partial credit.
- Recall-heavy mixes: the `confusion` miss type drills A-vs-B pairs head-to-head (separate from scenario traps); the `scenarioRecallRatio` knob biases each session toward scenarios or recall.
- Readiness self-correction: the dashboard debiases the cold-water estimate from the student's own predicted-vs-actual history once there are ≥ 5 calibration points.
- **Question-bank import:** drop real practice questions into `courses/{slug}/bank/` and the coach draws from them in quizzes alongside synthetic generation. Bank actuals are weighted 2× synthetic in the readiness debias (closer-to-real-exam signal). Format spec in `templates/question-bank.md`; the bank is fully optional.
- **Coverage-vs-blueprint check:** the dashboard flags any domain whose actual study effort is ≥ 5pp below its expected share (`weight / sumWeights` in weighted mode, `1/n` in unweighted), so under-drilled high-weight domains surface before exam day.

> See [`docs/EXAM-PROFILES.md`](docs/EXAM-PROFILES.md) for the full `examProfile` descriptor — every axis above lives there as an enum or constant, with defaults that reproduce the CCA-shaped exam out of the box.

**Not yet (roadmap)**
- Sparse-source handling (when authoritative sources are partial or missing).
- ~~Active source parsing — automatic indexing of dropped source files so the coach can ground answers without being told which section to read.~~ **Shipped** as `/index-sources` (see Quick Start).

**Out of scope**
- Non-MCQ formats: free-response, performance / lab, oral, coding exercises.
- Adaptive / computerized-adaptive (CAT) exams.
- Language learning and other skills-based / "any deadline-driven knowledge acquisition" use cases.

---

## What makes it different from a study tracker

- **Two separate files for rules vs traps** — `cheatsheet.md` holds forward-looking decision rules ("here's the model, apply it"); `misses.md` holds retrospective trap patterns ("here's where I got fooled"). Different mental modes; mixing them dilutes both.
- **Repeat-Miss Watchlist with auto-promotion** — when you miss the same conceptual trap twice, it's promoted to a dedicated Watchlist section, the highest-priority drill surface in the pre-exam window.
- **Honest cold-water calibration** — numeric estimates ("88–92% blended"), not vibes. `CALIBRATION.md` tracks predicted vs actual per quiz and phase exam so you can see whether you're over- or underconfident.
- **Quiz answer-leak prevention** — Claude Code's terminal autocomplete can leak quiz answers if the prompt ends on a question token. The coach follows explicit rules to prevent this (end on neutral prose, no sample answer strings, randomize A/B/C/D distribution).
- **Source-priority-aware** — primary > secondary > tertiary. When sources disagree the coach follows the declared hierarchy; when all sources are silent it marks the answer "out-of-source" rather than fabricating.
- **Source-grounding gate** — a `Stop` hook (`scripts/day-delivery-gate.mjs`) refuses to end the assistant turn if the coach claims to deliver Day N but hasn't actually read the cited source ranges in the current session. Required ranges per day live in `sources/_dayplan.md`; coverage is computed from the session transcript. Turns "read the sources before teaching" from a CLAUDE.md rule into a runtime invariant. See [`docs/DESIGN.md`](docs/DESIGN.md) § 10.
- **Self-contained dashboard** (`dashboard/index.html`) — visual snapshot of progress, calibration, readiness, and the watchlist. Includes a coverage-vs-blueprint check that surfaces under-drilled high-weight domains, so the actual effort distribution is held against the declared exam weight. Regenerated by Claude on every structural state change. Works offline via `file://`, no server required.

---

## Quick start

```bash
git clone https://github.com/cripkd/claude-learning-coach my-exam-prep
cd my-exam-prep
npm install     # one-time: installs ajv for dashboard schema validation
claude          # opens Claude Code in this directory
```

Requires Node.js ≥ 18 for the dashboard build tooling.

Then in the Claude Code prompt, in this order:

```
/init-coach          # answer the 10–12 interview questions (≈ 5 minutes)
                     # drop your source materials into courses/{slug}/sources/
                     # (and optionally a real question bank into courses/{slug}/bank/)
/index-sources       # builds the topic index — maps each task statement to file:line ranges in your sources
                     # so the coach can find relevant content in seconds instead of re-reading every file each day
"run diagnostic"     # pre-study assessment, used to rebalance the phase plan
"let's go" / "Day 1" # start studying
```

Subsequent sessions start with `"let's go"` or `"Day N"` directly. Re-run `/index-sources` any time you add or update files in `sources/`.

---

## What `/index-sources` does

After `/init-coach` and after you've added files to `sources/`, run `/index-sources`. It reads every file in your source folder once and produces `sources/_index.md` — a topic-keyed map from each exam task statement (e.g., `D1-T1.1 Design secure access to AWS resources`) to specific `file:line-range` citations in your primary and secondary sources, plus an explicit list of coverage gaps where sources are thin.

The coach reads `_index.md` at the start of every daily session and reads only the cited ranges — typically ~10 KB instead of re-reading hundreds of KB of source material per day. This is what makes "ground the day's concepts in your declared sources" actually feasible. Without the index, the coach falls back to training-data knowledge, with the trade-off that explanations aren't anchored to your specific materials.

Re-run any time `sources/` changes. The output is idempotent — previous `_index.md` is overwritten.

---

## Optional: Local Semantic Retrieval

By default the coach reads your `sources/` directly (`direct` mode) — no extra setup. As your materials grow, two optional layers help it read only what's relevant, both all-local (no cloud, no API keys):

- **Index mode** (no install): run `/index-sources` to build `sources/_index.md` (a topic→file:line map) and `sources/_dayplan.md`. The coach then reads only the cited ranges for the day's task statements. Re-run `/index-sources` whenever sources change. This is the existing `/index-sources` flow — the indexing tier adds bounded retrieval without any new dependencies.

- **Vector mode** (one small library + a ~23 MB model, CPU-only, offline after first download):
  1. `npm run setup:retrieval` — installs the embedding runtime and downloads the model to `.cache/`
  2. Create `courses/{course}/data/retrieval-config.json`:
     ```json
     { "mode": "vector", "model": "Xenova/all-MiniLM-L6-v2", "topK": 8, "byteBudget": 24000 }
     ```
  3. `npm run embeddings:build -- {course}` — embeds all source and bank files (re-runs automatically via hook when `sources/` changes)

**Fallback / disable:** the coach degrades automatically `vector → index → direct`. To turn vector off, delete `retrieval-config.json` or set `"mode": "direct"`.

**⚠️ `--no-save` caveat:** `npm run setup:retrieval` installs the embedding runtime with `--no-save`, so it is not recorded in `package.json`. A later `npm install` or `npm ci` will remove it — re-run `npm run setup:retrieval` if vector mode reports the runtime is missing.

**Keeping things fresh:**
- Source changes trigger automatic re-embedding via the PostToolUse hook — you don't have to re-run `embeddings:build` manually.
- `_index.md` is **not** auto-refreshed by the hook (it's a manual `/index-sources`). If it becomes stale the coach warns and falls back.
- Vector mode still reads each day's required source ranges before delivering content — `retrieve.mjs` retrieval is additive, not a substitute for the delivery gate.

---

## What `/init-coach` asks you

The setup is a guided interview — no manual file editing required:

1. **Exam/cert name** — full name + short abbreviation (e.g., `"AWS Solutions Architect Associate (SAA-C03)"`)
2. **Exam date** — `YYYY-MM-DD`, or `"ongoing"` if not date-bound
3. **Your name** — optional; used in the coach's tone
4. **Your background** — 1–3 sentences: role, prior experience, known gaps
5. **How you learn best** — scenarios/hands-on, lecture-style, drilling, or mixed
6. **Exam domains** — list with weights if known (e.g., `"D1: 30%, D2: 22%, ..."`), without weights (equal allocation), or `"no blueprint"` (domains emerge from the diagnostic)
7. **Case reasoning vs recall** — does the exam test integrated scenarios, or is it primarily recall? (affects phase plan shape)
7a. **Scoring & question format** (optional — defaults match a typical cert exam) — fixed-percent / scaled / pass-fail-unknown cutoff; 4 or 5 options; single- or multiple-correct (with all-or-nothing or partial credit). Skip with `"default"`. Full descriptor in [`docs/EXAM-PROFILES.md`](docs/EXAM-PROFILES.md).
8. **Total study days available** — integer
9. **Source materials** — paths/files to drop in, or `"I'll add them later"`
9a. **Question bank** (optional) — real practice questions to drop into `bank/`, or `"no"`. See [`docs/SETUP.md`](docs/SETUP.md#adding-a-question-bank-optional).
10. **Reference resources** — courses / docs / community links to surface in daily sessions (optional)
11. **License preference** — default MIT

After the interview, the coach generates your `CLAUDE.md`, copies and fills in all starter files, writes the initial `data/state.json`, and renders the first `dashboard/index.html`.

---

## What you provide

- Source materials (official guide, courses, docs) as markdown or text in `sources/`
- Priority declarations in `SOURCES.md` (primary / secondary / tertiary)
- Your background and learning preferences (during `/init-coach`)
- Exam date or learning deadline

## What the coach provides

- Per-day session structure: concepts → exam traps → decision rules → practice questions → hands-on exercise
- Domain-weighted phase plan, front-loaded to your weakest areas after the diagnostic
- Case-grounded quizzes with full post-answer explanation of all four options
- Trap-pattern drilling via `misses.md` and the Repeat-Miss Watchlist
- Pre-exam confidence calibration (predicted vs actual, tracked over time)
- Final-72-hour playbook (see [`docs/ENDGAME.md`](docs/ENDGAME.md))
- Visual progress dashboard, rebuilt automatically on every state change (schema-validated build artifact)

---

## Repo layout

Each course lives in its own folder under `courses/`. You can run multiple courses at the same time with clean separation.

```
courses/
└── saa-c03/               ← one folder per course (slug from exam short name)
    ├── CLAUDE.md           ← course-specific coach (generated by /init-coach)
    ├── memory.md           ← session log
    ├── progress.md         ← phase/day tracker
    ├── cheatsheet.md       ← forward-looking rules
    ├── misses.md           ← trap index + Repeat-Miss Watchlist
    ├── cases.md            ← case patterns
    ├── SOURCES.md          ← source material index
    ├── DIAGNOSTIC.md       ← pre-study diagnostic
    ├── CALIBRATION.md      ← predicted vs actual log
    ├── sources/            ← your study materials
    ├── bank/               ← optional question bank (real practice questions)
    ├── quizzes/            ← per-day quiz records
    ├── data/state.json     ← canonical structured state (source of truth)
    └── dashboard/
        └── index.html      ← build artifact (rebuilt by the hook on every state write)
```

The repo root contains only template machinery (never modified during study sessions):

| Root file | Purpose |
|---|---|
| `CLAUDE.md` | Multi-course dispatcher — tells Claude to ask which course and load it |
| `CLAUDE.md.template` | Template for per-course CLAUDE.md (filled by `/init-coach`) |
| `templates/` | Format guides and the JSON schema for `data/state.json` |
| `starter-files/` | Blank file skeletons copied by `/init-coach` |
| `dashboard/dashboard.css` + `.js` | Shared dashboard source (copied per course) |
| `scripts/build-dashboard.mjs` | Migrate-then-validate-then-render: rebuilds a course's `dashboard/index.html` from its `data/state.json` |
| `scripts/build-embeddings.mjs` | Optional: embeds `sources/` and `bank/` into `data/embeddings.ndjson` for vector retrieval. Requires `npm run setup:retrieval`. |
| `scripts/retrieve.mjs` | Optional: cosine-similarity query over `embeddings.ndjson`, with soft re-rank by domain/task-statement. |
| `.claude/settings.json` | Claude Code hook config — PostToolUse hooks rebuild the dashboard on every `state.json` write and re-embed sources on every `sources/`/`bank/` write (when vector mode is active). |
| `package.json` | Node tooling (`ajv` for schema validation). Run `npm install` once after cloning. Optional vector retrieval: `npm run setup:retrieval`. |
| `docs/` | Design rationale, setup guide, endgame playbook, dashboard internals |

**`data/state.json` is canonical.** All numeric/structural fields (scores, statuses, dates, occurrence counts) live there. The markdown files are rendered views and human annotations. The dashboard is a deterministic build artifact — never hand-written.

---

## Day-to-day use

Every session:

```
claude              # open Claude Code in the project directory
"let's go"          # or "continue" or "Day 7" or "SAA-C03"
```

The root `CLAUDE.md` dispatcher detects your active course and loads it. The course coach reads `memory.md` and `progress.md`, tells you where you are, and picks up where you left off. At session end it updates memory, progress, and quiz records; the dashboard is rebuilt automatically by a hook whenever `data/state.json` changes.

Multiple days per session is encouraged — if you're in flow, keep going.

---

## Dashboard

Open `courses/{your-course}/dashboard/index.html` in any browser. On macOS:

```bash
open courses/saa-c03/dashboard/index.html
```

It shows:

- Header: exam name, days remaining, current day and phase
- Headline readiness: cold-water estimate, margin over pass mark, rough pass probability
- Phase breakdown with day-status pills and phase exam scores
- Calibration chart: predicted vs actual over time
- Domain coverage weighted by exam blueprint
- Coverage vs blueprint: per-domain effort share vs declared weight (or equal split), flagging under-drilled high-weight domains
- Recent quiz scores, Repeat-Miss Watchlist, recent misses
- Source priority strip

Each course dashboard is rebuilt automatically by a `.claude` hook whenever `courses/{slug}/data/state.json` changes — after the state has passed schema validation. Refresh the tab after each session to see the latest snapshot. See [`docs/DASHBOARD.md`](docs/DASHBOARD.md) for full details.

---

## Docs

| File | Contents |
|---|---|
| [`docs/SETUP.md`](docs/SETUP.md) | Full setup guide, manual customization path, day-to-day reference |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Why the template is designed the way it is — rejected alternatives and rationale |
| [`docs/EXAM-PROFILES.md`](docs/EXAM-PROFILES.md) | The `examProfile` descriptor — every parameterization axis (blueprint mode, scoring model, question format), with defaults |
| [`docs/ENDGAME.md`](docs/ENDGAME.md) | Final-72-hour playbook: last week, Day -3, Day -2, rest day, exam day |
| [`docs/DASHBOARD.md`](docs/DASHBOARD.md) | Dashboard internals, regeneration flow, pass-probability framing |

---

## Status

**v2 (current — schema `2.3`).** MCQ parameterization landed: blueprint degradation (weighted / unweighted / none), scoring variants (fixed-percent / scaled / pass-fail-unknown), question formats (4-or-5 options, multi-correct with all-or-nothing or partial credit), the recall-vs-scenario mix, the trap-vs-confusion miss bifurcation, the closed calibration debias loop, question-bank import with a 2× calibration weight, the coverage-vs-blueprint dashboard check, the source-grounding delivery gate, and the optional all-local semantic retrieval tier (vector mode). MIT licensed.

## Roadmap

- **v2.x (remaining):** sparse-source handling — what the coach does when authoritative sources are partial or missing.
- **Future (gated on adoption):** Claude Code plugin packaging — wrap the template + commands + hooks as an installable plugin. Not scoped yet; decision pending real-world usage.

## License

MIT — see [`LICENSE`](LICENSE).
