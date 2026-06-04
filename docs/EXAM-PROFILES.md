# Exam Profiles — the `examProfile` descriptor

> The `examProfile` block in `courses/{slug}/data/state.json` parameterizes the coach across the dimensions on which MCQ certification exams actually vary. The defaults reproduce the v1 behavior — the CCA-shaped exam (4-option, single-correct, fixed-percent cut, declared weighted blueprint, scenario-based). Every axis is an enum or a constant; nothing here is free-form.
>
> This file is the **single home** for what each axis means and what it changes. The schema (`templates/state-schema.json`) is the contract; this doc is the interpretation.

---

## Why a descriptor

A generic MCQ coach would either lock to one exam shape (works for AWS/Azure/GCP, fails for everything else) or carry a forest of `if`-branches throughout the prompt (works once, falls apart on the next variant). The descriptor pattern compresses the variation into a small object that downstream logic — phase planning, quiz generation, calibration math, dashboard rendering — branches on once. Adding support for a new exam variant means filling in one or two new fields, not rewriting the coach.

The descriptor lives in `state.json` (not `CLAUDE.md`) for two reasons:
1. It's structured data the build script reads — keeping it out of prose avoids the "prose drift" problem (the same fact written two ways).
2. It's set at `/init-coach` time and rarely changes; persisting it next to the rest of canonical state makes it survive across sessions without re-derivation.

The schema marks all six axes as **required** so a state file always commits to a complete descriptor — there is no "unset" state where the coach's behavior is ambiguous.

---

## The six axes

| Axis | Schema location | Type | Default | What it enables |
|---|---|---|---|---|
| `profile` | `examProfile.profile` | const `"mcq"` | `"mcq"` | Exam family. Pinned to MCQ — the project is scoped to MCQ exams. |
| `scenarioRecallRatio` | `examProfile.scenarioRecallRatio` | number `0..1` | `1.0` (scenario) | Per-session bias between scenario questions and recall drills. |
| `blueprint.mode` | `examProfile.blueprint.mode` | enum `weighted / unweighted / none` | `"weighted"` | How `domains[].weight` is interpreted; drives phase planning + coverage-vs-blueprint analysis. |
| `scoring.model` | `examProfile.scoring.model` | enum `fixed_percent / scaled / pass_fail_unknown` | `"fixed_percent"` | How `exam.passMarkPercent` is interpreted; drives dashboard readiness rendering. |
| `questionFormat` | `examProfile.questionFormat` | object | 4 options, single-correct | Per-question shape constraints (option count, single- vs multi-correct, partial-credit policy). |
| `adaptive` | `examProfile.adaptive` | const `false` | `false` | Explicit out-of-scope guard. Computerized-adaptive (CAT) exams are not supported. |

---

## `profile` — exam family

```json
"profile": "mcq"
```

The only supported value. Pinned as a JSON const, not an enum, because the project's scope is intentionally narrow: structured, scenario-based multiple-choice certification exams.

Anything outside MCQ — free-response, performance / lab, oral, coding exercises — is out of scope. See the README's *Out of scope* block for the rationale.

---

## `scenarioRecallRatio` — scenario vs recall mix

```json
"scenarioRecallRatio": 0.0     // pure recall
"scenarioRecallRatio": 1.0     // pure scenario (default)
"scenarioRecallRatio": 0.5     // half-and-half
```

A number in `[0, 1]` describing what fraction of questions are scenario-grounded vs recall-driven. The coach uses this to bias each session's quiz block: a 0.5 ratio sets up roughly half scenario MCQs and half discrimination drills.

**Orthogonal to `exam.caseMode`** (which is *how scenarios are sourced* — exam-defined named scenarios, pool-derived crossings, or recall — not what fraction they make up). For a recall-only exam, both `scenarioRecallRatio = 0.0` and `exam.caseMode = "recall"` apply, and `cases.md` carries the N/A block instead of a scenario list.

**How `/init-coach` sets it:** derived from Q7 (case-reasoning vs recall). Integrated case-reasoning → `1.0`. Recall-only → `0.0`. A mixed-shape exam can be edited to a value in between after init; `/init-coach` doesn't prompt for it directly.

**Recall-heavy interaction with miss types:** when `scenarioRecallRatio < 0.5`, the coach leans on the `confusion` miss type (A-vs-B discrimination drills) more than on `trap` (scenario-shape recognition). The two miss types are documented in `templates/miss-entry.md`.

---

## `blueprint.mode` — how domain weights are interpreted

```json
"blueprint": { "mode": "weighted" }       // default
"blueprint": { "mode": "unweighted" }
"blueprint": { "mode": "none" }
```

The blueprint mode determines how `domains[].weight` is used (or whether it is at all) for both phase planning and dashboard rendering.

### `weighted` (default — CCA-shaped exams)

The exam publishes per-domain weights (AWS SAA, Azure AZ-104, GCP PCA, etc.). The coach:
- Sorts domains by weight descending for phase planning.
- Front-loads Phase 1 with the top domains until cumulative weight ≥ 55%.
- Distributes days inside each phase proportional to weight, minimum 1 day per domain.
- Dashboard's Coverage vs Blueprint card compares actual effort share to `weight / sumWeights` and flags domains ≥ 5pp below expected.

### `unweighted`

The exam declares domains but no published weights. The coach:
- Keeps the declared domain order.
- Front-loads Phase 1 with `ceil(n/2)` domains.
- Distributes days equally inside each phase.
- Diagnostic re-orders domains by score ascending (weakest first) and re-splits across phases. Day counts stay equal.
- Coverage vs Blueprint compares effort share to `1/n`.

### `none`

No domain blueprint exists. The coach:
- Starts with `domains[] = []` and generic Phase 1 ("Foundations") / Phase 2 ("Building") day topics.
- The diagnostic populates `domains[]` as topics surface in early sessions.
- After population, the coach flips `blueprint.mode` to `"unweighted"` and the course behaves accordingly.
- Coverage vs Blueprint is hidden — there's nothing to compare against.

**How `/init-coach` sets it:** Q6 — student lists weights (`"D1: 30%, D2: 22%, …"`), or lists domains without weights, or says `"no blueprint"`.

**Out-of-scope:** none of these modes covers a hidden blueprint where the weights exist but are not disclosed to the student. Treat that case as `unweighted` and accept that calibration will be approximate.

---

## `scoring.model` — how the pass mark is interpreted

```json
"scoring": { "model": "fixed_percent", "scaleMin": null, "scaleMax": null }     // default
"scoring": { "model": "scaled",        "scaleMin": 100,  "scaleMax": 1000 }
"scoring": { "model": "pass_fail_unknown", "scaleMin": null, "scaleMax": null }
```

`exam.passMarkPercent` (a number, 1–100) is interpreted differently in each model. The dashboard's readiness card branches on this.

### `fixed_percent` (default)

`passMarkPercent` is a raw percent cutoff. Example: `passMarkPercent = 72` means the student needs ≥ 72% correct.

Dashboard headline shows:
- Debiased cold-water estimate (%)
- Margin over pass mark (%)
- Rough pass probability (%)

### `scaled`

`passMarkPercent` is the percent-equivalent of the scaled cutoff. `scaleMin` and `scaleMax` give the score range (e.g., AWS uses 100–1000 with ~720 passing — set `passMarkPercent = 72`, `scaleMin = 100`, `scaleMax = 1000`).

Dashboard headline:
- Same debiased estimate / margin / probability math as `fixed_percent` (all computed in percent space).
- Pass-mark label is rendered in scaled form: `"720 of 1000 (72%)"` via linear interpolation between scaleMin and scaleMax.

**Limitation:** the dashboard math runs in percent space. If the actual scoring curve is non-linear (AWS's reportedly is), the rendered scaled number is an approximation, not a forecast. The percent-margin and pass probability remain honest; the scaled label is for orientation only.

### `pass_fail_unknown`

The exam publishes pass/fail but does not disclose the cut. The dashboard:
- Suppresses margin and pass probability (no cut → no math).
- Renders a **qualitative band** instead, derived from the debiased estimate: `"Strong"` (≥ 85), `"Likely passing"` (≥ 75), `"Marginal"` (≥ 65), `"Weak"` (< 65).

**How `/init-coach` sets it:** Q7a — defaults to `fixed_percent`. Student picks scaled (and provides the range) or pass-fail-unknown explicitly. Skipping Q7a with `"default"` keeps `fixed_percent`.

---

## `questionFormat` — per-question shape

```json
"questionFormat": {
  "optionCount": 4,
  "multipleCorrect": false,
  "partialCredit": "all_or_nothing"
}
```

### `optionCount`

Integer ≥ 2. Defaults to `4`. Tested for `4` and `5`. For 5-option exams the coach generates one correct answer and four plausible distractors instead of three — the extra distractor lets it drill two trap shapes per question.

Values other than 4 or 5 will validate but are untested; `/init-coach` warns and proceeds with `4` if the student claims another count.

### `multipleCorrect`

Boolean. Defaults to `false` (single-correct). When `true`, questions may have between 2 and `optionCount − 1` correct options. The coach tells the student explicitly how many to pick (`"Select 2 that apply"` — never `"Select all that apply"` without a count, which leaks set size).

### `partialCredit` (only meaningful when `multipleCorrect = true`)

Enum `"all_or_nothing"` (default) or `"partial"`.

| Policy | Per-question contribution to `quizScore.correct` |
|---|---|
| `all_or_nothing` | `1` if the student picks exactly the correct set; `0` otherwise. `quizScore.correct` stays integer. |
| `partial` | `max(0, (correctPicks − incorrectPicks) / K)` where K = number of correct options, clamped to `[0, 1]`. `quizScore.correct` may be a float (e.g. `7.5`). |

`quizScore.total` is always the integer question count. The dashboard renders `correct/total (percent%)` regardless of float/int.

**How `/init-coach` sets it:** Q7a. Defaults are 4 / false / `all_or_nothing`. Multiple-correct exams require explicit declaration during init.

---

## `adaptive` — explicit out-of-scope guard

```json
"adaptive": false
```

Pinned as a const, like `profile`. It exists so a state file makes the out-of-scope declaration explicit at the schema level. Computerized-adaptive (CAT) exams — where question difficulty shifts based on running performance — are out of scope:
- Real CAT prep needs an adaptive item bank and ability-trait estimation, neither of which fits the coach's prompt-and-react architecture.
- Calibration math against a fixed cut doesn't apply to CAT; the bias/stddev approach in `computeReadiness` would mislead.

A real CAT exam (NCLEX, GRE quantitative, etc.) is best served by a different tool.

---

## What `/init-coach` sets when the student answers `"default"`

When Q7a is skipped, `/init-coach` writes:

```json
"examProfile": {
  "profile": "mcq",
  "scenarioRecallRatio": 1.0,        // or 0.0 if Q7 said recall-only
  "blueprint": { "mode": "weighted" }, // or unweighted / none from Q6
  "scoring": { "model": "fixed_percent", "scaleMin": null, "scaleMax": null },
  "questionFormat": {
    "optionCount": 4,
    "multipleCorrect": false,
    "partialCredit": "all_or_nothing"
  },
  "adaptive": false
}
```

This is the CCA-shape default — matches AWS / Azure / GCP / Anthropic-style cert exams out of the box.

---

## Worked example

The fixture at [`courses/example-saa-c03/`](../courses/example-saa-c03/) uses:

```json
"examProfile": {
  "profile": "mcq",
  "scenarioRecallRatio": 1.0,
  "blueprint": { "mode": "weighted" },
  "scoring": { "model": "fixed_percent", "scaleMin": null, "scaleMax": null },
  "questionFormat": { "optionCount": 4, "multipleCorrect": false, "partialCredit": "all_or_nothing" },
  "adaptive": false
}
```

— the CCA default. To see what a different axis combination looks like in practice, edit the fixture's `data/state.json` and rebuild (`npm run build-example`). The build refuses to write on schema violation, so invalid descriptor combinations are caught at build time.

---

## Migration notes

The descriptor was introduced in schema v2.0. Pre-2.0 state files are migrated by `scripts/build-dashboard.mjs` → `migrateTo20` with v1-equivalent defaults: `mcq` / `1.0` (or `0.0` if `exam.caseMode = "recall"`) / `weighted` / `fixed_percent` / 4-option single-correct / `adaptive: false`. After migration the file validates and behavior is identical to v1.

Later schema bumps (2.1 readiness debias fields, 2.2 miss bifurcation, 2.3 calibration source) leave the descriptor untouched. The descriptor's contract is stable across the v2.x series.

---

## Related

- **Schema:** [`templates/state-schema.json`](../templates/state-schema.json) — the source of truth for what's allowed.
- **Defaults flow:** [`.claude/commands/init-coach.md`](../.claude/commands/init-coach.md) — how each axis is set from the interview.
- **Readiness math (`scoring.model` branches):** [`docs/DASHBOARD.md`](DASHBOARD.md) — the pass-probability and qualitative-band rendering.
- **Question-bank import (interacts with `questionFormat`):** [`templates/question-bank.md`](../templates/question-bank.md) — bank entries must match the declared option count.
