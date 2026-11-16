# SupeRR Selector Season 2: Pressure Index

Rajasthan Royals hackathon, Round 1. **Which batters and bowlers perform most reliably under pressure?** Built from IPL and T20I ball-by-ball data, 2022 to 2026.

The submission is an interactive dashboard with these sections: overview, pressure model, batter and bowler leaderboards with live weight sliders, player profiles, and the full methodology report.

## Approach in one paragraph

Pressure is **leverage**: how much the next delivery can swing the batting side's win probability. Two smooth logistic win-probability models, built on run-expectancy resources, score every match state. For each ball, the expected absolute swing over all outcomes (0, 1, 2, 3, 4, 6, wicket, wide) gives a Leverage Index (1.0 = average ball). Knockout matches get a ×1.2 multiplier, and the top 20% of balls form the high-pressure set. Performance is measured with context-adjusted **run value** (runs above expectation from the same state, with wickets priced at what they cost) plus **win probability added**. Each player's rating blends pressure level (baseline + shrunk clutch lift), WPA, lift over their own baseline, and match-to-match consistency. Empirical-Bayes shrinkage handles small samples, ball weights handle competition strength and recency, and 400 match-level bootstrap resamples measure how stable each rank is.

## Repo layout

```
analysis/pipeline.py        all modelling: state, WP model, leverage, run value, ratings, bootstrap
dashboard/                  Vite + React + TypeScript + Tailwind dashboard (hand-built SVG charts)
dashboard/public/data/      JSON written by the pipeline and read by the dashboard
Data Pack/                  raw hackathon data (not committed; place the unzipped CSVs here)
```

## Reproduce

```bash
# 1. ratings (Python 3.12, pandas, numpy, scikit-learn)
python -I analysis/pipeline.py          # N_BOOT=50 for a quick run

# 2. dashboard
cd dashboard
npm install
npm run dev                             # local
npm run build                           # static site in dashboard/dist
```
