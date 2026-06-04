# Calibration Log

> Tracks predicted vs actual scores per quiz and phase exam.
> Purpose: detect over/underconfidence patterns and force honest numeric estimation.
> Updated by the coach after every quiz and phase exam.
>
> The canonical record is `data/state.json` `calibration[]` — that's what the dashboard reads. This file is the rendered/annotated view.

---

## Log

| Date | Quiz / Phase Exam | Source | Predicted % | Actual % | Delta | Interpretation | Domain notes |
|------|-------------------|--------|-------------|----------|-------|----------------|--------------|
| 2026-05-31 | Day 1 quiz | synthetic | 75 | 70 | -5 | overconfident | D1 IAM; missed public-S3 vs bucket-policy. |
| 2026-06-01 | Day 2 quiz | synthetic | 80 | 80 | 0 | calibrated | D1 KMS + network sec; first simplest-sufficient-fix miss. |
| 2026-06-02 | Phase 1 exam | synthetic | 75 | 67 | -8 | overconfident | Overconfident by 8 pts; simplest-sufficient-fix promoted; SQS confusion introduced. |
| 2026-06-03 | Day 4 quiz (bank) | **bank** | 75 | 70 | -5 | overconfident | 4 bank questions on D3. SQS confusion repeated on bank Q2 → watchlist. |
| 2026-06-03 | Day 4 quiz (synthetic) | synthetic | 75 | 78 | +3 | underconfident | 6 synthetic questions on D3. Synthetic inflation visible vs the bank subset. |

---

## Patterns Observed

- **Persistent mild overconfidence.** 3 of 5 entries overconfident (-5, -5, -8). Pattern is consistent across both synthetic and bank questions, not a one-off.
- **Synthetic-vs-bank inflation gap.** Day 4 ran both sources on the same predicted estimate: bank actual was 5 pts under predicted, synthetic actual was 3 pts over. That's exactly the inflation the design assumes — bank entries get weighted 2× when computing bias.
- **Phase 1 exam was the strongest signal.** -8 delta on 12 questions is the most reliable single data point. Don't dismiss it.

---

## Script-Computed Debias

After 5 entries the script-computed fields kicked in (see dashboard headline):

- **Weighted bias correction:** -3.33% (negative = systematically overconfident)
- **Weighted noise stdev:** 4.17% (observed; well above the 3% floor)
- **Debiased estimate:** 76.67% (= 80% cold-water − 3.33% bias)
- **Margin over 72% cut:** +4.67%
- **Rough P(pass):** 0.87 (= 1 − Φ((72 − 76.67) / 4.17))

The debias does its job here: the headline 80% becomes a more honest 76.67%, and the still-positive margin (4.67%) is consistent with the small-but-real overconfidence pattern.

---

## Final Cold-Water Estimate

_To be updated in the endgame window. Current snapshot:_

76.67% blended debiased estimate; +4.67% margin over the 72% cut. Rough pass probability ≈ 0.87 (assuming ±4.17% observed-from-calibration noise). Not a forecast; the overconfidence pattern means a real-exam day at 76.67 ± 4.17 could plausibly come in at 73–80.
