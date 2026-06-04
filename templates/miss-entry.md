# Miss Entry Template

> This file documents the format for entries in `misses.md` and their structural counterparts in `data/state.json` `misses[]`. `misses[]` is canonical; `misses.md` is the rendered/annotated view. Both files use stable IDs (`miss-NNNN`); never renumber.

Every miss has a `missType`:

- **`trap`** — scenario-recognition error. A distractor exploited a familiar trap shape (length=correctness, scope-qualifier, simplest-sufficient-fix, etc.) or a hidden constraint. Existing misses migrated from pre-v2.2 default to this type.
- **`confusion`** — recall interference between two specific terms or concepts (e.g., *IPv4 header* vs *IPv6 header*). The structured entry carries a `confusionPair = { a, b }` capturing both sides; `diagnostic` reads as the discrimination cue.

---

## Trap entries

### Markdown format

```
- **[Trap] Label of the trap** [provenance markers]. Specific miss in 1–2 sentences. Corrected mental model in 1 sentence.
```

Rules:
- **≤ 30 words** for the miss + lesson combined (label, type tag, and provenance markers don't count toward the limit).
- **Label** — a memorable trap-name handle, not a description. Should trigger recognition (e.g., `"Absolute-vs-conditional enforcement"`, not `"Rule grammar question"`).
- **Provenance markers** — in brackets, always included. Examples: `[Day 3 Q2]`, `[Phase 1 exam Q7]`, `[Practice set 2025-03-10]`.

### Examples

```
- **[Trap] Absolute-vs-conditional enforcement** [Phase 1 exam Q7]. Rule grammar maps to layer: "never X" → surface removal; "X over $Y" → hook. Hook cannot make "never" structurally true.

- **[Trap] Scope-qualifier misread** [Day 8 Q3]. When a framing word makes you doubt instant recognition, ask: does it name a different mechanism, or just the surface where the known mechanism applies? If surface-only, trust the recognition.

- **[Trap] Simplest-sufficient-fix rejection** [Day 12 Q1, Phase 2 exam Q4]. Chose an over-engineered option when the correct answer was the minimal sufficient fix. When two options both work, prefer the one that adds less.
```

### Structured counterpart (`misses[]` item)

```json
{
  "id": "miss-0007",
  "label": "Scope-qualifier misread",
  "domain": "D2",
  "missType": "trap",
  "confusionPair": null,
  "occurrences": [{ "date": "2026-05-25", "location": "Day 8 Q3" }],
  "occurrenceCount": 1,
  "onWatchlist": false,
  "watchlistPosition": null,
  "diagnostic": "Does this framing word name a different mechanism, or just the surface where a known mechanism applies?",
  "lastSeen": "2026-05-25"
}
```

---

## Confusion entries

### Markdown format

```
- **[Confusion] Short label of the pair** [provenance markers]. A: <one side>. B: <other side>.
  Discrimination cue: <one sentence — how to tell A from B>.
```

Rules:
- **Label** — names the pair, not the scenario (e.g., `"IPv4 header vs IPv6 header"`, not `"Day 6 IPv6 question"`).
- Body uses the literal `A:` / `B:` form so the structure is scannable and parseable.
- Discrimination cue is on its own line — that's what the watchlist drill uses.

### Example

```
- **[Confusion] IPv4 vs IPv6 header** [Day 2 Q5, Day 6 Q3]. A: IPv4 header — 20 bytes base, options carried inline (variable length). B: IPv6 header — 40 bytes fixed; options moved into extension headers.
  Discrimination cue: "Are options inline or in a separate header?" If inline, IPv4. If extension headers, IPv6.
```

### Structured counterpart (`misses[]` item)

```json
{
  "id": "miss-0010",
  "label": "IPv4 vs IPv6 header",
  "domain": "D1",
  "missType": "confusion",
  "confusionPair": {
    "a": "IPv4 header (20 bytes, options inline)",
    "b": "IPv6 header (40 bytes fixed, options in extension headers)"
  },
  "occurrences": [
    { "date": "2026-05-20", "location": "Day 2 Q5" },
    { "date": "2026-05-25", "location": "Day 6 Q3" }
  ],
  "occurrenceCount": 2,
  "onWatchlist": true,
  "watchlistPosition": 1,
  "diagnostic": "Are options inline (IPv4) or in extension headers (IPv6)?",
  "lastSeen": "2026-05-25"
}
```

---

## Dedup and repeat-miss handling

When the coach sees a miss in a session, dedup runs against `state.json` `misses[]` (not against the markdown — the structured record is authoritative):

1. Decide the type (`trap` or `confusion`).
2. Search `misses[]` for an existing entry matching:
   - **Trap:** same `domain` and same conceptual error (use the existing `label`/`diagnostic` as the match key).
   - **Confusion:** same `domain` and same `confusionPair` (treat `{a, b}` and `{a:b, b:a}` as the same pair).
3. **Match found** — update in place:
   - Append `{date, location}` to `occurrences[]`.
   - Increment `occurrenceCount`.
   - Update `lastSeen`.
   - If `occurrenceCount` reaches 2 and `onWatchlist=false`, set `onWatchlist=true` and assign `watchlistPosition = max(existing positions) + 1`. **This is the promotion event** — it triggers on the 2nd occurrence, never later.
4. **No match** — create a new entry with the next `miss-NNNN` id (zero-padded) and all required fields populated.

After updating `misses[]`, mirror the change to `misses.md`: update the provenance markers, append a new entry, or move/relabel a promoted entry under the Watchlist section. The dashboard's Watchlist comes from `state.watchlist[]` which the build derives from `misses[]` — you never write `state.watchlist[]` by hand.

### Watchlist markdown format

```
N. **[Trap] Label** [REPEAT Nx — Day A, Day B, ...]. Diagnostic question or handle.

N. **[Confusion] Label** [REPEAT Nx — Day A, Day B, ...]. A: …  vs  B: …  Cue: <discrimination handle>.
```

The dashboard renders Watchlist items with a TRAP or CONFUSION badge plus the A/B pair for confusion entries — match the structure in the markdown so the two views stay parallel.

---

## Domain placement

Entries go under the domain section in `misses.md` that matches the exam domain being tested — not the domain of the source material, and not chronologically by day. If a question straddles two domains, place it under the primary domain and add a cross-reference note. Entries about question grammar, answer-shape recognition, or cross-domain distractor patterns that don't belong to a specific domain go under `## Meta — Exam Grammar & Answer Patterns`.
