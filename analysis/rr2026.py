"""
Rajasthan Royals: IPL 2026 season diagnosis and IPL 2027 auction targets.

Reads the ball-level cache written by pipeline.py (run that first) plus the ratings JSON,
and writes dashboard data: rr2026.json.

Method in one breath:
  * Every ball already carries a context-adjusted run value (RV): runs above what an
    average side gets from the same match state, wickets priced in. Summing RR's RV by
    phase / matchup / pressure shows exactly where RR gained or lost runs per match
    against an average IPL 2026 side. The biggest leaks are the shortcomings.
  * Each shortcoming maps to a role (e.g. "death-overs bowler"). Candidates outside the
    RR squad are scored on that role's RV per 100 balls (2024-26, recency-weighted,
    shrunk for sample size) plus their overall pressure rating.

Run:  python -I analysis/rr2026.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "Data Pack"
OUT = ROOT / "web" / "data"
CACHE = ROOT / "analysis" / "cache" / "balls.parquet"
POOL = ROOT / "analysis" / "auction_pool.json"

RR = "Rajasthan Royals"
SEASON = 2026
PHASES = ["Powerplay", "Middle", "Death"]
PHASE_OVERS = {"Powerplay": "overs 1-6", "Middle": "overs 7-15", "Death": "overs 16-20"}
REC_W = {2024: 0.6, 2025: 0.8, 2026: 1.0}
SHRINK_BALLS = 120
CAND_EXPORT_MIN = 30   # smallest role sample exported; the dashboard default is 90 / 120
CAND_EXPORT_TOP = 40   # candidates exported per role, best fit first


def r1(x, d=1):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), d)


def load():
    b = pd.read_parquet(CACHE)
    mp = pd.read_csv(DATA / "competition_team_player_mapping.csv")
    bat = json.loads((OUT / "batters.json").read_text())
    bowl = json.loads((OUT / "bowlers.json").read_text())
    pool = json.loads(POOL.read_text()) if POOL.exists() else {}
    return b, mp, bat, bowl, pool


def points_table(m26: pd.DataFrame):
    lg = m26[m26.stage == "League"]
    teams = sorted(set(lg.team_name) | set(lg.opp_name))
    rows = []
    for t in teams:
        g = lg[(lg.team_name == t) | (lg.opp_name == t)].drop_duplicates("match_id")
        won = int((g.win_team_id == np.where(g.team_name == t, g.batting_team_id, g.bowling_team_id)).sum())
        res = g.result.fillna("")
        nr = int(res.str.contains("No Result|Abandon", case=False).sum())
        rows.append({"team": t, "played": int(len(g)), "won": won, "lost": int(len(g) - won - nr),
                     "nr": nr, "points": 2 * won + nr})
    tab = pd.DataFrame(rows)
    # net run rate from ball data
    nrr = {}
    for t in teams:
        x = m26[(m26.stage == "League") & ((m26.team_name == t) | (m26.opp_name == t))]
        f = x[x.team_name == t]
        a = x[x.opp_name == t]
        # all-out innings count as full quota (standard NRR rule)
        def overs(d):
            o = 0.0
            for _, g in d.groupby("match_id"):
                legal = g.legal.sum()
                allout = g.wkt.sum() >= 10
                o += (g.max_balls.iloc[0] if allout else legal) / 6
            return o
        nrr[t] = (f.tot.sum() / max(overs(f), 1)) - (a.tot.sum() / max(overs(a), 1))
    tab["nrr"] = tab.team.map(nrr).round(3)
    tab = tab.sort_values(["points", "nrr"], ascending=False).reset_index(drop=True)
    tab["pos"] = tab.index + 1
    return tab


def team_phase(d: pd.DataFrame, team: str, n_matches: dict):
    """Per-match runs gained vs average side, by phase, batting and bowling."""
    out = []
    for ph in PHASES:
        bat = d[(d.team_name == team) & (d.phase == ph)]
        bowl = d[(d.opp_name == team) & (d.phase == ph)]
        nm = n_matches[team]
        legal_b, legal_w = bat.legal.sum(), bowl.legal.sum()
        out.append({
            "phase": ph,
            "bat_rv_pm": bat.rv_bat.sum() / nm,
            "bowl_rv_pm": bowl.rv_bowl.sum() / nm,
            "bat_rpo": 6 * bat.tot.sum() / max(legal_b, 1),
            "bowl_rpo": 6 * bowl.tot.sum() / max(legal_w, 1),
        })
    return out


def main():
    b, mp, bat_json, bowl_json, pool = load()
    d = b[(b.is_ipl == 1) & (b.season_yr == SEASON)].copy()
    d["bat_team"] = d.team_name
    teams = sorted(d.team_name.unique())
    n_matches = {t: d[(d.team_name == t) | (d.opp_name == t)].match_id.nunique() for t in teams}

    table = points_table(d)
    top4 = table.head(4).team.tolist()

    # ------------------------------------------------------------ phase diagnosis
    phase_rows = {t: team_phase(d, t, n_matches) for t in teams}
    league_phase = []
    for i, ph in enumerate(PHASES):
        def avg(key, group):
            return float(np.mean([phase_rows[t][i][key] for t in group]))
        rr = phase_rows[RR][i]
        league_phase.append({
            "phase": ph, "overs": PHASE_OVERS[ph],
            "rr": {k: r1(v, 2) for k, v in rr.items() if k != "phase"},
            "league": {k: r1(avg(k, teams), 2) for k in rr if k != "phase"},
            "top4": {k: r1(avg(k, top4), 2) for k in rr if k != "phase"},
            "bat_rank": int(sorted(teams, key=lambda t: -phase_rows[t][i]["bat_rv_pm"]).index(RR) + 1),
            "bowl_rank": int(sorted(teams, key=lambda t: -phase_rows[t][i]["bowl_rv_pm"]).index(RR) + 1),
            "teams": [{"team": t, "bat": r1(phase_rows[t][i]["bat_rv_pm"], 2),
                       "bowl": r1(phase_rows[t][i]["bowl_rv_pm"], 2)} for t in teams],
        })

    # ------------------------------------------------------------ matchups
    rr_bat = d[d.team_name == RR]
    rr_bowl = d[d.opp_name == RR]
    nm = n_matches[RR]

    def per100(x, col):
        return 100 * x[col].mean() if len(x) else None

    matchups = {
        "bat_vs_pace": r1(per100(rr_bat[(rr_bat.pace_or_spin == "Pace") & ~rr_bat.is_wide], "rv_bat")),
        "bat_vs_spin": r1(per100(rr_bat[(rr_bat.pace_or_spin == "Spin") & ~rr_bat.is_wide], "rv_bat")),
        "bowl_pace": r1(per100(rr_bowl[rr_bowl.pace_or_spin == "Pace"], "rv_bowl")),
        "bowl_spin": r1(per100(rr_bowl[rr_bowl.pace_or_spin == "Spin"], "rv_bowl")),
    }
    # league reference per team for matchups
    mu_teams = []
    for t in teams:
        tb, tw = d[(d.team_name == t) & ~d.is_wide], d[d.opp_name == t]
        mu_teams.append({"team": t,
                         "bat_vs_pace": r1(100 * tb[tb.pace_or_spin == "Pace"].rv_bat.mean()),
                         "bat_vs_spin": r1(100 * tb[tb.pace_or_spin == "Spin"].rv_bat.mean()),
                         "bowl_pace": r1(100 * tw[tw.pace_or_spin == "Pace"].rv_bowl.mean()),
                         "bowl_spin": r1(100 * tw[tw.pace_or_spin == "Spin"].rv_bowl.mean())})
    matchups["teams"] = mu_teams

    # batting order bands
    bands = {"Top order (1-3)": (1, 3), "Middle order (4-7)": (4, 7), "Lower order (8-11)": (8, 11)}
    order = []
    for name, (lo, hi) in bands.items():
        x = rr_bat[(rr_bat.batting_order >= lo) & (rr_bat.batting_order <= hi) & ~rr_bat.is_wide]
        lgx = d[(d.batting_order >= lo) & (d.batting_order <= hi) & ~d.is_wide]
        order.append({"band": name, "balls_pm": r1(len(x) / nm), "rv_pm": r1(x.rv_bat.sum() / nm, 2),
                      "sr": r1(100 * x.runs.sum() / max(len(x), 1)),
                      "league_sr": r1(100 * lgx.runs.sum() / max(len(lgx), 1)),
                      "rv100": r1(100 * x.rv_bat.mean()), "league_rv100": r1(100 * lgx.rv_bat.mean())})

    # ------------------------------------------------------------ pressure
    def press_block(x, col):
        p = x[x.pressure]
        return {"balls_pm": r1(len(p) / nm), "rv_pm": r1(p[col].sum() / nm, 2), "rv100": r1(100 * p[col].mean())}

    lg_press = {"bat_rv100": r1(100 * d[d.pressure & ~d.is_wide].rv_bat.mean()),
                "bowl_rv100": r1(100 * d[d.pressure].rv_bowl.mean())}
    pressure = {"bat": press_block(rr_bat[~rr_bat.is_wide], "rv_bat"), "bowl": press_block(rr_bowl, "rv_bowl"),
                "league": lg_press}
    pr_teams = []
    for t in teams:
        tb, tw = d[(d.team_name == t) & ~d.is_wide & d.pressure], d[(d.opp_name == t) & d.pressure]
        pr_teams.append({"team": t, "bat": r1(100 * tb.rv_bat.mean()), "bowl": r1(100 * tw.rv_bowl.mean())})
    pressure["teams"] = pr_teams

    # ------------------------------------------------------------ matches + worms
    matches = []
    for mid, g in d[(d.team_name == RR) | (d.opp_name == RR)].groupby("match_id"):
        g = g.sort_values(["innings", "innings_ball_num"])
        first = g[g.innings == 1]
        rr_first = first.team_name.iloc[0] == RR
        opp = g.opp_name.iloc[0] if g.team_name.iloc[0] == RR else g.team_name.iloc[0]
        scores = {}
        for inn, gi in g.groupby("innings"):
            scores[int(inn)] = {"team": gi.team_name.iloc[0], "runs": int(gi.tot.sum()), "wkts": int(gi.wkt.sum()),
                                "balls": int(gi.legal.sum())}
        won = bool((g.win_team_id.iloc[0] == (g.batting_team_id.iloc[0] if g.team_name.iloc[0] == RR
                                               else g.bowling_team_id.iloc[0])))
        # RR win probability before each ball
        wp = np.where(g.team_name == RR, g.wp_before, 1 - g.wp_before)
        worm = [[int(i), round(float(w), 3), int(p), int(inn)] for i, (w, p, inn) in
                enumerate(zip(wp, g.pressure.astype(int), g.innings))]
        rr_bat_m = g[(g.team_name == RR) & ~g.is_wide]
        rr_bowl_m = g[g.opp_name == RR]
        top_bat = rr_bat_m.groupby("striker_name").rv_bat.sum().sort_values()
        top_bowl = rr_bowl_m.groupby("bowler_name").rv_bowl.sum().sort_values()
        matches.append({
            "id": int(mid), "date": g.match_date.iloc[0], "opp": opp, "stage": g.stage.iloc[0],
            "result": g.result.iloc[0], "won": won, "rr_batted_first": bool(rr_first), "scores": scores,
            "bat_rv": r1(rr_bat_m.rv_bat.sum(), 1), "bowl_rv": r1(rr_bowl_m.rv_bowl.sum(), 1),
            "pressure_balls": int(g.pressure.sum()),
            "best": {"bat": top_bat.index[-1] if len(top_bat) else None,
                     "bowl": top_bowl.index[-1] if len(top_bowl) else None},
            "worst": {"bat": top_bat.index[0] if len(top_bat) else None,
                      "bowl": top_bowl.index[0] if len(top_bowl) else None},
            "worm": worm,
        })
    matches.sort(key=lambda x: x["date"])

    # ------------------------------------------------------------ squad
    sq = mp[(mp.comp_id == 3298) & (mp.team_name == RR)]
    squad_ids = set(sq.player_id)
    country = {}
    for p in bat_json["players"] + bowl_json["players"]:
        country[p["id"]] = p["country"]
    intl = mp[~mp.comp_name.str.startswith("IPL") & ~mp.comp_name.str.contains("Emerging|Rising", case=False)]
    for pid, t in intl.groupby("player_id").team_name.last().items():
        country.setdefault(pid, t)

    over = json.loads((ROOT / "analysis" / "nationality_overrides.json").read_text())["overrides"]
    pname = dict(zip(mp.player_id, mp.player_name))

    def nat(pid):
        c = country.get(pid) or over.get(pname.get(pid, ""))
        if pname.get(pid) in over:
            c = over[pname[pid]]
        return c if c else "India (uncapped)"

    squad = []
    for pid, name in zip(sq.player_id, sq.player_name):
        xb = rr_bat[(rr_bat.striker_id == pid) & ~rr_bat.is_wide]
        xw = rr_bowl[rr_bowl.bowler_id == pid]
        apps = d[(d.team_name == RR) | (d.opp_name == RR)]
        played = len(set(xb.match_id) | set(xw.match_id) | set(apps[apps.non_striker_id == pid].match_id))
        row = {"id": int(pid), "name": name, "nat": nat(pid), "overseas": nat(pid) not in ("India", "India (uncapped)"),
               "matches": played}
        if len(xb):
            outs = int(((xb.striker_out == 1)).sum())
            row["bat"] = {"balls": int(len(xb)), "runs": int(xb.runs.sum()), "outs": outs,
                          "sr": r1(100 * xb.runs.sum() / len(xb)), "avg": r1(xb.runs.sum() / outs) if outs else None,
                          "rv": r1(xb.rv_bat.sum()), "rv100": r1(100 * xb.rv_bat.mean()),
                          "p_balls": int(xb.pressure.sum()),
                          "p_rv100": r1(100 * xb[xb.pressure].rv_bat.mean()) if xb.pressure.any() else None,
                          "phases": {ph: {"balls": int((xb.phase == ph).sum()),
                                          "sr": r1(100 * xb[xb.phase == ph].runs.sum() / max((xb.phase == ph).sum(), 1)),
                                          "rv100": r1(100 * xb[xb.phase == ph].rv_bat.mean()) if (xb.phase == ph).any() else None}
                                     for ph in PHASES}}
        if len(xw):
            lg = int(xw.legal.sum())
            row["bowl"] = {"balls": lg, "runs": int(xw.bowler_runs.sum()), "wkts": int(xw.bowler_wkt.sum()),
                           "econ": r1(6 * xw.bowler_runs.sum() / max(lg, 1), 2), "rv": r1(xw.rv_bowl.sum()),
                           "rv100": r1(100 * xw.rv_bowl.mean()), "type": xw.bowling_type.mode().iat[0],
                           "pace": xw.pace_or_spin.mode().iat[0],
                           "p_balls": int(xw.pressure.sum()),
                           "p_rv100": r1(100 * xw[xw.pressure].rv_bowl.mean()) if xw.pressure.any() else None,
                           "phases": {ph: {"balls": int((xw.phase == ph).sum()),
                                           "econ": r1(6 * xw[xw.phase == ph].bowler_runs.sum() / max(xw[xw.phase == ph].legal.sum(), 1), 2),
                                           "rv100": r1(100 * xw[xw.phase == ph].rv_bowl.mean()) if (xw.phase == ph).any() else None}
                                      for ph in PHASES}}
        squad.append(row)
    squad.sort(key=lambda r: -((r.get("bat") or {}).get("balls", 0) + (r.get("bowl") or {}).get("balls", 0)))

    # ------------------------------------------------------------ shortcomings
    gaps = []
    for lp in league_phase:
        ph = lp["phase"]
        for disc in ("bat", "bowl"):
            rr_v = lp["rr"][f"{disc}_rv_pm"]
            t4 = lp["top4"][f"{disc}_rv_pm"]
            gaps.append({"key": f"{disc}_{ph.lower()}", "discipline": disc, "phase": ph,
                         "rr_rv_pm": rr_v, "top4_rv_pm": t4, "gap_vs_avg": rr_v, "gap_vs_top4": r1(rr_v - t4, 2),
                         "rank": lp[f"{disc}_rank"]})
    gaps.sort(key=lambda g: g["gap_vs_avg"])

    ROLE = {
        "bat_powerplay": ("Powerplay batter", "Opening or top-order batter who scores fast in overs 1-6 without losing wickets"),
        "bat_middle": ("Middle-overs batter", "Batter who keeps the score moving in overs 7-15, especially against spin"),
        "bat_death": ("Finisher", "Lower-middle-order hitter who adds runs in overs 16-20"),
        "bowl_powerplay": ("New-ball bowler", "Bowler who takes early wickets and controls the powerplay"),
        "bowl_middle": ("Middle-overs bowler", "Wicket-taking bowler who strangles overs 7-15"),
        "bowl_death": ("Death bowler", "Bowler who defends totals in overs 16-20"),
    }

    # ------------------------------------------------------------ candidates
    pool_b = b[(b.season_yr >= 2024) & ((b.comp_tier == "IPL") | (b.comp_tier == "T20I Full"))].copy()
    pool_b["w"] = pool_b.season_yr.map(REC_W) * pool_b.comp_weight
    press_bat = {p["id"]: p for p in bat_json["players"]}
    press_bowl = {p["id"]: p for p in bowl_json["players"]}
    ipl26_team = (mp[mp.comp_id == 3298].groupby("player_id").team_name.last()).to_dict()
    released = set(pool.get("released_ids", []))
    pool_known = bool(pool.get("released_ids"))

    def role_table(disc, ph, min_balls):
        if disc == "bat":
            x = pool_b[(pool_b.phase == ph) & ~pool_b.is_wide]
            pid, name, rv = x.striker_id, x.striker_name, x.rv_bat
        else:
            x = pool_b[pool_b.phase == ph]
            pid, name, rv = x.bowler_id, x.bowler_name, x.rv_bowl
        t = pd.DataFrame({"pid": pid, "name": name, "rv": rv, "w": x.w, "runs": x.runs if disc == "bat" else x.bowler_runs,
                          "legal": x.legal.astype(int), "wkt": x.striker_out if disc == "bat" else x.bowler_wkt,
                          "s26": (x.season_yr == 2026) & (x.comp_tier == "IPL"), "sipl": x.comp_tier == "IPL"})
        t["wrv"] = t.w * t.rv
        g = t.groupby("pid").agg(name=("name", lambda s: s.mode().iat[0]), balls=("rv", "size"), wn=("w", "sum"),
                                 wrv=("wrv", "sum"), runs=("runs", "sum"), legal=("legal", "sum"), wkt=("wkt", "sum"),
                                 b26=("s26", "sum"), bipl=("sipl", "sum"))
        g["rv100"] = 100 * g.wrv / (g.wn + SHRINK_BALLS)  # shrunk toward 0 (league average)
        g = g[g.balls >= min_balls]
        return g

    # Target the areas where RR trailed the top four most: the bar for winning the title.
    targets = sorted([g for g in gaps if g["gap_vs_top4"] < 0], key=lambda g: g["gap_vs_top4"])[:3]
    recs = []
    for gp in targets:
        disc, ph = gp["discipline"], gp["phase"]
        # export a wide pool (30+ balls in the role); the dashboard applies the default
        # minimum (90 batting / 120 bowling) and lets the viewer change it
        g = role_table(disc, ph, CAND_EXPORT_MIN)
        pj = press_bat if disc == "bat" else press_bowl
        g["press_score"] = [pj[i]["score"] if i in pj and pj[i]["score"] is not None else np.nan for i in g.index]
        z_role = (g.rv100 - g.rv100.mean()) / g.rv100.std(ddof=0)
        ps = g.press_score
        z_press = ((ps - ps.mean()) / ps.std(ddof=0)).fillna(-0.5)  # unproven under pressure: small penalty
        g["fit"] = 0.7 * z_role + 0.3 * z_press
        g = g.sort_values("fit", ascending=False)

        def cand(pid, r):
            c = {"id": int(pid), "name": r["name"], "nat": nat(pid), "overseas": nat(pid) not in ("India", "India (uncapped)"),
                 "ipl_team_2026": ipl26_team.get(pid), "balls": int(r.balls),
                 "rv100": r1(r.rv100), "fit": r1(r.fit, 2),
                 "press_score": r1(r.press_score, 2) if not np.isnan(r.press_score) else None,
                 "press_rank": pj[pid]["rank"] if pid in pj else None,
                 "rated": pid in pj,
                 "ipl26_balls": int(r.b26), "ipl_balls": int(r.bipl)}
            if disc == "bat":
                c["sr"] = r1(100 * r.runs / max(r.balls, 1))
                c["avg"] = r1(r.runs / r.wkt) if r.wkt else None
            else:
                c["econ"] = r1(6 * r.runs / max(r.legal, 1), 2)
                c["bpw"] = r1(r.legal / r.wkt) if r.wkt else None
            c["status"] = ("in auction pool" if pid in released else
                           ("retained elsewhere" if pool_known else "check retention list"))
            return c

        external = [cand(pid, r) for pid, r in g.iterrows() if pid not in squad_ids
                    and (not pool_known or pid in released)][:CAND_EXPORT_TOP]
        internal = [cand(pid, r) for pid, r in g.iterrows() if pid in squad_ids][:8]
        # benchmark: league-average and RR's own 2026 usage in this role
        recs.append({"gap": gp, "role": ROLE[gp["key"]][0], "role_desc": ROLE[gp["key"]][1],
                     "default_min_balls": 90 if disc == "bat" else 120,
                     "candidates": external, "internal": internal})


    rr_row = table[table.team == RR].iloc[0]
    out = {
        "season": SEASON,
        "summary": {"pos": int(rr_row.pos), "played": int(rr_row.played), "won": int(rr_row.won),
                    "lost": int(rr_row.lost), "points": int(rr_row.points), "nrr": float(rr_row.nrr),
                    "playoff_result": "Won the Eliminator, lost Qualifier 2" if any(
                        m["stage"] == "Qualifier" and not m["won"] for m in matches) else None,
                    "matches": len(matches), "wins_all": sum(m["won"] for m in matches)},
        "table": table.to_dict(orient="records"),
        "top4": top4,
        "phases": league_phase,
        "matchups": matchups,
        "order": order,
        "pressure": pressure,
        "matches": matches,
        "squad": squad,
        "gaps": gaps,
        "recommendations": recs,
        "pool": {"known": pool_known, "updated": pool.get("updated")},
    }
    # ------------------------------------------------------------ provenance + cross-checks
    # Reference figures from the public record (Wikipedia, "2026 Rajasthan Royals season",
    # accessed 2026-11-16). Every value below is recomputed from the data pack and compared.
    ref_url = "https://en.wikipedia.org/wiki/2026_Rajasthan_Royals_season"
    def top(key, stat, k=5):
        rows = [p for p in squad if p.get(key)]
        rows.sort(key=lambda p: -p[key][stat])
        return [(p["name"], p[key][stat]) for p in rows[:k]]
    ours_runs = dict(top("bat", "runs"))
    ours_wkts = dict(top("bowl", "wkts"))
    reference = [
        ("League position", "4th", f"{int(rr_row.pos)}th"),
        ("League record (W-L)", "8-6", f"{int(rr_row.won)}-{int(rr_row.lost)}"),
        ("Points", "16", str(int(rr_row.points))),
        ("Net run rate", "+0.189", f"{rr_row.nrr:+.3f}"),
        ("Eliminator v SRH", "Won by 47 runs", "Won by " + next(m["result"].split("Won by ")[-1] for m in matches if m["stage"] == "Eliminator")),
        ("Qualifier 2 v GT", "Lost by 7 wickets", "Lost by " + next(m["result"].split("Won by ")[-1] for m in matches if m["stage"] == "Qualifier")),
        ("Vaibhav Sooryavanshi runs", "776", str(ours_runs.get("Vaibhav Sooryavanshi"))),
        ("Dhruv Jurel runs", "515", str(ours_runs.get("Dhruv Jurel"))),
        ("Yashasvi Jaiswal runs", "427", str(ours_runs.get("Yashasvi Jaiswal"))),
        ("Donovan Ferreira runs", "317", str(ours_runs.get("Donovan Ferreira"))),
        ("Riyan Parag runs", "309", str(ours_runs.get("Riyan Parag"))),
        ("Jofra Archer wickets", "25", str(ours_wkts.get("Jofra Archer"))),
        ("Brijesh Sharma wickets", "14", str(ours_wkts.get("Brijesh Sharma"))),
        ("Ravi Bishnoi wickets", "11", str(ours_wkts.get("Ravi Bishnoi"))),
        ("Ravindra Jadeja wickets", "10", str(ours_wkts.get("Ravindra Jadeja"))),
    ]
    norm = lambda v: str(v).lower().replace("+", "").replace("th", "").strip()
    checks = [{"item": a, "public": b, "ours": c, "match": norm(b) == norm(c)} for a, b, c in reference]
    rr_ids = sorted({m["id"] for m in matches})
    provenance = {
        "files": [
            {"file": "ball_by_ball.csv", "use": "Every delivery of RR's 16 IPL 2026 matches (and the rest of the league for benchmarks)",
             "rows": int(len(d[(d.team_name == RR) | (d.opp_name == RR)]))},
            {"file": "matches.csv", "use": "Fixtures, stage, toss, revised targets and official results", "rows": len(rr_ids)},
            {"file": "competitions.csv", "use": "IPL 2026 is competition id 3298", "rows": 1},
            {"file": "competition_team_player_mapping.csv", "use": "RR's registered IPL 2026 squad", "rows": int(len(sq))},
            {"file": "playing_eleven.csv", "use": "Who played each match", "rows": None},
        ],
        "comp_id": 3298,
        "match_ids": rr_ids,
        "league_balls": int(len(d)),
        "league_matches": int(d.match_id.nunique()),
        "reference": {"name": "Wikipedia: 2026 Rajasthan Royals season", "url": ref_url, "accessed": "2026-11-16"},
        "checks": checks,
        "checks_passed": int(sum(c["match"] for c in checks)),
    }

    out["provenance"] = provenance
    (OUT / "rr2026.json").write_text(json.dumps(out, separators=(",", ":"), default=str))
    # console digest
    print(table[["pos", "team", "won", "lost", "points", "nrr"]].to_string(index=False))
    print("\nGAPS (runs per match vs average side):")
    for g in gaps:
        print(f"  {g['discipline']:>4} {g['phase']:<9} {g['gap_vs_avg']:+.2f}  vs top4 {g['gap_vs_top4']:+.2f}  rank {g['rank']}")
    for r in recs:
        print(f"\n{r['role']}: " + ", ".join(f"{c['name']} ({c['rv100']:+}, {c['nat']})" for c in r["candidates"][:8]))
        print("   internal: " + ", ".join(f"{c['name']} ({c['rv100']:+})" for c in r["internal"]))
    print("\nmatchups", {k: v for k, v in matchups.items() if k != "teams"})
    print("pressure", {k: v for k, v in pressure.items() if k != "teams"})
    print("order", order)


if __name__ == "__main__":
    main()
