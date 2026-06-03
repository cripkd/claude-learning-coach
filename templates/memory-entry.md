# Memory Entry Template

> This file documents the format of `memory.md` and the rules for appending and folding entries.
> `memory.md` has a two-section shape: a top **Standing Summary** (rolling synthesis) and a **Recent Entries** section holding the last N entries verbatim. The coach reads only these two sections at session start, never the file's pre-fold history.

---

## File shape

```markdown
# {{EXAM_SHORT_NAME}} Study Log

> [header explaining the shape; see starter-files/memory.md]

---

## Standing Summary

[Rolling synthesized prose / compact bullets covering everything older than the recent window.
 Rewritten at fold time. Empty until the first fold happens.]

---

## Recent Entries

## Day N — {{DAY_TITLE}} (YYYY-MM-DD)
[full verbatim entry — format below]

## Day N+1 — ... (YYYY-MM-DD)
[etc., oldest at the top, newest at the bottom]
```

---

## Entry format (Recent Entries section)

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

## Append + fold rule (session end)

The cap on Recent Entries is **N = 7**. Procedure when the coach appends a new entry at session end:

1. Append the new dated entry to the **bottom** of `## Recent Entries`.
2. Count entries in `## Recent Entries`. If the count is **≤ 7**, stop — no fold needed.
3. If the count is **8** (or more — recover if a previous fold was skipped):
   - Take the **oldest** entry (at the top of Recent Entries).
   - **Fold** it into `## Standing Summary` by synthesizing — never paste the entry verbatim into the summary. Pull out the parts that still matter weeks later: persistent misses, calibration drift, domain coverage status, anything the student or coach will still want to know later. If the Standing Summary already covers a topic, merge into the existing prose rather than duplicating.
   - **Remove** the folded entry from `## Recent Entries`.
4. Repeat step 3 until Recent Entries holds exactly 7 entries.

**No silent information loss.** A folded entry's substance must be representable in the Standing Summary. If you can't synthesize something cleanly (e.g., a one-off observation with no lasting relevance), drop it deliberately — never drop something the next session would benefit from knowing.

---

## Rules

- **One entry per session**, not per day. If the student covered Days 3 and 4 in one session, write one entry covering both.
- **Dated by session date**, not by study day number (the date is when the session happened).
- **Recent Entries is append-only between folds.** Don't edit or delete a Recent entry to "tidy" it — fold it instead.
- **Standing Summary is rewritten at fold time.** It is the only part of `memory.md` that the coach may rewrite. Treat it as living prose: integrate, deduplicate, sharpen.
- **Keep it scannable.** The coach reads `memory.md` (both sections) at the start of every session. Entries should be dense and useful, not narrative. Skip anything that doesn't affect future sessions.

---

## Well-formed Recent Entry example

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

---

## Well-formed Standing Summary example (after several folds)

```markdown
## Standing Summary

**Phase progress (folded through Day 14):** Phase 1 closed at 78% blended (phase exam Day 8: 8/10).
Phase 2 case-practice in flight; Days 9–14 covered all four pool-cross combinations.

**Calibration trajectory:** running mildly overconfident (avg delta -4 across Days 1–14). Cold-water
estimate stable at 78–82%. The student has stopped padding predictions upward — improvement noted Day 12.

**Persistent traps:**
- *Scope-qualifier misread* — on Watchlist (3 occurrences through Day 7). Still surfaces on
  region-vs-account-boundary questions; one clean rep at Day 12 but not yet retired.
- *Simplest-sufficient-fix rejection* — single occurrence (Day 7); not yet a pattern.

**Domain coverage status:** D1 and D2 fully delivered. D3 half-covered (3 of 6 task statements).
D4 not started — front-loaded into Phase 3.
```
