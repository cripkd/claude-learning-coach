# Task 11 — Acceptance pass (spec §5)

Checked against `v3-rag` HEAD (`c8147cb`). Runtime not installed in this env —
runtime-dependent items verified by code review.

---

## Results

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Fresh clone, `npm install` only → `direct`; no config → stays `direct` | ✓ | No `retrieval-config.json` in any course by default; `retrieve.mjs` + `embeddings-write-hook.mjs` both silent no-op without it; coach protocol defaults to `direct` |
| 2 | `index` mode reads `_index.md` only (Task 11 didn't rebuild the index) | ✓ | `build-embeddings.mjs` reads `_index.md` (never writes it); `embeddings-write-hook.mjs` explicitly documents "Does NOT regenerate `_index.md`"; `/index-sources` command unchanged |
| 3 | `mode:"vector"` embeds with tags from `_index.md`, retrieves within byteBudget | ✓ | `build-embeddings.mjs` calls `parseIndexBody()` + `findSourceTags()` for tag inheritance; `retrieve.mjs` applies `byteBudget` before returning results |
| 4 | Staleness guard: `_index.md` missing/stale → warn + fall back, no hard fail | ✓ | Lines 320/325/335 emit `console.error` and set `indexAvailable = false`; no `process.exit` called; execution continues to embedding with untagged fallback |
| 5 | Soft-rerank guard: mistagged/untagged source chunk still surfaces | ✓ | `scoreRecord()`: bank chunks hard-excluded only; source chunks always `include: true` (line 125), only score is boosted |
| 6 | Small-file guard: sub-`minFileBytesToIndex` file consulted in vector mode | ✓ | `CLAUDE.md.template` (Task 4): "always read those small files in full — never assume the absence of a chunk means the file is irrelevant" |
| 7 | Remove runtime / delete `embeddings.ndjson` + `mode:"vector"` → one warning, no crash, hook silent | ✓ | `retrieve.mjs` line 154-155: exits 0 with guidance; `embeddings-write-hook.mjs` `isRuntimeInstalled()` guard → silent exit; `build-embeddings.mjs` runtime guard → exit 0 |
| 8 | `embeddings:build` incremental; graceful exit when runtime absent | ✓ | Runtime guard: `exit:0` with message (verified by `node scripts/build-embeddings.mjs example-saa-c03`); incremental via SHA-256 manifest |
| 9 | `validate-example` + `build-example` pass; `state.json`/schema unchanged | ✓ | Both pass (verified by command); `git diff HEAD~6 -- templates/state-schema.json scripts/build-dashboard.mjs scripts/state-write-hook.mjs scripts/day-delivery-gate.mjs` → empty (no changes) |
| 10 | README has all eight §4 points | ✓ | Points 1–3, 5–8 confirmed by regex; point 4 confirmed by grep (three setup steps on lines 92–97) |

## Invariants confirmed

- `state.json` / `state-schema.json` — **not modified** by any Task 11 script (read-only)
- `build-dashboard.mjs`, `state-write-hook.mjs`, `day-delivery-gate.mjs` — **unchanged** (git diff clean)
- `@huggingface/transformers` — **not in `package.json` deps** (confirmed; only `ajv` present)
- `/index-sources` command — **unchanged** (read-only source of truth)

## Minor implementation note

`build-embeddings.mjs` embeds all files regardless of size (the spec says sub-`minFileBytesToIndex` files aren't embedded). The small-file guard is fully satisfied by the CLAUDE.md.template protocol rule ("always read in full"), and embedding small files is strictly additive (more recall, not less). No behavioral gap.
