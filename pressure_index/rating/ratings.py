"""One rating per player: runs added per 100 pressure balls, shrunk toward the player's usual level.

    usual  = sum(w x runs added on other balls) / (sum(w) + K)
    rating = (sum(w x runs added on pressure balls) + K x usual) / (sum(w) + K)
    lift   = rating - usual          (rises + / dips - when it matters)

w = recency weight of the ball (latest season 1.0, each season back 20% less; a knockout first-innings
pressure ball counts half). This is empirical-Bayes shrinkage: with K = 200 a player's own pressure record
counts half once he has 200 weighted pressure balls, so a short, lucky record cannot top the table.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pressure_index.config import CFG, season_weights

M, E = CFG["model"], CFG["eligibility"]


def player_match_table(b: pd.DataFrame, role: str, weights: dict[int, float] | None = None,
                       recent_from: int = E["recent_from"]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Top-level balls for one role, and their totals per player, match and pressure flag."""
    weights = weights or season_weights()
    b = b[b.top_level]
    if role == "bat":
        d = b[~b.is_wide].copy()
        d["pid"], d["pname"], d["rv"] = d.striker_id, d.striker_name, d.rv_bat
        d["wpa"] = d.wpa_bat
        d["r"], d["out"], d["par"] = d.runs, d.striker_out, d.par_bat
    else:
        d = b.copy()
        d["pid"], d["pname"], d["rv"] = d.bowler_id, d.bowler_name, d.rv_bowl
        d["wpa"] = -d.wpa_bat
        d["r"], d["out"], d["par"] = d.bowler_runs, d.bowler_wkt, d.par_bowl
    d["w"] = d.season_yr.map(weights)
    d["P"] = d.pressure.astype(int)
    d["R"] = (d.season_yr >= recent_from).astype(int)
    d["dotb"] = ((d.tot == 0) if role == "bowl" else (d.runs == 0)).astype(int)
    d["bnd"] = (d.is_four | d.is_six).astype(int)
    d["lg"] = d.legal.astype(int)
    ko1 = ((d.is_knockout == 1) & (d.innings == 1) & (d.P == 1)).to_numpy()
    d["w"] = d.w * np.where(ko1, M["ko_first_innings"], 1.0)
    d["cnt"] = np.where(ko1, M["ko_first_innings"], 1.0)
    d["wrv"] = d.w * d.rv
    agg = d.groupby(["pid", "match_id", "P", "R"]).agg(
        n=("rv", "size"), ne=("cnt", "sum"), w=("w", "sum"), wrv=("wrv", "sum"), rv=("rv", "sum"), wpa=("wpa", "sum"),
        r=("r", "sum"), out=("out", "sum"), li=("li", "sum"),
    ).reset_index()
    return agg, d


def rate(pm: pd.DataFrame, K: float = M["K"], match_min: int = M["match_min_balls"]) -> pd.DataFrame:
    """Rating table from player-match totals. Optional column `mult` = how many times a match was drawn
    (bootstrap)."""
    x = pm.assign(mult=pm["mult"] if "mult" in pm else 1)
    x = x[x["mult"] > 0].copy()
    single_n = x["n"].copy()
    if "ne" not in x:
        x["ne"] = x["n"]
    for col in ["n", "ne", "w", "wrv", "rv", "wpa"]:
        x[col] = x[col] * x["mult"]
    p = x[x.P == 1].groupby("pid").agg(pn=("n", "sum"), pne=("ne", "sum"), pw=("w", "sum"), pwrv=("wrv", "sum"),
                                       pwpa=("wpa", "sum"), pmatches=("mult", "sum"))
    n = x[x.P == 0].groupby("pid").agg(nn=("n", "sum"), nw=("w", "sum"), nwrv=("wrv", "sum"))
    r = x[(x.P == 1) & (x.R == 1)].groupby("pid").agg(rn=("n", "sum"), rne=("ne", "sum"), rw=("w", "sum"),
                                                      rwrv=("wrv", "sum"), rmatches=("mult", "sum"))
    # consistency: pressure innings or spells of 6+ balls in which the player beat the average
    inn = x[(x.P == 1) & (single_n >= match_min)]
    c = inn.assign(pos=(inn.rv > 0) * inn["mult"]).groupby("pid").agg(c_n=("mult", "sum"), c_pos=("pos", "sum"))
    t = p.join(n, how="outer").join(r, how="left").join(c, how="left").fillna(0)
    t["pmatches"] = inn.groupby("pid")["mult"].sum().reindex(t.index).fillna(0)
    t["rmatches"] = inn[inn.R == 1].groupby("pid")["mult"].sum().reindex(t.index).fillna(0)
    t["normal"] = t.nwrv / (t.nw + K)
    t["share"] = t.pw / (t.pw + K)
    t["rating"] = (t.pwrv + K * t.normal) / (t.pw + K)
    t["lift"] = t.rating - t.normal
    t["recent"] = t.rwrv / (t.rw + K)
    t["wpa100"] = t.pwpa / np.maximum(t.pn, 1) * 100
    t["cons"] = np.where(t.c_n > 0, t.c_pos / np.maximum(t.c_n, 1), np.nan)
    return t


def eligible_mask(t: pd.DataFrame, min_balls: int = E["min_pressure_balls"],
                  min_matches: int = E["min_pressure_matches"], min_recent: int = E["min_recent_balls"]) -> pd.Series:
    """Evidence bar (knockout first-innings balls count half)."""
    return (t.pne >= min_balls) & (t.pmatches >= min_matches) & (t.rne >= min_recent)


def rank(t: pd.DataFrame, eligible: pd.Index) -> pd.DataFrame:
    """Every player who clears the evidence bar, ranked by rating."""
    e = t.loc[t.index.intersection(eligible)].copy()
    e["rank"] = e.rating.rank(ascending=False, method="first").astype(int)
    return e
