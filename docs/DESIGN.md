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

---

## 2. Repeat-Miss Watchlist with auto-promotion

**The choice:** When a miss recurs (same conceptual error, different scenario), it is promoted from a regular `misses.md` domain entry to a numbered **Repeat-Miss Watchlist** section at the bottom of the file. The Watchlist is the highest-priority drill surface in the pre-exam window.

**Rejected alternative:** Formal spaced-repetition scheduling (Anki, 1/3/7/14-day intervals).

**Why:** SRS is the right algorithm in theory but adds tooling friction and a cold-start problem (you need enough cards before the intervals pay off). The Watchlist is informal SRS: it surfaces the same item every time you open `misses.md`, which happens to be the right interval when you're in a compressed prep cycle. The key insight is that the Watchlist doesn't need a scheduler — it self-prioritizes by the fact that it's at the bottom of a file the coach reads every session.

**Format:** Each Watchlist item carries the occurrence count and full provenance (e.g., `[REPEAT 3x — Day 10, Day 16, Day 21]`) so the student can trace the exact scenarios where the miss recurred.

**Promotion rule:** A miss is promoted on its 2nd occurrence. The original domain entry is updated (not duplicated). The Watchlist entry holds the diagnostic question — a one-sentence handle the student applies to recognize the trap in a new scenario.

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

**Why regenerate on every state change:** The dashboard is a snapshot, not a live view. Regenerating it explicitly (read template → substitute JSON → write output) means the student always sees state that matches the latest structural update, and the template file stays clean for future regenerations.

**Sync discipline:** Any structural update (mark day complete, record a score, add a miss, update readiness) must update the `.md` file, `data/state.json`, AND `dashboard/index.html` in the same response. Partial updates leave the dashboard stale and create silent state drift. See `CLAUDE.md.template` for the full sync rule.
