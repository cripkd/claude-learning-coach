# SAA-C03 Cheat Sheet

> **Forward-looking rules.** Read as: "here's the model, apply it."
> Appended by the coach after each phase is complete. Organized by domain.
> This is NOT a trap log — for traps and misses, see `misses.md`.

---

## How to use this file

- **Before a session:** scan to prime the mental models you'll be applying
- **Before the endgame:** read through to confirm each rule feels automatic
- **During a drill:** use these rules to check your reasoning after answering a question

---

## Domain 1 — Design Secure Architectures

### S3 public access
**When the question says "must not be publicly accessible" → check Block Public Access first, then the bucket policy.**
- Trigger: prohibition language about public access
- Mechanism: BPA is an account- or bucket-level prohibition that silently overrides permissive policies. A bucket policy alone is not sufficient to prove non-public access.
- Anti-pattern: rewriting the bucket policy without checking BPA — the policy might already be irrelevant.

### IAM permissions boundary vs SCP
**When the question describes a delegated administrator who shouldn't be able to escalate → permissions boundary.**
- Trigger: "delegate but cap", "max permissions", per-identity
- Mechanism: SCPs are organization-wide guardrails on accounts; boundaries are per-identity caps. Same idea, different scope.
- Anti-pattern: applying an SCP when only one user needs the cap — overkill.

## Domain 2 — Design Resilient Architectures

### Simplest sufficient fix
**When two options both meet the stated RTO/RPO → pick the one that adds less.**
- Trigger: scenario gives a specific RTO/RPO (e.g., "15 minutes") and two options both satisfy it
- Mechanism: AWS exams reward minimal-sufficient designs; over-engineered options are distractors
- Anti-pattern: jumping to active-active or cross-region just because they're available — the RTO might not require them.

### SQS queue type selection
**When ordering or exactly-once processing is required → FIFO. Otherwise → Standard.**
- Trigger: words like "order", "exactly-once", "deduplication", "sequence"
- Mechanism: FIFO trades throughput (~3000 msg/s per group) for strict ordering + dedup; Standard gives virtually unlimited throughput with at-least-once and best-effort ordering.
- Discrimination cue: "Does the scenario need ordering/dedup? Yes → FIFO; no → Standard."

---

## Domain 3 — Design High-Performing Architectures

_To be appended after Day 5 phase exam — currently in flight._

## Domain 4 — Design Cost-Optimized Architectures

_Day 5 in progress; rules will land after the Phase 2 exam._

---

## Cross-Domain Rules

_None yet — too early in the course for cross-domain pattern crystallization._
