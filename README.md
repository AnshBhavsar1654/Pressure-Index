# Pressure Index: SupeRR Selector Season 2

Rajasthan Royals hackathon, Round 1. **Which batters and bowlers perform most reliably under pressure, and what should RR do at the IPL 2027 auction?**

The submission is an interactive dashboard (Next.js, built with Bun, exported as a static site):

| Page | What it answers |
|---|---|
| Overview | The top 10 batters and bowlers under pressure, told through a real RR match |
| How pressure works | What counts as pressure, in plain words, and proof that the definition works |
| Batters / Bowlers | Full rankings, a "build your own ranking" weight panel, and a profile page for every player |
| IPL 2026 review | RR's season: all 16 matches ball by ball, where runs were won and lost, and the squad player by player |
| Auction targets | The three roles where RR trailed the top four, and the best players for each |
| Method in plain words | The whole approach in four steps, a glossary, and the evidence behind it |

## The idea in one paragraph

A win-probability model reads the scoreboard before every ball. A ball is **high pressure** when its possible outcomes could move that probability a lot. The top 20% of balls by those stakes are pressure moments, and knockout games count 1.2 times more. Players are judged on **runs added**: what they did compared with an average player in exactly the same situation, with each wicket charged at the runs it costs from there. The rating blends output under pressure (40%), match-winning impact (20%), rise above their own normal level (20%) and consistency (20%). Small samples are shrunk towards average, results are weighted for opposition strength and recency, and the ranking is re-run 400 times on resampled matches to show which ranks are solid.

## Data and trust

- **Only the official SupeRR Selector Season 2 data pack is used**: `ball_by_ball.csv`, `matches.csv`, `competitions.csv`, `competition_team_player_mapping.csv` and `playing_eleven.csv` (IPL and T20I, 2022 to 2026). The pack is not redistributed in this repo; place the unzipped files in `Data Pack/`.
- **RR's IPL 2026 figures are checked against the public record**: league position, record, net run rate, playoff results, and the top five run-scorers and wicket-takers all match [Wikipedia: 2026 Rajasthan Royals season](https://en.wikipedia.org/wiki/2026_Rajasthan_Royals_season) exactly (15 of 15 checks). The dashboard shows the check table on the IPL 2026 review page.
- `analysis/nationality_overrides.json` corrects nationality for a few players with no T20Is in the window (for example Sunil Narine), so the overseas labels are right.
- `analysis/auction_pool.json` takes the official released-player list once the retention deadline passes (17 November 2026). The auction page then only shows players RR can actually buy.

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

# 2. dashboard
cd web
bun install
bun run dev                           # http://localhost:3000
bun run build                         # static site in web/out, host anywhere
```
