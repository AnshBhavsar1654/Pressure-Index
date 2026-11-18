# Pressure Index: SupeRR Selector Season 2

Rajasthan Royals hackathon, Round 1. **Which batters and bowlers perform most reliably under pressure, and what should RR do at the IPL 2027 auction?**

The submission is an interactive dashboard (Next.js, built with Bun, exported as a static site):

| Page | What it answers |
|---|---|
| Overview | The top 10 batters and bowlers under pressure, told through a real RR match |
| My picks | The 20 submitted picks, why each one is reliable and whether they fill an RR gap or add depth (gap-fillers first), then the fresh picks among them who are new at the top level |
| How it works | The method in four steps, proof the pressure label works, known clutch moments checked, a worked example with every sum, where each number comes from, the submitted top 10s, and the forward test behind every choice |
| Batters / Bowlers | Full rankings with an adjustable evidence bar, and a profile page for every player |
| All players | Every player with a top-level pressure ball since 2022, searchable and filterable, each with a profile page |
| IPL 2026 review | RR's season: all 16 matches ball by ball, where runs were won and lost, and the squad player by player |
| Compare players | Up to three batters or bowlers side by side |

## The idea in one paragraph

A win-probability model reads the scoreboard before every ball (in the final over of a chase it is worked out exactly, ball by ball). A ball's **stakes** are how far the next delivery could move that chance; the top 20% of balls by stakes are **pressure balls**, and so is every ball of a knockout. Each ball is judged on **runs added**: runs scored against what an average player gets from exactly the same spot, with a wicket charged at the runs it costs from there. T20I balls are also judged against T20Is in the same host country and against the same opponent that season, so slow pitches and weak attacks flatter nobody. A player's **pressure rating** is runs added per 100 pressure balls, leaning on his **usual level** (the same sum on every other ball) until his pressure record is long: `rating = (Σ recency × pressure runs added + 200 × usual level) ÷ (Σ recency + 200)`. Each year back counts 20% less. **Lift** = rating − usual level. Ratings use the IPL and T20Is between full-member nations only. To be ranked a player needs 30 pressure balls in 3 matches (a match counts with 6+ pressure balls), 20 of them in 2025–26; Indian players need a third of that (10 balls, 1 match, 7 in 2025–26), because the data pack has no domestic cricket. The submitted top 10s are ranked by the rating, among players RR can buy at the 2027 auction (not RR's own squad, other teams' retentions, retired players or Pakistani players) who do not dip under pressure (lift ≥ 0). RR's retentions leave only 3 overseas places, so every signable Indian player who is above average under pressure is guaranteed a top-10 place (up to 5); no below-average player is promoted. Each list holds at most one Bangladeshi player, because the Bangladesh board often limits IPL release (NOC). `auction_pool.json` also lists retired players and players who cannot play IPL 2027 (`unavailable`, e.g. Harry Brook's ban). Rain-reduced matches are judged on their revised target, so the 2023 IPL final counts; only games cut below 10 overs a side are left out of pressure.

Four settings in all (the 20% line, K = 200, the recency step, the evidence bar), each chosen with a **forward test**: ratings built from 2022–24 and 2022–25 only, scored on how players actually did under pressure in 2025 and 2026. Win impact, consistency and recent form are shown beside each rating as evidence, not blended in, because blending them made predictions worse. Ranks are stress-tested with 400 re-runs on resampled matches.

## Data and trust

- **The official SupeRR Selector Season 2 data pack is the base**: `ball_by_ball.csv`, `matches.csv`, `competitions.csv`, `competition_team_player_mapping.csv` and `playing_eleven.csv` (IPL and T20I, 2022 to 2026). The pack is not redistributed in this repo; place the unzipped files in `Data Pack/`.
- **The 2026 ICC Men's T20 World Cup is added from public data** (the brief allows publicly available data alongside the pack, and the pack has no World Cup matches): 49 of the 55 matches (2 were washed out; the source lacks Afghanistan's 4 group games) from [Cricsheet](https://cricsheet.org) (CC BY licence), fetched from a public Hugging Face mirror of Cricsheet's files and converted into the data pack's own format in `public_data/t20wc2026/` by `analysis/public_wc2026.py`. Players are matched to data pack ids by lining up the 55 matches that appear in both sources ball by ball (148 people), then by surname and initial within the same country only when exactly one player fits (71); 48 players, almost all from associate sides, are new. Every match is listed in `public_data/t20wc2026/player_map.csv` for checking.
- **RR's IPL 2026 figures are checked against the public record**: league position, record, net run rate, playoff results, and the top five run-scorers and wicket-takers all match [Wikipedia: 2026 Rajasthan Royals season](https://en.wikipedia.org/wiki/2026_Rajasthan_Royals_season) exactly (15 of 15 checks). The dashboard shows the check table on the IPL 2026 review page.
- `analysis/nationality_overrides.json` corrects nationality for a few players with no T20Is in the window (for example Sunil Narine), so the overseas labels are right.
- Team crests are kit-colour roundels with each side's short code. Official logos are trademarked, so they are not bundled; to use them, place the files in `web/public/logos/` and set the `logo` path for each team in `web/src/lib/teams.ts`.
- Country flags are SVGs from the MIT-licensed `country-flag-icons` package, copied into `web/public/flags/`.
- The evidence bar can be changed on the rankings pages (default 30 pressure balls in 3 matches); the no-dip and auction rules apply live.
- `analysis/auction_pool.json` takes the official retention list (17 November 2026): add every retained player to `retained` (names as they appear in the data, or player ids) and rerun both analysis scripts. Retained players leave the top 10s and the auction lists, and RR players RR did not keep become buyable. Names the scripts cannot match are printed as a warning.
- Every statistic is named once, in plain words, in `web/src/lib/terms.ts`. Tables, charts and the glossary all read from it, and every underlined term explains itself on hover.

## Repo layout

```
analysis/pipeline.py      pressure model, run value, player ratings, forward test, bootstrap  -> web/data/*.json
analysis/rr2026.py        RR 2026 diagnosis, auction targets, cross-checks      -> web/data/rr2026.json
web/                      Next.js dashboard (Bun, Tailwind, hand-built SVG charts)
Data Pack/                raw data pack (not committed)
```

## Reproduce

```bash
# 1. analysis (Python 3.12 with pandas, numpy, scikit-learn, pyarrow)
python -I analysis/public_wc2026.py --download   # 2026 T20 World Cup from Cricsheet (optional; output is committed)
python -I analysis/pipeline.py        # ~5 min; N_BOOT=50 for a quick run
python -I analysis/rr2026.py
python analysis/worked_example.py    # methodology page's step-by-step example; checks it matches the ratings

# 2. dashboard
cd web
bun install
bun run dev                           # http://localhost:3000
bun run build                         # static site in web/out, host anywhere

# 3. submission deck (Pressure_Index_RR_2027.pptx, built from web/data)
cd ../deck
npm install
node build_deck.js
```
