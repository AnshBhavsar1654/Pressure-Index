# Model card: Pressure Index

## Purpose
Descriptive analysis of how T20 batters and bowlers perform in high-stakes moments relative to their usual level. A research and
portfolio project; not a betting, selection or contract-valuation tool.

## Data
Cricsheet ball-by-ball JSON (Open Data Commons Attribution): men's IPL 2022–26 and T20 internationals 2022–26, 638k deliveries in
2,836 matches. Ratings use top-level cricket only (IPL + T20Is between the 12 ICC full members: 817 matches, 190k balls). Win
probability and run expectancy are fit on every match.

## Models

| Component | Model | Validation | Result |
|---|---|---|---|
| Run expectancy | HistGradientBoostingRegressor, monotonic in wickets lost, smoothed ±9 balls, per competition × season | monotonicity enforced and unit-tested | n/a |
| Win probability (chase) | LogisticRegression on 7 engineered features | 5-fold GroupKFold by match; 2026 holdout | AUC 0.919, Brier 0.115, ECE 0.009 |
| Win probability (1st inn.) | LogisticRegression on 6 engineered features | same | AUC 0.744, Brier 0.204 |
| Final over of a chase | exact backward recursion on empirical outcome mix (prior 150 balls) | against real results, 6.7k balls | Brier 0.0445 vs 0.0442 smooth: about the same overall, but it fixes last-ball boundary states |
| Player rating | empirical-Bayes shrinkage toward usual level, K = 200, recency step 0.2 | walk-forward backtests on 2025 and 2026; 400-resample bootstrap; split halves | forward r 0.116 bat / 0.194 bowl |
| Archetypes | k-means (k = 4–7 by silhouette) on 8–9 standardised usage and style features; PCA for display | silhouette ≈ 0.22 | descriptive only |

Compared and rejected: gradient-boosted win-probability models (worse on CV, and piecewise-constant surfaces give unstable stakes);
a gradient-boosted next-season predictor (overfits ~200 player-seasons a year: r 0.09 bat, −0.01 bowl).

## Known limitations
- Usual level alone predicts next-season pressure output as well as or better than the pressure rating. The rating is descriptive.
  K = 800 would predict better (r 0.174), at the cost of no longer measuring pressure-specific performance.
- Lift does not repeat between halves of the data (split-half r ≈ −0.03): it is shown, never used to rank.
- No fielding, bowling-type match-ups, or cricket outside the IPL and T20Is.
- First-innings stakes are lower by construction, so pressure balls lean toward chases (offset by counting every knockout ball).
- Player nationality for IPL-only players defaults to India, with a small hand-checked override table.

## Reproducibility
`python -m pressure_index download && python -m pressure_index all`. Fixed seeds; settings in `pressure_index/config.toml`.
The modular pipeline was checked against the original single-script implementation and matched it exactly, ball for ball.
