# SAA-C03 Study Log

> Persistent memory across sessions. The coach reads the **Standing Summary** and **Recent Entries** at the start of every session and appends a new entry to Recent Entries at the end.
> Format: see `templates/memory-entry.md`.
> Recent Entries holds the last **N = 7** verbatim. When a session-end append makes it the 8th, the oldest entry is folded (synthesized) into the Standing Summary, then removed from the verbatim list — no information is lost.

---

## Standing Summary

_No entries folded yet — the Standing Summary fills in once Recent Entries exceeds 7._

In a longer course this section would summarize anything older than the 7-entry window — persistent misses, calibration trajectory, domain coverage status. The fixture is short enough that the Standing Summary is empty and all entries live verbatim in Recent Entries below. The fold mechanism is demonstrated in `templates/memory-entry.md`.

---

## Recent Entries

## Day 1–2 — IAM, KMS, Network Security (2026-06-01)

**Score:** Day 1 quiz 7/10 (70%); Day 2 quiz 8/10 (80%).

### What was covered
D1-T1 IAM (users, roles, policies, SCPs, permission boundaries) on Day 1. D1-T2 KMS + encryption-at-rest/transit and D1-T3 VPC/SG/NACL/WAF on Day 2. Two daily quizzes back-to-back.

### Misses and trap patterns
- **Public S3 vs bucket policy** [Day 1 Q3] — new entry, D1 (miss-0001). Chose "make the bucket policy public" when Block Public Access was the missing constraint. Trap: forgetting BPA silently overrides permissive policies.
- **Simplest-sufficient-fix rejection** [Day 2 Q5] — new entry, D2 (miss-0002). Chose Multi-AZ + cross-region replication when Multi-AZ alone met the stated RTO. First occurrence; one repeat away from watchlist.

### Calibration update
- Day 1: predicted 75%, actual 70% — overconfident by 5 pts.
- Day 2: predicted 80%, actual 80% — calibrated.
Cold-water estimate: 80% blended (D1 + early D2).

### Plan for next session
- Day 3: D2-T2 decoupling (SQS/SNS/EventBridge) + Phase 1 exam.
- Watch the simplest-sufficient-fix trap — one more occurrence and it goes to the watchlist.

## Day 3–4 — Phase 1 exam + Caching (2026-06-03)

**Score:** Phase 1 exam 8/12 (67%); Day 4 quiz 7/10 (70%).

### What was covered
Day 3 delivered D2-T1 HA (Multi-AZ, ASG, ELB types) and D2-T2 decoupling (SQS, SNS, EventBridge) followed by the 12-question Phase 1 exam. Day 4 delivered D3-T1 caching/compute (ElastiCache, CloudFront, EC2 sizing) with a mixed bank+synthetic quiz (4 bank + 6 synthetic).

### Misses and trap patterns
- **Simplest-sufficient-fix rejection** [Phase 1 exam Q7] — repeat (now 2×, promoted to Watchlist as position 1). Same trap shape as Day 2 Q5: chose active-active when active-passive was sufficient for the stated RTO.
- **SQS standard vs FIFO** [Phase 1 exam Q4] — new entry, D2 (miss-0003). Confusion type. A: Standard (at-least-once, best-effort ordering, virtually unlimited throughput). B: FIFO (exactly-once, strict order per group, ~3000 msg/s).
- **SQS standard vs FIFO** [Day 4 Q2 (bank)] — repeat (now 2×, promoted to Watchlist as position 2). Same confusion appeared on a bank question the very next day — the discrimination cue clearly hasn't landed yet.

### Calibration update
- Phase 1 exam: predicted 75%, actual 67% — overconfident by 8 pts (significant).
- Day 4 (bank subset): predicted 75%, actual 70% — overconfident by 5 pts.
- Day 4 (synthetic subset): predicted 75%, actual 78% — underconfident by 3 pts (synthetic inflation, as expected).
After 5 entries the script-computed bias is **-3.33** (weighted, bank counts 2×); debiased estimate **76.67%**; rough P(pass) **0.87**.

### Plan for next session
- Day 5: D4-T1 cost optimization (S3 tiers, Spot/RI/SP) + Phase 2 exam.
- Drill both watchlist items at the start of Day 5: a fresh simplest-sufficient-fix scenario and a discrimination drill for SQS Standard vs FIFO.
- Coverage check: D4 has 0% effort vs 20% blueprint expectation — Day 5 is its only chance.
