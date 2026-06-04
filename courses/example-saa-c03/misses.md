# Misses Log — Trap Index & Confusion Pairs

> **Retrospective miss index.** Read as: "here's where I got fooled — recognize the pattern next time."
> Built progressively. Organized by domain, not by day.
> Each entry is tagged with its type: `[Trap]` (scenario recognition) or `[Confusion]` (recall interference, A vs B).
> Structured counterpart lives in `data/state.json` `misses[]` — that's the canonical record. This file is the rendered/annotated view.
> Last updated: 2026-06-03.

---

## Domain 1 — Design Secure Architectures

- **[Trap] Public S3 vs bucket policy** [Day 1 Q3]. Chose "make the bucket policy permissive" when Block Public Access was the missing constraint. Trap: a permissive policy is silently overridden by BPA, so the question hinges on *whether BPA is on*, not on the policy text. Mental model: BPA first, policy second.

## Domain 2 — Design Resilient Architectures

- **[Trap] Simplest-sufficient-fix rejection** [Day 2 Q5, Phase 1 exam Q7]. Chose active-active when active-passive (Multi-AZ alone) met the stated RTO. When two options both work, prefer the one that adds less. Reject over-engineered answers unless a constraint forces them.

- **[Confusion] SQS standard vs FIFO** [Phase 1 exam Q4, Day 4 Q2 (bank)]. A: SQS Standard — at-least-once, best-effort ordering, virtually unlimited throughput. B: SQS FIFO — exactly-once processing, strict ordering per message group, ~3000 msg/s per group.
  Discrimination cue: "Does the scenario require ordering or dedup? If yes → FIFO. If only high throughput with best-effort → Standard."

## Domain 3 — Design High-Performing Architectures

_No misses yet — Day 4 quiz cleanly scored on the non-bank, non-watchlist questions._

## Domain 4 — Design Cost-Optimized Architectures

_No misses yet — Day 5 (cost optimization) is in progress._

---

## Meta — Exam Grammar & Answer Patterns

_No meta-level traps yet. Watch this section as the simplest-sufficient-fix pattern matures — it's currently scoped to D2, but it's a cross-domain answer-shape trap._

---

## Repeat-Miss Watchlist (highest drill priority)

1. **[Trap] Simplest-sufficient-fix rejection** [REPEAT 2× — Day 2 Q5, Phase 1 exam Q7]. When two options both work, prefer the one that adds less. Reject over-engineered answers unless a constraint forces them.

2. **[Confusion] SQS standard vs FIFO** [REPEAT 2× — Phase 1 exam Q4, Day 4 Q2 (bank)]. A: Standard (at-least-once, best-effort ordering, ~unlimited throughput) vs B: FIFO (exactly-once, strict ordering, ~3000 msg/s per group). Cue: "Does the scenario need ordering/dedup? Yes → FIFO; no → Standard."
