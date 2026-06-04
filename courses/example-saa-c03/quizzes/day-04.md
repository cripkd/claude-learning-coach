# Day 4 Quiz — D3 Caching & Compute (2026-06-03)

> Mixed quiz: 4 bank questions + 6 synthetic questions. Scored as two separate `calibration[]` entries — bank actuals and synthetic actuals never merge.

---

## Predicted

Alex predicted **75%** blended for the whole 10-question set before starting (cold-water estimate of where they are after Phase 1).

## Result

| Subset | Source | Questions | Correct | % | Delta vs predicted |
|---|---|---|---|---|---|
| Bank | bank | 4 | 2.8 (rounded to 70%) | 70% | −5 (overconfident) |
| Synthetic | synthetic | 6 | 4.7 (rounded to 78%) | 78% | +3 (underconfident) |
| Total | — | 10 | 7.5 (rounded to 75%) | 75% | (not logged — split logging only) |

The two calibration entries written:
1. `{date: 2026-06-03, label: "Day 4 quiz (bank)", predicted: 75, actual: 70, delta: -5, source: "bank"}`
2. `{date: 2026-06-03, label: "Day 4 quiz (synthetic)", predicted: 75, actual: 78, delta: +3, source: "synthetic"}`

## Per-question summary

| Q | Source | Bank ID | Domain | Correct? | Trap / notes |
|---|---|---|---|---|---|
| 1 | bank | Q-002 | D2 | ✗ | SQS standard-vs-FIFO confusion — picked A. Promoted miss-0003 to Watchlist (position 2). |
| 2 | bank | (D3-cache-001 — not in this fixture) | D3 | ✓ | Caching question; clean. |
| 3 | bank | (D3-cache-002) | D3 | ✓ | CloudFront origin failover; clean. |
| 4 | bank | (D3-sizing-001) | D3 | ✗ | EC2 sizing trap — picked the largest instance instead of the smallest sufficient. (Same shape as simplest-sufficient-fix on Watchlist; coach noted for the next session.) |
| 5 | synthetic | — | D3 | ✓ | |
| 6 | synthetic | — | D3 | ✓ | |
| 7 | synthetic | — | D3 | ✗ | Lazy-load vs write-through caching — diagnostic flagged this; not yet retired. |
| 8 | synthetic | — | D3 | ✓ | |
| 9 | synthetic | — | D3 | ✓ | |
| 10 | synthetic | — | D3 | ✓ | |

> Note on partial scoring: the per-question totals above are illustrative; the canonical scores are the integers in `calibration[]`. The "rounded" floats only show how the bank-vs-synthetic split was computed.

## Next session

- Drill both watchlist items at the top of Day 5: simplest-sufficient-fix (now also showing up at Q4 on EC2 sizing — possibly broadening) and SQS standard vs FIFO discrimination.
- Day 5 covers D4-T1 cost optimization. After that, Phase 2 exam closes the course.
