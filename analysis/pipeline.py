"""
SupeRR Selector S2 - Pressure performance pipeline.

Reads the raw data pack, builds:
  1. Match state for every delivery (score, wickets, balls left, target; revised for rain).
  2. A win-probability (WP) model, worked out exactly ball by ball in the final over of a chase.
  3. Stakes: the expected swing in WP from the next ball, where 1.0 = a typical ball.
     Pressure ball = top 20% by stakes, or any ball of a knockout.
  4. Runs added per ball: runs against an average player from the same spot, wickets charged
     at the runs they cost from there; T20I balls also judged against the same host country and
     the same opponent that season (pitch and opposition strength).
  5. One rating per player: runs added per 100 pressure balls, leaning on the player's usual level
     until his pressure record is long enough (K = 200 balls). Lift = rating - usual level.
     Ranked if 50 pressure balls in 4 matches (20 in 2025-26; a third of that for Indian players),
     signable at the 2027 auction and not worse under pressure than usual. Checked by a forward test,
     split halves and a bootstrap.

Writes JSON consumed by the dashboard into web/data/.

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
PUBLIC = ROOT / "public_data" / "t20wc2026"   # 2026 T20 World Cup from Cricsheet (public data)
IPL_2026 = 3298  # comp_id of IPL 2026, the squads the 2027 retentions are made from
OUT.mkdir(parents=True, exist_ok=True)

RNG = np.random.default_rng(27)

# ---------------------------------------------------------------- config
# The whole method has four settings. Each was checked with a forward test (forward_check): ratings
# built from earlier seasons only, scored on how players actually did under pressure the next season.
PRESSURE_PCTL = 0.80          # 1. a pressure ball: top 20% of balls by stakes (plus every knockout ball)
K = 200                       # 2. a pressure record counts half at 200 balls; the rest is the usual level
SEASON_WEIGHT = {2022: 0.2, 2023: 0.4, 2024: 0.6, 2025: 0.8, 2026: 1.0}  # 3. each year back counts 20% less
MIN_PRESSURE_BALLS = 50       # 4. evidence to be ranked: 50 pressure balls in 4 matches, at least
MIN_PRESSURE_MATCHES = 4      #    20 of them in 2025-26 (still doing it now: a 2027 pick must have been
RECENT_FROM = 2025            #    seen under pressure recently, not on a ball or two). A short record is
MIN_RECENT_BALLS = 20         #    safe because the rating leans on the usual level until it grows.
# A knockout first innings is high stakes, but less than a chase: the other side still has to bat. Its balls
# are all pressure balls (so a big knockout total counts), but each counts half, in the rating and towards
# the evidence bars, so a record cannot rest on one or two playoff first innings. (Batting forward test
# 0.079 -> 0.084; bowling unchanged.)
KO_FIRST_INNINGS = 0.5
# Active in 2026: an auction buys 2027 form, so a recommended player must have played top-level cricket (IPL or a
# full-member T20I, the 2026 World Cup included) in 2026. The 2025-26 evidence bar alone is not enough: it can be
# met entirely in early 2025 (Mark Wood's last match was February 2025). Inactive players keep their rating and
# profile but are not recommended.
ACTIVE_SEASON = 2026
MATCH_MIN_BALLS = 6           # a match counts as a pressure appearance only with 6+ pressure balls (an over):
                              # a one-ball cameo is not a pressure innings or spell
# The brief asks who rises and who dips under pressure, so a player whose rating is below his usual
# level (lift < 0) is never recommended, however good his usual level is.
# Indian players need a third of the evidence (17 balls, 2 matches, 7 in 2025-26). (30 balls in 3 matches let a
# 36-ball, mostly-average record into a top 10, so the overseas bar is 50 in 4.) The data pack has no
# domestic cricket, so an Indian player's only top-level cricket here is the IPL, while an international
# adds T20Is: the same bar would hold Indians to a far longer wait for the same evidence. (A third rather
# than a half lets a current IPL batter with one season of pressure balls, such as Himmat Singh, be
# judged; lower still adds nobody above average.)
INDIAN_BAR = 1 / 3
# Priority places: RR's 2027 squad has room for few overseas players, so a signable Indian who is above
# average under pressure (rating > 0) and rises (lift >= 0) is guaranteed a top-10 place, up to 5 per
# list. The other places go on merit, and the ten are ordered by rating. Never a below-average Indian.
INDIAN_PLACES = 5
# Board release (NOC): the Bangladesh board often limits how long its players may play in the IPL, so
# at most one Bangladeshi player goes in each top 10 (the best-rated); the rest rank from 11 on.
MAX_BANGLADESH = 1
# Indian options beyond the top 10: signable Indians in an IPL 2026 squad (so current) who are either
# above average under pressure without dipping (60+ balls in all), or won a match under pressure in
# 2025-26 (+15 points of win chance or more in one game). A one-game hero's overall rating can still be
# below average, so these are options to weigh, not top-10 picks. (Youth cannot be judged: the data has
# no ages and no domestic cricket, and "first seen in the data" also catches returning veterans.)
SCOUT_MIN_BALLS = 60
BIG_GAME_WPA = 0.15
# Ratings use top-level cricket only: the IPL and T20Is between two full-member nations. Associate
# T20Is and A-team tournaments are left out rather than down-weighted (one rule, no fractions).
FULL_MEMBERS = {
    "India", "Pakistan", "Australia", "England", "New Zealand", "South Africa",
    "West Indies", "Sri Lanka", "Bangladesh", "Afghanistan", "Ireland", "Zimbabwe",
}
TOP_LEVEL = ("IPL", "T20I Full")
# Rain: matches cut below 10 overs a side are left out of pressure (a 5-over game is a different sport).
# Longer reduced games, like the 2023 IPL final (171 off 15 overs), are judged on their revised target.
MIN_MATCH_BALLS = 60
NEW_INDIAN_FROM = 2024   # for the retention finding: Indian players first seen in 2024 or later
# Emerging: under 26 at the start of IPL 2027 (born on or after 1 April 2001, the IPL Emerging Player age test),
# from public birth dates in birth_dates.json. A label, not a quota: the ranking never uses age, and emerging
# players clear the same bar and are rated on the same scale as everyone else.
BIRTH = json.loads((ROOT / "analysis" / "birth_dates.json").read_text(encoding="utf-8"))
PROFILE_MIN_BALLS = 0     # every top-level player gets a profile page, even with no pressure ball
N_BOOT = int(__import__('os').environ.get('N_BOOT', 400))


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- load
def load():
    b = pd.read_csv(DATA / "ball_by_ball.csv", low_memory=False)
    m = pd.read_csv(DATA / "matches.csv")
    c = pd.read_csv(DATA / "competitions.csv")
    mp = pd.read_csv(DATA / "competition_team_player_mapping.csv")
    # Public data added next to the data pack, in the same format: the 2026 T20 World Cup from Cricsheet
    # (built by analysis/public_wc2026.py; players matched to data pack ids ball by ball).
    if PUBLIC.exists():
        b = pd.concat([b, pd.read_csv(PUBLIC / "ball_by_ball.csv", low_memory=False)], ignore_index=True)
        m = pd.concat([m, pd.read_csv(PUBLIC / "matches.csv")], ignore_index=True)
        c = pd.concat([c, pd.read_csv(PUBLIC / "competitions.csv")], ignore_index=True)
        mp = pd.concat([mp, pd.read_csv(PUBLIC / "competition_team_player_mapping.csv")], ignore_index=True)
        log(f"public data added: {PUBLIC.name}, {pd.read_csv(PUBLIC / 'matches.csv').shape[0]} matches")
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
    m["top_level"] = m["comp_tier"].isin(TOP_LEVEL)
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

    inn_tot = b.groupby(["match_id", "innings"]).tot.sum().unstack()
    b = b.merge(
        m[["match_id", "season_yr", "is_ipl", "comp_tier", "top_level", "is_knockout", "venue_country",
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

    def features(self, inn, x, bl, wk, is_ipl, yr, mb=None):
        res = self._lookup(is_ipl, yr, bl, wk)
        t = bl / 120.0
        if inn == 2:
            ratio = np.log((np.maximum(x, 0) + 2) / (res + 2))
            return np.column_stack([ratio, ratio * t, ratio ** 2, t, wk / 10, _rrr(x, bl) / 36, is_ipl])
        par = self.par[is_ipl.astype(int), np.clip(yr.astype(int) - SEASONS[0], 0, len(SEASONS) - 1)]
        if mb is not None:  # a reduced-overs innings is measured against a par scaled to its length
            mb = np.broadcast_to(np.asarray(mb, float), np.shape(x))
            full = np.full(np.shape(x), 120.0)
            ten = np.full(np.shape(x), 10.0)
            par = par * self._lookup(is_ipl, yr, mb, ten) / self._lookup(is_ipl, yr, full, ten)
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
                           d.is_ipl.to_numpy(float), d.season_yr.to_numpy(float),
                           d.max_balls.to_numpy(float) if inn == 1 else None)
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


def wp_eval(model, inn, runs_or_need, balls_left, wkts_in_hand, is_ipl, season_yr, max_balls=120.0):
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
                               is_ipl[live], season_yr[live], max_balls[live])
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
    mb = b.max_balls.to_numpy(float)
    wp_now = np.where(
        b.innings == 1,
        wp_eval(models, 1, b.runs_before, b.balls_left, b.wkts_in_hand, is_ipl, yr, mb),
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
                wp_o = wp_eval(models, 1, d.runs_before.to_numpy(float) + r, bl, wk, is_ipl[idx], yr[idx], mb[idx])
            else:
                wp_o = wp_eval(models, 2, d.runs_needed.to_numpy(float) - r, bl, wk, is_ipl[idx], yr[idx])
            exp_swing[idx] += p * np.abs(wp_o - wp_now[idx])
    # Matches cut below 10 overs a side are left out of pressure and win impact: a 5-over slog is a
    # different game. Longer reduced matches are judged on their revised overs and target, so the
    # 2023 IPL final (CSK 171 off 15 overs, Jadeja 10 off the last 2 balls) counts like any other.
    # Runs in the very short games still count towards each player's normal level.
    g = b.groupby("match_id")
    short = (g.max_balls.transform("min") < MIN_MATCH_BALLS).to_numpy()
    exp_swing = np.where(short, 0.0, exp_swing)
    b["wp_before"] = wp_now
    b["exp_swing"] = exp_swing
    b["li"] = exp_swing / exp_swing[~short].mean()
    b["short_match"] = short
    # realised WP after the ball (for WPA)
    nb = b.groupby(["match_id", "innings"]).wp_before.shift(-1)
    # end-of-innings fallback
    end_inn1 = wp_eval(models, 1, (b.runs_before + b.tot).to_numpy(float), np.zeros(len(b)),
                       np.zeros(len(b)), is_ipl, yr, mb)
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
    # Fair contexts for T20Is, which are played in very different conditions and against very different
    # sides (the IPL is one league in one country, so it is left as it is). Each T20I ball is judged
    # against (1) T20Is in the same country that season: Mirpur goes at 7.8 an over, other T20Is at 8.7,
    # so a tight spell there is worth less; then (2) T20Is against the same opponent that season: runs
    # against a weak attack are worth less, because everyone scores them. The forward test: batting
    # prediction roughly doubled (0.03 to 0.07), bowling fell slightly (0.21 to 0.18), both within noise.
    t20 = (b.is_ipl == 0).to_numpy()
    yr = "_" + b.season_yr.astype(str)
    every = pd.Series(True, index=b.index)
    host = pd.Series(np.where(t20, b.venue_country.fillna("?"), "IPL"), index=b.index) + yr
    for col, mask, g in (("rv_bat", bat_mask, host), ("rv_bowl", every, host),
                         ("rv_bat", bat_mask, pd.Series(np.where(t20, b.opp_name, "IPL"), index=b.index) + yr),
                         ("rv_bowl", every, pd.Series(np.where(t20, b.team_name, "IPL"), index=b.index) + yr)):
        b[col] = b[col] - g.map(b[mask].groupby(g[mask])[col].mean())
    # par: runs an average batter makes (or an average bowler concedes) on this ball, wickets aside.
    # Expected runs for the spot, recentred per competition and season like runs added. Shown beside raw
    # strike rates and economies, which differ between pressure and other balls because situations differ.
    exp = np.where(b.legal, ball_cost, 0)
    b["par_bat"] = exp + grp.map((b.runs - exp)[bat_mask].groupby(grp[bat_mask]).mean())
    b["par_bowl"] = exp + grp.map((b.bowler_runs - exp).groupby(grp).mean())
    return b


# ---------------------------------------------------------------- ratings
# One rating per player, in one sentence: runs added per 100 pressure balls, where a player is assumed
# to play as he normally does until his pressure record says otherwise.
#     normal = sum(weight x runs added on other balls) / (sum(weight) + K)
#     rating = (sum(weight x runs added on pressure balls) + K x normal) / (sum(weight) + K)
# weight = how recent the ball is (2026 = 1.0, each year back 20% less). With K = 200, a player's own
# pressure record counts half once he has 200 (recency-weighted) pressure balls, and more after that.
# lift = rating - normal: does he rise (+) or dip (-) when it matters?
# Win impact, consistency and recent form are shown as evidence beside the rating; the forward test
# found that blending them in made next-season predictions worse, not better.


def player_match_table(b: pd.DataFrame, role: str):
    """Top-level balls for one role, and their totals per player, match and pressure flag."""
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
    d["w"] = d.season_yr.map(SEASON_WEIGHT)
    d["P"] = d.pressure.astype(int)
    d["R"] = (d.season_yr >= RECENT_FROM).astype(int)
    d["dotb"] = ((d.tot == 0) if role == "bowl" else (d.runs == 0)).astype(int)
    d["bnd"] = (d.is_four | d.is_six).astype(int)
    d["lg"] = d.legal.astype(int)
    # knockout first-innings pressure balls count half (weight and evidence); everything else counts once
    ko1 = ((d.is_knockout == 1) & (d.innings == 1) & (d.P == 1)).to_numpy()
    d["w"] = d.w * np.where(ko1, KO_FIRST_INNINGS, 1.0)
    d["cnt"] = np.where(ko1, KO_FIRST_INNINGS, 1.0)
    d["wrv"] = d.w * d.rv
    agg = d.groupby(["pid", "match_id", "P", "R"]).agg(
        n=("rv", "size"), ne=("cnt", "sum"), w=("w", "sum"), wrv=("wrv", "sum"), rv=("rv", "sum"), wpa=("wpa", "sum"),
        r=("r", "sum"), out=("out", "sum"), li=("li", "sum"),
    ).reset_index()
    return agg, d


def rate(pm: pd.DataFrame) -> pd.DataFrame:
    """Rating table from player-match totals. Optional column `mult` = how many times a match was
    drawn (bootstrap)."""
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
    r = x[(x.P == 1) & (x.R == 1)].groupby("pid").agg(rn=("n", "sum"), rne=("ne", "sum"), rw=("w", "sum"), rwrv=("wrv", "sum"),
                                                      rmatches=("mult", "sum"))
    # consistency: pressure innings or spells of 6+ balls in which the player beat the average
    inn = x[(x.P == 1) & (single_n >= MATCH_MIN_BALLS)]
    c = inn.assign(pos=(inn.rv > 0) * inn["mult"]).groupby("pid").agg(c_n=("mult", "sum"), c_pos=("pos", "sum"))
    # outer: players with no pressure ball stay in (rating = usual level), so every player has a profile
    t = p.join(n, how="outer").join(r, how="left").join(c, how="left").fillna(0)
    # pressure matches = matches with 6+ pressure balls; a one-ball cameo does not count as an appearance
    t["pmatches"] = inn.groupby("pid")["mult"].sum().reindex(t.index).fillna(0)
    t["rmatches"] = inn[inn.R == 1].groupby("pid")["mult"].sum().reindex(t.index).fillna(0)
    t["normal"] = t.nwrv / (t.nw + K)          # usual level: the other balls, pulled towards average
    t["share"] = t.pw / (t.pw + K)             # how much of the rating is the player's own pressure record
    t["rating"] = (t.pwrv + K * t.normal) / (t.pw + K)  # the one number the ranking uses
    t["lift"] = t.rating - t.normal            # rises (+) or dips (-) under pressure
    t["recent"] = t.rwrv / (t.rw + K)          # the rating for 2025-26 alone
    t["wpa100"] = t.pwpa / np.maximum(t.pn, 1) * 100  # win chance added per 100 pressure balls
    t["cons"] = np.where(t.c_n > 0, t.c_pos / np.maximum(t.c_n, 1), np.nan)
    return t


def eligible_mask(t: pd.DataFrame, indian: pd.Series | None = None) -> pd.Series:
    f = np.where(indian.reindex(t.index, fill_value=False), INDIAN_BAR, 1.0) if indian is not None else 1.0
    # evidence counted with knockout first-innings balls at half
    return ((t.pne >= np.ceil(MIN_PRESSURE_BALLS * f - 1e-9)) & (t.pmatches >= np.ceil(MIN_PRESSURE_MATCHES * f - 1e-9))
            & (t.rne >= np.ceil(MIN_RECENT_BALLS * f - 1e-9)))


def score(t: pd.DataFrame, eligible: pd.Index, excluded=frozenset(), nat: pd.Series | None = None):
    """Rank by the rating. merit_rank ranks everyone who qualifies; rank (the submitted list) skips
    players who cannot be bought at the 2027 auction or who dip under pressure. With `nat`, the top 10
    first gives a place to each Indian who is above average (up to INDIAN_PLACES), then fills on merit
    with at most MAX_BANGLADESH Bangladeshi players; the ten are then ordered by rating."""
    e = t.loc[t.index.intersection(eligible)].copy()
    e["score"] = e.rating
    e["merit_rank"] = e.score.rank(ascending=False, method="first").astype(int)
    cand = list(e[~e.index.isin(list(excluded))].sort_values("score", ascending=False).index)
    if nat is not None:
        n = nat.reindex(cand)
        top = [pid for pid in cand if n[pid] == "India" and e.at[pid, "score"] > 0][:INDIAN_PLACES]
        bd = 0
        for pid in cand:
            if len(top) >= 10:
                break
            if pid in top:
                continue
            if n[pid] == "Bangladesh":
                if bd >= MAX_BANGLADESH:
                    continue
                bd += 1
            top.append(pid)
        top.sort(key=lambda pid: -e.at[pid, "score"])
        cand = top + [pid for pid in cand if pid not in top]
    e["rank"] = np.nan
    e.loc[list(cand), "rank"] = np.arange(1, len(cand) + 1)
    return e


def bootstrap(pm: pd.DataFrame, eligible: pd.Index, excluded=frozenset(), nat: pd.Series | None = None):
    """Resample matches with replacement, re-rate and record each player's rank (submitted rank, or
    merit rank for players outside the submitted list)."""
    matches = pm.match_id.unique()
    codes = pd.Index(matches).get_indexer(pm.match_id)
    ranks = {pid: [] for pid in eligible}
    for i in range(N_BOOT):
        counts = np.bincount(RNG.integers(0, len(matches), len(matches)), minlength=len(matches))
        s = score(rate(pm.assign(mult=counts[codes])), eligible, excluded=excluded, nat=nat)
        for pid in s.index:
            ranks[pid].append(s.at[pid, "merit_rank"] if pid in excluded else s.at[pid, "rank"])
        if i % 100 == 0:
            log(f"  bootstrap {i}/{N_BOOT}")
    out = {}
    for pid, rs in ranks.items():
        rs = np.array(rs) if rs else np.array([999])
        out[pid] = {"p_top10": round(float((rs <= 10).mean()), 3), "rank_med": int(np.median(rs)),
                    "rank_lo": int(np.percentile(rs, 5)), "rank_hi": int(np.percentile(rs, 95))}
    return out


def split_half(pm: pd.DataFrame, eligible: pd.Index):
    """Same measures on odd and even matches: how far does each repeat?"""
    j = rate(pm[pm.match_id % 2 == 1]).join(rate(pm[pm.match_id % 2 == 0]), lsuffix="_o", rsuffix="_e", how="inner")
    j = j.loc[j.index.intersection(eligible)]
    return {col: round(float(j[[f"{col}_o", f"{col}_e"]].dropna().corr().iloc[0, 1]), 3)
            for col in ["rating", "normal", "lift", "wpa100", "cons"]}


def forward_check(b: pd.DataFrame, role: str) -> dict:
    """The test every choice was made on: build ratings from earlier seasons only (2022-24, then
    2022-25), and see how well they predict each player's runs added per pressure ball in the next
    season (2025, then 2026). Reported as a correlation pooled over both years (0 = no better than
    guessing). The alternatives show why the rating is pressure output alone."""
    global SEASON_WEIGHT
    keep = dict(SEASON_WEIGHT)
    rows = []
    try:
        for test in (2025, 2026):
            SEASON_WEIGHT = {y: round(1 - 0.2 * (test - 1 - y), 1) for y in range(2022, test)}
            pm, _ = player_match_table(b[b.season_yr < test], role)
            t = rate(pm)
            t = t[t.pn >= 25]
            SEASON_WEIGHT = {test: 1.0}
            _, d = player_match_table(b[b.season_yr == test], role)
            actual = d[d.P == 1].groupby("pid").rv.agg(["size", "mean"])
            actual = actual[actual["size"] >= 24]
            j = t.join(actual, how="inner")
            j["year"] = test
            rows.append(j)
    finally:
        SEASON_WEIGHT = keep
    j = pd.concat(rows)

    def corr(col):
        z = j.groupby("year")[col].transform(lambda s: (s - s.mean()) / s.std())  # compare within a year
        y, w = j["mean"], j["size"]
        mz, my = np.average(z, weights=w), np.average(y, weights=w)
        cov = np.average((z - mz) * (y - my), weights=w)
        return round(float(cov / np.sqrt(np.average((z - mz) ** 2, weights=w) * np.average((y - my) ** 2, weights=w))), 3)

    return {"n": int(len(j)), "rating": corr("rating"), "normal": corr("normal"), "lift": corr("lift"),
            "wpa100": corr("wpa100")}


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
    # par: what an average player would have scored (or conceded) on exactly these balls, before wickets.
    # Raw rates differ between pressure and normal balls because the situations differ; par shows by how much.
    if role == "bat":
        par = x.par.sum()
        res["sr"] = round(100 * runs / max(balls, 1), 1)
        res["par_sr"] = round(100 * par / max(balls, 1), 1) if len(x) else None
        res["avg"] = round(runs / outs, 1) if outs else None
    else:
        par = x.par.sum()
        res["econ"] = round(6 * runs / max(balls, 1), 2)
        res["par_econ"] = round(6 * par / max(balls, 1), 2) if len(x) else None
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
    # players seen only for an A side (emerging tournaments) take that country: Bangladesh A -> Bangladesh.
    # This also keeps uncapped Pakistan A players out of the picks.
    a_side = mp[(mp.is_ipl == 0) & mp.team_name.str.endswith(" A")].sort_values("season_yr").groupby("player_id").last()
    a_side["team_name"] = a_side.team_name.str[:-2]
    intl = pd.concat([intl, a_side.loc[~a_side.index.isin(intl.index)]])
    # most common value; players new in the public data may have none recorded
    mode = lambda s: s.mode().iat[0] if s.notna().any() else None
    bat_hand = b.groupby("striker_id").batting_type.agg(mode)
    bowl_type = b.groupby("bowler_id").bowling_type.agg(mode)
    pace = b.groupby("bowler_id").pace_or_spin.agg(mode)
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


def retired_ids(mp: pd.DataFrame, cfg: dict, key: str = "retired") -> tuple[set, list]:
    """Players named in auction_pool.json `retired` (retired from the IPL) or `unavailable` (cannot play
    IPL 2027 for another reason, such as a ban), and names not found."""
    ids, missing, _ = retained_ids(mp, {"retained": {"": cfg.get(key, [])}})
    return set(ids), missing


def main():
    b, m, mp = load()
    log("loaded", b.shape)
    b = build_state(b, m)
    re = run_expectancy(b)
    models, wp_metrics = fit_wp(b, re)
    b, outcome_probs = leverage(b, models)
    # One cut-off for every ball: the top 20% by stakes. (Separate cut-offs for batting first and
    # chasing were tested and rejected: in a first innings they flagged 87% of over-one balls, because
    # the win chance sits near 50% early on, which is where any model is most sensitive.)
    # On top, every ball of a knockout counts: lose and you are out, so the occasion is the pressure,
    # whatever the scoreboard says. That is what credits a first-innings total built in a knockout.
    b["pi_raw"] = b.li
    live = ~b.short_match
    thr = float(b[live].li.quantile(PRESSURE_PCTL))
    b["pressure"] = live & ((b.li >= thr) | (b.is_knockout == 1))
    b["pi"] = (b.li.rank(pct=True) * 100).round(1)
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
    retired, unmatched_r = retired_ids(mp, pool_cfg)
    unavailable, unmatched_u = retired_ids(mp, pool_cfg, "unavailable")
    if unmatched or unmatched_r or unmatched_u:
        log("WARNING names not found in the data:", unmatched + unmatched_r + unmatched_u)
    log(f"retentions: {len(retained)} players from {sorted(announced)}")
    rr_squad = set(mp[(mp.comp_id == IPL_2026) & (mp.team_name == "Rajasthan Royals")].player_id)
    a26 = b[b.top_level & (b.season_yr == ACTIVE_SEASON)]
    active = set(a26.striker_id) | set(a26.non_striker_id) | set(a26.bowler_id)

    def exclusion(pid, name):
        """Why a player is left out of the submitted top 10, if they are."""
        if (overrides.get(name) or intl_meta.team_name.get(pid)) == "Pakistan":
            return "pakistan"  # cannot register for the IPL auction
        if pid in retired:
            return "retired"  # retired from the IPL
        if pid in unavailable:
            return "unavailable"  # cannot play IPL 2027 (Harry Brook: banned for withdrawing in 2025)
        if pid in retained:  # on a franchise's announced list
            return "rr" if retained[pid] == "Rajasthan Royals" else "retained"
        if pid in rr_squad and "Rajasthan Royals" not in announced:
            return "rr"  # until RR announce, their whole 2026 squad is treated as kept
        if pid not in active:
            return "inactive"  # no top-level cricket in 2026 (injured, retired from internationals or unsigned)
        return None

    results = {}
    forward = {}
    new_indians = {}
    for role in ("bat", "bowl"):
        pm, d = player_match_table(b, role)
        t = rate(pm)
        names = d.groupby("pid").pname.agg(lambda x: x.mode().iat[0])
        # nationality: the fix list, then the latest international side, then IPL-only players are Indian
        nat = pd.Series({pid: overrides.get(names.get(pid)) or (intl_meta.team_name.get(pid) if pid in intl_meta.index else None)
                         or ("India" if pid in ipl_meta.index else None) for pid in t.index})
        indian = nat.eq("India")
        eligible = t[eligible_mask(t, indian)].index
        why = {pid: r for pid in t.index if (r := exclusion(pid, names.get(pid)))}
        # qualified, could be signed, but worse under pressure than usual: not a pressure pick
        why.update({pid: "dips" for pid in eligible if pid not in why and t.at[pid, "lift"] < 0})
        excluded = frozenset(why)
        s = score(t, eligible, excluded=excluded, nat=nat)
        # Indian scouting leads: signable Indians beyond the top 10 who rise under pressure
        top10 = set(s.index[s["rank"] <= 10])
        in_2026 = pd.Series({pid: pid in ipl_meta.index and ipl_meta.season_yr.get(pid) == 2026 for pid in t.index})
        recent_p = d[(d.P == 1) & (d.season_yr >= RECENT_FROM)]
        big_game = recent_p.groupby(["pid", "match_id"]).wpa.sum().groupby("pid").max().reindex(t.index).fillna(0)
        steady = (t.pn + t.nn >= SCOUT_MIN_BALLS) & (t.rating > 0) & (t.lift >= 0)
        # judged in whole points, as the dashboard shows them (+14.6 reads, and counts, as +15)
        scout = t[indian & in_2026 & (steady | (big_game.round(2) >= BIG_GAME_WPA))
                  & ~t.index.isin([pid for pid, r in why.items() if r != "dips"]) & ~t.index.isin(top10)]
        india_rank = {pid: i + 1 for i, pid in enumerate(scout.sort_values("rating", ascending=False).index)}
        debut = d.groupby("pid").season_yr.min()
        log(f"{role}: eligible={len(eligible)}, signable={int(s['rank'].notna().sum())}")
        boot = bootstrap(pm, eligible, excluded, nat)
        sh = split_half(pm, eligible)
        forward[role] = forward_check(b, role)
        log(f"{role} split-half: {sh}; forward test: {forward[role]}")
        pool = t[t.pn >= PROFILE_MIN_BALLS].index
        s_all = score(t, pool)
        # export order: the submitted ranking first (rank order, which the Indian and Bangladesh rules make
        # differ from rating order), then the other qualified players by rating, then everyone else
        order = list(s[s["rank"].notna()].sort_values("rank").index) + list(
            s[s["rank"].isna()].sort_values("score", ascending=False).index) + [
            pid for pid in s_all.sort_values("score", ascending=False).index if pid not in s.index]
        r2 = lambda v, k=2: None if pd.isna(v) else round(float(v), k)
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
                "id": int(pid), "name": names[pid],
                "rank": int(s.loc[pid, "rank"]) if pid in s.index and pd.notna(s.loc[pid, "rank"]) else None,
                "merit_rank": int(s.loc[pid, "merit_rank"]) if pid in s.index else None,
                "excluded": why.get(pid), "retained_by": retained.get(pid),
                "score": round(100 * float(s.loc[pid, "score"]), 2) if pid in s.index else None,
                "country": intl_meta.team_name.get(pid) if pid in intl_meta.index else None,
                "indian": bool(indian.get(pid, False)), "india_rank": india_rank.get(pid),
                "ipl_team": ipl_team, "ipl_season": ipl_season,
                "hand": bat_hand.get(pid), "bowl_type": bowl_type.get(pid), "pace": pace.get(pid),
                "p_balls": int(row.pn), "p_matches": int(row.pmatches), "n_balls": int(row.nn),
                # evidence as the bar counts it (a knockout first-innings ball counts half), so the dashboard's
                # adjustable bar picks exactly the players the pipeline does
                "p_eff": round(float(row.pne), 1), "r_eff": round(float(row.rne), 1),
                "p_rv100": round(100 * row.rating, 2), "n_rv100": round(100 * row.normal, 2),
                "p_raw100": round(100 * row.pwrv / max(row.pw, 1e-9), 2),
                "delta100": round(100 * row.lift, 2), "wpa100": round(float(row.wpa100), 3),
                "cons": r2(row.cons, 3), "c_n": int(row.c_n),
                "recent100": round(100 * row.recent, 2), "r_balls": int(row.rn), "r_matches": int(row.rmatches),
                "debut": int(debut[pid]), "born": BIRTH["born"].get(names[pid]),
                "emerging": BIRTH["born"].get(names[pid], "0") >= BIRTH["cutoff"],
                "boot": boot.get(pid), "press": press, "norm": norm,
                "seasons": seasons, "phases": phases, "matches": matches,
                "moments": big_moments(dp, role),
            })
        # young Indian talent: of the Indians first seen 2024+ with 60+ balls, how many reached the auction?
        new_ind = [pid for pid in t.index if indian.get(pid, False) and debut.get(pid, 0) >= NEW_INDIAN_FROM and t.at[pid, "pn"] + t.at[pid, "nn"] >= 60]
        new_indians[role] = {pid: why.get(pid) for pid in new_ind}
        results[role] = {"players": players, "k": {"K": K}, "split_half": sh, "forward": forward[role],
                         "eligibility": {"min_pressure_balls": MIN_PRESSURE_BALLS,
                                         "min_pressure_matches": MIN_PRESSURE_MATCHES,
                                         "recent_from": RECENT_FROM, "min_recent_balls": MIN_RECENT_BALLS,
                                         "emerging_born_from": BIRTH["cutoff"], "indian_bar": round(INDIAN_BAR, 4),
                                         "indian_min": [int(np.ceil(x * INDIAN_BAR - 1e-9)) for x in (MIN_PRESSURE_BALLS, MIN_PRESSURE_MATCHES, MIN_RECENT_BALLS)],
                                         "indian_places": INDIAN_PLACES, "scout_min_balls": SCOUT_MIN_BALLS,
                                         "max_bangladesh": MAX_BANGLADESH, "active_season": ACTIVE_SEASON,
                                         "n_indian_top10": int(indian.reindex(list(top10), fill_value=False).sum()),
                                         "n_eligible": int(len(eligible)),
                                         "n_ranked": int(s["rank"].notna().sum()),
                                         "export_min_balls": 10, "export_min_matches": 1,
                                         "n_exported": int(len(pool)),
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
        "n_top_level_matches": int(b[b.top_level].match_id.nunique()),
        # public data added next to the data pack (analysis/public_wc2026.py)
        "public": ({"name": "ICC Men's T20 World Cup 2026", "source": "Cricsheet (cricsheet.org)",
                    "matches": int(b[b.match_id >= 9_000_000].match_id.nunique()),
                    "balls": int((b.match_id >= 9_000_000).sum())} if PUBLIC.exists() else None),
        "pressure_threshold": round(thr, 3), "pressure_pctl": PRESSURE_PCTL,
        "K": K, "season_weights": SEASON_WEIGHT, "top_level": list(TOP_LEVEL),
        "min_match_balls": MIN_MATCH_BALLS,
        "n_reduced_included": int(b[~b.short_match & (b.max_balls < 120)].match_id.nunique()),
        "n_short_excluded": int(b[b.short_match].match_id.nunique()),
        "forward": forward,
        "new_indians": (lambda allp: {"total": len(allp), "kept": sum(r in ("retained", "rr") for r in allp.values()),
                                      "available": sum(r in (None, "dips") for r in allp.values()), "from": NEW_INDIAN_FROM})(
            {**new_indians["bowl"], **new_indians["bat"]}),
        "wp_model": wp_metrics,
        "contrast": contrast, "by_phase": by_phase, "by_over": by_over,
        "li_hist": hist, "moments": moments,
    }
    # missing values (e.g. no batting hand for a player new in the public data) are written as null, never NaN
    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, list):
            return [clean(v) for v in o]
        return None if isinstance(o, float) and np.isnan(o) else o
    (OUT / "summary.json").write_text(json.dumps(clean(summary), separators=(",", ":"), allow_nan=False))
    (OUT / "batters.json").write_text(json.dumps(clean(results["bat"]), separators=(",", ":"), default=str, allow_nan=False))
    (OUT / "bowlers.json").write_text(json.dumps(clean(results["bowl"]), separators=(",", ":"), default=str, allow_nan=False))
    (OUT / "chase_grid.json").write_text(json.dumps(
        {"cols": ["wkts", "overs_left", "need", "wp", "li"], "rows": grid}, separators=(",", ":")))
    for role in ("bat", "bowl"):
        top = [p for p in results[role]["players"] if p["rank"]][:15]
        log(f"\nTOP {role}:")
        for p in top:
            log(f"{p['rank']:>2} {p['name']:<24} rating={p['p_rv100']:+.1f} normal={p['n_rv100']:+.1f} "
                f"lift={p['delta100']:+.1f} wpa={100 * p['wpa100']:+.1f}pts cons={p['cons']} "
                f"balls={p['p_balls']} top10={p['boot']['p_top10']}")
        merit = sorted((p for p in results[role]["players"] if p["merit_rank"]), key=lambda p: p["merit_rank"])[:15]
        log("all qualified, before auction rules: " + ", ".join(f"{p['name']} ({p['excluded'] or '-'})" for p in merit))
        # every player the top 10 or the watch list can draw from needs a birth date, or the label could miss someone
        missing = [p["name"] for p in results[role]["players"] if p["rank"] and p["p_rv100"] > 0 and not p["born"]]
        if missing:
            log("WARNING: no birth date (add to birth_dates.json): " + ", ".join(missing))
        em = sorted((p for p in results[role]["players"] if p["emerging"] and p["rank"]), key=lambda p: p["rank"])
        log(f"emerging in top 10: {sum(p['rank'] <= 10 for p in em)}; to track: "
            + ", ".join(f"{p['name']} {p['p_rv100']:+.1f}" for p in em if p["rank"] > 10))
    log("done")


if __name__ == "__main__":
    main()
