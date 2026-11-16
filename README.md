# Pressure Index: SupeRR Selector Season 2

Rajasthan Royals hackathon, Round 1. **Which batters and bowlers perform most reliably under pressure, and what should RR do at the IPL 2027 auction?**

The submission is an interactive dashboard (Next.js, built with Bun, exported as a static site):

| Page | What it answers |
|---|---|
| Overview | The top 10 batters and bowlers under pressure, told through a real RR match |
| Our picks | The 20 submitted picks in order, why each one is reliable and the RR gap each one fills, then a shortlist of 10+ realistic options for each role where RR lost runs |
| How pressure works | What counts as pressure, in plain words, and proof that the definition works |
| Batters / Bowlers | Full rankings, a "build your own ranking" weight panel, and a profile page for every player |
| All players | Every player with a high-pressure ball since 2022, searchable and filterable, each with a profile page |
| IPL 2026 review | RR's season: all 16 matches ball by ball, where runs were won and lost, and the squad player by player |
| Compare players | Up to three batters or bowlers side by side |
| Method in plain words | The whole approach in four steps, a glossary, and the evidence behind it |

## The idea in one paragraph

A win-probability model reads the scoreboard before every ball. A ball is **high pressure** when its possible outcomes could move that probability a lot. The top 20% of balls by those stakes are pressure moments, and knockout games count 1.2 times more. Players are judged on **runs added**: what they did compared with an average player in exactly the same situation, with each wicket charged at the runs it costs from there. The rating blends output under pressure (40%), win impact (20%), lift above their own normal level (20%) and consistency (20%). Every player who qualifies is rated, but the submitted top 10s leave out players RR cannot sign: its own squad, players retained by other teams, and Pakistani players, who cannot enter the IPL auction. Small samples are shrunk towards average, results are weighted for opposition strength and recency, and the ranking is re-run 400 times on resampled matches to show which ranks are solid.

## Data and trust

- **Only the official SupeRR Selector Season 2 data pack is used**: `ball_by_ball.csv`, `matches.csv`, `competitions.csv`, `competition_team_player_mapping.csv` and `playing_eleven.csv` (IPL and T20I, 2022 to 2026). The pack is not redistributed in this repo; place the unzipped files in `Data Pack/`.
- **RR's IPL 2026 figures are checked against the public record**: league position, record, net run rate, playoff results, and the top five run-scorers and wicket-takers all match [Wikipedia: 2026 Rajasthan Royals season](https://en.wikipedia.org/wiki/2026_Rajasthan_Royals_season) exactly (15 of 15 checks). The dashboard shows the check table on the IPL 2026 review page.
- `analysis/nationality_overrides.json` corrects nationality for a few players with no T20Is in the window (for example Sunil Narine), so the overseas labels are right.
- Team crests are kit-colour roundels with each side's short code. Official logos are trademarked, so they are not bundled; to use them, place the files in `web/public/logos/` and set the `logo` path for each team in `web/src/lib/teams.ts`.
- Country flags are SVGs from the MIT-licensed `country-flag-icons` package, copied into `web/public/flags/`.
- Every cut-off can be changed in the dashboard: minimum pressure balls and matches on the rankings pages (default 120 and 8, down to 30 and 3), minimum balls in a role on the auction page (default 90 batting, 120 bowling, down to 30), and minimum balls in the RR squad tables.
- `analysis/auction_pool.json` takes the official retention list (17 November 2026): add every retained player to `retained` (names as they appear in the data, or player ids) and rerun both analysis scripts. Retained players leave the top 10s and the auction lists, and RR players RR did not keep become buyable. Names the scripts cannot match are printed as a warning.
- Every statistic is named once, in plain words, in `web/src/lib/terms.ts`. Tables, charts and the glossary all read from it, and every underlined term explains itself on hover.

## Repo layout

```
analysis/pipeline.py      pressure model, run value, player ratings, bootstrap  -> web/data/*.json
analysis/rr2026.py        RR 2026 diagnosis, auction targets, cross-checks      -> web/data/rr2026.json
web/                      Next.js dashboard (Bun, Tailwind, hand-built SVG charts)
Data Pack/                raw data pack (not committed)
```

## Reproduce

```bash
# 1. analysis (Python 3.12 with pandas, numpy, scikit-learn, pyarrow)
python -I analysis/pipeline.py        # ~5 min; N_BOOT=50 for a quick run
python -I analysis/rr2026.py
python analysis/worked_example.py    # methodology page's step-by-step example; checks it matches the ratings

# 2. dashboard
cd web
bun install
bun run dev                           # http://localhost:3000
bun run build                         # static site in web/out, host anywhere
```
