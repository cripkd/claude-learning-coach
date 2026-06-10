# Setup Guide — Customizing the Template for a New Topic

> This guide explains how to go from a freshly cloned repo to a running study coach for your specific scenario-MCQ certification exam.

> **Look at the worked example first.** [`courses/example-saa-c03/`](../courses/example-saa-c03/) is a synthetic but fully-populated course — open its `dashboard/index.html` to see what every dashboard section looks like with real data, then compare its `data/state.json` and per-course markdown files to the templates to understand what `/init-coach` is going to produce. The same fixture is wired into the build's `npm run validate-example` check, so any later schema changes that would break a real course break this one first.

---

## The fast path: `/init-coach`

The intended setup flow is:

```
git clone <this repo> my-exam-prep
cd my-exam-prep
npm install       # one-time: installs ajv for dashboard schema validation
claude            # opens Claude Code in this directory
/init-coach       # 1. interactive setup interview
                  # 2. drop your source materials into courses/{slug}/sources/
                  #    (and optionally a question bank into courses/{slug}/bank/)
/index-sources    # 3. build the topic index so the coach can ground concepts in your declared sources
"run diagnostic"  # 4. pre-study assessment that adjusts the phase plan
"let's go"        # 5. start Day 1
```

`/init-coach` asks you ~10–12 questions (a few are optional and skip on `"default"`), then:
- Generates a customized `courses/{slug}/CLAUDE.md` (replacing `CLAUDE.md.template` placeholders with your answers)
- Copies all starter files from `starter-files/` to `courses/{slug}/` with your placeholders filled in
- Writes the initial `courses/{slug}/data/state.json` (canonical structured state, `schemaVersion: "2.3"`) — which fires the dashboard-build hook
- The hook runs `scripts/build-dashboard.mjs {slug}` to produce the first `courses/{slug}/dashboard/index.html`
- Reminds you to drop your source materials into `courses/{slug}/sources/` (and, optionally, a question bank into `courses/{slug}/bank/`)

After `/init-coach` completes, `courses/{slug}/` contains your working study environment. The `starter-files/` directory is no longer needed for day-to-day use.

Requires Node.js ≥ 18 (for the dashboard build script).

---

## What `/init-coach` asks you

1. **Exam/cert name** — full name + short abbreviation (e.g., "AWS Solutions Architect Associate (SAA-C03)")
2. **Exam date** — YYYY-MM-DD, or "ongoing" if not date-bound
3. **Your name** — optional; used for the coach's tone (defaults to "the student")
4. **Your background** — 1–3 sentences: role, prior experience, known gaps
5. **How you learn best** — scenarios/hands-on, lecture-style, drilling, mixed
6. **Exam domains** — three ways to answer:
   - **With weights** (e.g., "D1: 30%, D2: 22%, ...") → phase plan front-loads by weight.
   - **Without weights** → phase plan allocates days equally; the diagnostic re-orders so weak domains come first.
   - **No published blueprint** (say "no blueprint" or "I don't know") → plan starts flat. The diagnostic and early sessions populate domains as topics surface; from then on the course behaves as unweighted.
7. **Case reasoning vs recall** — does the exam test integrated case reasoning, or is it primarily recall?
   - If integrated: do sources list named scenarios, or should pools be declared?
   - If recall: the case-practice phase is skipped
7a. **Scoring & question format** (optional — answer `"default"` if these match a typical 4-option / single-correct / fixed-percent exam):
   - **Scoring model:** fixed-percent (default), scaled (e.g., 720 of 1000 — provide the scale range), or pass-fail with no published cut.
   - **Options per question:** 4 (default) or 5.
   - **Multiple-correct questions:** no (default), or yes — with all-or-nothing or partial credit.

   Full descriptor in [`docs/EXAM-PROFILES.md`](EXAM-PROFILES.md).
8. **Total study days available** — integer
9. **Source materials** — paths/files to drop in, or "I'll add them later"
9a. **Question bank** (optional) — paths/files to drop into `bank/`, or "no" (default). A bank is *real* practice questions (vendor pack, course-pack questions, official sample set, prior-exam pool) — not questions written from memory. The coach draws bank questions during quizzes alongside synthetic generation, and weights bank actuals 2× synthetic in the readiness debias. See "Adding a question bank" below.
10. **Reference resources** — courses, documentation sites, or community resources to link in daily sessions (optional)
11. **License preference** — default MIT

---

## Adding source materials

Drop your study materials into `courses/{slug}/sources/` as markdown, plain text, or any format Claude Code can read. Then open `courses/{slug}/SOURCES.md` and declare their priority:

```
## Primary (authoritative on tie-breaks)
- [exam-guide.md](sources/exam-guide.md) — Official exam guide, v2.1, retrieved 2025-01-10

## Secondary (courses, books, official docs)
- [course-transcript.md](sources/course-transcript.md) — Video course transcript

## Tertiary (community notes, blog posts)
- [study-notes.md](sources/study-notes.md) — Community study group notes
```

The coach uses this priority order when sources disagree. When all sources are silent on a topic, it marks the answer as "out-of-source" rather than fabricating.

**Source ingestion defaults to passive.** The coach reads sources when you reference them during sessions and uses them as ground truth when answering knowledge questions. The priority hierarchy you declare in `SOURCES.md` is the coach's reference map. For larger source sets, run `/index-sources` to build a topic index (`sources/_index.md`) that maps each task statement to specific file:line ranges — the coach then reads only cited ranges per day. For even larger sets, the optional vector retrieval tier (`npm run setup:retrieval`) adds semantic search on top; see the README "Optional: Local Semantic Retrieval" section.

---

## Adding a question bank (optional)

Drop real practice questions — verbatim from a vendor pack, course-pack quizzes, an official sample set, or a prior-exam pool — into `courses/{slug}/bank/`. The coach reads them at quiz time and prefers bank questions over synthesizing new ones for any domain the bank covers.

**Format:** see `templates/question-bank.md` for the full spec. Each question is a markdown section with an ID + domain tag in the heading, the stem, lettered options, a `**Correct:**` line, and an `**Explanation:**` block. Multiple questions per file is fine; multiple files in `bank/` is fine. Name them however maps to your source material.

**Why bank questions matter:**

| Question source | Trap structure | Coach's score-inflation bias | Calibration weight |
|---|---|---|---|
| **Bank** (verbatim from declared source) | Real — the source's actual distractors | None — the coach didn't write them | **2× synthetic** |
| **Synthetic** (coach-generated) | Approximated — the coach reasons about likely distractors | Some — the coach knows the trap it's drilling | 1× |

The dashboard's readiness debias weights bank deltas twice as heavily as synthetic when computing bias and noise (`scripts/build-dashboard.mjs` → `computeReadiness`). Once you have ≥ 5 calibration entries total, your headline number is closer to real-exam expectation in proportion to how much of the data is bank.

**Declaring the bank in `SOURCES.md`:** the starter `SOURCES.md` includes a Question Bank section. Add one line per bank file with provenance — vendor, question count, domains covered, date retrieved. This is documentation, not a structural requirement; the coach reads the bank files directly from `bank/`.

**Mixing scores in a single quiz:** when a quiz draws both bank and synthetic questions, the coach writes **two** `calibration[]` entries — one for the bank subset, one for the synthetic subset — so the per-source signal is preserved. The dashboard's calibration table shows a small `BANK` / `SYN` badge on each row.

**The bank is optional.** If `bank/` is empty (or missing), the coach behaves exactly as before: synthetic generation only.

---

## Building the source index — `/index-sources`

Between dropping files into `sources/` and running the diagnostic, run **`/index-sources`**. It reads every file under `courses/{slug}/sources/` once and produces `sources/_index.md` — a topic-keyed map from each exam task statement to specific `file:line-range` citations.

Why this exists: source materials (slides, exam guides, doc snapshots) are often split into files by page count or arbitrary chunks, not by concept. Without an index, the coach either re-reads hundreds of KB of source content every day or skips source-grounding entirely and falls back to training-data knowledge. The index solves this — the coach reads `_index.md` (~10 KB) at the start of every daily session and reads only the cited ranges for that day's task statement.

The index also flags **coverage gaps** — task statements where your declared sources are thin. When that happens you have three options: accept that the coach will supplement those parts from training-data knowledge (clearly labeled `[out-of-source]`), snapshot an authoritative documentation page into `sources/` as a primary supplement, or live with thinner coverage on those topics.

Re-run `/index-sources` any time `sources/` changes. The output is idempotent — previous `_index.md` is overwritten.

```
/index-sources       # builds courses/{slug}/sources/_index.md
```

If you skip this step, the coach will detect the missing index at the start of any source-reading flow (diagnostic, daily session, ad-hoc quiz) and prompt you to run it. You can also explicitly tell it "skip and use training knowledge" if you want to proceed without a source-grounded session.

---

## Running the pre-study diagnostic

After sources and the index are in place, tell the coach: `"run diagnostic"`. It generates a 10–15 question diagnostic across your declared domains, saves results to `DIAGNOSTIC.md`, and adjusts the phase plan to front-load your weakest areas.

Run the diagnostic before Day 1. It takes 15–20 minutes and materially changes the study plan.

---

## Manual setup (without `/init-coach`)

If you prefer to customize the template by hand:

1. Create the course folder: `mkdir -p courses/{slug}/{data,dashboard,sources,bank,quizzes}`
2. Copy `CLAUDE.md.template` to `courses/{slug}/CLAUDE.md`, replacing all `{{PLACEHOLDERS}}` with your values
3. Copy the dashboard assets: `cp dashboard/dashboard.{css,js} courses/{slug}/dashboard/`
4. Copy files from `starter-files/` to `courses/{slug}/`, replacing placeholders as you go
5. Write your phase plan into the `## Study Plan Structure` section of `courses/{slug}/CLAUDE.md` and into `courses/{slug}/progress.md`
6. Populate `courses/{slug}/data/state.json` using the schema in `templates/state-schema.json` (use `schemaVersion: "2.3"` and include the `examProfile` block — see the schema for the default shape)
7. Build the dashboard: `node scripts/build-dashboard.mjs {slug}` — this validates `state.json` and writes `courses/{slug}/dashboard/index.html`. The script refuses to write on validation failure.

The manual path is more work but useful if you want to pre-populate a phase plan before your first Claude Code session.

---

## Day-to-day use

Once set up, every session looks like this:

1. Open Claude Code in the project directory: `claude`
2. Say "let's go" or "continue" or "Day X" — the coach reads `memory.md` and `progress.md` and picks up where you left off
3. Work through the day: concepts → traps → decision rules → practice questions → hands-on exercise
4. At session end, tell the coach to update memory and progress (or it will ask you)

The coach maintains all files. You don't need to write to `memory.md`, `progress.md`, `misses.md`, etc. directly — that's the coach's job.

---

## File roles (quick reference)

All course files live under `courses/{slug}/`. The repo root contains only template machinery.

| File | Who writes it | What it holds |
|---|---|---|
| `CLAUDE.md` (root) | Ships with repo | Multi-course dispatcher — static, never overwritten |
| `courses/{slug}/CLAUDE.md` | `/init-coach` | Course-specific coach behavior and instructions |
| `courses/{slug}/memory.md` | Coach (you confirm) | Session continuity. Two sections: a rolling **Standing Summary** (synthesized) and **Recent Entries** holding the last 7 dated entries verbatim. Oldest entries are folded into the Summary at session end. |
| `courses/{slug}/progress.md` | Coach (you confirm) | Phase/day tracker with scores and statuses |
| `courses/{slug}/cheatsheet.md` | Coach | Forward-looking decision rules, appended per phase |
| `courses/{slug}/misses.md` | Coach | Retrospective trap index + Repeat-Miss Watchlist |
| `courses/{slug}/cases.md` | `/init-coach` + Coach | Case patterns for question generation |
| `courses/{slug}/SOURCES.md` | You | Source material index with priority levels (plus optional Question Bank section) |
| `courses/{slug}/sources/_index.md` | `/index-sources` | Topic index — maps each task statement to specific `file:line-range` citations in your source files. Rebuilt whenever you re-run `/index-sources`. The coach reads this at the start of every daily session. |
| `courses/{slug}/bank/` (optional) | You | Real practice questions verbatim from declared sources. Format: `templates/question-bank.md`. Absence = synthetic-only quizzes (default). |
| `courses/{slug}/DIAGNOSTIC.md` | Coach | Pre-study diagnostic results |
| `courses/{slug}/CALIBRATION.md` | Coach | Predicted-vs-actual score tracking |
| `courses/{slug}/quizzes/day-NN.md` | Coach | Per-day quiz records |
| `courses/{slug}/data/state.json` | Coach (structural changes) | **Canonical** structured state — source of truth for all numeric/structural fields. Schema-validated on every write. |
| `courses/{slug}/dashboard/index.html` | Hook (automatic) | **Build artifact** — rebuilt by `scripts/build-dashboard.mjs` via a PostToolUse hook on every write to `data/state.json`. Never hand-edited. |

---

## Updating the phase plan mid-prep

If your exam date changes, or diagnostic results suggest major rebalancing, re-run `/init-coach` and choose "reconfigure specific fields." It rewrites `courses/{slug}/data/state.json` to reflect the new config without wiping your existing progress data — the dashboard is rebuilt automatically by the hook.

For minor adjustments (swap two days, extend a phase by one day), edit `courses/{slug}/progress.md` and `courses/{slug}/data/state.json` directly. Writing `state.json` fires the hook and the dashboard rebuilds; if you skipped Claude Code and edited the file by hand, run `node scripts/build-dashboard.mjs {slug}` to rebuild manually.

---

## What the coach will NOT do

- **Parse your source documents for you automatically** — the coach reads sources when you reference them. For active indexing, run `/index-sources` (builds a topic map) or set up vector mode (semantic search). Both are optional and manual-trigger; nothing runs without your action.
- **Auto-generate questions from source prose** — synthetic questions come from the coach's own domain knowledge grounded in `cases.md`. If you want real source-derived questions, drop them into `bank/` as verbatim entries (see "Adding a question bank" above) — that's how source-of-truth practice questions enter the quiz mix.
- **Send you reminders or push notifications** — no background process.
- **Sync across devices** — files are local; use git if you want sync.
- **Support multiple students from the same repo** — single-student by design.
