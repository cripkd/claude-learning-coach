# Source Material Index

> Declare all study materials here with their priority level.
> The coach uses this hierarchy when sources disagree on a fact.
> Drop your files into the `sources/` directory, then add entries below.

---

## Primary (authoritative on tie-breaks)

<!-- These sources win when sources conflict. Typically: the official exam guide, official documentation, or any source the exam committee declares authoritative.

Add entries in this format:
- [filename.md](sources/filename.md) — Description, version/edition, retrieved YYYY-MM-DD

Example:
- [exam-guide.md](sources/exam-guide.md) — Official exam guide, v2.1, retrieved 2025-01-10
-->

---

## Secondary (courses, books, official docs)

<!-- Training courses, textbooks, vendor documentation. Authoritative when primary is silent.

Example:
- [course-transcript.md](sources/course-transcript.md) — Video course transcript, completed 2025-01-20
- [official-docs.md](sources/official-docs.md) — Official product documentation, snapshot 2025-01-15
-->

---

## Tertiary (community notes, blog posts, study group materials)

<!-- Community study guides, blog posts, peer notes. Use for additional context and practice questions, but defer to primary/secondary when they conflict.

Example:
- [community-notes.md](sources/community-notes.md) — Study group notes from community forum, 2025-01-05
-->

---

## Question Bank (optional — orthogonal to the priority tiers above)

<!-- Real practice questions verbatim from an imported source (vendor pack, course-pack questions, official sample set, prior-exam pool). The coach draws from these during quizzes, alongside synthetic generation, and weights bank actuals 2× synthetic when computing readiness.

The bank lives in `bank/` (parallel to `sources/`). Format spec: `templates/question-bank.md`. The bank is optional — leave this section empty and the coach behaves exactly as without a bank.

Add entries in this format:
- [filename.md](bank/filename.md) — Description, question count, domains covered, retrieved YYYY-MM-DD

Example:
- [tutorialsdojo-set-a.md](bank/tutorialsdojo-set-a.md) — TutorialsDojo SAA Practice Set A, 65 Qs, D1–D4, retrieved 2025-01-12
- [course-chapter-quizzes.md](bank/course-chapter-quizzes.md) — Cantrill course end-of-chapter quizzes, 80 Qs, D1–D4, retrieved 2025-01-08
-->

---

## Priority Rule

When sources disagree on a fact: **primary > secondary > tertiary**.

When primary is silent on a topic, secondary wins. When all sources are silent, the coach marks the answer as **"out-of-source"** and flags it for verification rather than fabricating an answer.

If you discover a source is outdated or incorrect after adding it, move it to a lower priority tier and add a note explaining why.

**Bank vs sources.** The bank is a *practice surface* (questions), not a *knowledge surface* (facts). When a bank question's explanation contradicts a primary source, the primary source wins for facts and decision rules — but the bank entry stays in `bank/` verbatim (its trap structure is the point). Flag the discrepancy in `misses.md` so the next drill addresses it.
