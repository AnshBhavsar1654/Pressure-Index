"""Stakes (leverage) of every delivery, and the pressure-ball flag.

Stakes = the expected absolute swing in win probability from the next ball, averaged over how often each
outcome (dot, 1, 2, 3, 4, 6, wicket, wide) happens in that phase of the innings. Scaled so the average ball
is 1.0. A pressure ball is in the top 20% by stakes, or any ball of a knockout.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pressure_index.config import CFG, log
from pressure_index.models.win_prob import wp_eval

OUTCOMES = [("0", 0, 1, 0), ("1", 1, 1, 0), ("2", 2, 1, 0), ("3", 3, 1, 0),
            ("4", 4, 1, 0), ("6", 6, 1, 0), ("W", 0, 1, 1), ("Wd", 1, 0, 0)]
MIN_MATCH_BALLS = CFG["data"]["min_match_balls"]


def outcome_mix(b: pd.DataFrame) -> pd.DataFrame:
    lab = np.where(b.is_wide, "Wd", np.where(b.wkt == 1, "W", np.clip(b.tot, 0, 6).astype(int).astype(str)))
    lab = np.where(lab == "5", "4", lab)
    return pd.crosstab(b.phase, lab, normalize="index")


def leverage(b: pd.DataFrame, models) -> tuple[pd.DataFrame, pd.DataFrame]:
    probs = outcome_mix(b)
    is_ipl, yr = b.is_ipl.to_numpy(float), b.season_yr.to_numpy(float)
    mb = b.max_balls.to_numpy(float)
    wp_now = np.where(
        b.innings == 1,
        wp_eval(models, 1, b.runs_before, b.balls_left, b.wkts_in_hand, is_ipl, yr, mb),
        wp_eval(models, 2, b.runs_needed.fillna(0), b.balls_left, b.wkts_in_hand, is_ipl, yr),
    )
    exp_swing = np.zeros(len(b))
    for inn in (1, 2):
        idx = (b.innings == inn).to_numpy()
        d = b[idx]
        for name, r, ball, w in OUTCOMES:
            if name not in probs.columns:
                continue
            p = d.phase.map(probs[name]).to_numpy(float)
            bl = d.balls_left.to_numpy(float) - ball
            wk = d.wkts_in_hand.to_numpy(float) - w
            if inn == 1:
                wp_o = wp_eval(models, 1, d.runs_before.to_numpy(float) + r, bl, wk, is_ipl[idx], yr[idx], mb[idx])
            else:
                wp_o = wp_eval(models, 2, d.runs_needed.to_numpy(float) - r, bl, wk, is_ipl[idx], yr[idx])
            exp_swing[idx] += p * np.abs(wp_o - wp_now[idx])
    # Matches cut below 10 overs a side are left out of pressure and win impact; longer reduced matches
    # are judged on their revised overs and target. Runs in very short games still count towards usual level.
    short = (b.groupby("match_id").max_balls.transform("min") < MIN_MATCH_BALLS).to_numpy()
    exp_swing = np.where(short, 0.0, exp_swing)
    b["wp_before"] = wp_now
    b["exp_swing"] = exp_swing
    b["li"] = exp_swing / exp_swing[~short].mean()
    b["short_match"] = short
    # realised WP after the ball (for win probability added)
    nb = b.groupby(["match_id", "innings"]).wp_before.shift(-1)
    end_inn1 = wp_eval(models, 1, (b.runs_before + b.tot).to_numpy(float), np.zeros(len(b)), np.zeros(len(b)), is_ipl, yr, mb)
    left = b.runs_needed - b.tot
    end_inn2 = np.where(left <= 0, 1.0, np.where(left == 1, 0.5, b.bat_won.fillna(0.0)))
    chase_start = b.match_id.map(1 - b[b.innings == 2].groupby("match_id").wp_before.first())
    end_inn1 = chase_start.fillna(pd.Series(end_inn1, index=b.index)).to_numpy()
    fallback = np.where(b.innings == 1, end_inn1, end_inn2)
    b["wp_after"] = nb.fillna(pd.Series(fallback, index=b.index))
    b["wpa_bat"] = np.where(b.short_match, 0.0, b.wp_after - b.wp_before)
    return b, probs


def flag_pressure(b: pd.DataFrame) -> tuple[pd.DataFrame, float]:
    """One cut-off for every ball: the top 20% by stakes, plus every ball of a knockout. (Separate cut-offs
    for batting first and chasing flagged 87% of first-over balls, where WP sits near 50% and any model is
    most sensitive, so they were rejected.)"""
    live = ~b.short_match
    thr = float(b[live].li.quantile(CFG["model"]["pressure_pctl"]))
    b["pressure"] = live & ((b.li >= thr) | (b.is_knockout == 1))
    b["pi"] = (b.li.rank(pct=True) * 100).round(1)
    log(f"pressure threshold {thr:.3f}; share {b.pressure.mean():.3f}")
    return b, thr
