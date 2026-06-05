# /index-sources — Build the topic index for `sources/`

Scan all files in `courses/{slug}/sources/` and produce `sources/_index.md`: a topic-keyed map that lets the coach locate relevant teaching content in seconds (KB) instead of re-reading every file each day (hundreds of KB).

Run this once after dropping source files into a course, and re-run whenever you add or update files. The output is a derived artifact — overwritten on every run.

---

## When to run

- **After `/init-coach`** completes and you've added source files to `sources/`.
- **Before `"run diagnostic"`**, if the diagnostic prompts you that the index is missing or stale.
- **Whenever `sources/` changes** — new file added, existing file updated, file removed. The dashboard's "Sources" card surfaces the stale-index warning once Fix C from `scripts/build-dashboard.mjs` is extended to it (TODO).
- **Manually**, any time you want to refresh.

It's safe to re-run — the output is replaced atomically. Existing `_index.md` is overwritten.

---

## Prerequisites

- A configured course at `courses/{slug}/` with `data/state.json` (created by `/init-coach`).
- At least one source file in `courses/{slug}/sources/` (slides, exam guide, docs snapshots, etc.).
- `data/state.json` `domains[].taskStatements` should be populated (init-coach now does this for known exams; for unknown exams the diagnostic and early sessions populate them). If `taskStatements` is fully empty, this skill warns and falls back to a heading-only TOC index.

---

## Step 0: Identify the course

If only one course exists under `courses/`, use it. Otherwise ask: "Which course do you want to index? Options: [list of slugs]."

Store: `COURSE_SLUG`.

If `courses/{COURSE_SLUG}/sources/` is missing or contains only `.gitkeep`, stop with: "No source files in `courses/{COURSE_SLUG}/sources/` yet. Drop files in first, then re-run /index-sources."

---

## Step 1: Inventory source files

List every regular file under `courses/{COURSE_SLUG}/sources/` (skipping `_index.md` if it exists from a prior run, and skipping `.gitkeep`).

For each file, record:
- Relative path (relative to `sources/`)
- Last-modified timestamp (mtime, ISO-8601 UTC)
- Total line count

Store as `INDEXED_FILES[]`.

---

## Step 2: Extract structure

For each markdown file in `INDEXED_FILES`, extract every H1, H2, and H3 heading with its line number. This is the **heading skeleton**.

For non-markdown files (`.txt`, `.pdf` converted to text, etc.), treat the whole file as a single section spanning lines 1..N.

The heading skeleton is the raw material — the coach uses it to identify topic boundaries when reading source content.

---

## Step 3: Read source content and map to task statements

Load `data/state.json` to get the list of task statements: `domains[].taskStatements[]`.

**If task statements exist (the common case):**

For each task statement, identify which source files and line ranges cover it. The mapping is **LLM-judgment-based** — read each file's heading skeleton (or the file itself if headings are sparse), classify each section under the most-relevant task statement, and record the file path + line range.

Cross-cutting sections (touch multiple task statements) can appear under multiple entries.

For sections that don't map cleanly to any task statement — meta sections, course-overview blocks, white papers references — list them at the bottom of the index under "Cross-cutting references" with a one-line description.

**If task statements are empty (`domains[].taskStatements: []`):**

Fall back to a heading-only TOC. Output the index as a flat list of `file → heading → line range`, grouped by file. Warn the student: "No task statements declared in `data/state.json`. Index produced as a flat TOC instead of task-keyed. Re-run /index-sources after the diagnostic populates task statements for a more useful index."

---

## Step 4: Flag coverage gaps

A task statement is **thin on secondary** when:
- The total line count of secondary citations is < 50 lines, OR
- Only one secondary file cites it, OR
- A `Knowledge of:` or `Skills in:` bullet in the primary exam guide names a concept that doesn't appear in any secondary citation's headings (e.g., "GuardDuty" in scope but no slide-section heading mentions GuardDuty).

For each thin task statement, add a `**Coverage notes:**` paragraph to its entry calling out what's thin and recommending one of:
- Supplement from training-data knowledge with `[out-of-source]` labels (coach's default fallback).
- Snapshot an authoritative doc page into `sources/` as a primary supplement.
- Search source files for finer-grained matches that the H2-heading-level scan missed.

Also produce a "Coverage gaps summary" section at the bottom of the index listing all flagged task statements together.

---

## Step 5: Write `sources/_index.md`

Format:

```markdown
---
schema_version: 1
indexed_at: "YYYY-MM-DDTHH:MM:SSZ"
indexed_files:
  - path: "..."
    mtime: "..."
  - ...
---

# Sources Topic Index — {EXAM_SHORT_NAME}

> Built once. Reused at the start of every day's Core Concepts delivery.
> [...standard intro...]

## {TaskStatementID} — {Task statement name}

**Primary (scope):**
- `path/to/file.md` § Section reference — what's there

**Secondary (teaching):**
- `path/to/slides-N.md` L{start}–L{end} — short description of what the range covers
- ...

**Coverage notes:** {only when thin or gap-flagged}

---

## Cross-cutting references

- `path/to/file.md` — one-line role/description

---

## Coverage gaps summary

{aggregated list of task statements flagged as thin}
```

Write to `courses/{COURSE_SLUG}/sources/_index.md`. Atomic write (overwrite OK; previous version is replaced).

---

## Step 5.5: Write `sources/_dayplan.md`

The day-delivery gate (`scripts/day-delivery-gate.mjs`) consumes a sibling file that maps each study day to the source ranges the coach must have read before delivering that day's Core Concepts block.

Read `data/state.json` `phases[].days[]`. For each day:

1. Extract task-statement IDs from `topics[]` (e.g., `D1-T1.1`, `D3-T3.1`, etc. — leading token before the first space).
2. If a day's `topics` is empty or names a non-task entry (e.g., `"Phase 1 Exam"`, `"Case practice"`, `"Full simulation"`, `"Rest day"`, `"Exam day"`), emit `**Required reading:** _none — <short reason>._` for that day.
3. Otherwise, for each task statement ID, collect every `Primary` and `Secondary` citation from the `## {TaskID} ...` section of `_index.md`. Skip `Coverage notes`. Dedupe by `(path, start, end)`.
4. Emit a `## Day N — <topic summary>` heading followed by a `**Required reading:**` block listing each range as `` - `sources/<path>` L<start>–<end> ``.

For multi-day task statements (e.g., Day 1 and Day 2 both = D1-T1.1), emit the **same set** for both days by default. The coach can hand-edit `_dayplan.md` afterward to split coverage; the skill will warn before overwriting hand-edits if the front-matter has `manual: true` (TODO — for now the file is overwritten on every run).

Format:

```markdown
---
schema_version: 1
generated_at: "YYYY-MM-DDTHH:MM:SSZ"
course: <slug>
---

# Day Plan — {EXAM_SHORT_NAME}

> Maps each study day to the source ranges the coach must read before delivering that day's Core Concepts.
> Generated by /index-sources from `data/state.json phases[].days[].topics` ⨯ `sources/_index.md`.
> The day-delivery gate (`scripts/day-delivery-gate.mjs`, wired as a Stop hook) blocks Day N delivery if the coach emits a marker `<!-- coach:day-start course={slug} day=N -->` but required ranges haven't been read in the current session.
>
> Paths are relative to the course root (`courses/{slug}/`).

## Day N — <topic summary>

**Required reading:**
- `sources/<path>` L<start>–<end>
- ...
```

Write to `courses/{COURSE_SLUG}/sources/_dayplan.md`. Atomic overwrite.

---

## Step 6: Report

Print a concise summary:

```
✓ /index-sources complete for {COURSE_SLUG}

Indexed:        N files ({total} KB raw → {index} KB structured index)
Mapped to:      M task statements
Coverage gaps:  K task statements flagged as thin (see _index.md bottom)
Output:         courses/{COURSE_SLUG}/sources/_index.md
                courses/{COURSE_SLUG}/sources/_dayplan.md

Next steps:
- If you haven't yet, say "run diagnostic" to take the pre-study assessment.
- The coach will read _index.md at the start of each daily session and cite ranges in Core Concepts delivery.
- Re-run /index-sources after adding new source files or revising existing ones.

{If K > 0:}
Coverage gaps worth your attention:
  - {Task ID}: {what's thin}
  - ...
Consider snapshotting authoritative docs into sources/ for these task statements, or accept that the coach will supplement those parts from training-data knowledge with [out-of-source] labels.
```

---

## Edge case handling

**Source files exist but no task statements declared (`domains[].taskStatements: []`):**
Produce the flat-TOC variant from Step 3 and surface the warning. The index is still useful for navigation; it's just not task-keyed.

**Source files are not markdown (PDFs, etc.):**
This skill assumes markdown. If a `.pdf` or other format is present, warn: "Skipping non-markdown file: `{path}`. Convert to markdown (e.g., via `pandoc`) and drop the `.md` version into sources/ for indexing." Continue with the markdown files.

**Source folder is empty or only `.gitkeep`:**
Stop with the message described in Step 0.

**Existing `_index.md` is stale relative to source mtimes:**
Overwrite it. The skill is idempotent.

**Token-budget concern:**
For very large source sets (>1 MB total), read files one at a time and produce the index incrementally rather than holding all content in context. The output is a digest; intermediate content is discarded.

---

## What this skill does NOT do

- Does not modify source files (it's read-only on `sources/`).
- Does not change `data/state.json`. (Though it reads it for task-statement names.)
- Does not regenerate the dashboard. Drift detection and dashboard rebuild are owned by `scripts/build-dashboard.mjs`.
- Does not duplicate source content into the index. Citations are file:line references — the source remains the source of truth.
