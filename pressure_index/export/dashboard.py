"""Export stage: everything the dashboard reads.

    web/data/batters.json, bowlers.json   every top-level player, slim: rating, intervals, evidence (for tables)
    web/public/data/players/<role>/<id>.json   full profile per player: seasons, phases, matches, similar players
    web/public/search.json                the search box's player list, fetched when search opens
    web/data/similarity.json              style-map coordinates for the similar-players finder
    web/data/summary.json                 data coverage, pressure definition, league-level evidence
    web/data/chase_grid.json              WP and stakes over a chase (overs left x runs needed x wickets)
    web/data/example.json                 the top-rated batter's rating rebuilt step by step (checked)
    web/data/teams.json                   every IPL season, every team
    web/data/matches.json                 match explorer index (+ web/public/matches/<id>.json)
    web/data/model_lab.json               model comparison, tuning, next-season model, similarity, RE surface
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

from pressure_index.analysis import similarity, teams
from pressure_index.config import ARTIFACTS, CFG, LAST, SOURCE, WEB_DATA, WEB_PLAYERS, WEB_PUBLIC, log, season_weights
from pressure_index.data.dataset import COMPETITIONS, MATCHES, MEMBERSHIP, model_input_digest, nationality_overrides, read_table
from pressure_index.evaluation.reliability import bootstrap, forward_check, split_half
from pressure_index.export import matches as match_export
from pressure_index.models.leverage import OUTCOMES
from pressure_index.models.win_prob import wp_eval
from pressure_index.pipeline import load_cached
from pressure_index.rating.ratings import eligible_mask, player_match_table, rank, rate

E = CFG["eligibility"]
NEW_FROM = LAST - 2   # "new face": first top-level season in the last three


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def write(name: str, obj) -> None:
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / name).write_text(json.dumps(clean(obj), separators=(",", ":"), allow_nan=False, default=str))


# ------------------------------------------------------------------ per-player evidence
def traditional(x: pd.DataFrame, role: str) -> dict:
    balls = int(x.lg.sum()) if role == "bowl" else int(len(x))
    runs, outs = int(x.r.sum()), int(x.out.sum())
    res = {"balls": balls, "runs": runs, "outs": outs,
           "dot_pct": round(100 * x.dotb.mean(), 1) if len(x) else None,
           "bnd_pct": round(100 * x.bnd.mean(), 1) if len(x) else None,
           "rv100": round(100 * x.rv.mean(), 1) if len(x) else None,
           "avg": round(runs / outs, 1) if outs else None}
    if role == "bat":
        res["sr"] = round(100 * runs / max(balls, 1), 1)
        res["par_sr"] = round(100 * x.par.sum() / max(balls, 1), 1) if len(x) else None
    else:
        res["econ"] = round(6 * runs / max(balls, 1), 2)
        res["par_econ"] = round(6 * x.par.sum() / max(balls, 1), 2) if len(x) else None
        res["sr"] = round(balls / outs, 1) if outs else None
    return res


def big_moments(dp: pd.DataFrame, role: str, k: int = 3) -> list:
    """A player's biggest pressure performances: matches where their pressure balls moved their team's chance
    of winning most, with a plain headline for finishes and final-over defences."""
    g = dp[dp.P == 1]
    if g.empty:
        return []
    side = (lambda wp: wp) if role == "bat" else (lambda wp: 1 - wp)
    out = []
    for mid, wpa in g.groupby("match_id").wpa.sum().sort_values(ascending=False).head(k).items():
        if wpa <= 0:
            break
        gm = g[g.match_id == mid].sort_values(["innings", "innings_ball_num"])
        first, last = gm.iloc[0], gm.iloc[-1]
        won = bool(last.bat_won == 1) if role == "bat" else bool(last.bat_won == 0)
        headline, wp_from = None, side(first.wp_before)
        fo = dp[(dp.match_id == mid) & (dp.innings == 2) & (dp.balls_left <= 6)].sort_values("innings_ball_num")
        if won and len(fo):
            need, left = int(fo.iloc[0].runs_needed), int(fo.iloc[0].balls_left)
            span = "the final over" if left == 6 else f"the last {left} balls"
            if role == "bat":
                headline, wp_from = f"Needed {need} off {span} and made {int(fo.r.sum())} of them to win", side(fo.iloc[0].wp_before)
            elif need <= 15:
                headline = f"Defended {need} in {span}" if left == 6 else f"Defended {need} off {span}"
                wp_from = side(fo.iloc[0].wp_before)
        out.append({"id": int(mid), "date": str(first.match_date)[:10], "comp": first.comp_name,
                    "opp": first.opp_name if role == "bat" else first.team_name, "balls": int(len(gm)),
                    "r": int(gm.r.sum()), "out": int(gm.out.sum()), "wpa": round(float(wpa), 3),
                    "wp_from": round(float(wp_from), 4), "wp_to": round(float(side(last.wp_after)), 3),
                    "won": won, "headline": headline})
    return out


def nationality(mp: pd.DataFrame, comps: pd.DataFrame, source: Path = SOURCE) -> tuple[pd.Series, pd.DataFrame, set]:
    """Country: the latest national side a player turned out for; IPL-only players are Indian unless the
    reference table says otherwise. Also each player's latest IPL team and season."""
    mp = mp.merge(comps[["comp_id", "season", "comp_name"]], on="comp_id", how="left", suffixes=("", "_c"))
    over = nationality_overrides(source)
    intl = mp[~mp.comp_name.str.startswith("IPL")].sort_values("season").groupby("player_id").team_name.last()
    ipl = mp[mp.comp_name.str.startswith("IPL")].sort_values("season").groupby("player_id").last()[["team_name", "season"]]
    names = mp.groupby("player_id").player_name.last()
    nat = {}
    for pid in set(intl.index) | set(ipl.index):
        nat[pid] = over.get(names.get(pid)) or intl.get(pid) or "India"
    return pd.Series(nat), ipl, set(intl.index)


def role_export(b: pd.DataFrame, role: str, nat: pd.Series, ipl: pd.DataFrame, capped: set) -> tuple[dict, pd.DataFrame, pd.DataFrame, dict]:
    pm, d = player_match_table(b, role)
    t = rate(pm)
    names = d.groupby("pid").pname.agg(lambda x: x.mode().iat[0])
    eligible = t[eligible_mask(t)].index
    s = rank(t, eligible)
    log(f"{role}: {len(t)} players, {len(eligible)} qualified")
    boot = bootstrap(pm, eligible)
    sh = split_half(pm, eligible)
    fwd = forward_check(b, role)
    sim = similarity.build(d, t, role, names)
    debut = d.groupby("pid").season_yr.min()
    active = set(d[d.season_yr == LAST].pid)
    order = list(s.sort_values("rank").index) + [p for p in t.sort_values("rating", ascending=False).index if p not in s.index]
    players = []
    by_pid = dict(tuple(d.groupby("pid")))
    for pid in order:
        row, dp = t.loc[pid], by_pid[pid]
        seasons = [{"season": int(yr), "p_balls": int((g.P == 1).sum()),
                    "p_rv100": round(100 * g[g.P == 1].rv.mean(), 1) if (g.P == 1).any() else None,
                    "n_rv100": round(100 * g[g.P == 0].rv.mean(), 1) if (g.P == 0).any() else None}
                   for yr, g in dp.groupby("season_yr")]
        phases = [{"phase": ph, "balls": int(((dp.phase == ph) & (dp.P == 1)).sum()),
                   "rv100": round(100 * dp[(dp.phase == ph) & (dp.P == 1)].rv.mean(), 1)
                   if ((dp.phase == ph) & (dp.P == 1)).any() else None} for ph in ("Powerplay", "Middle", "Death")]
        mt = (dp[dp.P == 1].groupby("match_id")
              .agg(balls=("rv", "size"), rv=("rv", "sum"), wpa=("wpa", "sum"), r=("r", "sum"), out=("out", "sum"),
                   date=("match_date", "first"), opp=("opp_name" if role == "bat" else "team_name", "first"),
                   comp=("comp_name", "first"), li=("li", "mean"))
              .reset_index().sort_values("date"))
        sp = sim["players"].get(int(pid))
        players.append({
            "id": int(pid), "name": names[pid],
            "rank": int(s.at[pid, "rank"]) if pid in s.index else None,
            "country": nat.get(pid), "capped": pid in capped,
            "ipl_team": ipl.team_name.get(pid) if pid in ipl.index else None,
            "ipl_season": int(ipl.season.get(pid)) if pid in ipl.index else None,
            "p_balls": int(row.pn), "p_matches": int(row.pmatches), "n_balls": int(row.nn),
            "p_eff": round(float(row.pne), 1), "r_eff": round(float(row.rne), 1),
            "p_rv100": round(100 * row.rating, 2), "n_rv100": round(100 * row.normal, 2),
            "p_raw100": round(100 * row.pwrv / max(row.pw, 1e-9), 2), "delta100": round(100 * row.lift, 2),
            "wpa100": round(float(row.wpa100), 3), "cons": None if pd.isna(row.cons) else round(float(row.cons), 3),
            "c_n": int(row.c_n), "recent100": round(100 * row.recent, 2), "r_balls": int(row.rn),
            "r_matches": int(row.rmatches), "debut": int(debut[pid]), "active": pid in active,
            "new_face": int(debut[pid]) >= NEW_FROM,
            "style": {"x": sp["x"], "y": sp["y"], "traits": sp["traits"]} if sp else None,
            "similar": sp["similar"] if sp else [],
            "boot": boot.get(pid),
            "press": traditional(dp[dp.P == 1], role), "norm": traditional(dp[dp.P == 0], role),
            "seasons": seasons, "phases": phases,
            "matches": [{"id": int(r.match_id), "date": str(r.date)[:10], "opp": r.opp, "comp": r.comp, "balls": int(r.balls),
                         "rv": round(float(r.rv), 2), "wpa": round(float(r.wpa), 3), "r": int(r.r), "out": int(r.out),
                         "li": round(float(r.li), 2)} for r in mt.itertuples()],
            "moments": big_moments(dp, role),
        })
    data = {"players": players, "k": {"K": CFG["model"]["K"]}, "split_half": sh, "forward": fwd,
            "eligibility": {"min_pressure_balls": E["min_pressure_balls"], "min_pressure_matches": E["min_pressure_matches"],
                            "recent_from": E["recent_from"], "min_recent_balls": E["min_recent_balls"],
                            "new_from": NEW_FROM, "active_season": LAST, "n_eligible": int(len(eligible)),
                            "n_ranked": int(len(s)), "n_players": int(len(t)), "n_exported": int(len(players))}}
    sim_out = {k: v for k, v in sim.items() if k != "players"} | {"n": len(sim["players"])}
    return data, t, d, sim_out


def worked_example(b: pd.DataFrame, bat: dict) -> dict:
    """The top-rated batter's rating rebuilt by hand, checked against the published figures."""
    me = next(p for p in bat["players"] if p["rank"] == 1)
    pid = me["id"]
    pm, d = player_match_table(b, "bat")
    r = rate(pm).loc[pid]
    mine = d[d.pid == pid]
    press = mine[mine.P == 1]
    pool = press[press.runs >= 4] if (press.runs >= 4).any() else press[press.out == 1]
    ball = pool.sort_values("li", ascending=False).iloc[0]
    centre = float(ball.rv - (ball.runs - ball.x_runs - ball.wkt_cost * ball.out))
    w = season_weights()
    seasons = [{"season": int(yr), "weight": w[int(yr)], "p_balls": int((g.P == 1).sum()),
                "p_runs": round(float((g[g.P == 1].w / w[int(yr)] * g[g.P == 1].rv).sum()), 1),
                "n_balls": int((g.P == 0).sum()), "n_runs": round(float(g[g.P == 0].rv.sum()), 1)}
               for yr, g in mine.groupby("season_yr")]
    K = CFG["model"]["K"]
    normal = r.nwrv / (r.nw + K)
    rating = (r.pwrv + K * normal) / (r.pw + K)
    assert abs(100 * rating - me["p_rv100"]) < 0.02 and abs(100 * (rating - normal) - me["delta100"]) < 0.02
    assert abs(sum(s["weight"] * s["p_runs"] for s in seasons) - r.pwrv) < 0.5
    ranked = sorted((p for p in bat["players"] if p["rank"]), key=lambda p: p["rank"])
    return {
        "id": pid, "name": me["name"], "role": "bat",
        "ball": {"match": f"{ball.team_name} v {ball.opp_name}", "comp": ball.comp_name, "date": str(ball.match_date)[:10],
                 "over": f"{int(ball.overid) - 1}.{int(ball.over_ball_num)}", "score": f"{int(ball.runs_before)}/{int(ball.wkts_before)}",
                 "need": int(ball.runs_needed) if ball.innings == 2 else None, "balls_left": int(ball.balls_left),
                 "knockout": bool(ball.is_knockout), "threshold": None, "wp": round(float(ball.wp_before), 3),
                 "wp_after": round(float(ball.wp_after), 3), "stakes": round(float(ball.li), 1), "runs": int(ball.runs),
                 "out": int(ball.out), "expected": round(float(ball.x_runs), 2), "wkt_cost": round(float(ball.wkt_cost), 2),
                 "centre": round(centre, 2), "rv": round(float(ball.rv), 2)},
        "seasons": seasons,
        "steps": {"K": K, "p_balls": int(r.pn), "p_matches": int(r.pmatches), "p_weighted": round(float(r.pw), 1),
                  "p_sum": round(float(r.pwrv), 1), "p_raw100": round(100 * float(r.pwrv / r.pw), 1), "n_balls": int(r.nn),
                  "n_weighted": round(float(r.nw), 1), "n_sum": round(float(r.nwrv), 1),
                  "n_raw100": round(100 * float(r.nwrv / r.nw), 1), "n_rv100": round(100 * float(normal), 1),
                  "n_keep": round(float(r.nw / (r.nw + K)), 3), "share": round(float(r.pw / (r.pw + K)), 3),
                  "rating100": round(100 * float(rating), 1), "lift100": round(100 * float(rating - normal), 1),
                  "wpa_sum": round(float(r.pwpa), 3), "wpa100": round(float(r.wpa100), 3), "c_pos": int(r.c_pos),
                  "c_n": int(r.c_n), "recent_balls": int(r.rn), "recent100": round(100 * float(r.recent), 1),
                  "recent_from": E["recent_from"]},
        "rank": 1, "n_ranked": bat["eligibility"]["n_ranked"],
        "next": [{"rank": p["rank"], "name": p["name"], "rating": p["p_rv100"]} for p in ranked[1:4]],
        "boot": me["boot"], "press": me["press"], "norm": me["norm"],
    }


# ------------------------------------------------------------------ league-level evidence
def summary(b: pd.DataFrame, m: pd.DataFrame, models: dict, wp_metrics: dict, forward: dict) -> dict:
    lb = b[~b.short_match].copy()
    lb["dotb"] = (lb.tot == 0) & lb.legal
    lb["bnd"] = lb.is_four | lb.is_six

    def league(mask):
        x = lb[mask]
        legal = x.legal.sum()
        return {"balls": int(len(x)), "rpo": round(6 * x.tot.sum() / max(legal, 1), 2),
                "wkt_pct": round(100 * x.wkt.sum() / max(legal, 1), 2), "dot_pct": round(100 * x.dotb.sum() / max(legal, 1), 1),
                "bnd_pct": round(100 * x.bnd.sum() / max(legal, 1), 1), "extras_pct": round(100 * (x.is_wide | x.is_nb).mean(), 2),
                "li": round(float(x.li.mean()), 2)}

    by_phase = [{"innings": inn, "phase": ph, "balls": int(((lb.innings == inn) & (lb.phase == ph)).sum()),
                 "pressure_share": round(100 * lb[(lb.innings == inn) & (lb.phase == ph)].pressure.mean(), 1),
                 "li": round(float(lb[(lb.innings == inn) & (lb.phase == ph)].li.mean()), 2)}
                for inn in (1, 2) for ph in ("Powerplay", "Middle", "Death")]
    bo = lb.groupby(["innings", "over"]).agg(li=("li", "mean"), share=("pressure", "mean")).reset_index()
    h = np.histogram(np.clip(lb.li, 0, 6), bins=60, range=(0, 6))
    hist = [{"x": round(float(h[1][i]), 2), "n": int(h[0][i]),
             "p": int(lb[(lb.li >= h[1][i]) & (lb.li < h[1][i + 1])].pressure.mean() > 0.5) if h[0][i] else 0} for i in range(60)]
    top = lb[(lb.innings == 2) & lb.top_level].sort_values("li", ascending=False).drop_duplicates("match_id").head(12)
    moments = [{"id": int(r.match_id), "match": f"{r.team_name} v {r.opp_name}", "comp": r.comp_name, "date": str(r.match_date)[:10],
                "over": f"{int(r.overid) - 1}.{int(r.over_ball_num)}",
                "state": f"{int(r.runs_needed)} needed off {int(r.balls_left)}, {int(r.wkts_in_hand)} wkts in hand",
                "striker": r.striker_name, "bowler": r.bowler_name, "li": round(float(r.li), 2), "wp": round(float(r.wp_before), 2),
                "result": r.result} for r in top.itertuples()]
    comps = (b.drop_duplicates("match_id").groupby("comp_name").agg(matches=("match_id", "size"), top=("top_level", "max"))
             .reset_index())
    wc = comps[comps.comp_name.str.contains("World Cup")]
    return {
        "n_balls": int(len(b)), "n_matches": int(b.match_id.nunique()),
        "n_ipl_matches": int(b[b.is_ipl == 1].match_id.nunique()),
        "n_t20i_matches": int(b[b.is_ipl == 0].match_id.nunique()),
        "n_t20i_full": int(b[b.comp_tier == "T20I Full"].match_id.nunique()),
        "n_top_level_matches": int(b[b.top_level].match_id.nunique()),
        "n_top_level_balls": int(b.top_level.sum()),
        "seasons": sorted(int(x) for x in b.season_yr.unique()),
        "world_cups": [{"name": r.comp_name, "matches": int(r.matches)} for r in wc.itertuples()],
        "source": {"name": "Cricsheet", "url": "https://cricsheet.org", "licence": "Open Data Commons Attribution 1.0"},
        "pressure_threshold": round(float(models["threshold"]), 3), "pressure_pctl": CFG["model"]["pressure_pctl"],
        "K": CFG["model"]["K"], "season_weights": season_weights(), "top_level": ["IPL", "T20I Full"],
        "min_match_balls": CFG["data"]["min_match_balls"],
        "n_reduced_included": int(b[~b.short_match & (b.max_balls < 120)].match_id.nunique()),
        "n_short_excluded": int(b[b.short_match].match_id.nunique()),
        "forward": forward, "wp_model": wp_metrics,
        "contrast": {"pressure": league(lb.pressure), "normal": league(~lb.pressure)},
        "by_phase": by_phase,
        "by_over": [{"innings": int(r.innings), "over": int(r.over), "li": round(float(r.li), 3), "share": round(100 * float(r.share), 1)}
                    for r in bo.itertuples()],
        "li_hist": hist, "moments": moments,
    }


def chase_grid(b: pd.DataFrame, models: dict) -> dict:
    wp, probs = models["wp"], models["outcome_probs"]
    rows = []
    for wk in range(1, 11):
        for ov in range(1, 21):
            bl, need = ov * 6, np.arange(2, 252, 6, dtype=float)
            n = len(need)
            base = wp_eval(wp, 2, need, np.full(n, bl, float), np.full(n, wk, float), 1.0, float(LAST))
            swing = np.zeros(n)
            for name, r, ball, w in OUTCOMES:
                p = float(probs.loc["Death" if ov <= 5 else ("Middle" if ov <= 14 else "Powerplay"), name])
                swing += p * np.abs(wp_eval(wp, 2, need - r, np.full(n, bl - ball, float), np.full(n, wk - w, float), 1.0, float(LAST)) - base)
            li = swing / b.exp_swing.mean()
            rows += [[wk, ov, int(need[i]), round(float(base[i]), 3), round(float(li[i]), 2)] for i in range(n)]
    return {"cols": ["wkts", "overs_left", "need", "wp", "li"], "rows": rows}


def model_lab(models: dict, sim: dict, roles: dict, b: pd.DataFrame) -> dict:
    metrics = ARTIFACTS / "metrics"
    read = lambda n: json.loads((metrics / f"{n}.json").read_text()) if (metrics / f"{n}.json").exists() else None
    re = models["re"][(1, LAST)]
    surface = [[int(bl), int(w), round(float(re[bl, w]), 1)] for bl in range(0, 121, 6) for w in range(0, 10)]
    stab = {}
    for role, data in roles.items():
        top = [p for p in data["players"] if p["rank"] and p["rank"] <= 10]
        stab[role] = [{"name": p["name"], "rank": p["rank"], "p_top10": p["boot"]["p_top10"], "lo": p["boot"]["rank_lo"],
                       "hi": p["boot"]["rank_hi"], "rating": p["p_rv100"], "rating_lo": p["boot"]["rating_lo"],
                       "rating_hi": p["boot"]["rating_hi"]} for p in top]
    return {
        "wp_comparison": read("wp_comparison"), "tuning": read("tuning"), "next_season": read("next_season"),
        "similarity": sim, "re_surface": {"season": LAST, "competition": "IPL", "rows": surface},
        "stability": stab, "split_half": {r: d["split_half"] for r, d in roles.items()},
        "forward": {r: d["forward"] for r, d in roles.items()},
        "dataset": {"balls": int(len(b)), "train_matches": int(b.match_id.nunique())},
    }


DETAIL = ("seasons", "phases", "matches", "similar")


def write_players(roles: dict) -> None:
    """Full profile per player as its own file (loaded on demand); slim role files for tables; the search list;
    and style-map points for the similar-players finder."""
    if WEB_PLAYERS.exists():
        shutil.rmtree(WEB_PLAYERS)
    points, search = [], []
    for role, data in roles.items():
        out = WEB_PLAYERS / role
        out.mkdir(parents=True)
        for p in data["players"]:
            (out / f"{p['id']}.json").write_text(json.dumps(clean(p), separators=(",", ":"), allow_nan=False, default=str))
            search.append({"id": p["id"], "name": p["name"], "role": role, "rank": p["rank"], "ipl": p["ipl_team"], "country": p["country"]})
            if p["style"]:
                points.append({"id": p["id"], "name": p["name"], "role": role, "x": p["style"]["x"], "y": p["style"]["y"],
                               "rating": p["p_rv100"], "rank": p["rank"], "country": p["country"], "ipl": p["ipl_team"]})
        slim = {**data, "players": [{k: v for k, v in p.items() if k not in DETAIL} for p in data["players"]]}
        write("batters.json" if role == "bat" else "bowlers.json", slim)
    (WEB_PUBLIC / "search.json").write_text(json.dumps(clean(search), separators=(",", ":")))
    write("similarity.json", {"points": points})


def run() -> None:
    input_digest = model_input_digest(SOURCE)
    m = read_table(SOURCE, MATCHES)
    mp = read_table(SOURCE, MEMBERSHIP)
    comps = read_table(SOURCE, COMPETITIONS)
    nat, ipl, capped = nationality(mp, comps)
    b, models = load_cached()
    if model_input_digest(SOURCE) != input_digest:
        raise ValueError(f"CSV inputs changed while reading {SOURCE}. Rerun the export stage.")
    wp_metrics = json.loads((ARTIFACTS / "metrics" / "win_probability.json").read_text(encoding="utf-8"))
    roles, sim = {}, {}
    for role in ("bat", "bowl"):
        roles[role], _, _, sim[role] = role_export(b, role, nat, ipl, capped)
    write_players(roles)
    write("summary.json", summary(b, m, models, wp_metrics, {r: d["forward"] for r, d in roles.items()}))
    write("chase_grid.json", chase_grid(b, models))
    write("example.json", worked_example(b, roles["bat"]))
    write("teams.json", teams.all_seasons(b))
    write("matches.json", {"matches": match_export.export(b)})
    write("model_lab.json", model_lab(models, sim, roles, b))
    for role in ("bat", "bowl"):
        top = [p for p in roles[role]["players"] if p["rank"]][:10]
        log(f"TOP {role}: " + ", ".join(f"{p['rank']}. {p['name']} {p['p_rv100']:+.1f} (lift {p['delta100']:+.1f})" for p in top))
