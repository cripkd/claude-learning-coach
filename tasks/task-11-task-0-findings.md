# Task 11 — Task 0 findings (recon only, no production code)

Verified against current `v3-rag` working tree (schema v2.3). Files read:
`templates/state-schema.json`, `.claude/settings.json`, `package.json`,
`scripts/state-write-hook.mjs`, `scripts/day-delivery-gate.mjs`,
`scripts/check-day-readiness.mjs`, `.claude/commands/index-sources.md`,
`.gitignore`, `templates/question-bank.md`. (`build-dashboard.mjs` style mirrored
from `state-write-hook.mjs`; `CLAUDE.md.template` deferred to Task 4.)

---

## 1. Assumption B — strict schema: **YES, confirmed.**

`templates/state-schema.json` sets `"additionalProperties": false` on the **root
object** (line 8) and on **every** nested object: `exam`, `examProfile`,
`blueprint`, `scoring`, `questionFormat`, `student`, `plan`, each `domains[]`
item, each `phases[]`/`days[]`/`quizScore`/`phaseExam`, each `calibration[]`,
`misses[]`/`confusionPair`/`occurrences[]`, `watchlist[]`, `sources` +
`$defs.sourceList`, `diagnostic`/`perDomain[]`, `readiness`.

**Consequence:** adding any retrieval field anywhere in `state.json` → ajv
`additionalProperties` error → `build-dashboard.mjs` refuses to write → the
state-write hook reports failure on every state write. **Retrieval config/state
MUST live in separate files** (`courses/{slug}/data/retrieval-config.json`,
`embeddings.ndjson`). Invariant holds.

---

## 2. `_index.md` format (source of reused tags)

Front-matter (YAML):
```
---
schema_version: 1
indexed_at: "YYYY-MM-DDTHH:MM:SSZ"
indexed_files:
  - path: "..."
    mtime: "..."
---
```
`indexed_at` + per-file `mtime` are the **staleness-guard inputs** for Task 1.

Body sections, one per task statement:
```
## {TaskStatementID} — {Task statement name}

**Primary (scope):**
- `path/to/file.md` § Section reference — what's there

**Secondary (teaching):**
- `path/to/slides-N.md` L{start}–L{end} — short description

**Coverage notes:** {only when thin}
```
- Heading key = task-statement ID (e.g. `D1-T1.1`) — the join key for tag reuse.
- Secondary bullets carry the **`L{start}–{end}` line range** Task 1 maps chunks
  against. Primary bullets are `§ Section` refs (no guaranteed line range).
- En-dash `–` used in line ranges (gate regex also accepts hyphen — see §3).
- Fallbacks: empty `taskStatements` → flat heading TOC; plus
  `## Cross-cutting references` and `## Coverage gaps summary` at bottom.

---

## 3. `_dayplan.md` format + how the gate decides "ranges read"

Front-matter:
```
---
schema_version: 1
generated_at: "YYYY-MM-DDTHH:MM:SSZ"
course: <slug>
---
```
Per-day blocks:
```
## Day N — <topic summary>

**Required reading:**
- `sources/<path>` L<start>–<end>
- ...
```
"No reading" days emit `**Required reading:** _none — <reason>._`

**Gate mechanics** (`day-delivery-gate.mjs` Stop hook → `check-day-readiness.mjs`):
- Gate fires only when the **last assistant message starts** with
  `<!-- coach:day-start course=<slug> day=<N> -->` (anchored regex, `MARKER_RE`).
- `check-day-readiness.mjs`:
  - `parseDayplan`: matches `## Day (\d+)`; inside a day, reads lines under
    `**Required reading:**`; line regex `^- \`([^\`]+)\` L(\d+)[–-](\d+)\s*$`
    (accepts en-dash **or** hyphen). `_none` → no required ranges.
  - `readsFromTranscript`: extracts `tool_use` blocks `name === "Read"`; window =
    `[offset, offset+limit-1]`, default whole-file `[1, 2000]` when no offset.
  - Coverage per range = |union of reads ∩ [start,end]| / span; **satisfied if
    ≥ 0.9** (`COVERAGE_THRESHOLD`). Reads outside the course dir are ignored.
  - Exit 0 = all satisfied / none required; 1 = missing (gate emits
    `{decision:"block"}`); 2 = infra error (gate does **not** block).

**Vector-mode implication (Task 4):** the coach must still issue real `Read`
calls covering the day's `_dayplan.md` ranges (≥90% each) **before** the
day-start marker — `retrieve.mjs` output does not count toward coverage. Vector
retrieval augments; it never replaces gated reads.

---

## 4. `.claude/settings.json` hook-registration JSON (mirror target)

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "node scripts/state-write-hook.mjs" }
        ]
      }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node scripts/day-delivery-gate.mjs" } ] }
    ]
  }
}
```
**Task 3 plan:** add the embeddings re-embed hook as a **second entry in the same
`PostToolUse` array** (own matcher `Write|Edit|MultiEdit`,
`command: "node scripts/embeddings-write-hook.mjs"`) — leave the existing
state-write hook and the `Stop` gate untouched. (Two sibling objects in the
array fire independently; do not merge into the existing object.)

---

## 5. `.gitignore` pattern for per-course generated artifacts

- Whole `courses/*` is already ignored, **except** the committed fixture
  `!courses/example-saa-c03/` (`.gitignore` lines 29–31).
- So for any real course, `embeddings.ndjson` is already untracked. **But the
  fixture is committed**, so Task 1 must add explicit ignores that also cover the
  exception:
  - `courses/*/data/embeddings.ndjson` (incl. the example fixture)
  - local model cache dir (e.g. `.cache/` / transformers cache location)
- `node_modules/` already ignored (line 49) — relevant because
  `setup:retrieval` installs `@huggingface/transformers` with `--no-save`.

---

## Bonus facts for later tasks
- `state-write-hook.mjs` is the canonical shape to mirror: `REPO_ROOT =
  resolve(__dirname,'..')`, stdin payload → `payload.tool_input.file_path`,
  slug regex `courses/([a-zA-Z0-9_-]+)/...`, `spawn(process.execPath, ...)`,
  always exit 0 except the deliberate drift-block (exit 2). The embeddings hook
  mirrors this but **always** exits 0 (no block path).
- Bank tag: heading form `## Q-001 [domain: D1]` (`templates/question-bank.md`
  line 35); must match a `domains[].id`. → `tagConfidence: "high"`.
- `package.json`: `"type":"module"`, `engines.node ">=18"`, deps `{ ajv }` only.
  Add only `scripts` entries (`setup:retrieval`, `embeddings:build`) — no deps.

## Done-when checklist
- [x] Assumption B answered (YES — `additionalProperties:false` everywhere).
- [x] `_index.md` format captured (front-matter + task-keyed sections + ranges).
- [x] `_dayplan.md` format + gate "ranges read" logic captured (≥90% Read coverage).
- [x] Hook-registration JSON captured (mirror as 2nd PostToolUse entry).
- [x] `.gitignore` per-course artifact handling captured (note the fixture exception).
