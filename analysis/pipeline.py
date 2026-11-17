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
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "Data Pack"
OUT = ROOT / "web" / "data"
POOL = ROOT / "analysis" / "auction_pool.json"
IPL_2026 = 3298  # comp_id of IPL 2026, the squads the 2027 retentions are made from
OUT.mkdir(parents=True, exist_ok=True)

RNG = np.random.default_rng(27)

# ---------------------------------------------------------------- config
PRESSURE_PCTL = 0.80          # top 20% of Pressure Index = "high pressure" delivery
KNOCKOUT_MULT = 1.20          # knockout / playoff stakes multiplier
RACE_MULT = 1.10              # late IPL league game involving a team still in the playoff race
FULL_MEMBERS = {
    "India", "Pakistan", "Australia", "England", "New Zealand", "South Africa",
    "West Indies", "Sri Lanka", "Bangladesh", "Afghanistan", "Ireland", "Zimbabwe",
}
SEASON_WEIGHT = {2022: 0.60, 2023: 0.70, 2024: 0.80, 2025: 0.90, 2026: 1.00}
MIN_PRESSURE_BALLS_BAT = 120  # eligibility (raw balls faced under pressure)
MIN_PRESSURE_BALLS_BOWL = 120
MIN_PRESSURE_MATCHES = 8
# Wider pool exported to the dashboard so viewers can lower the bar themselves.
# Shrinkage already pulls small samples toward the player's own baseline.
EXPORT_MIN_BALLS = 30     # lowest bar offered by the ranking sliders
EXPORT_MIN_MATCHES = 3
PROFILE_MIN_BALLS = 1     # every player with any pressure ball gets a profile page
# Inside the pressure set, a ball counts in proportion to its stakes: one at 10x a typical ball
# matters more than one just over the line. Weight = stakes / average pressure-ball stakes,
# capped at 1.5: higher caps made ratings less repeatable between odd and even matches
# (bowlers' split-half fell from 0.16 to 0.07 at a cap of 3), so big moments count more, not most.
STAKES_CAP = 1.5
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
    m["is_race"] = playoff_race(m)
    m["stage_mult"] = np.where(m.is_knockout == 1, KNOCKOUT_MULT, np.where(m.is_race == 1, RACE_MULT, 1.0))
    return b, m, mp


def playoff_race(m: pd.DataFrame) -> np.ndarray:
    """IPL league games among a team's last five, when that team finished within one
    win (2 points) of the fourth playoff place: a game with qualification on the line. The data has
    no live table, so the final table stands in for 'still in the race at the time'."""
    race = pd.Series(0, index=m.index)
    for _, g in m[(m.is_ipl == 1) & (m.stage == "League")].groupby("comp_id"):
        pts: dict = {}
        for r in g.itertuples():
            for t in (r.home_team_id, r.away_team_id):
                pts.setdefault(t, 0)
            if pd.isna(r.win_team_id):
                pts[r.home_team_id] += 1
                pts[r.away_team_id] += 1
            else:
                pts[int(r.win_team_id)] = pts.get(int(r.win_team_id), 0) + 2
        if len(pts) < 5:
            continue
        p4 = sorted(pts.values(), reverse=True)[3]
        alive = {t for t, v in pts.items() if abs(v - p4) <= 2}
        g = g.sort_values(["match_date", "match_number"])
        played: dict = {}
        for idx, r in g.iterrows():
            late = False
            for t in (r.home_team_id, r.away_team_id):
                played[t] = played.get(t, 0) + 1
                late |= t in alive and played[t] > 9  # the last five games of the league stage
            race[idx] = int(late)
    return race.to_numpy()


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

    inn_tot = b.groupby(["match_id", "innings"]).tot.sum().unstack()
    b = b.merge(
        m[["match_id", "season_yr", "is_ipl", "comp_tier", "comp_weight", "is_knockout", "is_race", "stage_mult",
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
    return b


# ---------------------------------------------------------------- WP model
# Smooth logistic WP built on run-expectancy "resources" (Duckworth-Lewis-like):
# chase -> log(runs needed / runs the side can still expect to make);
# 1st innings -> log(projected total / par total).  Being smooth in runs and balls
# matters: leverage is a derivative of WP, and tree models give step-function WP.
SEASONS = sorted(SEASON_WEIGHT)


def _rrr(runs_needed, balls_left):
    return np.clip(runs_needed / np.maximum(balls_left, 1) * 6, -6, 36)


class WPModel:
    def __init__(self, re: dict, par: dict):
        self.re = np.stack([np.stack([re[(ipl, yr)] for yr in SEASONS]) for ipl in (0, 1)])
        self.par = np.array([[par[(ipl, yr)] for yr in SEASONS] for ipl in (0, 1)])
        self.coef = {}

    def _lookup(self, is_ipl, yr, bl, wk_in_hand):
        i = is_ipl.astype(int)
        j = np.clip(yr.astype(int) - SEASONS[0], 0, len(SEASONS) - 1)
        return self.re[i, j, np.clip(bl, 0, 120).astype(int), np.clip(10 - wk_in_hand, 0, 10).astype(int)]

    def features(self, inn, x, bl, wk, is_ipl, yr):
        res = self._lookup(is_ipl, yr, bl, wk)
        t = bl / 120.0
        if inn == 2:
            ratio = np.log((np.maximum(x, 0) + 2) / (res + 2))
            return np.column_stack([ratio, ratio * t, ratio ** 2, t, wk / 10, _rrr(x, bl) / 36, is_ipl])
        par = self.par[is_ipl.astype(int), np.clip(yr.astype(int) - SEASONS[0], 0, len(SEASONS) - 1)]
        d = np.log((x + res + 1) / par)
        return np.column_stack([d, d * t, d ** 2, t, wk / 10, is_ipl])

    def fit(self, inn, X, y):
        from sklearn.linear_model import LogisticRegression
        self.coef[inn] = LogisticRegression(C=1.0, max_iter=2000).fit(X, y)
        return self

    def predict(self, inn, X):
        return self.coef[inn].predict_proba(X)[:, 1]


# ---------------------------------------------------------------- end of a chase
# The logistic WP is smooth, which is what leverage needs, but it is far too pessimistic in
# the last over of a chase: it gave 4 off the last ball a 9% chance when one boundary wins it.
# In the final over the game is short enough to calculate exactly: from how often each
# outcome happens in the last two overs of a chase (by competition, runs needed per ball and
# wickets in hand), work backwards ball by ball to the chance of getting home.
ENDGAME_BALLS = 6                 # use the exact calculation for the final over
ENDGAME_FIT_BALLS = 12            # outcome frequencies come from the last two overs
ENDGAME_NMAX = 60                 # more than 60 needed off an over cannot be chased
EG_OUT = ["0", "1", "2", "3", "4", "6", "W", "X"]   # X = wide or no-ball: a run, ball bowled again
EG_RUNS = [0, 1, 2, 3, 4, 6]
EG_NEED = [1.5, 3.0]              # runs needed per ball: under 1.5, 1.5 to 3, 3 or more
EG_WKTS = [2, 4, 6]               # wickets in hand: 1, 2-3, 4-5, 6 or more
EG_PRIOR = 150                    # small cells lean on the competition-wide mix


def _eg_label(d: pd.DataFrame) -> np.ndarray:
    lab = np.where(d.is_wide | d.is_nb, "X", np.where(d.wkt == 1, "W", np.clip(d.tot, 0, 6).astype(int).astype(str)))
    return np.where(lab == "5", "4", lab)


class EndgameWP:
    """Exact chase win probability for the final over, by backward recursion."""

    def fit(self, b: pd.DataFrame):
        c = b[(b.innings == 2) & (b.balls_left <= ENDGAME_FIT_BALLS) & (b.runs_needed > 0)]
        lab = pd.Series(_eg_label(c), index=c.index)
        nb = np.searchsorted(EG_NEED, (c.runs_needed / c.balls_left).to_numpy(), side="right")
        wb = np.searchsorted(EG_WKTS, c.wkts_in_hand.to_numpy(), side="right")
        self.dist = np.zeros((2, len(EG_NEED) + 1, len(EG_WKTS) + 1, len(EG_OUT)))
        for g in (0, 1):
            m = (c.is_ipl == g).to_numpy()
            pooled = lab[m].value_counts(normalize=True).reindex(EG_OUT, fill_value=0).to_numpy()
            for i in range(len(EG_NEED) + 1):
                for j in range(len(EG_WKTS) + 1):
                    cnt = lab[m & (nb == i) & (wb == j)].value_counts().reindex(EG_OUT, fill_value=0).to_numpy()
                    self.dist[g, i, j] = (cnt + EG_PRIOR * pooled) / (cnt.sum() + EG_PRIOR)
        self.table = np.zeros((2, ENDGAME_NMAX + 1, ENDGAME_BALLS + 1, 11))
        for g in (0, 1):
            T = self.table[g]

            def v(n, bl, w):
                if n <= 0:
                    return 1.0
                if bl == 0 or w == 0:
                    return 0.5 if n == 1 else 0.0  # scores level: a super over, a coin flip
                return 0.0 if n > ENDGAME_NMAX else T[n, bl, w]

            for bl in range(1, ENDGAME_BALLS + 1):
                for w in range(1, 11):
                    for n in range(1, ENDGAME_NMAX + 1):  # ascending, so a wide's state is ready
                        p = self.dist[g, np.searchsorted(EG_NEED, n / bl, side="right"),
                                      np.searchsorted(EG_WKTS, w, side="right")]
                        T[n, bl, w] = (sum(p[i] * v(n - r, bl - 1, w) for i, r in enumerate(EG_RUNS))
                                       + p[6] * v(n, bl - 1, w - 1) + p[7] * v(n - 1, bl, w))
        return self

    def predict(self, need, balls_left, wkts_in_hand, is_ipl):
        n = np.asarray(need, float).astype(int)
        out = self.table[np.asarray(is_ipl, float).astype(int), np.clip(n, 0, ENDGAME_NMAX),
                         np.clip(np.asarray(balls_left, float).astype(int), 0, ENDGAME_BALLS),
                         np.clip(np.asarray(wkts_in_hand, float).astype(int), 0, 10)]
        return np.where(n > ENDGAME_NMAX, 0.0, out)


def endgame_evidence(b: pd.DataFrame, model) -> dict:
    """How the smooth model and the exact final-over model compare with what actually happened."""
    d = b[(b.innings == 2) & (b.balls_left <= ENDGAME_BALLS) & (b.runs_needed > 0) & b.bat_won.notna()
          & b.result.str.contains("won", case=False, na=False)]
    X = model.features(2, d.runs_needed.to_numpy(float), d.balls_left.to_numpy(float), d.wkts_in_hand.to_numpy(float),
                       d.is_ipl.to_numpy(float), d.season_yr.to_numpy(float))
    old = model.predict(2, X)
    new = model.endgame.predict(d.runs_needed, d.balls_left, d.wkts_in_hand, d.is_ipl)
    y = d.bat_won.to_numpy(float)
    groups = [
        ("Last ball, 2 or 3 needed", (d.balls_left == 1) & d.runs_needed.between(2, 3)),
        ("Last ball, a boundary needed (4 to 6)", (d.balls_left == 1) & d.runs_needed.between(4, 6)),
        ("Last 2 balls, 7 to 12 needed", (d.balls_left == 2) & d.runs_needed.between(7, 12)),
        ("Last 3 balls, 7 to 12 needed", (d.balls_left == 3) & d.runs_needed.between(7, 12)),
        ("Last over, 6 to 10 needed", (d.balls_left == 6) & d.runs_needed.between(6, 10)),
        ("Last over, 11 to 16 needed", (d.balls_left == 6) & d.runs_needed.between(11, 16)),
    ]
    rows = []
    for label, mask in groups:
        m = mask.to_numpy()
        first = ~d[m].duplicated("match_id").to_numpy()  # one state per match
        idx = np.flatnonzero(m)[first]
        rows.append({"situation": label, "n": int(len(idx)), "actual": round(float(y[idx].mean()), 3),
                     "old": round(float(old[idx].mean()), 3), "new": round(float(new[idx].mean()), 3)})
    brier = lambda p: round(float(((p - y) ** 2).mean()), 4)
    return {"balls": int(len(d)), "brier_old": brier(old), "brier_new": brier(new), "rows": rows}


def fit_wp(b: pd.DataFrame, re: dict):
    from sklearn.linear_model import LogisticRegression
    full1 = b[(b.innings == 1) & (b.max_balls == 120)]
    tot1 = full1.groupby("match_id").agg(t=("tot", "sum"), ipl=("is_ipl", "first"), yr=("season_yr", "first"))
    par = {(ipl, yr): float(tot1[(tot1.ipl == ipl) & (tot1.yr == yr)].t.mean()) for ipl in (0, 1) for yr in SEASONS}
    model = WPModel(re, par)
    train = b[b.bat_won.notna() & b.result.str.contains("won", case=False, na=False)]
    metrics = {}
    for inn in (1, 2):
        d = train[train.innings == inn]
        X = model.features(inn, (d.runs_before if inn == 1 else d.runs_needed).to_numpy(float),
                           d.balls_left.to_numpy(float), d.wkts_in_hand.to_numpy(float),
                           d.is_ipl.to_numpy(float), d.season_yr.to_numpy(float))
        y, grp = d.bat_won.to_numpy(int), d.match_id.to_numpy()
        oof = np.zeros(len(y))
        for tr, te in GroupKFold(n_splits=5).split(X, y, grp):
            oof[te] = LogisticRegression(C=1.0, max_iter=2000).fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
        metrics[inn] = {
            "auc": round(roc_auc_score(y, oof), 3),
            "brier": round(brier_score_loss(y, oof), 4),
            "logloss": round(log_loss(y, oof), 4),
            "n_balls": int(len(y)),
            "n_matches": int(d.match_id.nunique()),
        }
        bins = np.clip((oof * 10).astype(int), 0, 9)
        metrics[inn]["calibration"] = [
            {"pred": round(float(oof[bins == k].mean()), 3),
             "actual": round(float(y[bins == k].mean()), 3), "n": int((bins == k).sum())}
            for k in range(10) if (bins == k).sum() > 0
        ]
        model.fit(inn, X, y)
        log(f"WP innings {inn}: auc={metrics[inn]['auc']} brier={metrics[inn]['brier']}")
    model.endgame = EndgameWP().fit(b)
    metrics["endgame"] = endgame_evidence(b, model)
    log("endgame:", metrics["endgame"])
    return model, metrics


def wp_eval(model, inn, runs_or_need, balls_left, wkts_in_hand, is_ipl, season_yr):
    """Vectorised WP for the batting side, handling terminal states."""
    runs_or_need = np.asarray(runs_or_need, float)
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
            X = model.features(2, runs_or_need[live], balls_left[live], wkts_in_hand[live],
                               is_ipl[live], season_yr[live])
            out[live] = model.predict(2, X)
            # final over: the exact calculation replaces the smooth model
            last = live & (balls_left <= ENDGAME_BALLS)
            if last.any() and getattr(model, "endgame", None) is not None:
                out[last] = model.endgame.predict(runs_or_need[last], balls_left[last], wkts_in_hand[last], is_ipl[last])
    else:
        done = (wkts_in_hand <= 0) | (balls_left <= 0)
        live = ~done
        if live.any():
            X = model.features(1, runs_or_need[live], balls_left[live], wkts_in_hand[live],
                               is_ipl[live], season_yr[live])
            out[live] = model.predict(1, X)
        if done.any():
            # first innings over: P(bat first wins) = 1 - P(chaser wins from start of chase)
            n = int(done.sum())
            X = model.features(2, runs_or_need[done] + 1, np.full(n, 120.0), np.full(n, 10.0),
                               is_ipl[done], season_yr[done])
            out[done] = 1 - model.predict(2, X)
    return out


OUTCOMES = [("0", 0, 1, 0), ("1", 1, 1, 0), ("2", 2, 1, 0), ("3", 3, 1, 0),
            ("4", 4, 1, 0), ("6", 6, 1, 0), ("W", 0, 1, 1), ("Wd", 1, 0, 0)]


def leverage(b: pd.DataFrame, models):
    """Expected |dWP| from the next delivery, over the empirical outcome mix per phase."""
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
    # Rain-shortened matches (fewer than 20 overs, or a revised target) are left out of pressure and
    # win impact: the model is built for 20-over games and cannot judge the stakes of a 5-over one.
    # Their runs still count towards each player's normal level.
    g = b.groupby("match_id")
    short = ((g.max_balls.transform("min") < 120) | g.revised_target.transform(lambda x: x.notna().any())).to_numpy()
    exp_swing = np.where(short, 0.0, exp_swing)
    b["wp_before"] = wp_now
    b["exp_swing"] = exp_swing
    b["li"] = exp_swing / exp_swing[~short].mean()
    b["short_match"] = short
    # realised WP after the ball (for WPA)
    nb = b.groupby(["match_id", "innings"]).wp_before.shift(-1)
    # end-of-innings fallback
    end_inn1 = wp_eval(models, 1, (b.runs_before + b.tot).to_numpy(float), np.zeros(len(b)),
                       np.zeros(len(b)), is_ipl, yr)
    # last ball of a chase: the actual result (covers rain-shortened DLS finishes), a coin flip for a tie
    left = b.runs_needed - b.tot
    end_inn2 = np.where(left <= 0, 1.0, np.where(left == 1, 0.5, b.bat_won.fillna(0.0)))
    # end of the first innings: the batting side's chance is the one the chase actually starts from
    # (this carries a rain-revised target and overs; the projection is only for abandoned matches)
    chase_start = b.match_id.map(1 - b[b.innings == 2].groupby("match_id").wp_before.first())
    end_inn1 = chase_start.fillna(pd.Series(end_inn1, index=b.index)).to_numpy()
    fallback = np.where(b.innings == 1, end_inn1, end_inn2)
    b["wp_after"] = nb.fillna(pd.Series(fallback, index=b.index))
    b["wpa_bat"] = np.where(b.short_match, 0.0, b.wp_after - b.wp_before)
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
            rate = reg.predict(X.astype(float)).reshape(121, 11)
            # trees give a stepped rate: smooth along balls-left (+-9 balls) so that
            # expected runs per ball changes gradually, then convert to runs
            kern = np.ones(19) / 19
            pad = np.pad(rate, ((9, 9), (0, 0)), mode="edge")
            rate = np.column_stack([np.convolve(pad[:, w], kern, mode="valid") for w in range(11)])
            g = rate * bl
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
         "c_prior": float((c.rvs > 0).mean()),
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
    d["wb"] = d.comp_weight * d.season_yr.map(SEASON_WEIGHT)  # recency and competition
    d["P"] = d.pressure.astype(int)
    # stakes (with match importance) against the average pressure ball. Knockout balls are all in the
    # pressure set but weighted by their own stakes like any other ball: a minimum weight was tested
    # and made bowlers' ratings less repeatable (split-half 0.16 to 0.13).
    stakes = np.clip(d.pi_raw / d.pi_raw[d.pressure].mean(), 0, STAKES_CAP)
    d["lw"] = np.where(d.pressure, stakes, 1.0)
    d["w"] = d.wb * d.lw  # ...and stakes, for pressure balls
    d["rvs"] = d.lw * d.rv  # stakes-weighted runs added (match charts, consistency)
    d["dotb"] = ((d.tot == 0) if role == "bowl" else (d.runs == 0)).astype(int)
    d["bnd"] = (d.is_four | d.is_six).astype(int)
    d["lg"] = d.legal.astype(int)
    # win probability already grows with the stakes, so WPA is not weighted by them again
    d["wrv"], d["wrv2"], d["wwpa"] = d.w * d.rv, d.w * d.rv ** 2, d.wb * d.wpa
    agg = d.groupby(["pid", "match_id", "P"]).agg(
        n=("rv", "size"), wn=("w", "sum"), wbn=("wb", "sum"), wrv=("wrv", "sum"), wrv2=("wrv2", "sum"),
        wwpa=("wwpa", "sum"), rv=("rv", "sum"), rvs=("rvs", "sum"), wpa=("wpa", "sum"), r=("r", "sum"),
        out=("out", "sum"), dotb=("dotb", "sum"), bnd=("bnd", "sum"), lg=("lg", "sum"),
        li=("li", "sum"),
    ).reset_index()
    return agg, d


def rate(pm: pd.DataFrame, role: str, k=None):
    """Compute rating table from player-match aggregates (also used in bootstrap).
    Optional column `mult` = how many times a match was drawn (bootstrap)."""
    pm = pm if "mult" in pm else pm.assign(mult=1)
    x = pm.copy()
    for col in ["n", "wn", "wbn", "wrv", "wrv2", "wwpa"]:
        x[col] = x[col] * x["mult"]
    x = x[x["mult"] > 0]
    P = x[x.P == 1].groupby("pid")
    N = x[x.P == 0].groupby("pid")
    p = P.agg(pn=("n", "sum"), pwn=("wn", "sum"), pwbn=("wbn", "sum"), pwrv=("wrv", "sum"), pwrv2=("wrv2", "sum"),
              pwwpa=("wwpa", "sum"), pmatches=("mult", "sum"))
    n = N.agg(nn=("n", "sum"), nwn=("wn", "sum"), nwrv=("wrv", "sum"), nwrv2=("wrv2", "sum"))
    # consistency: share of matches with >= 6 pressure balls where pressure RV > 0
    pmm = x[(x.P == 1) & (pm.loc[x.index, "n"] >= 6)]
    cons = pmm.assign(pos=(pmm.rvs > 0).astype(int) * pmm["mult"]).groupby("pid").agg(
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
    t["wpa100"] = t.pwwpa / np.maximum(t.pwbn, 1) * 100 * (t.pwbn / (t.pwbn + k["kp"]))
    t["cons"] = (t.c_pos + 8 * k["c_prior"]) / (t.c_n + 8)
    return t, k


def score(t: pd.DataFrame, eligible: pd.Index, weights=DEFAULT_WEIGHTS, excluded=frozenset()):
    """Standardise within the whole eligible pool, then rank.
    merit_rank ranks everyone; rank (the submitted list) skips players RR cannot sign
    (its own squad, and Pakistani players, who cannot enter the IPL auction)."""
    e = t.loc[t.index.intersection(eligible)].copy()
    comps = {"pressure": "p_rv", "impact": "wpa100", "delta": "delta", "consistency": "cons"}
    for name, col in comps.items():
        e[f"z_{name}"] = (e[col] - e[col].mean()) / e[col].std(ddof=0)
    e["score"] = sum(weights[n] * e[f"z_{n}"] for n in comps)
    e["merit_rank"] = e.score.rank(ascending=False, method="first").astype(int)
    ok = ~e.index.isin(list(excluded))
    e["rank"] = np.nan
    e.loc[ok, "rank"] = e.loc[ok, "score"].rank(ascending=False, method="first")
    return e


def bootstrap(pm: pd.DataFrame, role: str, eligible: pd.Index, k: dict, excluded=frozenset()):
    """Resample matches with replacement; re-rate; record each player's rank
    (submitted rank, or merit rank for players outside the submitted list)."""
    matches = pm.match_id.unique()
    codes = pd.Index(matches).get_indexer(pm.match_id)
    ranks = {pid: [] for pid in eligible}
    for i in range(N_BOOT):
        counts = np.bincount(RNG.integers(0, len(matches), len(matches)), minlength=len(matches))
        t, _ = rate(pm.assign(mult=counts[codes]), role, k)
        s = score(t, eligible, excluded=excluded)
        for pid in s.index:
            ranks[pid].append(s.at[pid, "merit_rank"] if pid in excluded else s.at[pid, "rank"])
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


def big_moments(dp: pd.DataFrame, role: str, k: int = 3) -> list:
    """A player's biggest pressure performances: the matches where their pressure balls moved
    their team's chance of winning most, with a plain headline for finishes and final-over defences."""
    g = dp[dp.P == 1]
    if g.empty:
        return []
    side = (lambda wp: wp) if role == "bat" else (lambda wp: 1 - wp)  # the player's team's chance
    best = g.groupby("match_id").wpa.sum().sort_values(ascending=False)
    out = []
    for mid, wpa in best.head(k).items():
        if wpa <= 0:
            break
        gm = g[g.match_id == mid].sort_values(["innings", "innings_ball_num"])
        first, last = gm.iloc[0], gm.iloc[-1]
        won = bool(last.bat_won == 1) if role == "bat" else bool(last.bat_won == 0)
        headline, wp_from = None, side(first.wp_before)
        fo = dp[(dp.match_id == mid) & (dp.innings == 2) & (dp.balls_left <= 6)].sort_values("innings_ball_num")
        if won and len(fo):
            need, left = int(fo.iloc[0].runs_needed), int(fo.iloc[0].balls_left)
            span_from = side(fo.iloc[0].wp_before)  # the chance when the headline situation began
            span = "the final over" if left == 6 else f"the last {left} balls"
            if role == "bat":
                headline = f"Needed {need} off {span} and made {int(fo.r.sum())} of them to win"
                wp_from = span_from
            elif need <= 15:  # only a tight defence is a headline; defending 40 is not clutch
                headline = f"Defended {need} in {span}" if left == 6 else f"Defended {need} off {span}"
                wp_from = span_from
        out.append({
            "id": int(mid), "date": str(first.match_date)[:10], "comp": first.comp_name,
            "opp": first.opp_name if role == "bat" else first.team_name,
            "balls": int(len(gm)), "r": int(gm.r.sum()), "out": int(gm.out.sum()), "wpa": round(float(wpa), 3),
            "wp_from": round(float(wp_from), 4), "wp_to": round(float(side(last.wp_after)), 3),
            "won": won, "headline": headline,
        })
    return out


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


def retained_ids(mp: pd.DataFrame, cfg: dict) -> tuple[dict, list, set]:
    """Retentions from auction_pool.json. `retained` maps each franchise that has announced to its list
    (names as written in the data, or player ids). Returns {player id: franchise}, the names not found,
    and the franchises that have announced. Names are matched to IPL 2026 squads first, so a namesake
    elsewhere in the data cannot be picked up by mistake."""
    raw = cfg.get("retained", {})
    if isinstance(raw, list):  # a single list with no franchise attached
        raw = {"": raw}
    key = mp.player_name.str.strip().str.lower()
    lookup = mp.assign(key=key).groupby("key").player_id.first()
    lookup26 = mp[mp.comp_id == IPL_2026].assign(key=key).groupby("key").player_id.first()
    ids, missing = {}, []
    for team, names in raw.items():
        for x in names:
            x = str(x).strip()
            k = x.lower()
            pid = int(x) if x.isdigit() else lookup26.get(k, lookup.get(k))
            if pid is None:
                missing.append(x)
            else:
                ids[int(pid)] = team or None
    return ids, missing, {t for t in raw if t}


def main():
    b, m, mp = load()
    log("loaded", b.shape)
    b = build_state(b, m)
    re = run_expectancy(b)
    models, wp_metrics = fit_wp(b, re)
    b, outcome_probs = leverage(b, models)
    # stakes x match importance (knockouts 1.2, late games in the playoff race 1.1)
    b["pi_raw"] = b.li * b.stage_mult
    # One cut-off for every ball: the top 20% by stakes. (Separate cut-offs for batting first and
    # chasing were tested and rejected: in a first innings they flagged 87% of over-one balls, because
    # the win chance sits near 50% early on, which is where any model is most sensitive.)
    # On top, every ball of a knockout counts: lose and you are out, so the occasion is the pressure,
    # whatever the scoreboard says. That is what credits a first-innings total built in a knockout.
    live = ~b.short_match
    thr = float(b[live].pi_raw.quantile(PRESSURE_PCTL))
    b["pressure"] = live & ((b.pi_raw >= thr) | (b.is_knockout == 1))
    b["pi"] = (b.pi_raw.rank(pct=True) * 100).round(1)
    log(f"pressure threshold {thr:.3f}; share {b.pressure.mean():.3f}; "
        f"by innings {b[live].groupby('innings').pressure.mean().round(3).to_dict()}")
    b = run_value(b, re)
    # cache ball-level output for downstream analyses (rr2026.py)
    cache = ROOT / "analysis" / "cache"
    cache.mkdir(exist_ok=True)
    keep = [c for c in b.columns if c not in ("delivery_ist_time", "stroke")]
    b[keep].to_parquet(cache / "balls.parquet", index=False)

    ipl_meta, intl_meta, bat_hand, bowl_type, pace = player_meta(mp, m, b)
    overrides = json.loads((ROOT / "analysis" / "nationality_overrides.json").read_text())["overrides"]
    pool_cfg = json.loads(POOL.read_text()) if POOL.exists() else {}
    retained, unmatched, announced = retained_ids(mp, pool_cfg)
    if unmatched:
        log("WARNING retained names not found in the data:", unmatched)
    log(f"retentions: {len(retained)} players from {sorted(announced)}")
    rr_squad = set(mp[(mp.comp_id == IPL_2026) & (mp.team_name == "Rajasthan Royals")].player_id)

    def exclusion(pid, name):
        """Why a player is left out of the submitted top 10, if they are."""
        if (overrides.get(name) or intl_meta.team_name.get(pid)) == "Pakistan":
            return "pakistan"  # cannot register for the IPL auction
        if pid in retained:  # on a franchise's announced list
            return "rr" if retained[pid] == "Rajasthan Royals" else "retained"
        if pid in rr_squad and "Rajasthan Royals" not in announced:
            return "rr"  # until RR announce, their whole 2026 squad is treated as kept
        return None

    results = {}
    for role in ("bat", "bowl"):
        pm, d = player_match_table(b, role)
        t, k = rate(pm, role)
        names = d.groupby("pid").pname.agg(lambda x: x.mode().iat[0])
        why = {pid: r for pid in t.index if (r := exclusion(pid, names.get(pid)))}
        excluded = frozenset(why)
        min_balls = MIN_PRESSURE_BALLS_BAT if role == "bat" else MIN_PRESSURE_BALLS_BOWL
        eligible = t[(t.pn >= min_balls) & (t.pmatches >= MIN_PRESSURE_MATCHES)].index
        s = score(t, eligible, excluded=excluded)
        log(f"{role}: k={k}, eligible={len(eligible)}")
        boot = bootstrap(pm, role, eligible, k, excluded)
        sh = split_half(pm, role, eligible, k)
        log(f"{role} split-half: {sh}")
        pool = t[t.pn >= PROFILE_MIN_BALLS].index
        s_all = score(t, pool)
        order = list(s.sort_values("score", ascending=False).index) + [
            pid for pid in s_all.sort_values("score", ascending=False).index if pid not in s.index]
        players = []
        for pid in order:
            row = t.loc[pid]
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
                  .agg(balls=("rv", "size"), rv=("rvs", "sum"), wpa=("wpa", "sum"), r=("r", "sum"),
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
                "id": int(pid), "name": names[pid],
                "rank": int(s.loc[pid, "rank"]) if pid in s.index and pd.notna(s.loc[pid, "rank"]) else None,
                "merit_rank": int(s.loc[pid, "merit_rank"]) if pid in s.index else None,
                "excluded": why.get(pid), "retained_by": retained.get(pid),
                "score": round(float(s.loc[pid, "score"]), 3) if pid in s.index else None,
                "country": intl_meta.team_name.get(pid) if pid in intl_meta.index else None,
                "ipl_team": ipl_team, "ipl_season": ipl_season,
                "hand": bat_hand.get(pid), "bowl_type": bowl_type.get(pid), "pace": pace.get(pid),
                "p_balls": int(row.pn), "p_matches": int(row.pmatches), "n_balls": int(row.nn),
                "p_rv100": round(100 * row.p_rv, 2), "n_rv100": round(100 * row.n_rv, 2),
                "delta100": round(100 * row.delta, 2), "wpa100": round(float(row.wpa100), 3),
                "cons": round(float(row.cons), 3),
                "boot": boot.get(pid), "press": press, "norm": norm,
                "seasons": seasons, "phases": phases, "matches": matches,
                "moments": big_moments(dp, role),
            })
        results[role] = {"players": players, "k": k, "split_half": sh,
                         "eligibility": {"min_pressure_balls": min_balls,
                                         "min_pressure_matches": MIN_PRESSURE_MATCHES,
                                         "n_eligible": int(len(eligible)),
                                         "n_ranked": int(s["rank"].notna().sum()),
                                         "export_min_balls": EXPORT_MIN_BALLS,
                                         "export_min_matches": EXPORT_MIN_MATCHES,
                                         "n_exported": int(len(pool)),
                                         "n_slider_pool": int(((t.pn >= EXPORT_MIN_BALLS) & (t.pmatches >= EXPORT_MIN_MATCHES)).sum()),
                                         "n_players": int(len(t))}}

    # ------------------------------------------------ league-level evidence
    lb = b[~b.short_match].copy()
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
    h = np.histogram(np.clip(lb.li, 0, 6), bins=60, range=(0, 6))
    hist = [{"x": round(float(h[1][i]), 2), "n": int(h[0][i]),
             "p": int(lb[(lb.li >= h[1][i]) & (lb.li < h[1][i + 1])].pressure.mean() > 0.5)
             if h[0][i] else 0} for i in range(60)]

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
        "seasons": sorted(int(x) for x in b.season_yr.unique()),
        "pressure_threshold": round(thr, 3), "pressure_pctl": PRESSURE_PCTL,
        "race_mult": RACE_MULT,
        "knockout_mult": KNOCKOUT_MULT, "season_weights": SEASON_WEIGHT,
        "comp_weights": {"IPL": 1.0, "T20I Full": 1.0, "T20I Assoc": 0.75, "Emerging": 0.6},
        "weights": DEFAULT_WEIGHTS, "wp_model": wp_metrics,
        "contrast": contrast, "by_phase": by_phase, "by_over": by_over,
        "li_hist": hist, "moments": moments,
    }
    (OUT / "summary.json").write_text(json.dumps(summary, separators=(",", ":")))
    (OUT / "batters.json").write_text(json.dumps(results["bat"], separators=(",", ":"), default=str))
    (OUT / "bowlers.json").write_text(json.dumps(results["bowl"], separators=(",", ":"), default=str))
    (OUT / "chase_grid.json").write_text(json.dumps(
        {"cols": ["wkts", "overs_left", "need", "wp", "li"], "rows": grid}, separators=(",", ":")))
    for role in ("bat", "bowl"):
        top = [p for p in results[role]["players"] if p["rank"]][:15]
        log(f"\nTOP {role}:")
        for p in top:
            log(f"{p['rank']:>2} {p['name']:<24} score={p['score']:.2f} P={p['p_rv100']:+.1f} "
                f"N={p['n_rv100']:+.1f} d={p['delta100']:+.1f} wpa={p['wpa100']:.2f} "
                f"cons={p['cons']:.2f} balls={p['p_balls']} top10={p['boot']['p_top10']}")
    log("done")


if __name__ == "__main__":
    main()
