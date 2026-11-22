"""Runs added: each ball judged against what an average player gets from exactly the same spot.

Batter: bat runs - expected runs for the ball - (runs a wicket costs from here, if the striker was out)
Bowler: expected runs - runs conceded + (wicket cost, for wickets the bowler is credited with)
Both are centred per competition and season, then (T20Is only) against T20Is in the same host country that
season (pitch) and against the same opponent that season (strength of opposition).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def run_value(b: pd.DataFrame, re: dict) -> pd.DataFrame:
    bl = b.balls_left.clip(0, 120).astype(int).to_numpy()
    w = b.wkts_before.clip(0, 10).astype(int).to_numpy()
    bl_after = np.clip(bl - b.legal.astype(int).to_numpy(), 0, 120)
    w_after = np.clip(w + b.wkt.to_numpy(), 0, 10)
    re_before, re_after, re_after_nowkt = np.zeros(len(b)), np.zeros(len(b)), np.zeros(len(b))
    keys = pd.Series(list(zip(b.is_ipl.to_numpy(), b.season_yr.to_numpy())))
    for key, idx in keys.groupby(keys).groups.items():
        g = re[key]
        idx = np.asarray(idx)
        re_before[idx] = g[bl[idx], w[idx]]
        re_after[idx] = g[bl_after[idx], w_after[idx]]
        re_after_nowkt[idx] = g[bl_after[idx], w[idx]]
    wkt_cost = re_after_nowkt - re_after   # runs a wicket costs from this state
    ball_cost = re_before - re_after_nowkt  # expected runs "used up" by this ball
    b["rv_bat"] = b.runs - np.where(b.legal, ball_cost, 0) - wkt_cost * b.striker_out
    b["rv_bowl"] = np.where(b.legal, ball_cost, 0) - b.bowler_runs + wkt_cost * b.bowler_wkt
    b["wkt_cost"] = wkt_cost
    b["x_runs"] = ball_cost
    # centre per (IPL/T20I, season) so the average delivery = 0
    grp = b.is_ipl.astype(str) + "_" + b.season_yr.astype(str)
    bat_mask = ~b.is_wide
    b["rv_bat"] = b.rv_bat - grp.map(b[bat_mask].groupby(grp[bat_mask]).rv_bat.mean())
    b["rv_bowl"] = b.rv_bowl - grp.map(b.groupby(grp).rv_bowl.mean())
    # T20Is are played in very different conditions and against very different sides (the IPL is one league
    # in one country, so it is left as it is): judge each T20I ball against (1) T20Is in the same host country
    # that season, then (2) T20Is against the same opponent that season.
    t20 = (b.is_ipl == 0).to_numpy()
    yr = "_" + b.season_yr.astype(str)
    every = pd.Series(True, index=b.index)
    host = pd.Series(np.where(t20, b.venue_country.fillna("?"), "IPL"), index=b.index) + yr
    for col, mask, g in (("rv_bat", bat_mask, host), ("rv_bowl", every, host),
                         ("rv_bat", bat_mask, pd.Series(np.where(t20, b.opp_name, "IPL"), index=b.index) + yr),
                         ("rv_bowl", every, pd.Series(np.where(t20, b.team_name, "IPL"), index=b.index) + yr)):
        b[col] = b[col] - g.map(b[mask].groupby(g[mask])[col].mean())
    # par: runs an average batter makes (or an average bowler concedes) on this ball, wickets aside
    exp = np.where(b.legal, ball_cost, 0)
    b["par_bat"] = exp + grp.map((b.runs - exp)[bat_mask].groupby(grp[bat_mask]).mean())
    b["par_bowl"] = exp + grp.map((b.bowler_runs - exp).groupby(grp).mean())
    return b
