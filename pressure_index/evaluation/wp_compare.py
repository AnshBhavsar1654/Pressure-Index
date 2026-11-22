"""Win-probability model comparison.

Three candidates, each validated two ways:
  * 5-fold GroupKFold by match (no match in both train and test), on every season
  * a time holdout: train on seasons before the last, test on the last season

  logistic        the production model: 6-7 engineered "resources" features (smooth in runs and balls)
  gbm             HistGradientBoosting on raw match state + the same resources features
  gbm_isotonic    the GBM with isotonic calibration fitted on held-out folds

Why production stays logistic even if a GBM scores slightly better: stakes are differences in WP between
neighbouring states (one run, one ball apart). Tree ensembles are piecewise constant, so those differences are
mostly zero or a jump, and the pressure flag would follow tree splits instead of the game.

Also reported: permutation importance (GBM, on the holdout) and partial-dependence style curves from the
production model (how a chase's WP moves with wickets in hand and runs needed).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

from pressure_index.config import CFG, LAST, log
from pressure_index.models.win_prob import calibration_bins, design, training_rows, wp_eval

RAW_FEATURES = {
    1: ["runs_before", "balls_left", "wkts_in_hand", "run_rate", "is_ipl", "season_yr"],
    2: ["runs_needed", "balls_left", "wkts_in_hand", "req_rate", "is_ipl", "season_yr"],
}


def _raw(d: pd.DataFrame, inn: int) -> np.ndarray:
    d = d.assign(run_rate=6 * d.runs_before / np.maximum(d.max_balls - d.balls_left, 1),
                 req_rate=np.clip(6 * d.runs_needed / np.maximum(d.balls_left, 1), -6, 36))
    return d[RAW_FEATURES[inn]].to_numpy(float)


def _gbm(seed: int = 0) -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(max_iter=300, learning_rate=0.06, max_leaf_nodes=31,
                                          min_samples_leaf=200, l2_regularization=1.0, random_state=seed)


def _ece(y, p, k: int = 10) -> float:
    bins = np.clip((p * k).astype(int), 0, k - 1)
    return float(sum(abs(p[bins == i].mean() - y[bins == i].mean()) * (bins == i).mean()
                     for i in range(k) if (bins == i).any()))


def _metrics(y, p) -> dict:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return {"auc": round(roc_auc_score(y, p), 4), "brier": round(brier_score_loss(y, p), 4),
            "logloss": round(log_loss(y, p), 4), "ece": round(_ece(y, p), 4)}


def _candidates(Xe, Xr, y, tr, te, seed):
    """Predictions of each candidate trained on `tr`, evaluated on `te`."""
    out = {"logistic": LogisticRegression(C=1.0, max_iter=2000).fit(Xe[tr], y[tr]).predict_proba(Xe[te])[:, 1]}
    Xc = np.column_stack([Xr, Xe])
    out["gbm"] = _gbm(seed).fit(Xc[tr], y[tr]).predict_proba(Xc[te])[:, 1]
    cal = CalibratedClassifierCV(_gbm(seed), method="isotonic", cv=3).fit(Xc[tr], y[tr])
    out["gbm_isotonic"] = cal.predict_proba(Xc[te])[:, 1]
    return out


def compare(b: pd.DataFrame, wp, sample_matches: int | None = None) -> dict:
    rng = np.random.default_rng(CFG["evaluation"]["seed"])
    train = training_rows(b)
    if sample_matches:
        keep = rng.choice(train.match_id.unique(), size=min(sample_matches, train.match_id.nunique()), replace=False)
        train = train[train.match_id.isin(keep)]
    result: dict = {"candidates": ["logistic", "gbm", "gbm_isotonic"], "innings": {}}
    for inn in (1, 2):
        d = train[train.innings == inn]
        Xe, Xr = design(wp, d, inn), _raw(d, inn)
        y, grp = d.bat_won.to_numpy(int), d.match_id.to_numpy()
        oof = {k: np.zeros(len(y)) for k in result["candidates"]}
        for fold, (tr, te) in enumerate(GroupKFold(n_splits=CFG["evaluation"]["cv_folds"]).split(Xe, y, grp)):
            for k, p in _candidates(Xe, Xr, y, tr, te, fold).items():
                oof[k][te] = p
        tr, te = np.flatnonzero(d.season_yr < LAST), np.flatnonzero(d.season_yr == LAST)
        hold = _candidates(Xe, Xr, y, tr, te, 99)
        result["innings"][inn] = {
            "n_balls": int(len(y)), "n_matches": int(d.match_id.nunique()),
            "cv": {k: _metrics(y, p) for k, p in oof.items()},
            "holdout": {k: _metrics(y[te], p) for k, p in hold.items()},
            "holdout_season": LAST, "holdout_balls": int(len(te)),
            "calibration": {k: calibration_bins(y, p) for k, p in oof.items()},
        }
        # permutation importance of the GBM on (a sample of) the holdout
        Xc = np.column_stack([Xr, Xe])
        gbm = _gbm(5).fit(Xc[tr], y[tr])
        s = rng.choice(te, size=min(20_000, len(te)), replace=False)
        pi = permutation_importance(gbm, Xc[s], y[s], scoring="neg_log_loss", n_repeats=5, random_state=0)
        names = RAW_FEATURES[inn] + [f"resources_{i}" for i in range(Xe.shape[1])]
        # fold the engineered columns into one "resources (engineered)" bar for readability
        imp = dict(zip(names, pi.importances_mean))
        eng = sum(v for k, v in imp.items() if k.startswith("resources_"))
        bars = [{"feature": k, "importance": round(float(v), 5)} for k, v in imp.items() if not k.startswith("resources_")]
        bars.append({"feature": "resources (engineered)", "importance": round(float(eng), 5)})
        result["innings"][inn]["importance"] = sorted(bars, key=lambda r: -r["importance"])
        log(f"WP compare innings {inn}: " + ", ".join(f"{k} auc={v['auc']} brier={v['brier']}"
                                                         for k, v in result["innings"][inn]["cv"].items()))
    result["curves"] = curves(wp)
    return result


def curves(wp) -> dict:
    """How the production model's chase WP moves with the situation (IPL, latest season)."""
    out = {"by_wickets": [], "by_need": []}
    need = np.arange(1, 121, dtype=float)
    for wk in (2, 4, 6, 8, 10):  # 36 balls left (6 overs), runs needed varies
        p = wp_eval(wp, 2, need, np.full_like(need, 36.0), np.full_like(need, float(wk)), 1.0, float(LAST))
        out["by_wickets"].append({"wkts": wk, "points": [[int(n), round(float(v), 4)] for n, v in zip(need[::2], p[::2])]})
    for n_ in (30, 60, 90):  # wickets in hand fixed at 6, overs left varies
        bl = np.arange(6, 121, 6, dtype=float)
        p = wp_eval(wp, 2, np.full_like(bl, float(n_)), bl, np.full_like(bl, 6.0), 1.0, float(LAST))
        out["by_need"].append({"need": n_, "points": [[int(x // 6), round(float(v), 4)] for x, v in zip(bl, p)]})
    return out
