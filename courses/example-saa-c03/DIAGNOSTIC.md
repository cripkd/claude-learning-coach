# Pre-Study Diagnostic

> Run before Day 1. The coach generated 12 questions across the four declared domains; results below.

---

## Date run: 2026-05-30

---

## Scores by Domain

| Domain | Weight | Questions | Correct | % | Notes |
|--------|--------|-----------|---------|---|-------|
| D1 — Design Secure Architectures | 30% | 4 | 2 | 50% | Weak on bucket-policy + BPA interaction; IAM permissions boundary tricky. |
| D2 — Design Resilient Architectures | 26% | 3 | 2 | 67% | SQS/SNS choice OK; over-engineered Multi-AZ design on one question. |
| D3 — Design High-Performing Architectures | 24% | 3 | 2 | 67% | ElastiCache + CloudFront layering correct; missed write-through vs lazy-load. |
| D4 — Design Cost-Optimized Architectures | 20% | 2 | 1 | 50% | Spot vs Savings Plans confused on the one steady-state workload question. |

**Blended score:** 7 / 12 (58%)

---

## Confidence vs Accuracy

- Predicted 65% blended → Actual 58% → Overconfident by 7 points overall.
- D1 (predicted 60%) → Actual 50% → Overconfident by 10 — the weakest signal coming in.
- D3 (predicted 60%) → Actual 67% → Underconfident by 7.

---

## Phase Plan Adjustments

- D1 has the highest weight (30%) AND the lowest diagnostic score — front-load it. Days 1–2 cover all three D1 task statements.
- D2 is the next-highest weight (26%) and a 67% diagnostic. Day 3 covers D2 + Phase 1 exam.
- D3 + D4 compressed into Phase 2 (Days 4–5) since the diagnostic showed adequate baseline.

---

## Weak Areas to Watch

- D1 — bucket policy + BPA interaction. (Confirmed: surfaced as miss-0001 on Day 1.)
- D2 — over-engineered HA designs. (Confirmed: surfaced as miss-0002 simplest-sufficient-fix on Day 2.)
- D3 — write-through vs lazy-load caching. (Not yet surfaced in study.)
- D4 — Spot vs Savings Plans selection. (Day 5 pending.)
