"""Run expectancy: expected runs still to come in an innings, given balls left and wickets lost.

A monotonic gradient-boosted regressor (more wickets lost can never mean more runs to come) is trained on
completed, full-length first innings, separately keyed by competition (IPL / T20I) and season, then turned
into a smooth grid RE[balls_left, wickets_lost] for each key.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from pressure_index.config import SEASONS

FEATURES = ["balls_left", "wkts_before", "is_ipl", "season_yr"]


def fit_regressor(d: pd.DataFrame) -> HistGradientBoostingRegressor:
    """Expected scoring RATE over the remaining balls (smooth near the end of the innings)."""
    return HistGradientBoostingRegressor(
        max_iter=300, learning_rate=0.05, max_leaf_nodes=16, min_samples_leaf=400,
        l2_regularization=2.0, monotonic_cst=[0, -1, 0, 0], random_state=1,
    ).fit(d[FEATURES].to_numpy(float), d.rate.to_numpy(float), sample_weight=d.balls_left.to_numpy(float))


def training_frame(b: pd.DataFrame) -> pd.DataFrame:
    d = b[(b.innings == 1) & (b.max_balls == 120)].copy()
    tot = d.groupby("match_id").tot.sum()
    d["remaining"] = d.match_id.map(tot) - d.runs_before
    d["rate"] = d.remaining / d.balls_left
    return d


def grid(reg: HistGradientBoostingRegressor, ipl: int, yr: int) -> np.ndarray:
    bl, wk = np.meshgrid(np.arange(121), np.arange(11), indexing="ij")
    X = np.column_stack([bl.ravel(), wk.ravel(), np.full(bl.size, ipl), np.full(bl.size, yr)])
    rate = reg.predict(X.astype(float)).reshape(121, 11)
    # trees give a stepped rate: smooth along balls-left (+-9 balls), then convert to runs
    kern = np.ones(19) / 19
    pad = np.pad(rate, ((9, 9), (0, 0)), mode="edge")
    rate = np.column_stack([np.convolve(pad[:, w], kern, mode="valid") for w in range(11)])
    g = np.maximum(rate * bl, 0)
    g[0, :] = 0
    g[:, 10] = 0
    g = np.maximum.accumulate(g, axis=0)   # more balls left -> never fewer runs to come
    g = np.minimum.accumulate(g, axis=1)   # more wickets lost -> never more runs to come
    return g


def run_expectancy(b: pd.DataFrame) -> tuple[dict, HistGradientBoostingRegressor]:
    reg = fit_regressor(training_frame(b))
    return {(ipl, yr): grid(reg, ipl, yr) for ipl in (0, 1) for yr in SEASONS}, reg
