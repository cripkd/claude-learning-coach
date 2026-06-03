# Setup Guide — Customizing the Template for a New Topic

> This guide explains how to go from a freshly cloned repo to a running study coach for your specific scenario-MCQ certification exam.

---

## The fast path: `/init-coach`

The intended setup flow is:

```
git clone <this repo> my-exam-prep
cd my-exam-prep
npm install       # one-time: installs ajv for dashboard schema validation
claude            # opens Claude Code in this directory
/init-coach       # starts the interactive setup interview
```

`/init-coach` asks you 10 questions, then:
- Generates a customized `courses/{slug}/CLAUDE.md` (replacing `CLAUDE.md.template` placeholders with your answers)
- Copies all starter files from `starter-files/` to `courses/{slug}/` with your placeholders filled in
- Writes the initial `courses/{slug}/data/state.json` (canonical structured state, `schemaVersion: "2.0"`) — which fires the dashboard-build hook
- The hook runs `scripts/build-dashboard.mjs {slug}` to produce the first `courses/{slug}/dashboard/index.html`
- Reminds you to drop your source materials into `courses/{slug}/sources/`

After `/init-coach` completes, `courses/{slug}/` contains your working study environment. The `starter-files/` directory is no longer needed for day-to-day use.

Requires Node.js ≥ 18 (for the dashboard build script).

---

## What `/init-coach` asks you

1. **Exam/cert name** — full name + short abbreviation (e.g., "AWS Solutions Architect Associate (SAA-C03)")
2. **Exam date** — YYYY-MM-DD, or "ongoing" if not date-bound
3. **Your name** — optional; used for the coach's tone (defaults to "the student")
4. **Your background** — 1–3 sentences: role, prior experience, known gaps
5. **How you learn best** — scenarios/hands-on, lecture-style, drilling, mixed
6. **Exam domains** — list with weights if known (e.g., "D1: 30%, D2: 22%, ...")
7. **Case reasoning vs recall** — does the exam test integrated case reasoning, or is it primarily recall?
   - If integrated: do sources list named scenarios, or should pools be declared?
   - If recall: the case-practice phase is skipped
8. **Total study days available** — integer
9. **Source materials** — paths/files to drop in, or "I'll add them later"
10. **License preference** — default MIT

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

**v1 is passive ingestion.** The coach doesn't parse or index your source files automatically. It reads them when you reference them during sessions and uses them as ground truth when answering knowledge questions. v2 will add active parsing.

---

## Running the pre-study diagnostic

After sources are in place, tell the coach: `"run diagnostic"`. It generates a 10–15 question diagnostic across your declared domains, saves results to `DIAGNOSTIC.md`, and adjusts the phase plan to front-load your weakest areas.

Run the diagnostic before Day 1. It takes 15–20 minutes and materially changes the study plan.

---

## Manual setup (without `/init-coach`)

If you prefer to customize the template by hand:

1. Create the course folder: `mkdir -p courses/{slug}/{data,dashboard,sources,quizzes}`
2. Copy `CLAUDE.md.template` to `courses/{slug}/CLAUDE.md`, replacing all `{{PLACEHOLDERS}}` with your values
3. Copy the dashboard assets: `cp dashboard/dashboard.{css,js} courses/{slug}/dashboard/`
4. Copy files from `starter-files/` to `courses/{slug}/`, replacing placeholders as you go
5. Write your phase plan into the `## Study Plan Structure` section of `courses/{slug}/CLAUDE.md` and into `courses/{slug}/progress.md`
6. Populate `courses/{slug}/data/state.json` using the schema in `templates/state-schema.json` (use `schemaVersion: "2.0"` and include the `examProfile` block — see the schema for the default shape)
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
| `courses/{slug}/SOURCES.md` | You | Source material index with priority levels |
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

- Parse your source documents for you (v1: passive ingestion only)
- Generate questions from sources automatically (it generates from its domain knowledge; sources are reference)
- Send you reminders or push notifications (no background process)
- Sync across devices (files are local; use git if you want sync)
- Support multiple students from the same repo (single-student by design)
