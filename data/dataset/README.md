# Pressure Index input tables

Run `python -m pressure_index download` to fetch Cricsheet's IPL and men's T20I files and name
registers. Then run `python -m pressure_index build` to generate the five match-data tables alongside
the three tracked lookups. `python -m pressure_index validate-data` checks all eight CSVs.

| CSV | Row grain | Key |
|---|---|---|
| `ball_by_ball.csv` | Recorded delivery, including wides, no-balls and super overs | `match_id`, `innings`, `innings_ball_num` |
| `matches.csv` | Match, with venue, toss, result and rain revisions | `match_id` |
| `competitions.csv` | IPL season, ICC Men's T20 World Cup edition or annual T20I group | `comp_id` |
| `competition_team_player_mapping.csv` | Player listed for a team in a competition | `comp_id`, `team_id`, `player_id` |
| `players.csv` | Player with resolved display name and Cricsheet identifier | `player_id` |
| `city_country.csv` | Hand-checked host country for a Cricsheet city | `city` |
| `player_name_overrides.csv` | Hand-checked display name, applied after the Cricsheet registers | `cricsheet_id` |
| `nationality_overrides.csv` | Hand-checked dashboard country, applied before inferring it from team participation | `player_name` |

Join deliveries to matches on `match_id`, matches to competitions on `comp_id`, and player roles
to `players.player_id`. The membership table covers a competition and has no match-level lineup.
`match_id`, `comp_id`, and `team_id` are assigned within a snapshot. Use the Cricsheet identifiers in
`matches.csv` and `players.csv` to compare snapshots. Read player Cricsheet identifiers as text to
preserve leading zeros.

`overid`, `over_ball_num`, and `innings_ball_num` are one-based. Delivery counters include illegal
deliveries. `runs` is the batter's runs. Total runs on a delivery are `runs + extras1_runs + extras_2_runs`.
The delivery table captures the first dismissal counted as a wicket. The match tables retain the
existing team aliases and store revised innings lengths in balls, including in the
`first_inn_revised_overs` and `second_inn_revised_overs` columns. Blank optional fields are missing
values. The CSVs include super overs. Model scoring uses the first two innings.

Cricsheet supplies the match data and registers under the Open Data Commons Attribution License 1.0.
[Source downloads](https://cricsheet.org/downloads/) · [Licensing](https://cricsheet.org/licensing/)
