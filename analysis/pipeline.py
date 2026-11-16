"""
SupeRR Selector S2 - Pressure performance pipeline.

Reads the raw data pack, builds:
  1. Match state for every delivery (score, wickets, balls left, target).
  2. A win-probability (WP) model per innings (monotonic gradient boosting).
  3. Leverage Index (LI): expected absolute swing in WP from the next ball,
     normalised so the average delivery = 1.0. Pressure Index = LI x stage factor.
  4. Run-expectancy (RE) table -> context-adjusted Run Value (RV) per ball.
  5. Player ratings under pressure vs baseline, with empirical-Bayes shrinkage,
     consistency, and bootstrap rank stability.

Writes JSON consumed by the dashboard into dashboard/public/data/.

Run:  python -I analysis/pipeline.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "Data Pack"
OUT = ROOT / "dashboard" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

RNG = np.random.default_rng(27)

# ---------------------------------------------------------------- config
PRESSURE_PCTL = 0.80          # top 20% of Pressure Index = "high pressure" delivery
KNOCKOUT_MULT = 1.20          # knockout / playoff stakes multiplier
FULL_MEMBERS = {
    "India", "Pakistan", "Australia", "England", "New Zealand", "South Africa",
    "West Indies", "Sri Lanka", "Bangladesh", "Afghanistan", "Ireland", "Zimbabwe",
}
SEASON_WEIGHT = {2022: 0.60, 2023: 0.70, 2024: 0.80, 2025: 0.90, 2026: 1.00}
MIN_PRESSURE_BALLS_BAT = 120  # eligibility (raw balls faced under pressure)
MIN_PRESSURE_BALLS_BOWL = 120
MIN_PRESSURE_MATCHES = 8
DEFAULT_WEIGHTS = {"pressure": 0.40, "impact": 0.20, "delta": 0.20, "consistency": 0.20}
PRESSURE_K = 250              # credibility prior: pressure balls before a player's own record counts 50%
N_BOOT = int(__import__('os').environ.get('N_BOOT', 400))


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- load
def load():
    b = pd.read_csv(DATA / "ball_by_ball.csv", low_memory=False)
    m = pd.read_csv(DATA / "matches.csv")
    c = pd.read_csv(DATA / "competitions.csv")
    mp = pd.read_csv(DATA / "competition_team_player_mapping.csv")
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
    m["comp_weight"] = m["comp_tier"].map(
        {"IPL": 1.0, "T20I Full": 1.0, "T20I Assoc": 0.75, "Emerging": 0.6}
    )
    m["is_knockout"] = ((m["knock_out"] == 1) | m["stage"].isin(
        ["Final", "Qualifier", "Eliminator", "Semi Final"])).astype(int)
    return b, m, mp


# ---------------------------------------------------------------- state
def build_state(b: pd.DataFrame, m: pd.DataFrame) -> pd.DataFrame:
    b = b[b.innings <= 2].copy()  # drop super overs
    b = b.sort_values(["match_id", "innings", "innings_ball_num"]).reset_index(drop=True)
    b["extras_type"] = b["extras_type"].fillna("None")
    b["tot"] = b.runs + b.extras1_runs + b.extras_2_runs
    b["legal"] = ~b.extras_type.isin(["wide", "Overstep", "other"])
    b["is_wide"] = b.extras_type.eq("wide")
    b["is_nb"] = b.extras_type.isin(["Overstep", "other"])
    b["wkt"] = b.is_wicket.astype(int)
    # runs charged to bowler: bat runs + wides + no-ball runs (not byes / leg byes)
    b["bowler_runs"] = b.runs + np.where(b.is_wide | b.is_nb, b.extras1_runs + b.extras_2_runs, 0)
    b["bowler_wkt"] = (b.is_wicket & ~b.dismissal_type.isin(
        ["RunOut", "Retire Out", "Obstracting the field", "Obstructing the field"])).astype(int)
    b["striker_out"] = (b.is_wicket & (b.dismissed_player_id == b.striker_id)).astype(int)

    g = b.groupby(["match_id", "innings"], sort=False)
    b["runs_before"] = g.tot.cumsum() - b.tot
    b["wkts_before"] = g.wkt.cumsum() - b.wkt
    b["legal_before"] = g.legal.cumsum() - b.legal.astype(int)

    mm = m.set_index("match_id")
    inn_tot = b.groupby(["match_id", "innings"]).tot.sum().unstack()
    b = b.merge(
        m[["match_id", "season_yr", "is_ipl", "comp_tier", "comp_weight", "is_knockout",
           "first_inn_revised_overs", "second_inn_revised_overs", "revised_target",
           "win_team_id", "match_date", "comp_name", "home_team", "away_team",
           "home_team_id", "away_team_id", "stage", "result"]],
        on="match_id", how="left")
    max_balls = np.where(
        b.innings == 1, b.first_inn_revised_overs, b.second_inn_revised_overs)
    b["max_balls"] = np.where(np.isnan(max_balls), 120, max_balls)
    first_tot = b.match_id.map(inn_tot[1])
    b["target"] = np.where(b.revised_target.notna(), b.revised_target, first_tot + 1)
    b.loc[b.innings == 1, "target"] = np.nan
    b["balls_left"] = (b.max_balls - b.legal_before).clip(lower=1)
    b["wkts_in_hand"] = 10 - b.wkts_before
    b["runs_needed"] = b.target - b.runs_before
    b["over"] = b.overid
    b["phase"] = pd.cut(b.overid, [0, 6, 15, 20], labels=["Powerplay", "Middle", "Death"]).astype(str)
    b["bat_won"] = np.where(b.win_team_id.isna(), np.nan,
                            (b.win_team_id == b.batting_team_id).astype(float))
    b["opp_name"] = np.where(b.bowling_team_id == b.home_team_id, b.home_team, b.away_team)
    b["team_name"] = np.where(b.batting_team_id == b.home_team_id, b.home_team, b.away_team)
    del mm
    return b


# ---------------------------------------------------------------- WP model
F1 = ["runs_before", "balls_left", "wkts_in_hand", "is_ipl", "season_yr"]
M1 = [1, 1, 1, 0, 0]
F2 = ["runs_needed", "balls_left", "wkts_in_hand", "rrr", "is_ipl", "season_yr"]
M2 = [-1, 1, 1, -1, 0, 0]


class CalibratedWP:
    """Gradient-boosted WP with an isotonic calibration layer fitted on out-of-fold predictions."""

    def __init__(self, clf, iso):
        self.clf, self.iso = clf, iso

    def predict_proba(self, X):
        p = self.iso.predict(self.clf.predict_proba(X)[:, 1])
        return np.column_stack([1 - p, p])


def _rrr(runs_needed, balls_left):
    return np.clip(runs_needed / np.maximum(balls_left, 1) * 6, -6, 36)


def fit_wp(b: pd.DataFrame):
    train = b[b.bat_won.notna() & b.result.str.contains("won", case=False, na=False)].copy()
    train["rrr"] = _rrr(train.runs_needed, train.balls_left)
    models, metrics = {}, {}
    for inn, F, M in [(1, F1, M1), (2, F2, M2)]:
        d = train[train.innings == inn]
        X, y, grp = d[F].to_numpy(float), d.bat_won.to_numpy(int), d.match_id.to_numpy()
        # strong regularisation: balls within a match are highly correlated
        params = dict(max_iter=200, learning_rate=0.05, max_leaf_nodes=12,
                      min_samples_leaf=1500, l2_regularization=5.0, monotonic_cst=M)
        oof = np.zeros(len(y))
        for tr, te in GroupKFold(n_splits=5).split(X, y, grp):
            clf = HistGradientBoostingClassifier(**params, random_state=1).fit(X[tr], y[tr])
            oof[te] = clf.predict_proba(X[te])[:, 1]
        iso = IsotonicRegression(out_of_bounds="clip", y_min=0.005, y_max=0.995).fit(oof, y)
        oof = iso.predict(oof)
        metrics[inn] = {
            "auc": round(roc_auc_score(y, oof), 3),
            "brier": round(brier_score_loss(y, oof), 4),
            "logloss": round(log_loss(y, oof), 4),
            "n_balls": int(len(y)),
            "n_matches": int(d.match_id.nunique()),
        }
        # calibration bins for the dashboard
        bins = np.clip((oof * 10).astype(int), 0, 9)
        metrics[inn]["calibration"] = [
            {"pred": round(float(oof[bins == k].mean()), 3),
             "actual": round(float(y[bins == k].mean()), 3), "n": int((bins == k).sum())}
            for k in range(10) if (bins == k).sum() > 0
        ]
        models[inn] = CalibratedWP(
            HistGradientBoostingClassifier(**params, random_state=1).fit(X, y), iso)
        log(f"WP innings {inn}: {metrics[inn]}")
    return models, metrics


def wp_eval(models, inn, runs_or_need, balls_left, wkts_in_hand, is_ipl, season_yr):
    """Vectorised WP for the batting side, handling terminal states."""
    runs_or_need = np.asarray(runs_or_need, float)
    balls_left = np.asarray(balls_left, float)
    wkts_in_hand = np.asarray(wkts_in_hand, float)
    is_ipl = np.broadcast_to(np.asarray(is_ipl, float), runs_or_need.shape)
    season_yr = np.broadcast_to(np.asarray(season_yr, float), runs_or_need.shape)
    out = np.full(runs_or_need.shape, np.nan)
    if inn == 2:
        won = runs_or_need <= 0
        lost = (~won) & ((wkts_in_hand <= 0) | (balls_left <= 0))
        live = ~(won | lost)
        out[won], out[lost] = 1.0, 0.0
        if live.any():
            X = np.column_stack([runs_or_need, balls_left, wkts_in_hand,
                                 _rrr(runs_or_need, balls_left), is_ipl, season_yr])[live]
            out[live] = models[2].predict_proba(X)[:, 1]
    else:
        done = (wkts_in_hand <= 0) | (balls_left <= 0)
        live = ~done
        if live.any():
            X = np.column_stack([runs_or_need, balls_left, wkts_in_hand, is_ipl, season_yr])[live]
            out[live] = models[1].predict_proba(X)[:, 1]
        if done.any():
            # first innings over: P(bat first wins) = 1 - P(chaser wins from start of chase)
            need = runs_or_need[done] + 1
            n = int(done.sum())
            X = np.column_stack([need, np.full(n, 120.0), np.full(n, 10.0),
                                 _rrr(need, np.full(n, 120.0)),
                                 is_ipl[done], season_yr[done]])
            out[done] = 1 - models[2].predict_proba(X)[:, 1]
    return out


OUTCOMES = [("0", 0, 1, 0), ("1", 1, 1, 0), ("2", 2, 1, 0), ("3", 3, 1, 0),
            ("4", 4, 1, 0), ("6", 6, 1, 0), ("W", 0, 1, 1), ("Wd", 1, 0, 0)]


def leverage(b: pd.DataFrame, models):
    """Expected |dWP| from the next delivery, over the empirical outcome mix per phase."""
    def outcome_label(r):
        if r.is_wide:
            return "Wd"
        if r.wkt:
            return "W"
        return str(min(int(r.tot), 6)) if int(r.tot) != 5 else "4"
    lab = np.where(b.is_wide, "Wd", np.where(b.wkt == 1, "W",
                   np.clip(b.tot, 0, 6).astype(int).astype(str)))
    lab = np.where(lab == "5", "4", lab)
    probs = pd.crosstab(b.phase, lab, normalize="index")
    is_ipl, yr = b.is_ipl.to_numpy(float), b.season_yr.to_numpy(float)
    wp_now = np.where(
        b.innings == 1,
        wp_eval(models, 1, b.runs_before, b.balls_left, b.wkts_in_hand, is_ipl, yr),
        wp_eval(models, 2, b.runs_needed.fillna(0), b.balls_left, b.wkts_in_hand, is_ipl, yr),
    )
    # evaluate separately per innings for correct state arithmetic
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
                wp_o = wp_eval(models, 1, d.runs_before.to_numpy(float) + r, bl, wk, is_ipl[idx], yr[idx])
            else:
                wp_o = wp_eval(models, 2, d.runs_needed.to_numpy(float) - r, bl, wk, is_ipl[idx], yr[idx])
            exp_swing[idx] += p * np.abs(wp_o - wp_now[idx])
    b["wp_before"] = wp_now
    b["exp_swing"] = exp_swing
    b["li"] = exp_swing / exp_swing.mean()
    # realised WP after the ball (for WPA)
    nb = b.groupby(["match_id", "innings"]).wp_before.shift(-1)
    # end-of-innings fallback
    end_inn1 = wp_eval(models, 1, (b.runs_before + b.tot).to_numpy(float), np.zeros(len(b)),
                       np.zeros(len(b)), is_ipl, yr)
    end_inn2 = np.where(b.runs_needed - b.tot <= 0, 1.0, 0.0)
    fallback = np.where(b.innings == 1, end_inn1, end_inn2)
    b["wp_after"] = nb.fillna(pd.Series(fallback, index=b.index))
    b["wpa_bat"] = b.wp_after - b.wp_before
    return b, probs


# ---------------------------------------------------------------- run expectancy
def run_expectancy(b: pd.DataFrame):
    """Run expectancy: expected runs still to come in an innings given balls left and
    wickets lost, per (IPL/T20I, season). Monotonic gradient boosting on completed,
    full-length first innings -> smooth RE grids RE[key][balls_left, wkts_lost]."""
    d = b[(b.innings == 1) & (b.max_balls == 120)].copy()
    tot = d.groupby("match_id").tot.sum()
    d["remaining"] = d.match_id.map(tot) - d.runs_before
    # model the expected scoring RATE over the remaining balls (smooth at the innings end)
    d["rate"] = d.remaining / d.balls_left
    F = ["balls_left", "wkts_before", "is_ipl", "season_yr"]
    reg = HistGradientBoostingRegressor(
        max_iter=300, learning_rate=0.05, max_leaf_nodes=16, min_samples_leaf=400,
        l2_regularization=2.0, monotonic_cst=[0, -1, 0, 0], random_state=1,
    ).fit(d[F].to_numpy(float), d.rate.to_numpy(float), sample_weight=d.balls_left.to_numpy(float))
    re = {}
    bl, wk = np.meshgrid(np.arange(121), np.arange(11), indexing="ij")
    for ipl in (0, 1):
        for yr in SEASON_WEIGHT:
            X = np.column_stack([bl.ravel(), wk.ravel(), np.full(bl.size, ipl), np.full(bl.size, yr)])
            g = reg.predict(X.astype(float)).reshape(121, 11) * bl
            g = np.maximum(g, 0)
            g[0, :] = 0
            g[:, 10] = 0
            # enforce monotonicity exactly
            g = np.maximum.accumulate(g, axis=0)
            g = np.minimum.accumulate(g, axis=1)
            re[(ipl, yr)] = g
    return re


def run_value(b: pd.DataFrame, re):
    bl = b.balls_left.clip(0, 120).astype(int).to_numpy()
    w = b.wkts_before.clip(0, 10).astype(int).to_numpy()
    bl_after = np.clip(bl - b.legal.astype(int).to_numpy(), 0, 120)
    w_after = np.clip(w + b.wkt.to_numpy(), 0, 10)
    re_before = np.zeros(len(b)); re_after = np.zeros(len(b)); re_after_nowkt = np.zeros(len(b))
    keys = list(zip(b.is_ipl.to_numpy(), b.season_yr.to_numpy()))
    keys = pd.Series(keys)
    for key, idx in keys.groupby(keys).groups.items():
        g = re[key]
        idx = np.asarray(idx)
        re_before[idx] = g[bl[idx], w[idx]]
        re_after[idx] = g[bl_after[idx], w_after[idx]]
        re_after_nowkt[idx] = g[bl_after[idx], w[idx]]
    wkt_cost = re_after_nowkt - re_after   # runs a wicket costs from this state
    ball_cost = re_before - re_after_nowkt  # expected runs "used up" by this ball
    # Batter: bat runs - expected runs for the ball - wicket cost if the striker was out
    b["rv_bat"] = b.runs - np.where(b.legal, ball_cost, 0) - wkt_cost * b.striker_out
    # Bowler: expected runs - runs conceded + wicket cost for bowler-credited wickets
    b["rv_bowl"] = np.where(b.legal, ball_cost, 0) - b.bowler_runs + wkt_cost * b.bowler_wkt
    b["wkt_cost"] = wkt_cost
    b["x_runs"] = ball_cost
    # centre per (IPL/T20I, season) so the league-average delivery = 0
    grp = b.is_ipl.astype(str) + "_" + b.season_yr.astype(str)
    bat_mask = ~b.is_wide
    b["rv_bat"] = b.rv_bat - grp.map(b[bat_mask].groupby(grp[bat_mask]).rv_bat.mean())
    b["rv_bowl"] = b.rv_bowl - grp.map(b.groupby(grp).rv_bowl.mean())
    return b


# ---------------------------------------------------------------- ratings
K_GRID = [25, 50, 100, 150, 200, 300, 400, 600, 800, 1200, 1600, 2400]


def _raw(pm, P):
    x = pm[pm.P == P].groupby("pid")[["wn", "wrv"]].sum()
    return x


def choose_k(pm: pd.DataFrame, role: str) -> dict:
    """Cross-validated shrinkage: pick prior strengths that best predict a player's
    raw rate in the other half of matches (odd vs even match ids, both directions)."""
    halves = [pm[pm.match_id % 2 == 1], pm[pm.match_id % 2 == 0]]
    mun = float(pm[pm.P == 0].wrv.sum() / pm[pm.P == 0].wn.sum())
    res_n, res_p = {}, {}
    for kn in K_GRID:
        err = wsum = 0.0
        for a, bb in [(0, 1), (1, 0)]:
            fa, tb = _raw(halves[a], 0), _raw(halves[bb], 0)
            j = fa.join(tb, lsuffix="_a", rsuffix="_b", how="inner")
            j = j[j.wn_b >= 30]
            est = (j.wrv_a + kn * mun) / (j.wn_a + kn)
            err += (j.wn_b * (est - j.wrv_b / j.wn_b) ** 2).sum()
            wsum += j.wn_b.sum()
        res_n[kn] = err / wsum
    kn = min(res_n, key=res_n.get)
    for kp in K_GRID:
        err = wsum = 0.0
        for a, bb in [(0, 1), (1, 0)]:
            na, pa, pb = _raw(halves[a], 0), _raw(halves[a], 1), _raw(halves[bb], 1)
            j = pa.join(na, lsuffix="", rsuffix="_n", how="left").fillna(0).join(
                pb, rsuffix="_b", how="inner")
            j = j[j.wn_b >= 30]
            base = (j.wrv_n + kn * mun) / (j.wn_n + kn)
            n_raw = np.where(j.wn_n > 0, j.wrv_n / np.maximum(j.wn_n, 1e-9), mun)
            est = base + (j.wrv - j.wn * n_raw) / (j.wn + kp)
            err += (j.wn_b * (est - j.wrv_b / j.wn_b) ** 2).sum()
            wsum += j.wn_b.sum()
        res_p[kp] = err / wsum
    kp_cv = min(res_p, key=res_p.get)
    # Descriptive ranking uses a fixed credibility prior (documented); the CV optimum
    # is reported as reliability evidence (how much pressure skill persists).
    kp = PRESSURE_K
    c = pm[(pm.P == 1) & (pm.n >= 6)]
    k = {"kp": float(kp), "kp_cv": float(kp_cv), "kn": float(kn), "mun": mun,
         "c_prior": float((c.rv > 0).mean()),
         "cv_n": {str(a): round(v, 5) for a, v in res_n.items()},
         "cv_p": {str(a): round(v, 5) for a, v in res_p.items()}}
    log(f"choose_k {role}: kn={kn} kp_cv={kp_cv} (using kp={kp})")
    return k


def player_match_table(b: pd.DataFrame, role: str) -> pd.DataFrame:
    if role == "bat":
        d = b[~b.is_wide].copy()
        d["pid"], d["pname"], d["rv"] = d.striker_id, d.striker_name, d.rv_bat
        d["wpa"] = d.wpa_bat
        d["r"], d["out"] = d.runs, d.striker_out
    else:
        d = b.copy()
        d["pid"], d["pname"], d["rv"] = d.bowler_id, d.bowler_name, d.rv_bowl
        d["wpa"] = -d.wpa_bat
        d["r"], d["out"] = d.bowler_runs, d.bowler_wkt
    d["w"] = d.comp_weight * d.season_yr.map(SEASON_WEIGHT)
    d["P"] = d.pressure.astype(int)
    d["dotb"] = ((d.tot == 0) if role == "bowl" else (d.runs == 0)).astype(int)
    d["bnd"] = (d.is_four | d.is_six).astype(int)
    d["lg"] = d.legal.astype(int)
    d["wrv"], d["wrv2"], d["wwpa"] = d.w * d.rv, d.w * d.rv ** 2, d.w * d.wpa
    agg = d.groupby(["pid", "match_id", "P"]).agg(
        n=("rv", "size"), wn=("w", "sum"), wrv=("wrv", "sum"), wrv2=("wrv2", "sum"),
        wwpa=("wwpa", "sum"), rv=("rv", "sum"), wpa=("wpa", "sum"), r=("r", "sum"),
        out=("out", "sum"), dotb=("dotb", "sum"), bnd=("bnd", "sum"), lg=("lg", "sum"),
        li=("li", "sum"),
    ).reset_index()
    return agg, d


def rate(pm: pd.DataFrame, role: str, k=None):
    """Compute rating table from player-match aggregates (also used in bootstrap).
    Optional column `mult` = how many times a match was drawn (bootstrap)."""
    pm = pm if "mult" in pm else pm.assign(mult=1)
    x = pm.copy()
    for col in ["n", "wn", "wrv", "wrv2", "wwpa"]:
        x[col] = x[col] * x["mult"]
    x = x[x["mult"] > 0]
    P = x[x.P == 1].groupby("pid")
    N = x[x.P == 0].groupby("pid")
    p = P.agg(pn=("n", "sum"), pwn=("wn", "sum"), pwrv=("wrv", "sum"), pwrv2=("wrv2", "sum"),
              pwwpa=("wwpa", "sum"), pmatches=("mult", "sum"))
    n = N.agg(nn=("n", "sum"), nwn=("wn", "sum"), nwrv=("wrv", "sum"), nwrv2=("wrv2", "sum"))
    # consistency: share of matches with >= 6 pressure balls where pressure RV > 0
    pmm = x[(x.P == 1) & (pm.loc[x.index, "n"] >= 6)]
    cons = pmm.assign(pos=(pmm.rv > 0).astype(int) * pmm["mult"]).groupby("pid").agg(
        c_n=("mult", "sum"), c_pos=("pos", "sum"))
    t = p.join(n, how="left").join(cons, how="left").fillna(0)
    if k is None:
        k = choose_k(pm, role)
    # baseline (non-pressure) level: shrink toward the league mean
    t["n_rv"] = (t.nwrv + k["kn"] * k["mun"]) / (t.nwn + k["kn"])
    # clutch deviation: pressure rate minus the player's OWN raw baseline,
    # shrunk toward zero (no pressure effect) with prior strength kp
    n_raw = np.where(t.nwn > 0, t.nwrv / np.maximum(t.nwn, 1e-9), k["mun"])
    t["delta"] = (t.pwrv - t.pwn * n_raw) / (t.pwn + k["kp"])
    # pressure level = baseline level + clutch deviation (hierarchical decomposition)
    t["p_rv"] = t.n_rv + t.delta
    t["wpa100"] = t.pwwpa / np.maximum(t.pwn, 1) * 100 * (t.pwn / (t.pwn + k["kp"]))
    t["cons"] = (t.c_pos + 8 * k["c_prior"]) / (t.c_n + 8)
    return t, k


def score(t: pd.DataFrame, eligible: pd.Index, weights=DEFAULT_WEIGHTS):
    e = t.loc[t.index.intersection(eligible)].copy()
    comps = {"pressure": "p_rv", "impact": "wpa100", "delta": "delta", "consistency": "cons"}
    for name, col in comps.items():
        e[f"z_{name}"] = (e[col] - e[col].mean()) / e[col].std(ddof=0)
    e["score"] = sum(weights[n] * e[f"z_{n}"] for n in comps)
    e["rank"] = e.score.rank(ascending=False, method="first").astype(int)
    return e


def bootstrap(pm: pd.DataFrame, role: str, eligible: pd.Index, k: dict):
    """Resample matches with replacement; re-rate; record each player's rank."""
    matches = pm.match_id.unique()
    codes = pd.Index(matches).get_indexer(pm.match_id)
    ranks = {pid: [] for pid in eligible}
    for i in range(N_BOOT):
        counts = np.bincount(RNG.integers(0, len(matches), len(matches)), minlength=len(matches))
        t, _ = rate(pm.assign(mult=counts[codes]), role, k)
        s = score(t, eligible)
        for pid, r in s["rank"].items():
            ranks[pid].append(r)
        if i % 100 == 0:
            log(f"  bootstrap {role} {i}/{N_BOOT}")
    out = {}
    for pid, rs in ranks.items():
        rs = np.array(rs) if rs else np.array([999])
        out[pid] = {"p_top10": round(float((rs <= 10).mean()), 3),
                    "rank_med": int(np.median(rs)),
                    "rank_lo": int(np.percentile(rs, 5)), "rank_hi": int(np.percentile(rs, 95))}
    return out


def split_half(pm: pd.DataFrame, role: str, eligible: pd.Index, k: dict):
    odd = pm[pm.match_id % 2 == 1]
    even = pm[pm.match_id % 2 == 0]
    to, _ = rate(odd, role, k)
    te, _ = rate(even, role, k)
    j = to.join(te, lsuffix="_o", rsuffix="_e", how="inner")
    j = j.loc[j.index.intersection(eligible)]
    res = {}
    for col in ["p_rv", "n_rv", "delta", "cons", "wpa100"]:
        r = float(np.corrcoef(j[f"{col}_o"], j[f"{col}_e"])[0, 1])
        res[col] = round(r, 3)
    return res


# ---------------------------------------------------------------- outputs
def traditional(d: pd.DataFrame, role: str, mask) -> dict:
    x = d[mask]
    balls = int(x.lg.sum()) if role == "bowl" else int(len(x) - (x.is_nb.sum() * 0))
    runs = int(x.r.sum())
    outs = int(x.out.sum())
    res = {"balls": balls, "runs": runs, "outs": outs,
           "dot_pct": round(100 * x.dotb.mean(), 1) if len(x) else None,
           "bnd_pct": round(100 * x.bnd.mean(), 1) if len(x) else None,
           "rv100": round(100 * x.rv.mean(), 1) if len(x) else None}
    if role == "bat":
        res["sr"] = round(100 * runs / max(balls, 1), 1)
        res["avg"] = round(runs / outs, 1) if outs else None
    else:
        res["econ"] = round(6 * runs / max(balls, 1), 2)
        res["sr"] = round(balls / outs, 1) if outs else None
        res["avg"] = round(runs / outs, 1) if outs else None
    return res


def player_meta(mp: pd.DataFrame, m: pd.DataFrame, b: pd.DataFrame):
    mp = mp.merge(m[["comp_id", "season_yr", "is_ipl"]].drop_duplicates("comp_id"), on="comp_id")
    ipl = mp[mp.is_ipl == 1].sort_values("season_yr").groupby("player_id").last()
    intl = mp[(mp.is_ipl == 0) & mp.team_name.isin(FULL_MEMBERS | {
        "Netherlands", "Scotland", "United Arab Emirates", "Nepal", "Hong Kong", "Oman",
        "Canada", "United States Of America", "Namibia", "Kuwait", "Singapore", "Japan"})]
    intl = intl.sort_values("season_yr").groupby("player_id").last()
    bat_hand = b.groupby("striker_id").batting_type.agg(lambda s: s.mode().iat[0])
    bowl_type = b.groupby("bowler_id").bowling_type.agg(lambda s: s.mode().iat[0])
    pace = b.groupby("bowler_id").pace_or_spin.agg(lambda s: s.mode().iat[0])
    return ipl, intl, bat_hand, bowl_type, pace


def main():
    b, m, mp = load()
    log("loaded", b.shape)
    b = build_state(b, m)
    models, wp_metrics = fit_wp(b)
    b, outcome_probs = leverage(b, models)
    b["pi_raw"] = b.li * np.where(b.is_knockout == 1, KNOCKOUT_MULT, 1.0)
    b["pi"] = (b.pi_raw.rank(pct=True) * 100).round(1)
    thr = b.pi_raw.quantile(PRESSURE_PCTL)
    b["pressure"] = b.pi_raw >= thr
    log(f"pressure threshold LI*stage >= {thr:.3f}; share {b.pressure.mean():.3f}")
    re = run_expectancy(b)
    b = run_value(b, re)

    ipl_meta, intl_meta, bat_hand, bowl_type, pace = player_meta(mp, m, b)

    results = {}
    for role in ("bat", "bowl"):
        pm, d = player_match_table(b, role)
        t, k = rate(pm, role)
        min_balls = MIN_PRESSURE_BALLS_BAT if role == "bat" else MIN_PRESSURE_BALLS_BOWL
        eligible = t[(t.pn >= min_balls) & (t.pmatches >= MIN_PRESSURE_MATCHES)].index
        s = score(t, eligible)
        log(f"{role}: k={k}, eligible={len(eligible)}")
        boot = bootstrap(pm, role, eligible, k)
        sh = split_half(pm, role, eligible, k)
        log(f"{role} split-half: {sh}")
        names = d.groupby("pid").pname.agg(lambda x: x.mode().iat[0])
        players = []
        for pid, row in s.sort_values("rank").iterrows():
            dp = d[d.pid == pid]
            press, norm = traditional(dp, role, dp.P == 1), traditional(dp, role, dp.P == 0)
            seasons = []
            for yr, g in dp.groupby("season_yr"):
                gp = g[g.P == 1]
                seasons.append({"season": int(yr), "p_balls": int(len(gp)),
                                "p_rv100": round(100 * gp.rv.mean(), 1) if len(gp) else None,
                                "n_rv100": round(100 * g[g.P == 0].rv.mean(), 1) if (g.P == 0).any() else None})
            phases = []
            for ph in ["Powerplay", "Middle", "Death"]:
                g = dp[(dp.phase == ph) & (dp.P == 1)]
                phases.append({"phase": ph, "balls": int(len(g)),
                               "rv100": round(100 * g.rv.mean(), 1) if len(g) else None})
            mt = (dp[dp.P == 1].groupby("match_id")
                  .agg(balls=("rv", "size"), rv=("rv", "sum"), wpa=("wpa", "sum"), r=("r", "sum"),
                       out=("out", "sum"), date=("match_date", "first"), opp=("opp_name", "first")
                       if role == "bat" else ("team_name", "first"), comp=("comp_name", "first"),
                       li=("li", "mean"))
                  .reset_index().sort_values("date"))
            matches = [{"id": int(r.match_id), "date": r.date, "opp": r.opp, "comp": r.comp,
                        "balls": int(r.balls), "rv": round(float(r.rv), 2),
                        "wpa": round(float(r.wpa), 3), "r": int(r.r), "out": int(r.out),
                        "li": round(float(r.li), 2)} for r in mt.itertuples()]
            ipl_team = ipl_meta.team_name.get(pid) if pid in ipl_meta.index else None
            ipl_season = int(ipl_meta.season_yr.get(pid)) if pid in ipl_meta.index else None
            players.append({
                "id": int(pid), "name": names[pid], "rank": int(row["rank"]),
                "score": round(float(row.score), 3),
                "country": intl_meta.team_name.get(pid) if pid in intl_meta.index else None,
                "ipl_team": ipl_team, "ipl_season": ipl_season,
                "hand": bat_hand.get(pid), "bowl_type": bowl_type.get(pid), "pace": pace.get(pid),
                "p_balls": int(row.pn), "p_matches": int(row.pmatches), "n_balls": int(row.nn),
                "p_rv100": round(100 * row.p_rv, 2), "n_rv100": round(100 * row.n_rv, 2),
                "delta100": round(100 * row.delta, 2), "wpa100": round(float(row.wpa100), 3),
                "cons": round(float(row.cons), 3), "cons_n": int(row.c_n),
                "z": {c: round(float(row[f"z_{c}"]), 3) for c in DEFAULT_WEIGHTS},
                "boot": boot[pid], "press": press, "norm": norm,
                "seasons": seasons, "phases": phases, "matches": matches,
                "tiers": {tier: int((dp[dp.P == 1].comp_tier == tier).sum())
                          for tier in ["IPL", "T20I Full", "T20I Assoc", "Emerging"]},
            })
        results[role] = {"players": players, "k": k, "split_half": sh,
                         "eligibility": {"min_pressure_balls": min_balls,
                                         "min_pressure_matches": MIN_PRESSURE_MATCHES,
                                         "n_eligible": int(len(eligible)),
                                         "n_players": int(len(t))}}

    # ------------------------------------------------ league-level evidence
    lb = b.copy()
    lb["dotb"] = (lb.tot == 0) & lb.legal
    lb["bnd"] = lb.is_four | lb.is_six

    def league(mask):
        x = lb[mask]
        legal = x.legal.sum()
        return {"balls": int(len(x)), "rpo": round(6 * x.tot.sum() / max(legal, 1), 2),
                "wkt_pct": round(100 * x.wkt.sum() / max(legal, 1), 2),
                "dot_pct": round(100 * x.dotb.sum() / max(legal, 1), 1),
                "bnd_pct": round(100 * x.bnd.sum() / max(legal, 1), 1),
                "extras_pct": round(100 * (x.is_wide | x.is_nb).mean(), 2),
                "li": round(float(x.li.mean()), 2)}

    contrast = {"pressure": league(lb.pressure), "normal": league(~lb.pressure)}
    by_phase = []
    for inn in (1, 2):
        for ph in ["Powerplay", "Middle", "Death"]:
            msk = (lb.innings == inn) & (lb.phase == ph)
            by_phase.append({"innings": inn, "phase": ph, "balls": int(msk.sum()),
                             "pressure_share": round(100 * lb[msk].pressure.mean(), 1),
                             "li": round(float(lb[msk].li.mean()), 2)})
    by_over = (lb.groupby(["innings", "over"]).agg(li=("li", "mean"), share=("pressure", "mean"))
               .reset_index())
    by_over = [{"innings": int(r.innings), "over": int(r.over), "li": round(float(r.li), 3),
                "share": round(100 * float(r.share), 1)} for r in by_over.itertuples()]
    by_wkts = (lb.groupby(["innings", "wkts_before"]).agg(li=("li", "mean"), n=("li", "size"))
               .reset_index())
    by_wkts = [{"innings": int(r.innings), "wkts": int(r.wkts_before), "li": round(float(r.li), 3),
                "n": int(r.n)} for r in by_wkts.itertuples()]
    li_hist = np.histogram(np.clip(lb.li, 0, 6), bins=60, range=(0, 6))
    hist = [{"x": round(float(li_hist[1][i]), 2), "n": int(li_hist[0][i]),
             "p": int(lb[(lb.li >= li_hist[1][i]) & (lb.li < li_hist[1][i + 1])].pressure.mean() > 0.5)
             if li_hist[0][i] else 0} for i in range(60)]

    # chase pressure grid: overs left x runs needed x wickets in hand
    grid = []
    for wk in range(1, 11):
        for ov in range(1, 21):
            bl = ov * 6
            need = np.arange(2, 252, 6, dtype=float)
            n = len(need)
            base = wp_eval(models, 2, need, np.full(n, bl, float), np.full(n, wk, float), 1.0, 2025.0)
            swing = np.zeros(n)
            for name, r, ball, w in OUTCOMES:
                p = float(outcome_probs.loc["Death" if ov <= 5 else ("Middle" if ov <= 14 else "Powerplay"), name])
                wp_o = wp_eval(models, 2, need - r, np.full(n, bl - ball, float),
                               np.full(n, wk - w, float), 1.0, 2025.0)
                swing += p * np.abs(wp_o - base)
            li = swing / b.exp_swing.mean()
            for i in range(n):
                grid.append([wk, ov, int(need[i]), round(float(base[i]), 3), round(float(li[i]), 2)])

    # example high-pressure moments
    top_moments = (lb[lb.innings == 2].sort_values("li", ascending=False)
                   .drop_duplicates("match_id").head(12))
    moments = [{"match": f"{r.team_name} v {r.opp_name}", "comp": r.comp_name, "date": r.match_date,
                "over": f"{int(r.overid) - 1}.{int(r.over_ball_num)}",
                "state": f"{int(r.runs_needed)} needed off {int(r.balls_left)}, {int(r.wkts_in_hand)} wkts in hand",
                "striker": r.striker_name, "bowler": r.bowler_name, "li": round(float(r.li), 2),
                "wp": round(float(r.wp_before), 2), "result": r.result} for r in top_moments.itertuples()]

    summary = {
        "n_balls": int(len(b)), "n_matches": int(b.match_id.nunique()),
        "n_ipl_matches": int(b[b.is_ipl == 1].match_id.nunique()),
        "n_t20i_matches": int(b[b.comp_tier.str.startswith("T20I")].match_id.nunique()),
        "n_emerging_matches": int(b[b.comp_tier == "Emerging"].match_id.nunique()),
        "seasons": sorted(int(x) for x in b.season_yr.unique()),
        "pressure_threshold": round(float(thr), 3), "pressure_pctl": PRESSURE_PCTL,
        "knockout_mult": KNOCKOUT_MULT, "season_weights": SEASON_WEIGHT,
        "comp_weights": {"IPL": 1.0, "T20I Full": 1.0, "T20I Assoc": 0.75, "Emerging": 0.6},
        "weights": DEFAULT_WEIGHTS, "wp_model": wp_metrics,
        "contrast": contrast, "by_phase": by_phase, "by_over": by_over, "by_wkts": by_wkts,
        "li_hist": hist, "moments": moments,
        "outcome_probs": {ph: {k2: round(float(v), 4) for k2, v in row.items()}
                          for ph, row in outcome_probs.iterrows()},
        "re_ipl": [[round(float(x), 1) for x in re[(1, 2025)][bl]] for bl in range(0, 121, 6)],
        "re_t20i": [[round(float(x), 1) for x in re[(0, 2025)][bl]] for bl in range(0, 121, 6)],
    }
    (OUT / "summary.json").write_text(json.dumps(summary, separators=(",", ":")))
    (OUT / "batters.json").write_text(json.dumps(results["bat"], separators=(",", ":"), default=str))
    (OUT / "bowlers.json").write_text(json.dumps(results["bowl"], separators=(",", ":"), default=str))
    (OUT / "chase_grid.json").write_text(json.dumps(
        {"cols": ["wkts", "overs_left", "need", "wp", "li"], "rows": grid}, separators=(",", ":")))
    for role in ("bat", "bowl"):
        top = results[role]["players"][:15]
        log(f"\nTOP {role}:")
        for p in top:
            log(f"{p['rank']:>2} {p['name']:<24} score={p['score']:.2f} P={p['p_rv100']:+.1f} "
                f"N={p['n_rv100']:+.1f} d={p['delta100']:+.1f} wpa={p['wpa100']:.2f} "
                f"cons={p['cons']:.2f} balls={p['p_balls']} top10={p['boot']['p_top10']}")
    log("done")


if __name__ == "__main__":
    main()
