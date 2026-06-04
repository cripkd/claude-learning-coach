# Calibration Log

> Tracks predicted vs actual scores per quiz and phase exam.
> Purpose: detect over/underconfidence patterns and force honest numeric estimation.
> Updated by the coach after every quiz and phase exam.

---

## Log

| Date | Quiz / Phase Exam | Predicted % | Actual % | Delta | Interpretation | Domain notes |
|------|-------------------|-------------|----------|-------|----------------|--------------|
<!-- Fill in after each quiz/exam. Delta = actual - predicted. Positive = underconfident.
Example:
| 2025-03-05 | Phase 1 exam       | 75%  | 90%  | +15 | underconfident | D1, D2 strong |
| 2025-03-10 | Day 8 quiz         | 80%  | 72%  | -8  | overconfident  | D3 weaker than expected |
| 2025-03-18 | Phase 2 exam       | 78%  | 83%  | +5  | underconfident | Calibration improving |
-->

---

## Patterns Observed

<!-- Update as patterns emerge across multiple quizzes.
Examples:
- Underconfident on architecture questions — I know more than I think
- Overconfident on naming/syntax recall — surface knowledge without depth
- Trend: delta narrowing from ±15 to ±5 over 4 weeks (calibration improving)
- D2 consistently overconfident — drill harder before Phase 2 exam
-->

---

## Final Cold-Water Estimate

<!-- Updated in the endgame window (last week before exam).
Format: "X–Y% blended cold-water; Z-point margin over the cut. Rough pass probability: P%."
The coach computes pass probability as: 1 - normalCDF((passMarkPercent - estimate) / stdDev)
where stdDev defaults to 7% (exam-day noise assumption). See docs/DASHBOARD.md for formula.

Example:
90–94% blended cold-water; ~250-point margin over the cut (72% pass mark).
Rough pass probability: ~98% (assuming ±7% exam-day noise — not a forecast).
-->
