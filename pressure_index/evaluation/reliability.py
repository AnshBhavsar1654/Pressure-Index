"""How far the ratings can be trusted.

* bootstrap    resample matches with replacement, re-rate, and record each player's rank -> intervals
* split_half   the same measures on odd and even matches: how far does each repeat?
* forward      walk-forward backtest: ratings built from earlier seasons only, scored on how players did
               under pressure the following season (the test every setting was chosen on)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pressure_index.config import CFG, N_BOOT, log, season_weights
from pressure_index.rating.ratings import player_match_table, rank, rate

TEST_YEARS = (2025, 2026)


def bootstrap(pm: pd.DataFrame, eligible: pd.Index, n_boot: int = N_BOOT, seed: int = CFG["evaluation"]["seed"]) -> dict:
    rng = np.random.default_rng(seed)
    matches = pm.match_id.unique()
    codes = pd.Index(matches).get_indexer(pm.match_id)
    ranks: dict = {pid: [] for pid in eligible}
    ratings: dict = {pid: [] for pid in eligible}
    for i in range(n_boot):
        counts = np.bincount(rng.integers(0, len(matches), len(matches)), minlength=len(matches))
        t = rate(pm.assign(mult=counts[codes]))
        s = rank(t, eligible)
        for pid in s.index:
            ranks[pid].append(s.at[pid, "rank"])
            ratings[pid].append(s.at[pid, "rating"])
        if i % 100 == 0:
            log(f"  bootstrap {i}/{n_boot}")
    out = {}
    for pid in eligible:
        rs = np.array(ranks[pid]) if ranks[pid] else np.array([999])
        vs = np.array(ratings[pid]) if ratings[pid] else np.array([np.nan])
        out[pid] = {"p_top10": round(float((rs <= 10).mean()), 3), "rank_med": int(np.median(rs)),
                    "rank_lo": int(np.percentile(rs, 5)), "rank_hi": int(np.percentile(rs, 95)),
                    "rating_lo": round(100 * float(np.nanpercentile(vs, 5)), 2) if n_boot else None,
                    "rating_hi": round(100 * float(np.nanpercentile(vs, 95)), 2) if n_boot else None}
    return out


def split_half(pm: pd.DataFrame, eligible: pd.Index) -> dict:
    j = rate(pm[pm.match_id % 2 == 1]).join(rate(pm[pm.match_id % 2 == 0]), lsuffix="_o", rsuffix="_e", how="inner")
    j = j.loc[j.index.intersection(eligible)]
    return {col: round(float(j[[f"{col}_o", f"{col}_e"]].dropna().corr().iloc[0, 1]), 3)
            for col in ["rating", "normal", "lift", "wpa100", "cons"]}


def forward_frame(b: pd.DataFrame, role: str, K: float = CFG["model"]["K"], min_train: int = 25,
                  min_test: int = 24) -> pd.DataFrame:
    """For each test season: ratings from the seasons before it, joined to the next season's actual runs
    added per pressure ball (`mean`, over `size` balls)."""
    rows = []
    for test in TEST_YEARS:
        pm, _ = player_match_table(b[b.season_yr < test], role, season_weights(last=test - 1))
        t = rate(pm, K=K)
        t = t[t.pn >= min_train]
        _, d = player_match_table(b[b.season_yr == test], role, {test: 1.0})
        actual = d[d.P == 1].groupby("pid").rv.agg(["size", "mean"])
        actual = actual[actual["size"] >= min_test]
        j = t.join(actual, how="inner")
        j["year"] = test
        rows.append(j)
    return pd.concat(rows)


def weighted_corr(j: pd.DataFrame, col: str) -> float:
    """Correlation (weighted by test balls) between a predictor, standardised within its year, and the
    next season's pressure output."""
    z = j.groupby("year")[col].transform(lambda s: (s - s.mean()) / s.std())
    y, w = j["mean"], j["size"]
    ok = z.notna()
    z, y, w = z[ok], y[ok], w[ok]
    mz, my = np.average(z, weights=w), np.average(y, weights=w)
    cov = np.average((z - mz) * (y - my), weights=w)
    return round(float(cov / np.sqrt(np.average((z - mz) ** 2, weights=w) * np.average((y - my) ** 2, weights=w))), 3)


def forward_check(b: pd.DataFrame, role: str) -> dict:
    j = forward_frame(b, role)
    return {"n": int(len(j)), **{c: weighted_corr(j, c) for c in ("rating", "normal", "lift", "wpa100")}}
