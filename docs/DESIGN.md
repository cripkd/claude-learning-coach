# Design Notes — Why This Template Works the Way It Does

> This document explains the **non-obvious design choices** in the exam-coach template. Each section names the choice, the rejected alternative(s), and the reasoning. If you want to extend or fork the template, read this first.

---

## 1. Two separate files for forward-looking rules vs retrospective traps

**The choice:** `cheatsheet.md` holds decision rules and mental models. `misses.md` holds case-oriented trap patterns. They are never merged.

**Rejected alternative:** One combined "notes" or "lessons learned" file.

**Why:** The two files serve different mental modes.

- `cheatsheet.md` is read in **application mode**: "here is the model, apply it." You scan it before a session to prime the right mental frameworks. Entries are rules, conditionals, and heuristics — forward-looking.
- `misses.md` is read in **recognition mode**: "here is where I got fooled, recognize the pattern." Entries are trap labels + provenance. You drill it to install reflexes that catch specific distractor shapes.

Mixing them in one file forces the brain to switch modes mid-scan. Worse, the two writing styles pollute each other: trap entries written as rules sound generic; rule entries written as trap patterns feel overly narrow. Keeping them separate also makes it easy to see at a glance which file to open before a practice session vs before an endgame drill.

### 1a. Two miss types: trap vs confusion

Within `misses.md`, each miss carries an explicit `missType` — `trap` (a scenario distractor that fooled you) or `confusion` (you mixed up two recall items, e.g., S3 storage class A vs B). The two drill differently: a trap is drilled by replaying the scenario shape with the distractor present; a confusion is drilled head-to-head on the A-vs-B discrimination. Forcing both into one shape either dilutes the trap drill (a pure confusion has no scenario to replay) or under-utilises the confusion (no pair → no A-vs-B reps). Bifurcating at the record level keeps each drill mode pure.

### 1b. Structured dedup over `misses[]`, not prose rescan

Deduplication and recurrence detection operate on `state.json`'s `misses[]` array — structured fields (`missType`, normalised label, `confusionPair`) — not on prose in `misses.md`. A prose-driven rescan is fragile (a paraphrase defeats it) and forces the coach to re-read the entire file before every write. With structured records, "this miss recurred" is a field comparison; promotion to the watchlist is then deterministic and idempotent. The `.md` file is a rendered view; the canonical truth is the structured array.

---

## 2. Repeat-Miss Watchlist with auto-promotion

**The choice:** When a miss recurs (same conceptual error, different scenario), it is promoted from a regular `misses.md` domain entry to a numbered **Repeat-Miss Watchlist** section at the bottom of the file. The Watchlist is the highest-priority drill surface in the pre-exam window.

**Rejected alternative:** Formal spaced-repetition scheduling (Anki, 1/3/7/14-day intervals).

**Why:** SRS is the right algorithm in theory but adds tooling friction and a cold-start problem (you need enough cards before the intervals pay off). The Watchlist is informal SRS: it surfaces the same item every time you open `misses.md`, which happens to be the right interval when you're in a compressed prep cycle. The key insight is that the Watchlist doesn't need a scheduler — it self-prioritizes by the fact that it's at the bottom of a file the coach reads every session.

**Format:** Each Watchlist item carries occurrence count, full provenance (e.g., `[REPEAT 3× — Day 10, Day 16, Day 21]`), and a missType badge (TRAP or CONFUSION). For confusions the A vs B pair renders inline; for traps the diagnostic question is the one-sentence handle the student applies to recognise the pattern in a new scenario.

**Promotion rule:** A miss is promoted on its 2nd occurrence. Promotion is build-derived: `watchlist[]` is recomputed from `misses[]` by `scripts/build-dashboard.mjs` on every state write, so the coach never hand-maintains it and any inconsistent hand-edit is corrected on the next build. Drilling branches on `missType` — trap entries replay the scenario shape; confusion entries drill the pair head-to-head.

---

## 3. Quiz answer-leak prevention

**The choice:** The coach follows explicit rules to prevent quiz answers from leaking through Claude Code's terminal autocomplete.

**Why this matters:** Claude Code's terminal input field auto-suggests completions based on the assistant's last message. If a quiz prompt ends with a numbered list of questions (e.g., `1. Which of the following...`), the autocomplete will try to extend that token — and if the message contains any answer hint (e.g., `The answer here follows the pattern of B/C/D...`), the suggestion leaks the correct answer before the student types anything.

**The rules (enforced via `CLAUDE.md.template`):**
1. Never include a sample or format-example answer string in quiz prompts (no `"e.g., A"` or `"(format: letter)"`)
2. End every quiz message on neutral closing prose — not on a numbered list, not on a question token, not on anything an autocomplete could extend into a question→letter mapping. Close with: `"Reply when ready."` or `"Post your answers and I'll walk through each option."`
3. Randomize the correct-answer letter distribution across A/B/C/D within each quiz session
4. Remind the student to ignore input-field auto-suggestions

**Rejected alternative:** Just warning the student to ignore suggestions. The warning alone is not reliable — the distraction is involuntary once you see the suggestion. The fix is structural: never give autocomplete anything to latch onto.

---

## 4. Honest-calibration tone

**The choice:** The coach reports numeric cold-water estimates ("88-92% blended") and explicitly distinguishes synthetic-quiz inflation from real-exam expectation. It pushes back on overconfidence rather than validating it.

**Rejected alternative:** Motivational framing ("you're doing great, keep it up").

**Why:** Motivational framing is the most dangerous failure mode in cert prep. A student who feels confident based on vibes is underdrilling weak areas and overestimating their readiness. The exam doesn't care about feelings.

The `CALIBRATION.md` file and `state.json` readiness block exist specifically to force numerical tracking. The coach is instructed to compute `P(score ≥ pass_mark)` using a noise model (default ±7% exam-day variance) and to label it explicitly as a rough estimate with the formula shown. The goal is not to discourage — it's to make overconfidence expensive and underconfidence visible.

---

## 5. Pattern/content split via `/init-coach`

**The choice:** Coach behavior (session protocol, file roles, drilling cadence, quiz rules) is locked in `CLAUDE.md.template`. Only topic-specific content (exam name, domains, schedule, sources, student profile) is parameterized and filled in by `/init-coach`.

**Rejected alternative:** A fully custom `CLAUDE.md` per topic, written from scratch.

**Why:** The behavioral pattern is what makes the coach work. If users can freely edit the session protocol, they'll remove the parts that feel bureaucratic (reading `memory.md` before every session, asking before updating state) but are structurally load-bearing. The template preserves the kernel by keeping it locked and parameterizing only the surface that legitimately varies.

This also means improvements to the kernel (better quiz rules, better watchlist logic) can be backported to any topic by updating `CLAUDE.md.template` and re-running `/init-coach`.

---

## 6. Source-priority awareness

**The choice:** Sources are tiered as primary / secondary / tertiary. When sources disagree on a fact, primary wins. When all sources are silent, the coach marks the answer as "out-of-source" rather than fabricating.

**Why:** Study material for structured exams often contains contradictions — an official guide vs a course vs community notes may give different answers to the same question. Without an explicit priority rule, the coach (and the student) will default to whichever source they read most recently, which is essentially random. Formalizing the hierarchy in `SOURCES.md` makes tie-breaking explicit and traceable.

The "out-of-source" flag is equally important: it prevents the coach from confabulating answers to questions not covered by the declared sources, which would introduce exam-day errors from hallucinated facts presented with false authority.

---

## 7. Structured state layer + static dashboard

**The choice:** Claude maintains a machine-readable `data/state.json` in parallel with the markdown files. A static HTML dashboard (`dashboard/index.html`) reads from it. State is injected inline at write time so the dashboard works via `file://` with no server.

**Why two formats:** Markdown is Claude's primary working format and is optimized for human reading and narrative prose. JSON is optimized for structured data with known shapes: scores, dates, statuses, occurrence counts. Some fields live in both (day status, quiz score) — Claude keeps them in sync.

**Why inline JSON instead of `fetch('data/state.json')`:** `file://` URLs block `fetch` due to browser CORS policy. Inlining the JSON inside a `<script type="application/json">` block lets the student double-click the HTML file and view the dashboard with zero server setup.

**Why rebuild on every state change:** The dashboard is a snapshot, not a live view. A `.claude/settings.json` PostToolUse hook runs `scripts/build-dashboard.mjs {slug}` whenever `courses/{slug}/data/state.json` is written — read template → migrate-if-needed → validate against the schema → substitute JSON → write output. The student always sees state matching the latest structural update; the template file stays clean for future builds; invalid state never produces a stale or partial dashboard (the previous `index.html` survives until the next valid write).

**Sync discipline:** `data/state.json` is canonical; the `.md` files are rendered views or human annotations. Any structural update must write `state.json` (and the relevant `.md` view) in the same response. The dashboard rebuild is automatic — the PostToolUse hook handles it after schema validation, so partial dashboards are impossible by construction. See `CLAUDE.md.template` for the full write rule.

---

## 8. `examProfile` as a parameterization descriptor

**The choice:** Variability across MCQ exams (blueprint shape, scoring model, option count, single- vs multi-correct, scenario-vs-recall mix) is captured in one structured `examProfile` block on `state.json`. Phase planning, quiz generation, calibration math, and dashboard rendering all branch on its fields.

**Rejected alternatives:**
- A one-size-fits-all coach tuned to AWS/Azure/GCP CCA-shape exams — works for ~70% of cert exams, falls apart on the rest (scaled scoring, multi-correct, recall-heavy mixes, exams without a published blueprint).
- A forest of `if`-branches sprinkled through `CLAUDE.md.template` and the build script — works once, drifts whenever a new variant lands.

**Why a descriptor:** the variation is small (six enum-or-constant axes) and stable (it doesn't change across sessions). Capturing it in one structured object lets downstream logic branch once on a known field rather than re-deriving the exam shape from prose every time. Adding a new variant means filling in a new enum value, not rewriting the coach.

The descriptor lives in `state.json` (not `CLAUDE.md` prose) because it's structured data the build script reads — keeping it out of prose avoids the same fact being written two ways. The schema marks every axis as required, so a course always commits to a complete descriptor; there is no ambiguous "unset" state.

**Why a const for `profile` and `adaptive`:** out-of-scope categories (non-MCQ formats, computerized-adaptive exams) are pinned as JSON constants rather than absent fields. A schema-level no-op like `adaptive: false` makes the boundary explicit — a future state file claiming `adaptive: true` would fail validation, which is the right behavior because the project intentionally doesn't support CAT.

Full reference (every axis, defaults, what each one enables): [`docs/EXAM-PROFILES.md`](EXAM-PROFILES.md).

---

## 9. Rolling-summary `memory.md`

**The choice:** `memory.md` has two sections — a top **Standing Summary** that synthesizes everything older than the recent window, and a **Recent Entries** section holding the last **N = 7** dated entries verbatim. At session end the coach appends a new entry; if Recent Entries now holds more than 7, the oldest is folded (synthesized) into the Standing Summary and removed from the verbatim list. Session start reads only these two sections, not the file's pre-fold history.

**Rejected alternative:** Unbounded append-only log.

**Why:** The session protocol reads `memory.md` at the start of every session. Over a 30-day sprint, an unbounded log grows monotonically — every session's context (and the cost of reading it) gets larger. The Standing Summary is the bounded artifact a future session actually needs: persistent misses, calibration trajectory, domain coverage status. The verbatim last 7 entries preserve the texture of recent work (specific quiz scores, day-by-day plans) without paying for the texture of weeks-old work.

**Why fold instead of truncate:** Pure truncation drops information silently. Folding requires synthesis — the oldest entry's substance is integrated into the Standing Summary first, then removed from the verbatim list. The rule "no information unique to the dropped entry is lost" is the discipline that makes the cap safe.

**Why memory.md is exempt from the structural-sync rule:** It is narrative, not structured. Nothing in `state.json` is derivable from it; the dashboard does not depend on it. Folding rewrites the Standing Summary section in place — the only place in the project where the coach is allowed to rewrite (rather than append to) a markdown file.
