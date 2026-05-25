# Memory Entry Template

> This file documents the format for dated entries in `memory.md`. The coach appends one entry per session at session end (after student confirmation).

---

## Entry format

```markdown
## Day N — {{DAY_TITLE}} (YYYY-MM-DD)

**Score:** X/Y (Z%).

### What was covered
<!-- Brief. Concepts, exercises, anything new this session. -->

### Misses and trap patterns
<!-- For each miss this session:
- Link to the misses.md entry by label
- Note whether it's a new entry or a repeat (and current occurrence count)
- Example: "Scope-qualifier misread [Day 8] — repeat (now 2x, promoted to Watchlist)"
-->

### Calibration update
<!-- Predicted vs actual for any quiz or phase exam this session.
- Example: "Predicted 75%, actual 82% — underconfident by 7 points"
- Current cold-water estimate if updated this session
-->

### Plan for next session
<!-- 1–3 bullets. What comes next and anything to front-load. -->
```

---

## Rules

- **One entry per session**, not per day. If the student covered Days 3 and 4 in one session, write one entry covering both.
- **Dated by session date**, not by study day number (the date is when the session happened).
- **Append only** — never edit or delete past entries. `memory.md` is an append-only log.
- **Keep it scannable** — the coach reads this file at the start of every session. Entries should be dense and useful, not narrative. Skip anything that doesn't affect the next session.

---

## Well-formed example

```markdown
## Day 7 — Cross-Domain Case Patterns (2025-03-14)

**Score:** 7/10 (70%).

### What was covered
Phase 2 case-practice day. Covered pool-cross scenarios: HA × 3-tier and Cost × serverless.
Two hands-on exercises: sizing a 3-tier failover and selecting the minimal DR config.

### Misses and trap patterns
- **Simplest-sufficient-fix rejection** [Day 7 Q3] — new entry, D2. Chose active-active when active-passive was the minimal sufficient fix for the stated RTO.
- **Scope-qualifier misread** [Day 7 Q8] — repeat (now 3x, confirmed on Watchlist). "Regional" was surface-only; the mechanism was the same. Chose wrong answer despite recognizing the pattern.

### Calibration update
Predicted 75%, actual 70% — overconfident by 5 points. Cold-water estimate: 78–82% blended.

### Plan for next session
- Day 8: Cost × microservices case patterns
- Front-load the scope-qualifier watchlist item — one clean drill rep before starting Day 8 content
- Check misses.md Watchlist: 3 items now, all worth a quick pass
```
