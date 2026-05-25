# Miss Entry Template

> This file documents the format for adding entries to `misses.md`. Follow this format exactly — consistency is what makes the Watchlist promotion logic work.

---

## Entry format

```
- **Label of the trap** [provenance markers]. Specific miss in 1–2 sentences. Corrected mental model in 1 sentence.
```

Rules:
- **≤ 30 words** for the miss + lesson combined (label and provenance markers don't count toward the limit)
- **Label** — a memorable trap-name handle, not a description. Should be specific enough to trigger recognition (e.g., `"Absolute-vs-conditional enforcement"`, not `"Rule grammar question"`)
- **Provenance markers** — in brackets, always included. Examples: `[Day 3 Q2]`, `[Phase 1 exam Q7]`, `[Practice set 2025-03-10]`
- **Merge, don't duplicate** — before adding a new entry, scan the domain section for an existing entry covering the same conceptual error. If one exists, add the new provenance marker to it instead of creating a second entry.

---

## Well-formed examples

```
- **Absolute-vs-conditional enforcement** [Phase 1 exam Q7]. Rule grammar maps to layer: "never X" → surface removal; "X over $Y" → hook. Hook cannot make "never" structurally true.

- **Scope-qualifier misread** [Day 8 Q3]. When a framing word makes you doubt instant recognition, ask: does it name a different mechanism, or just the surface where the known mechanism applies? If surface-only, trust the recognition.

- **Simplest-sufficient-fix rejection** [Day 12 Q1, Phase 2 exam Q4]. Chose an over-engineered option when the correct answer was the minimal sufficient fix. When two options both work, prefer the one that adds less.
```

---

## Repeat-miss handling

When a miss recurs (same conceptual error, new scenario):

1. Find the existing entry in the relevant domain section
2. Add the new provenance marker to the brackets: `[Day 3 Q2, Day 11 Q5]`
3. If this is the **2nd or later occurrence**, add or update a Watchlist entry:
   - Add to the `## Repeat-Miss Watchlist` section at the bottom of `misses.md`
   - Format: `N. **Label** [REPEAT Nx — Day A, Day B, ...]. Diagnostic question or handle.`
   - The diagnostic is a one-sentence question the student can apply to recognize the trap in a new scenario
4. Update `data/state.json`: increment `occurrenceCount`, set `onWatchlist: true`, add to the `watchlist[]` array if not already present

**Watchlist example entry:**

```
2. **Scope-qualifier misread** [REPEAT 3x — Day 8, Day 14, Day 19]. Does this framing word name a different mechanism, or just the surface where the known mechanism applies?
```

---

## Domain placement

Entries go under the domain section in `misses.md` that matches the exam domain being tested — not the domain of the source material, and not chronologically by day. If a question straddles two domains, place it under the primary domain and add a cross-reference note.

Entries about question grammar, answer-shape recognition, or distractor patterns that don't belong to a specific domain go under `## Meta — Exam Grammar & Answer Patterns`.
