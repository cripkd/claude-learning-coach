# Quiz Question Template

> This file documents the prompt pattern and constraints for generating exam-style practice questions. The coach follows these rules when generating quizzes during daily sessions and on-demand drilling.

---

## Drawing from a question bank (preferred when available)

If `bank/` exists and contains questions tagged with the day's domain (`[domain: Dx]` in the entry heading; format: `templates/question-bank.md`), **draw from the bank first** before generating any synthetic questions.

- **Verbatim only.** Present the question's stem, options, and explanation exactly as written. Do not paraphrase, do not reorder options, do not rewrite distractors — the bank's value is its real distractor structure.
- **Attribute the source.** Tell the student which questions are bank-drawn (e.g., `"Q1 from bank (Q-042); Q2–Q3 synthesized"`). Quiz logs (`quizzes/day-NN.md`) record the bank ID for each bank question.
- **Mix freely.** A quiz can be all bank, all synthetic, or mixed. When the day's domain has no bank coverage, generate synthetically as usual.
- **Don't overdraw.** Don't pull more than ~50% of a single quiz from the bank when synthetic coverage is also available — synthetic targets named traps from `misses.md`, which the bank may or may not. Use the bank for breadth; use synthetic for targeted drilling.
- **When the bank explanation conflicts with primary sources:** the primary source wins for facts. Note the discrepancy in `misses.md` so the next drill addresses it — but leave the bank entry verbatim in `bank/`.

After bank draws, fall through to the synthetic-generation rules below.

---

## Generation constraints (synthetic questions)

Generate a scenario-grounded MCQ with the following constraints. The option count and correctness rules come from `examProfile.questionFormat` in `data/state.json`; the defaults below match a typical 4-option single-correct exam.

1. **Ground in a case pattern** drawn from `cases.md` (named scenario or pool-cross). If the case mode is `"recall"`, ground in a domain-specific scenario instead.
2. **Option count = `examProfile.questionFormat.optionCount`** (default 4; 5 also supported). For 5-option, generate one correct answer and four plausible distractors instead of three. The extra distractor lets you drill two traps in one question.
3. **Single- vs multiple-correct** = `examProfile.questionFormat.multipleCorrect` (default `false`).
   - **Single-correct (default):** one correct answer, the rest plausible distractors. Each distractor should target a named trap from `misses.md` if one applies — this maximizes drilling value.
   - **Multiple-correct:** between 2 and `optionCount−1` correct options. Tell the student explicitly how many to pick (e.g., *"Select 2 that apply"* — never *"Select all that apply"* without a count, which leaks set size from context). Distractors still target traps.
4. **Distractors should look defensible** — vary option length; the correct answer is sometimes the shortest option. Avoid "obviously wrong" distractors that a student can eliminate by surface reading.
5. **Letter distribution** — randomize correct-answer placement across the option letters over a quiz session. Do not bias toward A or B. For multi-correct, also randomize *which letters* the correct set occupies (avoid contiguous runs like "A,B" every time).
6. **Answer-leak prevention (critical):**
   - Never include a sample or format-example answer string of any kind in the quiz prompt. No `"(e.g., A)"`, no `"(format: letter)"`, no demonstration showing a question→letter mapping. For multi-correct, no `"(e.g., A and C)"` either.
   - End every quiz message on neutral closing prose — not on a numbered list, not on a question token, not on anything autocomplete could extend into a question→letter mapping. Close with a sentence like `"Reply when ready."` or `"Post your answers and I'll walk through each option."` with no trailing example or list.
   - This applies on top of: warning the student to ignore input-field auto-suggestions, and randomizing correct-answer letter distribution.
7. **Difficulty** — test the edges and traps, not memorization. The question should require the student to apply a decision rule, not recall a definition.
8. **Post-answer explanation** — after the student answers, explain ALL options: why each correct answer is correct, and specifically why each distractor fails (name the trap it exploits).

---

## Scoring per question (when `multipleCorrect = true`)

`examProfile.questionFormat.partialCredit` decides how to score a multi-correct question. `K` = number of correct selections in this question.

| partialCredit | Per-question contribution to `quizScore.correct` |
|---|---|
| `"all_or_nothing"` (default) | `1` if the student picks exactly the correct set; `0` otherwise. `quizScore.correct` stays an integer. |
| `"partial"` | `max(0, (correctPicks − incorrectPicks) / K)`, clamped to `[0, 1]`. `quizScore.correct` may be a float (e.g. `7.5`). |

`quizScore.total` is always the integer question count (not selection count). `quizScore.percent = correct / total * 100`. The dashboard renders `correct/total (percent%)` directly — both representations work.

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
5. Save the full quiz to `quizzes/day-NN.md`. For bank-drawn questions, record the bank ID alongside the response — provenance matters.
6. **Calibration logging — split by source.** If the quiz mixed bank and synthetic questions, write **two** `calibration[]` entries (same date, distinct labels, distinct `source` values). Never merge bank scores into the synthetic entry — the dashboard's readiness math relies on the split to weight bank actuals higher.
