# CopyMe Regression Baseline v1

Date: 2026-03-24

This document records the first stable, fixture-backed full regression sweep for CopyMe.
It is intended to be the comparison point for future routing, reaction, calibration, precision, polish, and ROI changes.

## Scope

The baseline runs the current end-to-end chain over all 15 fixed Proxy Review fixtures:

- `review-01` ~ `review-05`
- `ood-01-mixed-face` ~ `ood-10-adversarial-soft`

The sweep uses the current U + V + W behavior stack on the fixed fixture set.

## Baseline Metrics

- `reviewPassRate`: `1.00`
- `reviewAverageDelta`: `+8.0`
- `oodStrictSuccessRate`: `1.00`
- `oodAverageDelta`: `+3.1`
- `totalAverageDelta`: `+4.8`
- `improvedCount`: `9`
- `stableCount`: `6`
- `degradedCount`: `0`
- `avgSelectedEditsPerCase`: `0.33`
- `avgRejectedEditsPerCase`: `0.47`
- `noOpCount`: `10`

## Degraded OOD Cases

No OOD fixtures regressed under the updated baseline sweep.

## Review Cases

All review fixtures stayed non-negative:

- `review-01`: `+19.6`
- `review-02`: `+9.8`
- `review-03`: `+10.8`
- `review-04`: `0`
- `review-05`: `0`

## Baseline File

The persisted machine-readable baseline is stored at:

- `data/regression/regression-baseline-v1.json`

## How To Use This Baseline

Before claiming an improvement to CopyMe's routing, reaction, calibration, precision, polish, or ROI layers, compare the new result against this baseline.

For future sweeps, the expected workflow is:

1. Run the 15 fixed fixtures.
2. Compare per-case delta against baseline v1.
3. Check review pass rate and OOD strict success rate.
4. Verify no new negative deltas were introduced into review fixtures.
5. Only then treat the change as a real gain.
