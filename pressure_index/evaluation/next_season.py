"""Can a learned model beat the shrinkage rating at predicting next season's pressure performance?

Target: a player's runs added per pressure ball in season Y (players with 24+ pressure balls that season).
Features: everything known before season Y (rating, usual level, lift, last-season form, volume, win
probability added, consistency, phase mix of pressure balls, share of T20I balls, years active).
Model: gradient boosting (HistGradientBoostingRegressor), trained with an expanding window: to predict
2025 it learns from the targets of 2023-24, to predict 2026 from 2023-25. Scored exactly like the rating
(weighted correlation, standardised within year), so the two numbers are directly comparable.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from pressure_index.config import FIRST, log, season_weights
from pressure_index.evaluation.reliability import TEST_YEARS, weighted_corr
from pressure_index.rating.ratings import player_match_table, rate

FEATURES = ["rating", "normal", "lift", "last", "log_pn", "log_nn", "wpa100", "cons", "pp_share", "death_share",
            "t20i_share", "years"]
LABELS = {"rating": "Pressure rating", "normal": "Usual level", "lift": "Lift", "last": "Last season (pressure)",
          "log_pn": "Pressure balls (log)", "log_nn": "Other balls (log)", "wpa100": "Win chance added",
          "cons": "Consistency", "pp_share": "Powerplay share", "death_share": "Death-overs share",
          "t20i_share": "T20I share", "years": "Seasons active"}


def features_before(b: pd.DataFrame, role: str, year: int) -> pd.DataFrame:
    hist = b[b.season_yr < year]
    pm, d = player_match_table(hist, role, season_weights(last=year - 1))
    t = rate(pm)
    p = d[d.P == 1]
    last = p[p.season_yr == year - 1].groupby("pid").rv.agg(["size", "mean"])
    t["last"] = (last["mean"] * last["size"] / (last["size"] + 50)).reindex(t.index).fillna(0)  # shrunk last season
    t["log_pn"], t["log_nn"] = np.log1p(t.pn), np.log1p(t.nn)
    ph = p.groupby(["pid", "phase"]).size().unstack(fill_value=0)
    tot = ph.sum(axis=1).replace(0, np.nan)
    t["pp_share"] = (ph.get("Powerplay", 0) / tot).reindex(t.index)
    t["death_share"] = (ph.get("Death", 0) / tot).reindex(t.index)
    t["t20i_share"] = d.assign(t=(d.is_ipl == 0).astype(int)).groupby("pid").t.mean().reindex(t.index)
    t["years"] = d.groupby("pid").season_yr.nunique().reindex(t.index)
    return t


def target(b: pd.DataFrame, role: str, year: int, min_balls: int = 24) -> pd.DataFrame:
    _, d = player_match_table(b[b.season_yr == year], role, {year: 1.0})
    a = d[d.P == 1].groupby("pid").rv.agg(["size", "mean"])
    return a[a["size"] >= min_balls]


def frame(b: pd.DataFrame, role: str, year: int) -> pd.DataFrame:
    t = features_before(b, role, year)
    j = t[t.pn >= 25].join(target(b, role, year), how="inner")
    j["year"] = year
    return j


def evaluate(b: pd.DataFrame) -> dict:
    out = {}
    years = list(range(FIRST + 1, max(TEST_YEARS) + 1))
    for role in ("bat", "bowl"):
        frames = {y: frame(b, role, y) for y in years}
        preds = []
        imps = []
        for test in TEST_YEARS:
            tr = pd.concat([frames[y] for y in years if y < test])
            te = frames[test].copy()
            model = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.04, max_depth=3, min_samples_leaf=20,
                                                  l2_regularization=1.0, random_state=0)
            model.fit(tr[FEATURES], tr["mean"], sample_weight=tr["size"])
            te["gbm"] = model.predict(te[FEATURES])
            preds.append(te)
            # importance by drop in correlation when a feature is shuffled
            base = weighted_corr(te.assign(year=test), "gbm")
            rng = np.random.default_rng(test)
            for f in FEATURES:
                sh = te.copy()
                sh[f] = rng.permutation(sh[f].to_numpy())
                imps.append({"feature": f, "drop": base - weighted_corr(sh.assign(gbm=model.predict(sh[FEATURES])), "gbm")})
        j = pd.concat(preds)
        imp = pd.DataFrame(imps).groupby("feature").drop.mean().sort_values(ascending=False)
        out[role] = {
            "n": int(len(j)), "train_years": [y for y in years if y < max(TEST_YEARS)],
            "corr": {"gbm": weighted_corr(j, "gbm"), "rating": weighted_corr(j, "rating"),
                     "normal": weighted_corr(j, "normal"), "last": weighted_corr(j, "last")},
            "importance": [{"feature": LABELS[f], "drop": round(float(v), 4)} for f, v in imp.items()],
        }
        log(f"next-season {role}: {out[role]['corr']}")
    return out
