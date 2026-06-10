# Exam Coach

Most people study for certifications the same way: watch a course, take notes, do a practice test the week before, and hope for the best. There's no real feedback loop. No honest signal on whether the hours are actually moving the needle. No one to ask when something doesn't click at 11pm.

This is a personal study coach that builds a structured plan around your exam, teaches the material, quizzes you, and tells you — with a number, not a feeling — whether you're ready to pass. When you don't understand something, you ask in plain English. It explains, re-explains from a different angle, and has unlimited time to do it. Between sessions it remembers where you left off. Over time it tracks which concepts you keep getting wrong and makes sure they get drilled before exam day.

**It works even if your exam doesn't have a well-defined curriculum.** Bring whatever materials you have — official guides, course notes, community cheatsheets — and it builds the curriculum from them. Bring nothing at all, and it works from its own knowledge. No exam at the end? That's fine too — it's a tutor, not just an exam-prep tool.

Built primarily for certification exams (AWS, Azure, GCP, and similar), but usable for any structured knowledge domain Claude has knowledge of.

---

## See it in action

A fully-populated example lives at [`courses/example-saa-c03/`](courses/example-saa-c03/). Open `courses/example-saa-c03/dashboard/index.html` in any browser to see a mid-prep dashboard: debiased readiness estimate, calibration chart, watchlist, domain coverage vs blueprint, and more. The student "Alex" is synthetic — it's a fixture, not a real prep run.

---

## Quick Start

```bash
git clone https://github.com/cripkd/claude-learning-coach my-exam-prep
cd my-exam-prep
npm install     # one-time: installs ajv for schema validation
claude          # opens Claude Code
```

Requires Node.js ≥ 18.

Then in the Claude Code prompt:

```
/init-coach          # guided setup — ~10 questions, ~5 minutes
                     # drop your source materials into courses/{slug}/sources/
                     # (optional: drop real practice questions into courses/{slug}/bank/)
/index-sources       # builds a topic → file:line map so the coach reads only what's relevant
"run diagnostic"     # pre-study assessment; rebalances the phase plan
"let's go"           # start Day 1
```

Subsequent sessions: just open Claude Code and say `"let's go"` or `"Day N"`. Re-run `/index-sources` any time you add files to `sources/`.

---

## What you bring / What it does

**You bring:**
- Source materials (official guide, course notes, docs) as markdown or plain text in `sources/`
- Priority tiers: primary / secondary / tertiary, declared in `SOURCES.md`
- Your background, learning style, and exam date (captured during `/init-coach`)
- Optionally: real practice questions in `bank/`

**It does:**
- Per-day session structure: concepts → exam traps → decision rules → practice questions
- Domain-weighted phase plan, front-loaded to your weakest areas after the diagnostic
- Quizzes with full explanation of all options — bank questions weighted 2× synthetic in readiness math
- Tracks misses and auto-promotes recurring traps to a Repeat-Miss Watchlist
- Calibrates your confidence: predicted vs actual per quiz, debiased once you have ≥ 5 data points
- Rebuilds a visual progress dashboard automatically on every state change
- Final-72-hour playbook (see [`docs/ENDGAME.md`](docs/ENDGAME.md))

---

## Day-to-day use

```bash
claude          # open Claude Code in the project directory
```

Then: `"let's go"` or `"continue"` or `"Day 7"`. The dispatcher loads your active course, reads the session log and progress file, and picks up where you left off. Multiple days per session is fine — if you're in flow, keep going.

The dashboard rebuilds automatically whenever the state changes. Refresh the tab after each session.

---

## Dashboard

Open in any browser:

```bash
open courses/{your-course}/dashboard/index.html   # macOS
```

Shows:
- Header: exam name, days remaining, current day and phase
- Readiness: cold-water estimate, margin over pass mark, rough pass probability
- Phase breakdown with day-status pills and phase exam scores
- Calibration chart: predicted vs actual over time
- Domain coverage weighted by exam blueprint
- Coverage vs blueprint: flags under-drilled high-weight domains
- Recent quiz scores, Repeat-Miss Watchlist, recent misses
- Source priority strip

See [`docs/DASHBOARD.md`](docs/DASHBOARD.md) for internals and pass-probability framing.

---

## How the coach works

A few design choices that make this different from a study tracker:

- **Separate rules vs traps files** — `cheatsheet.md` holds forward-looking decision rules; `misses.md` holds retrospective trap patterns. Different mental modes; mixing them dilutes both.
- **Repeat-Miss Watchlist** — miss the same trap twice and it's auto-promoted to the highest-priority drill surface. No manual curation.
- **Honest calibration** — numeric estimates from your own history, not vibes. The coach debiases its readiness estimate from your predicted-vs-actual record once there are ≥ 5 calibration points.
- **Source-aware answers** — primary > secondary > tertiary. When sources disagree the coach follows the declared hierarchy; when all sources are silent it says so rather than guessing.
- **Source-grounding gate** — a `Stop` hook refuses to end the turn if the coach claims to deliver Day N without having read the cited source ranges in the current session. "Read sources before teaching" is a runtime invariant, not a rule. See [`docs/DESIGN.md`](docs/DESIGN.md) § 10.

Full design rationale and rejected alternatives: [`docs/DESIGN.md`](docs/DESIGN.md).

---

## Setup interview (`/init-coach`)

A guided interview — no manual file editing. You'll be asked:

1. **Exam name** — full name + short abbreviation (e.g., `"AWS Solutions Architect Associate (SAA-C03)"`)
2. **Exam date** — `YYYY-MM-DD`, or `"ongoing"` if not date-bound
3. **Your name** — optional; used in tone
4. **Your background** — role, prior experience, known gaps (1–3 sentences)
5. **How you learn best** — scenarios/hands-on, lecture-style, drilling, or mixed
6. **Exam domains** — with weights if known (`"D1: 30%, D2: 22%"`), without (equal split), or `"no blueprint"`
7. **Scenario vs recall** — integrated case reasoning or primarily recall? Affects phase plan shape.
8. **Scoring & question format** — fixed-percent / scaled / pass-fail-unknown; 4 or 5 options; single- or multiple-correct. Skip with `"default"`. Full spec: [`docs/EXAM-PROFILES.md`](docs/EXAM-PROFILES.md).
9. **Total study days**
10. **Source materials** — paths to drop in, or `"I'll add them later"`
11. **Question bank** — real practice questions for `bank/`, or `"no"`. See [`docs/SETUP.md`](docs/SETUP.md#adding-a-question-bank-optional).
12. **Reference resources** — courses, docs, community links (optional)

After the interview, the coach generates your `CLAUDE.md`, copies and fills all starter files, writes `data/state.json`, and renders the first `dashboard/index.html`.

---

## Repo layout

Each course lives in its own folder under `courses/`. Multiple courses can run in parallel with clean separation.

```
courses/
└── saa-c03/               ← one folder per course
    ├── CLAUDE.md           ← course-specific coach (generated by /init-coach)
    ├── memory.md           ← session log
    ├── progress.md         ← phase/day tracker
    ├── cheatsheet.md       ← forward-looking decision rules
    ├── misses.md           ← trap index + Repeat-Miss Watchlist
    ├── cases.md            ← case patterns
    ├── SOURCES.md          ← source priority declarations
    ├── DIAGNOSTIC.md       ← pre-study diagnostic results
    ├── CALIBRATION.md      ← predicted vs actual log
    ├── sources/            ← your study materials
    ├── bank/               ← optional real practice questions
    ├── quizzes/            ← per-day quiz records
    ├── data/state.json     ← canonical structured state (source of truth)
    └── dashboard/
        └── index.html      ← build artifact (auto-rebuilt on every state write)
```

Root-level files (template machinery — never modified during study):

| File | Purpose |
|---|---|
| `CLAUDE.md` | Multi-course dispatcher |
| `CLAUDE.md.template` | Template for per-course CLAUDE.md |
| `templates/` | Format guides and the JSON schema for `state.json` |
| `starter-files/` | Blank skeletons copied by `/init-coach` |
| `dashboard/dashboard.css` + `.js` | Shared dashboard source (copied per course) |
| `scripts/build-dashboard.mjs` | Migrate → validate → render: rebuilds `dashboard/index.html` from `state.json` |
| `.claude/settings.json` | Hook config — rebuilds dashboard on every `state.json` write |
| `package.json` | Node tooling (`ajv` for schema validation) |
| `docs/` | Design rationale, setup guide, endgame playbook, dashboard internals |

`data/state.json` is canonical. All numeric and structural fields live there. Markdown files are human-readable views. The dashboard is a deterministic build artifact.

---

## Docs

| File | Contents |
|---|---|
| [`docs/SETUP.md`](docs/SETUP.md) | Full setup guide, manual customization, day-to-day reference |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design rationale and rejected alternatives |
| [`docs/EXAM-PROFILES.md`](docs/EXAM-PROFILES.md) | Every exam parameterization axis with defaults |
| [`docs/ENDGAME.md`](docs/ENDGAME.md) | Final-72-hour playbook |
| [`docs/DASHBOARD.md`](docs/DASHBOARD.md) | Dashboard internals and pass-probability framing |

---

---

## ⚡ Advanced: Semantic Retrieval (optional)

By default the coach reads your `sources/` files directly. As your materials grow, an optional local retrieval layer helps it find the relevant passages for each day's topics automatically — no cloud, no API keys, runs entirely on your machine.

### What it does

When active, the coach queries your embedded sources at the start of each session and reads only the top-ranked passages for the day's task statements — typically ~10–24 KB instead of re-reading hundreds of KB of material. This makes source-grounded answers faster and more precise.

There are two tiers:

| Tier | What it needs | What it does |
|---|---|---|
| **Index** (default, no install) | Nothing | `/index-sources` builds a `topic → file:line` map. Coach reads only the cited ranges. |
| **Vector** (optional) | ~23 MB model, one npm command | Semantic embedding search. Better recall across paraphrased content. |

The index tier is what `/index-sources` already gives you. Vector mode is the optional add-on.

### When to use vector mode

- Your `sources/` folder is large (> ~100 KB total)
- You want semantic matching (finds relevant content even when exact terminology differs)
- You're comfortable with a one-time ~23 MB model download

If you just want basic source-grounding, the index tier (`/index-sources`) is enough.

### Dependencies

- Node.js ≥ 18 (already required)
- `@huggingface/transformers` — installed by the setup command below, **not** recorded in `package.json`
- ~23 MB model download on first run (cached to `.cache/`, CPU-only, works offline after)

> **⚠️ Note:** `npm run setup:retrieval` installs the embedding runtime with `--no-save`. Running `npm install` or `npm ci` later will remove it — re-run `npm run setup:retrieval` if vector mode reports the runtime is missing.

### Setup

**Step 1** — Install the embedding runtime:
```bash
npm run setup:retrieval
```

**Step 2** — Create `courses/{slug}/data/retrieval-config.json`:
```json
{ "mode": "vector", "model": "Xenova/all-MiniLM-L6-v2", "topK": 8, "byteBudget": 24000 }
```

**Step 3** — Build the embeddings:
```bash
npm run embeddings:build -- {slug}
```

That's it. Re-embedding runs automatically via a hook whenever `sources/` or `bank/` changes.

### Fallback and disabling

The coach degrades automatically: **vector → index → direct**. To turn vector mode off, delete `retrieval-config.json` or set `"mode": "direct"`.

---

## How to read the dashboard

A glossary of every metric and concept shown in the dashboard.

---

### Readiness card

**Cold-water estimate**
The coach's honest, unvarnished guess at what you'd score on the real exam today, expressed as a percent — written after each quiz or phase exam. "Cold water" because it's meant to be sobering, not encouraging: the coach is asked to correct for optimism bias before writing the number.

**Debiased estimate**
The cold-water estimate corrected for your systematic over- or underconfidence: `debiased = cold_water + bias_correction`. This is the headline number shown in the readiness card. Until there are ≥ 5 calibration entries it equals the raw cold-water estimate (no data yet to debias from).

**Bias correction**
The weighted mean of all your calibration deltas (bank deltas count 2×, synthetic 1×): if you've been consistently predicting 5% higher than you actually score, bias = −5 and the debiased estimate is pulled down by 5 points. A negative value means overconfident; positive means underconfident. Shown in the summary line as *"debiased by −3.3% (overconfident over 5 quizzes)"* so the correction is auditable.

**Margin over pass mark**
`debiased_estimate − pass_mark` — how far above (positive) or below (negative) the passing cut your debiased estimate sits right now. Green when positive, red when negative.

**Rough pass probability**
The probability that your actual exam score will meet or exceed the pass mark, modeled as a normal distribution: `P = 1 − Φ((pass_mark − debiased_estimate) / noise_std_dev)`, where Φ is the standard normal CDF. It's "rough" because it assumes your exam-day score is drawn from a normal distribution centered on your debiased estimate — a simplification, not a guarantee. Color-coded: ≥ 95% green, ≥ 75% amber, < 75% red.

**Noise std dev** (`±X% noise`)
The spread of the normal distribution used in the pass-probability calculation — how much exam-day variance to expect. Before 5 calibration entries, uses a conservative ±7% prior. After ≥ 5 entries, uses the observed weighted standard deviation of your calibration deltas, clamped to a 3% floor (to prevent overconfident probabilities on low-variance small samples).

---

### Calibration table

**Predicted %**
What you said your score would be before taking the quiz — entered as a self-assessment and stored in `calibration[].predictedPercent`.

**Actual %**
What you actually scored — stored in `calibration[].actualPercent`.

**Delta**
`actual − predicted`. Negative = overconfident (predicted higher than you scored); positive = underconfident. Color-coded per entry: |delta| ≤ 3 → green (well-calibrated), ≤ 7 → amber, > 7 → red.

**BANK / SYN badge**
Whether the quiz drew from your imported question bank (`BANK`) or from coach-generated questions (`SYN`). Bank questions are verbatim practice material closer to real-exam conditions, so their deltas count 2× synthetic in the bias and noise calculations.

---

### Domain Coverage

**Coverage bar per domain**
Percentage of study days planned for this domain that are marked complete. A day is counted toward a domain if any of its `topics[]` strings match a `taskStatement` in that domain — exact string match. Days that span two domains (e.g., a phase-exam day) count toward both.

**Blueprint weight** (the `30%` chip next to the domain name)
The exam vendor's declared share of questions from this domain. Set during `/init-coach` from the official exam guide. This is the target — the Coverage vs Blueprint card measures whether your actual study time matches it.

---

### Coverage vs Blueprint

This card answers: *are you spending your study time in the same proportions as the exam allocates its questions?*

**Effort %**
Your actual study time share for this domain: `(completed days touching this domain) ÷ (total completed day-touches across all domains) × 100`. A domain with 2 of 5 completed day-touches has 40% effort share.

**Expected %**
The target share, derived from the blueprint: `domain_weight ÷ sum_of_all_weights × 100` in weighted mode, or `100 ÷ number_of_domains` when all domains are equal. A 30%-weighted domain in a 4-domain exam has an expected share of 30%.

**Δ (delta)**
`effort − expected` in percentage points. Negative means you've studied this domain less than its blueprint weight calls for (under-drilled). Positive means more (over-drilled). Domains more than 5pp below expected are flagged and listed in the footer.

*The card requires at least 3 completed days before showing results — gap analysis on 1–2 days is dominated by which day happened to be first, not by real drift.*

---

### Repeat-Miss Watchlist

Misses that have occurred **2 or more times** are automatically promoted here — no manual curation. Items are listed in priority order (position 1 = highest drill priority). Each item shows its type (trap or confusion), how many times it's appeared, when it was last seen, and the diagnostic note written by the coach.

**Trap** — a question pattern that keeps catching you out, usually because of a subtle service behavior or an over-engineered answer that looks right but isn't.

**Confusion** — two concepts you keep mixing up, shown as an A vs B pair with the distinguishing rule stated explicitly.

---

### Qualitative band (pass/fail exams only)

Shown instead of margin and probability when the exam has no published passing cut (`pass_fail_unknown` scoring model). Derived from the debiased estimate alone:

| Band | Debiased estimate |
|---|---|
| Strong — comfortable margin | ≥ 85% |
| Likely passing | ≥ 75% |
| Marginal — could go either way | ≥ 65% |
| Weak — more work needed | < 65% |

---



**Current: v2 (schema `2.3`)** — MCQ parameterization, blueprint variants, scoring variants, question formats, question-bank import, calibration debias loop, coverage-vs-blueprint check, source-grounding delivery gate, optional semantic retrieval. MIT licensed.

**v2.x:** Sparse-source handling — what the coach does when authoritative sources are thin or missing.

**Future (gated on adoption):** Claude Code plugin packaging.

---

## License

MIT — see [`LICENSE`](LICENSE).
