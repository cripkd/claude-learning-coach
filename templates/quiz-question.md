# Quiz Question Template

> This file documents the prompt pattern and constraints for generating exam-style practice questions. The coach follows these rules when generating quizzes during daily sessions and on-demand drilling.

---

## Generation constraints

Generate a scenario-grounded MCQ with the following constraints:

1. **Ground in a case pattern** drawn from `cases.md` (named scenario or pool-cross). If the case mode is `"recall"`, ground in a domain-specific scenario instead.
2. **4 options, one correct, three plausible distractors.** Each distractor should target a named trap from `misses.md` if one applies — this maximizes drilling value.
3. **Distractors should look defensible** — vary option length; the correct answer is sometimes the shortest option. Avoid "obviously wrong" distractors that a student can eliminate by surface reading.
4. **Letter distribution** — randomize correct-answer placement across A/B/C/D over a quiz session. Do not bias toward A or B.
5. **Answer-leak prevention (critical):**
   - Never include a sample or format-example answer string of any kind in the quiz prompt. No `"(e.g., A)"`, no `"(format: letter)"`, no demonstration showing a question→letter mapping.
   - End every quiz message on neutral closing prose — not on a numbered list, not on a question token, not on anything autocomplete could extend into a question→letter mapping. Close with a sentence like `"Reply when ready."` or `"Post your answers and I'll walk through each option."` with no trailing example or list.
   - This applies on top of: warning the student to ignore input-field auto-suggestions, and randomizing correct-answer letter distribution.
6. **Difficulty** — test the edges and traps, not memorization. The question should require the student to apply a decision rule, not recall a definition.
7. **Post-answer explanation** — after the student answers, explain ALL four options: why the correct answer is correct, and specifically why each distractor fails (name the trap it exploits).

---

## Shape diversity

Mix these question shapes across a quiz session and across sessions over time:

| Shape | Description |
|---|---|
| **Short-correct** | The correct answer is noticeably shorter than the distractors. Trains students not to equate length with correctness. |
| **Vocab-in-wrong-layer** | Distractor uses correct vocabulary but applies it at the wrong mechanism or layer. Tests whether the student understands the concept, not just the label. |
| **Simplest-sufficient-fix** | Frames a scenario where the correct answer is the minimal fix; distractors are over-engineered. Trains rejection of unnecessary complexity. |
| **Anti-overapplication** | Correct answer rejects a familiar mental model because the scenario's constraints make it inapplicable. |
| **Scope-qualifier trap** | A framing word in the question names *where* something applies, not *what* mechanism applies. Tests whether the student trusts pattern recognition despite surface noise. |
| **Cross-domain** | The trap straddles two task statements or domains. Highest difficulty; use sparingly, especially in endgame drills. |

---

## Watchlist drilling

When drilling the Repeat-Miss Watchlist:
- Use each watchlist item's `diagnostic` field as the question seed
- Construct a new scenario (not a verbatim repeat of the original miss)
- After the student answers, reference the watchlist entry by label and occurrence count to close the loop

---

## Per-session quiz protocol

1. Present questions **one at a time**. Do not reveal the next question until the student has answered the current one.
2. Wait for the student's answer before revealing correct/incorrect.
3. On a wrong answer:
   a. Explain why their choice was tempting (name the trap)
   b. Explain the mental model they should apply instead
   c. Note the miss in `misses.md` (check for an existing entry to merge into first)
4. After all questions, give a score summary and note any new or promoted watchlist items.
5. Save the full quiz to `quizzes/day-NN.md`.
