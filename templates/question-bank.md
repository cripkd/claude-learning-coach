# Question Bank Format

> Spec for files in `courses/{slug}/bank/`. The coach reads these at runtime to
> draw **real** practice questions (vs synthetic generation from `cases.md`).
> Real-question performance is a higher-quality calibration signal than synthetic
> drilling — the dashboard weights bank actuals 2× synthetic when computing bias
> and noise (see `scripts/build-dashboard.mjs` → `computeReadiness`).
>
> The bank is **optional**. If `courses/{slug}/bank/` is empty or missing, the
> coach falls back to today's behavior exactly: synthetic generation only.

---

## Where bank files live

```
courses/{slug}/bank/
├── index.md           ← optional roster of bank files with provenance
├── chapter-1.md       ← any number of question files, any naming
├── practice-set-a.md
└── …
```

One question file may hold many questions. The coach reads them in `bank/` recursively. Naming is free-form — pick whatever maps to your source material (chapter, set, vendor pack, etc.).

Drop your source's questions in here exactly as written. Do **not** paraphrase — verbatim text preserves the actual distractor structure and is the whole reason the bank is a higher-quality signal than synthetic.

---

## Question entry format

Each question is a top-level section. The heading carries the stable ID and the domain tag; the body holds the stem, options, correct answer(s), and explanation.

```markdown
## Q-001 [domain: D1]

A company stores customer PII in an S3 bucket. Compliance requires that the data
remain encrypted at rest with keys the company controls and that access is
restricted to a single application role. Which combination of services BEST meets
these requirements?

A. S3 Default Encryption with AWS-managed (SSE-S3) keys + bucket policy
B. S3 Default Encryption with KMS Customer-Managed Key + IAM role policy
C. S3 Object Lock in Compliance mode + ACL restrictions
D. CloudHSM-backed envelope encryption + VPC Endpoint policy

**Correct:** B

**Explanation:** Customer-controlled keys requires KMS CMK (not SSE-S3). Access
control to a single application identity is an IAM role policy on the calling
principal. Object Lock is for retention/immutability, not access control. CloudHSM
is over-engineered for this requirement and not necessary for "company-controlled
keys" — KMS CMKs satisfy that constraint.
```

### Required fields

| Field | Where it lives | Notes |
|---|---|---|
| Stable ID | `## Q-NNN` in the heading | Free-form within the file (e.g., `Q-001`, `vendor-A-q42`). Coach uses it to attribute results back to a specific question. Never renumber after the question is referenced in a quiz log. |
| Domain | `[domain: Dx]` in the heading | Must match a `domains[].id` in `data/state.json`. Used to filter bank picks by the day's domain. |
| Stem | Prose under the heading | The scenario as written in the source. Do not paraphrase. |
| Options | `A. …` / `B. …` / … lines | One per line, letter-prefixed. Option count must match `examProfile.questionFormat.optionCount` for the course (default 4). |
| Correct | `**Correct:** X` line | Single letter for single-correct; comma-separated letters (e.g., `**Correct:** B, D`) for multi-correct. |
| Explanation | `**Explanation:** …` block | Verbatim from the source if provided. If the source has no explanation, the coach generates one and labels it `**Explanation (coach-added):**`. |

### Optional fields

| Field | Format | Notes |
|---|---|---|
| Source attribution | `**Source:** …` line | Free-form (e.g., `Cantrill course Chapter 8 Q12`, `Vendor pack v3 Q42`). Useful for provenance when multiple vendors are mixed. |
| Trap tag | `**Trap:** …` line | Names the trap pattern the question exercises (e.g., `simplest-sufficient-fix`). Lets the coach cross-reference against `misses.md`. |
| Difficulty | `**Difficulty:** easy \| medium \| hard` line | Coach may pull harder questions for endgame drills. |

---

## How the coach uses the bank

**At quiz time:** when the day's domain has bank questions available, the coach draws **at least one bank question per quiz block** before synthesizing any. Synthetic generation fills the rest. When the day's domain has no bank questions, the coach generates synthetically as usual.

**Attribution in the quiz log:** `quizzes/day-NN.md` records which questions came from the bank (with their bank ID) vs were synthesized. The coach never blends them silently.

**Calibration entry:** when a quiz contains bank questions, log the **score on bank questions only** as a separate `calibration[]` entry with `source: "bank"`. The synthetic score (if any) is logged as a separate entry with `source: "synthetic"`. The two never merge.

**Why split, not merge:** synthetic questions inflate scores (the generator knows the trap it's drilling); bank questions don't. Merging them muddies the signal. The dashboard's debias math weights bank entries 2× when there are enough of each — the closer-to-real-exam channel earns more influence over the headline estimate.

**Source-priority rule still applies:** the bank is a declared source, not a license to fabricate. When a bank question's explanation contradicts a primary source on a fact, the primary source wins for explanations and decision rules. The bank entry stays in the bank (don't rewrite it — the trap structure is its value), but flag the discrepancy in `misses.md` so the next drill addresses it.

---

## Example `bank/index.md` (optional)

A bank index file is purely documentation — the coach doesn't require it, but it's useful when you mix multiple sources or want notes on provenance:

```markdown
# Question Bank Index — {slug}

## Files

| File | Source | Question count | Domains | Notes |
|---|---|---|---|---|
| chapter-1.md | Cantrill SAA-C03 Chapter 1 | 24 | D1 | Verbatim from course |
| practice-set-a.md | TutorialsDojo SAA Practice Set A | 65 | D1–D4 | Verbatim, official-style |
| vendor-pack-v3.md | Vendor X v3 sample pack | 30 | D2, D3 | Two explanations differ from AWS docs — see misses.md |

## Last refreshed

YYYY-MM-DD
```

---

## What not to put in the bank

- **Your own practice questions written from memory.** Those are synthetic — keep them out of the bank or the calibration weighting becomes misleading.
- **Questions whose answer you couldn't verify against a primary source.** Either verify them or move them to a `bank/_unverified.md` file the coach won't draw from.
- **Modified bank questions** ("I rewrote option C to make it harder"). A modified question is synthetic. Keep bank entries verbatim.
