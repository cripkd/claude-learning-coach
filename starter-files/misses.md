# Misses Log — Trap Index & Confusion Pairs

> **Retrospective miss index.** Read as: "here's where I got fooled — recognize the pattern next time."
> Built progressively. Organized by domain, not by day.
> Each entry is tagged with its type: `[Trap]` (scenario recognition) or `[Confusion]` (recall interference, A vs B).
> Structured counterpart lives in `data/state.json` `misses[]` — that's the canonical record. This file is the rendered/annotated view.
> For the entry format and examples (both types), see `templates/miss-entry.md`.
> Last updated: {{START_DATE}}.

---

## Domain 1 — {{DOMAIN_1_NAME}}

<!-- Entries added as misses occur. Two formats — pick the one that matches the entry's type:

  Trap (scenario recognition):
- **[Trap] Label of the trap** [Day X Q# / Phase X exam Q#]. Specific miss + lesson, ≤ 30 words.

  Confusion (recall interference, A vs B):
- **[Confusion] Short label of the pair** [Day X Q#]. A: <one side>. B: <other side>.
  Discrimination cue: <one sentence — how to tell A from B>.
-->

---

## Domain 2 — {{DOMAIN_2_NAME}}

<!-- ... -->

---

<!-- /init-coach generates additional domain sections based on your declared domain list. -->

---

## Meta — Exam Grammar & Answer Patterns

<!-- Cross-domain patterns: answer-shape recognition, distractor smells, question-grammar diagnostics.
These are almost always [Trap]-type. Examples:
- **[Trap] Short-correct instinct override** [Day 4 Q2]. Chose longer answer assuming it was more complete. Correct answer was the shortest option. Exam doesn't reward verbosity.
- **[Trap] Scope-qualifier second-guessing** [Day 8 Q5]. A framing word ("regional") made me doubt instant recognition. It named the surface, not a different mechanism. Trust the pattern.
-->

---

## Repeat-Miss Watchlist (highest drill priority)

<!-- Auto-populated when a miss recurs (2nd occurrence). The structured source is data/state.json `misses[]`
with `onWatchlist: true`, sorted by `watchlistPosition`. This section mirrors it. The dashboard's
Repeat-Miss Watchlist card is the live view (rebuilt by scripts/build-dashboard.mjs).

Format (mixed types — tag each):
N. **[Trap] Label** [REPEAT Nx — Day A, Day B, ...]. Diagnostic question or handle.
N. **[Confusion] Label** [REPEAT Nx — Day A, Day B, ...]. A: ...  vs  B: ...  Cue: <how to distinguish>.

Example:
1. **[Trap] Scope-qualifier misread** [REPEAT 3x — Day 8, Day 14, Day 19]. Does this framing word name a different mechanism, or just the surface where the known mechanism applies?
2. **[Confusion] IPv4 vs IPv6 header** [REPEAT 2x — Day 2, Day 6]. A: IPv4 (options inline). B: IPv6 (options in extension headers). Cue: "Are options inline or in a separate header?"
-->
