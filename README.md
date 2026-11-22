# Pressure Index

**Who performs when a T20 match is on the line?** An end-to-end machine-learning and analytics project over every IPL and
men's T20 international delivery since 2022: models that score how much each ball could swing the result, player ratings built
on the balls that mattered most, and an interactive dashboard to explore all of it.

| | |
|---|---|
| **Data** | 638,406 deliveries · 2,836 matches · IPL 2022–26 (367) · T20Is (2,469, incl. the 2022, 2024 and 2026 T20 World Cups) · open data from [Cricsheet](https://cricsheet.org) |
| **Models** | Monotonic gradient-boosted run expectancy · logistic win probability on engineered features · exact final-over Markov model · empirical-Bayes shrinkage ratings · nearest-neighbour similar-player recommender |
| **Validation** | Match-grouped 5-fold CV · season holdout · walk-forward backtests · 400× bootstrap · split halves · unit tests |
| **Stack** | Python (pandas, scikit-learn, pyarrow) → per-entity JSON → Next.js 16 + TypeScript + Tailwind on Vercel (static pages + on-demand ISR), hand-built SVG charts |

## How it works

```
Cricsheet JSON ──► canonical tables ──► match state before every ball
                                             │
              run expectancy (HistGBM, monotonic) ──► win probability (logistic + exact last over)
                                             │
                     stakes of every ball ──► pressure balls (top 20% + every knockout ball)
                                             │
               runs added vs an average player in the same spot (host-country & opponent adjusted)
                                             │
           rating = (Σ w·pressure runs added + K·usual level) / (Σ w + K)   ← shrinkage, K = 200
                                             │
     bootstrap intervals · forward tests · similar-player recommender ──► per-player / per-match JSON ──► Next.js
```

1. **Win probability.** For a chase: log(runs needed ÷ runs the side can still expect), from the run-expectancy model, plus its
   square, its interaction with time left, wickets in hand and required rate. The first innings is measured against a par total.
   In the final over the model is replaced by an exact backward recursion over (runs needed, balls left, wickets).
2. **Stakes.** The expected absolute change in win probability over every possible next ball (dot, 1, 2, 3, 4, 6, wicket, wide),
   weighted by how often each happens in that phase. Pressure ball = top 20% by stakes, or any ball of a knockout.
3. **Runs added.** Runs scored minus what an average batter makes from that exact state, with a wicket charged at the runs it
   costs from there; mirrored for bowlers. T20I balls are recentred by host country and by opponent each season.
4. **Rating.** Runs added per 100 pressure balls, shrunk toward the player's usual level until the pressure record is long
   (half and half at 200 recency-weighted balls). **Lift** = rating − usual level.

## Results

**Win probability: the engineered linear model beats gradient boosting.** Match-grouped 5-fold CV (chase / first innings):

| Model | Chase AUC | Chase Brier | First-inn. AUC | First-inn. Brier |
|---|---|---|---|---|
| **Logistic on engineered "resources" (production)** | **0.919** | **0.1154** | **0.744** | **0.2046** |
| HistGradientBoosting (raw state + engineered) | 0.912 | 0.1217 | 0.731 | 0.2101 |
| HistGradientBoosting + isotonic calibration | 0.911 | 0.1221 | 0.730 | 0.2095 |

Permutation importance shows why: the engineered resources feature carries almost all of the signal. A logistic surface is also
smooth in runs and balls, which measuring a ball's stakes needs.

**The honest finding: future pressure output is mostly general skill.** Walk-forward backtests (rate on 2022–24 / 2022–25, score on
2025 / 2026), correlation with next season's runs added per pressure ball:

| Predictor | Batters | Bowlers |
|---|---|---|
| Pressure rating (K = 200) | 0.116 | 0.194 |
| Usual level alone | 0.120 | 0.254 |
| Gradient boosting on 12 player features | 0.090 | −0.011 |
| Last season's raw pressure form | 0.003 | 0.046 |

- A hyperparameter sweep (5 pressure lines × 5 values of K × 4 recency steps) finds prediction keeps improving with more shrinkage
  (best: K = 800, r = 0.174 vs 0.155). Production keeps K = 200 on purpose: the rating is meant to *describe* pressure performance,
  and at K = 800 it collapses into the usual level. The cost is stated, not hidden.
- The learned next-season model does not beat the hand-built rating: about 200 player-seasons a year is too few, so it overfits.
- Lift ("clutch") barely repeats between odd and even matches (split-half r ≈ −0.03), so it is shown, never scored.

**Similar-player recommender.** Every player with 300+ balls becomes a standardised vector of 11–12 style and pressure features
(phase shares, strike rate or economy, boundary, dot and dismissal rates, usual level, pressure rating, lift); neighbours are ranked
by cosine similarity and each recommendation names the distinctive traits the two players share (e.g. Virat Kohli → Sai Sudharsan,
KL Rahul, Shubman Gill: *hard to dismiss, few dot balls*). Split-half check: rebuilt from odd and even matches separately, a
player's top 10 overlap by 20% (batters) and 19% (bowlers) against 7% by chance, about three times chance.

The full write-up, with interactive charts for every result, is on the dashboard's **Model Lab** page.

## The dashboard

| Page | What it shows |
|---|---|
| Overview | Headline numbers, the top 10 batters and bowlers, a featured World Cup final ball by ball, the pipeline |
| Model Lab | Model comparison, calibration, importance, WP curves, run-expectancy surface, tuning heatmap, next-season model, bootstrap intervals, model card |
| Batters / Bowlers | Rankings with an adjustable evidence bar that re-ranks in the browser, a pressure-vs-usual scatter, 90% intervals |
| Player profiles | Every top-level player since 2022: season trend, phases, match-by-match strip, biggest moments |
| Match explorer | All 886 top-level and World Cup matches: win-probability chart, pressure balls, biggest swings, runs added |
| IPL teams | Every season's table rebuilt from the balls, and each team's runs won and lost by phase |
| Similar players | Pick any player: the ten most similar by style and pressure profile, the shared traits, and a PCA style map |
| Insights | What changes under pressure, who rises and drops, new faces, who plays like whom |
| Methodology · Data & pipeline | Every definition and setting, the worked example, data sources and quality checks |

## Reproduce

```bash
# 1. pipeline (Python 3.11+)
uv sync --extra dev                      # or: pip install -e ".[dev]"
python -m pressure_index download        # Cricsheet archives + registers  -> data/raw/
python -m pressure_index all             # build, model, evaluate, export  -> web/data/, artifacts/
pytest -q && ruff check pressure_index tests

# 2. dashboard
cd web
bun install
bun run dev                              # http://localhost:3000
bun run build                            # static site in web/out
```

Every setting lives in [`pressure_index/config.toml`](pressure_index/config.toml). `N_BOOT=50` gives a quick export.

### How the site serves data

The pipeline writes one JSON file per player (`web/public/data/players/<role>/<id>.json`) and per match
(`web/public/matches/<id>.json`), slim tables for the ranking pages, and a separate search list. Pages pull only what they need:
the top 30 profiles per role are prerendered, every other profile is rendered on its first request and cached (ISR), and the match
explorer, compare view, similar-player finder and search box fetch their JSON in the browser. A deploy is about 35 MB of pages
plus 18 MB of JSON, instead of 1,100 prerendered profiles each repeating the full player list.

**Deploy on Vercel:** import the repo and set the project's root directory to `web`.

## Repository layout

```
pressure_index/
  data/          download.py (Cricsheet), build.py (canonical CSVs)
  features/      match_state.py
  models/        run_expectancy.py, win_prob.py, endgame.py, leverage.py
  rating/        run_value.py, ratings.py (shrinkage, eligibility, ranking)
  evaluation/    reliability.py (bootstrap, split half, forward test), wp_compare.py, tuning.py, next_season.py
  analysis/      teams.py, similarity.py (recommender)
  export/        dashboard.py, matches.py
  pipeline.py    core stage · evaluate.py · __main__.py (CLI)
data/reference/  hand-checked lookup tables (city → country, display names, nationality fixes)
artifacts/       metrics JSON and the model card
tests/           unit tests (monotonicity, endgame bounds, rating formula, recommender, no leakage across folds)
web/             Next.js dashboard
```

## Data and licence

Ball-by-ball data © [Cricsheet](https://cricsheet.org), released under the Open Data Commons Attribution License. Team and player
names are used only to identify them; no logos are bundled. Not affiliated with the IPL, the ICC or any team.
Code: MIT.
