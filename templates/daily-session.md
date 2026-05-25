# Daily Session Format

> This file documents the structure of a single study day. The coach follows this format for every day in the phase plan.

---

## Session shape

Each day delivers six components in this order:

### 1. Core Concepts

Explain each task statement for the day concisely but completely. This may be the student's only study material for that topic — don't assume prior exposure. Use primary sources (`SOURCES.md`) as ground truth. When sources conflict, follow the priority rule: primary > secondary > tertiary.

Format: prose explanation with code blocks, config examples, or structured artifacts where the concept has a concrete form.

### 2. Exam Traps

For each concept covered, identify what the distractors will look like and *why* they're wrong. Format each trap as:

```
**Trap:** [what sounds right but is wrong]
**Why it fails:** [the principle it violates]
**Correct mental model:** [the decision rule to apply instead]
```

Aim for 2–4 traps per concept. Pull from `misses.md` entries in this domain where they apply — the exam will re-use the same distractor shapes.

### 3. Decision Rules

The if/then logic the exam rewards. Format as clear conditionals:

```
If [condition or scenario signal] → [correct choice or action]
If [competing condition] → [different correct choice]
Never [anti-pattern] when [constraint]
```

These rules go into `cheatsheet.md` after the phase is complete.

### 4. Practice Questions

Minimum 3 exam-style MCQs. Follow the full generation constraints in `templates/quiz-question.md`:
- Grounded in a case pattern from `cases.md`
- 4 options, one correct, three plausible distractors
- Hard — test edges and traps, not definitions
- After the student answers, explain all four options

**Present one question at a time. Wait for the student's answer before continuing.**

**Answer-leak prevention:** end the quiz message on neutral closing prose. Never end on a question list, a numbered item, or any token autocomplete could extend into a question→letter mapping.

### 5. Hands-On Exercise

One interactive exercise the student completes in the conversation. Examples:

- "Here's a broken [artifact] — find and fix the error"
- "Design a [system] that prevents the [trap] pattern"
- "Given this error output, what went wrong and what's the correct fix?"
- "Walk through this scenario step by step and identify which decision rule applies at each branch"

Pull the scenario from source material case patterns. The exercise should force active application of the day's decision rules, not passive recognition.

### 6. Resources

Close the day with pointers to:
- Specific sections in primary source materials (with path and priority level)
- Secondary sources that expand the topic
- Any reference resources declared during `/init-coach`

---

## Session start protocol

Before delivering any content, the coach:
1. Reads `memory.md` and `progress.md`
2. Tells the student: `"You're on Day X (topic). Ready to go, or do you want to drill something from last time?"`
3. If the student says `"let's go"` / `"start"` / `"continue"` → picks up from wherever `progress.md` says they are

## Pacing within a day

Deliver concepts → traps → decision rules as one block, then ask:

> "Ready for practice questions, or do you want to dig deeper into anything?"

This gives the student a natural pause to ask follow-up questions before moving to the quiz.

## Finishing a day

After the practice questions and exercise:

> "That's Day X done. Want to move to Day [X+1] now, or wrap up for today?"

- `"next"` / `"keep going"` → deliver the next day immediately in the same session
- `"wrap"` / `"done"` → update `memory.md`, `progress.md`, save quiz results, summarize what's next
- Mid-day time-out → mark partial progress in `progress.md` (e.g., `"Day 3: concepts done, quiz pending"`)

## Multiple days per session

Encouraged. If the student is in flow, keep going. The only constraint is that `memory.md` and `progress.md` are updated at the end of the session — not just at the end of each day.

## Resuming a partial day

If `progress.md` shows a partial day (concepts done, quiz pending), pick up at the quiz — don't re-deliver the concepts block.

---

## Session end protocol

When wrapping up, ask the student: `"Should I update memory and progress before we wrap?"`

On confirmation:
1. Append a dated entry to `memory.md` (format: `templates/memory-entry.md`)
2. Mark day status in `progress.md` (✅ Complete, 🟡 Partial)
3. Record quiz score in `progress.md` and `quizzes/day-NN.md`
4. For any misses: add or merge entries in `misses.md` (format: `templates/miss-entry.md`)
5. Update `CALIBRATION.md` if this session included a quiz or phase exam
6. Update `data/state.json` for all structural changes (day status, scores, misses, calibration)
7. Regenerate `dashboard/index.html`
8. Tell the student: `"Dashboard updated; open dashboard/index.html to view current state."`
