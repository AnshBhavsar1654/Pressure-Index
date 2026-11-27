"""Load the canonical CSVs and build the match state before every delivery.

State = score, wickets, legal balls bowled, balls left, runs needed. A rain-revised target and overs are
used wherever the match has one, so a shortened chase is measured against what it actually had to make.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from pressure_index.config import FULL_MEMBERS, SOURCE, TOP_LEVEL
from pressure_index.data.dataset import MODEL_TABLES, read_table

KNOCKOUT_STAGES = ["Final", "Qualifier", "Eliminator", "Semi Final"]


def load(source: Path = SOURCE) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Deliveries, matches (with competition info) and the competition-team-player mapping."""
    b, m, c, mp = (read_table(source, name) for name in MODEL_TABLES)
    m = m.merge(c, on="comp_id", how="left")
    m["season_yr"] = m["season"].astype(str).str[:4].astype(int)
    m["is_ipl"] = m["comp_name"].str.startswith("IPL").astype(int)
    m["is_emerging"] = ((m["match_format"] == "T20") & (m["is_ipl"] == 0)).astype(int)
    both_full = m["home_team"].isin(FULL_MEMBERS) & m["away_team"].isin(FULL_MEMBERS)
    m["comp_tier"] = np.select(
        [m.is_ipl == 1, m.is_emerging == 1, both_full],
        ["IPL", "Emerging", "T20I Full"],
        default="T20I Assoc",
    )
    m["top_level"] = m["comp_tier"].isin(TOP_LEVEL)
    m["is_knockout"] = ((m["knock_out"] == 1) | m["stage"].isin(KNOCKOUT_STAGES)).astype(int)
    return b, m, mp


def build_state(b: pd.DataFrame, m: pd.DataFrame) -> pd.DataFrame:
    b = b[b.innings <= 2].copy()  # drop super overs
    b = b.sort_values(["match_id", "innings", "innings_ball_num"]).reset_index(drop=True)
    b["extras_type"] = b["extras_type"].fillna("None")
    b["tot"] = b.runs + b.extras1_runs + b.extras_2_runs
    b["legal"] = ~b.extras_type.isin(["wide", "Overstep", "other"])
    b["is_wide"] = b.extras_type.eq("wide")
    b["is_nb"] = b.extras_type.isin(["Overstep", "other"])
    b["wkt"] = b.is_wicket.astype(int)
    # runs charged to the bowler: bat runs + wides + no-ball runs (not byes / leg byes)
    b["bowler_runs"] = b.runs + np.where(b.is_wide | b.is_nb, b.extras1_runs + b.extras_2_runs, 0)
    b["bowler_wkt"] = (b.is_wicket & ~b.dismissal_type.isin(
        ["RunOut", "Retire Out", "Obstracting the field", "Obstructing the field"])).astype(int)
    b["striker_out"] = (b.is_wicket & (b.dismissed_player_id == b.striker_id)).astype(int)

    g = b.groupby(["match_id", "innings"], sort=False)
    b["runs_before"] = g.tot.cumsum() - b.tot
    b["wkts_before"] = g.wkt.cumsum() - b.wkt
    b["legal_before"] = g.legal.cumsum() - b.legal.astype(int)

    inn_tot = b.groupby(["match_id", "innings"]).tot.sum().unstack()
    b = b.merge(
        m[["match_id", "season_yr", "is_ipl", "comp_tier", "top_level", "is_knockout", "venue_country",
           "first_inn_revised_overs", "second_inn_revised_overs", "revised_target",
           "win_team_id", "match_date", "comp_name", "home_team", "away_team",
           "home_team_id", "away_team_id", "stage", "result"]],
        on="match_id", how="left")
    max_balls = np.where(b.innings == 1, b.first_inn_revised_overs, b.second_inn_revised_overs)
    b["max_balls"] = np.where(np.isnan(max_balls), 120, max_balls)
    first_tot = b.match_id.map(inn_tot[1])
    b["target"] = np.where(b.revised_target.notna(), b.revised_target, first_tot + 1)
    b.loc[b.innings == 1, "target"] = np.nan
    b["balls_left"] = (b.max_balls - b.legal_before).clip(lower=1)
    b["wkts_in_hand"] = 10 - b.wkts_before
    b["runs_needed"] = b.target - b.runs_before
    b["over"] = b.overid
    b["phase"] = pd.cut(b.overid, [0, 6, 15, 20], labels=["Powerplay", "Middle", "Death"]).astype(str)
    b["bat_won"] = np.where(b.win_team_id.isna(), np.nan, (b.win_team_id == b.batting_team_id).astype(float))
    b["opp_name"] = np.where(b.bowling_team_id == b.home_team_id, b.home_team, b.away_team)
    b["team_name"] = np.where(b.batting_team_id == b.home_team_id, b.home_team, b.away_team)
    return b
