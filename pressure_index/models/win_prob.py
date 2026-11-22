"""Win probability (WP) before every delivery.

A logistic model built on run-expectancy "resources" (the idea behind Duckworth-Lewis):
  chase         -> log(runs needed / runs the side can still expect to make), its square, its interaction
                   with time left, wickets in hand, required rate
  first innings -> log(projected total / par total) with the same shape
Being smooth in runs and balls matters here: stakes (leverage) are a difference of WP across the possible
next-ball outcomes, and a tree model's step-shaped WP gives jumpy, unstable leverage. The final over of a
chase is replaced by the exact calculation in `endgame.py`.

The model is validated out-of-fold with GroupKFold by match (no match appears in both train and test), and
compared against gradient-boosted alternatives in `evaluation/wp_compare.py`.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

from pressure_index.config import CFG, SEASONS, log
from pressure_index.models.endgame import ENDGAME_BALLS, EndgameWP, endgame_evidence

FEATURE_NAMES = {
    1: ["log(projected / par)", "x time left", "squared", "time left", "wickets in hand", "IPL"],
    2: ["log(need / resources)", "x time left", "squared", "time left", "wickets in hand", "required rate", "IPL"],
}


def _rrr(runs_needed, balls_left):
    return np.clip(runs_needed / np.maximum(balls_left, 1) * 6, -6, 36)


class WPModel:
    def __init__(self, re: dict, par: dict):
        self.re = np.stack([np.stack([re[(ipl, yr)] for yr in SEASONS]) for ipl in (0, 1)])
        self.par = np.array([[par[(ipl, yr)] for yr in SEASONS] for ipl in (0, 1)])
        self.coef: dict[int, LogisticRegression] = {}
        self.endgame: EndgameWP | None = None

    def _lookup(self, is_ipl, yr, bl, wk_in_hand):
        i = np.asarray(is_ipl).astype(int)
        j = np.clip(np.asarray(yr).astype(int) - SEASONS[0], 0, len(SEASONS) - 1)
        return self.re[i, j, np.clip(bl, 0, 120).astype(int), np.clip(10 - wk_in_hand, 0, 10).astype(int)]

    def features(self, inn, x, bl, wk, is_ipl, yr, mb=None):
        res = self._lookup(is_ipl, yr, bl, wk)
        t = bl / 120.0
        if inn == 2:
            ratio = np.log((np.maximum(x, 0) + 2) / (res + 2))
            return np.column_stack([ratio, ratio * t, ratio ** 2, t, wk / 10, _rrr(x, bl) / 36, is_ipl])
        par = self.par[np.asarray(is_ipl).astype(int), np.clip(np.asarray(yr).astype(int) - SEASONS[0], 0, len(SEASONS) - 1)]
        if mb is not None:  # a reduced-overs innings is measured against a par scaled to its length
            mb = np.broadcast_to(np.asarray(mb, float), np.shape(x))
            full = np.full(np.shape(x), 120.0)
            ten = np.full(np.shape(x), 10.0)
            par = par * self._lookup(is_ipl, yr, mb, ten) / self._lookup(is_ipl, yr, full, ten)
        d = np.log((x + res + 1) / par)
        return np.column_stack([d, d * t, d ** 2, t, wk / 10, is_ipl])

    def fit(self, inn, X, y):
        self.coef[inn] = LogisticRegression(C=1.0, max_iter=2000).fit(X, y)
        return self

    def predict(self, inn, X):
        return self.coef[inn].predict_proba(X)[:, 1]


def first_innings_par(b: pd.DataFrame) -> dict:
    full1 = b[(b.innings == 1) & (b.max_balls == 120)]
    tot1 = full1.groupby("match_id").agg(t=("tot", "sum"), ipl=("is_ipl", "first"), yr=("season_yr", "first"))
    return {(ipl, yr): float(tot1[(tot1.ipl == ipl) & (tot1.yr == yr)].t.mean()) for ipl in (0, 1) for yr in SEASONS}


def training_rows(b: pd.DataFrame) -> pd.DataFrame:
    """Balls from matches with a winner (ties settled by a super over count; no-results do not)."""
    return b[b.bat_won.notna() & b.result.str.contains("won", case=False, na=False)]


def design(model: WPModel, d: pd.DataFrame, inn: int) -> np.ndarray:
    return model.features(inn, (d.runs_before if inn == 1 else d.runs_needed).to_numpy(float),
                          d.balls_left.to_numpy(float), d.wkts_in_hand.to_numpy(float),
                          d.is_ipl.to_numpy(float), d.season_yr.to_numpy(float),
                          d.max_balls.to_numpy(float) if inn == 1 else None)


def calibration_bins(y, p, k: int = 10) -> list[dict]:
    bins = np.clip((p * k).astype(int), 0, k - 1)
    return [{"pred": round(float(p[bins == i].mean()), 3), "actual": round(float(y[bins == i].mean()), 3),
             "n": int((bins == i).sum())} for i in range(k) if (bins == i).sum() > 0]


def fit_wp(b: pd.DataFrame, re: dict) -> tuple[WPModel, dict]:
    model = WPModel(re, first_innings_par(b))
    train = training_rows(b)
    metrics: dict = {}
    for inn in (1, 2):
        d = train[train.innings == inn]
        X, y, grp = design(model, d, inn), d.bat_won.to_numpy(int), d.match_id.to_numpy()
        oof = np.zeros(len(y))
        for tr, te in GroupKFold(n_splits=CFG["evaluation"]["cv_folds"]).split(X, y, grp):
            oof[te] = LogisticRegression(C=1.0, max_iter=2000).fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
        metrics[inn] = {
            "auc": round(roc_auc_score(y, oof), 3), "brier": round(brier_score_loss(y, oof), 4),
            "logloss": round(log_loss(y, oof), 4), "n_balls": int(len(y)), "n_matches": int(d.match_id.nunique()),
            "calibration": calibration_bins(y, oof),
        }
        model.fit(inn, X, y)
        metrics[inn]["coef"] = dict(zip(FEATURE_NAMES[inn], np.round(model.coef[inn].coef_[0], 3).tolist()))
        log(f"WP innings {inn}: auc={metrics[inn]['auc']} brier={metrics[inn]['brier']}")
    model.endgame = EndgameWP().fit(b)
    metrics["endgame"] = endgame_evidence(b, model)
    log("endgame:", {k: v for k, v in metrics["endgame"].items() if k != "rows"})
    return model, metrics


def wp_eval(model: WPModel, inn, runs_or_need, balls_left, wkts_in_hand, is_ipl, season_yr, max_balls=120.0):
    """Vectorised WP for the batting side, handling terminal states."""
    runs_or_need = np.asarray(runs_or_need, float)
    max_balls = np.broadcast_to(np.asarray(max_balls, float), runs_or_need.shape)
    balls_left = np.asarray(balls_left, float)
    wkts_in_hand = np.asarray(wkts_in_hand, float)
    is_ipl = np.broadcast_to(np.asarray(is_ipl, float), runs_or_need.shape)
    season_yr = np.broadcast_to(np.asarray(season_yr, float), runs_or_need.shape)
    out = np.full(runs_or_need.shape, np.nan)
    if inn == 2:
        won = runs_or_need <= 0
        over = (~won) & ((wkts_in_hand <= 0) | (balls_left <= 0))
        live = ~(won | over)
        out[won] = 1.0
        out[over] = np.where(runs_or_need[over] == 1, 0.5, 0.0)  # level scores go to a super over
        if live.any():
            X = model.features(2, runs_or_need[live], balls_left[live], wkts_in_hand[live], is_ipl[live], season_yr[live])
            out[live] = model.predict(2, X)
            last = live & (balls_left <= ENDGAME_BALLS)  # final over: the exact calculation
            if last.any() and model.endgame is not None:
                out[last] = model.endgame.predict(runs_or_need[last], balls_left[last], wkts_in_hand[last], is_ipl[last])
    else:
        done = (wkts_in_hand <= 0) | (balls_left <= 0)
        live = ~done
        if live.any():
            X = model.features(1, runs_or_need[live], balls_left[live], wkts_in_hand[live],
                               is_ipl[live], season_yr[live], max_balls[live])
            out[live] = model.predict(1, X)
        if done.any():
            # first innings over: P(batting first wins) = 1 - P(chaser wins from the start of the chase)
            n = int(done.sum())
            X = model.features(2, runs_or_need[done] + 1, np.full(n, 120.0), np.full(n, 10.0), is_ipl[done], season_yr[done])
            out[done] = 1 - model.predict(2, X)
    return out
