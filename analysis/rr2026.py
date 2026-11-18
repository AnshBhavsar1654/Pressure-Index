"""
Rajasthan Royals: IPL 2026 season diagnosis and IPL 2027 auction targets.

Reads the ball-level cache written by pipeline.py (run that first) plus the ratings JSON,
and writes dashboard data: rr2026.json.

Method in one breath:
  * Every ball already carries a context-adjusted run value (RV): runs above what an
    average side gets from the same match state, wickets priced in. Summing RR's RV by
    phase / matchup / pressure shows exactly where RR gained or lost runs per match
    against an average IPL 2026 side. The biggest leaks are the shortcomings.
  * Each shortcoming maps to a role (e.g. "death bowler"). The picks page then marks which of
    the submitted top-10 players are strongest under pressure in that phase (no separate score).

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
IPL_2026 = 3298  # comp_id of IPL 2026, the squads the 2027 retentions are made from

RR = "Rajasthan Royals"
SEASON = 2026
PHASES = ["Powerplay", "Middle", "Death"]
PHASE_OVERS = {"Powerplay": "overs 1-6", "Middle": "overs 7-15", "Death": "overs 16-20"}


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


def retained_squad(b: pd.DataFrame, mp: pd.DataFrame, kept: list, nat, squad: list) -> list:
    """RR's retained players for 2027, each given a role from what he actually did in his matches since 2024
    (the data pack has no role field): wicket-keeper if he kept wicket in at least a quarter of his matches
    (playing_eleven is_wk), all-rounder if he bowled 6+ legal balls and faced 8+ balls a match, bowler if he
    bowled 6+ balls a match, batter otherwise. A player with no matches in the data gets no role."""
    pe = pd.read_csv(DATA / "playing_eleven.csv").merge(pd.read_csv(DATA / "matches.csv")[["match_id", "match_date"]], on="match_id")
    pe = pe[(pe.match_date >= "2024-01-01") & (pe.is_played.astype(str).str.lower() == "true")]
    bb = b[b.season_yr >= 2024]
    names = mp.groupby("player_id").player_name.last()
    rows26 = {r["id"]: r for r in squad}
    ro = ROOT / "analysis" / "role_overrides.json"
    overrides = json.loads(ro.read_text(encoding="utf-8")).get("roles", {}) if ro.exists() else {}
    out = []
    for pid in kept:
        g = pe[pe.player_id == pid]
        nm = int(g.match_id.nunique())
        wk = int((g.is_wk.astype(str).str.lower() == "true").sum())
        faced = int(len(bb[(bb.striker_id == pid) & ~bb.is_wide]))
        bowled = int(bb[bb.bowler_id == pid].legal.sum())
        fpm, bpm = faced / max(nm, 1), bowled / max(nm, 1)
        role = (None if nm == 0 else "keeper" if wk >= 0.25 * nm else "allrounder" if bpm >= 6 and fpm >= 8
                else "bowler" if bpm >= 6 else "batter")
        source = "data"
        if names.get(pid) in overrides:  # the public record, where the data cannot see the role
            role, source = overrides[names.get(pid)], "public record"
        r = rows26.get(int(pid), {})
        bat, bowl = r.get("bat"), r.get("bowl")
        out.append({"id": int(pid), "name": names.get(pid, str(pid)), "role": role, "role_source": source,
                    "overseas": nat(pid) not in ("India", "India (uncapped)"),
                    "matches": nm, "wk_matches": wk,
                    "bat26": {"runs": bat["runs"], "sr": bat["sr"]} if bat and bat.get("balls", 0) >= 10 else None,
                    "bowl26": {"wkts": bowl["wkts"], "econ": bowl["econ"]} if bowl and bowl.get("balls", 0) >= 12 else None})
    return sorted(out, key=lambda x: (-(x["bat26"] or {}).get("runs", 0), -(x["bowl26"] or {}).get("wkts", 0), -x["matches"]))


def main():
    b, mp, bat_json, bowl_json, pool = load()
    d = b[(b.is_ipl == 1) & (b.season_yr == SEASON)].copy()
    d["bat_team"] = d.team_name
    teams = sorted(d.team_name.unique())
    n_matches = {t: d[(d.team_name == t) | (d.opp_name == t)].match_id.nunique() for t in teams}

    table = points_table(d)
    top4 = table.head(4).team.tolist()
    # RR's benchmark is the OTHER playoff sides: an average that includes RR would partly compare RR with itself
    bench = [t for t in top4 if t != RR]

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
            "top4": {k: r1(avg(k, bench), 2) for k in rr if k != "phase"},
            "bat_rank": int(sorted(teams, key=lambda t: -phase_rows[t][i]["bat_rv_pm"]).index(RR) + 1),
            "bowl_rank": int(sorted(teams, key=lambda t: -phase_rows[t][i]["bowl_rv_pm"]).index(RR) + 1),
            # the best side in the phase: the playoff average is not the bar for a rank, so show both
            "best": {disc: (lambda t: {"team": t, "v": r1(phase_rows[t][i][f"{disc}_rv_pm"], 2)})(
                max(teams, key=lambda t: phase_rows[t][i][f"{disc}_rv_pm"])) for disc in ("bat", "bowl")},
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

    # ------------------------------------------------------------ retentions and target roles
    released = set(pool.get("released_ids", []))
    retained, unmatched, announced = retained_ids(mp, pool)
    if unmatched:
        print("WARNING retained names not found in the data:", unmatched)
    # the pool is final once every franchise has announced (or an official released list is given)
    pool_known = bool(released) or announced >= set(teams)
    for row in squad:
        row["retained"] = retained.get(row["id"]) == RR
    # IPL squad rules: at most 25 players, at most 8 from overseas. What RR's retentions leave open.
    # counted from the retained list itself: some retained players have no 2026 balls, so no squad row
    kept = [pid for pid, team in retained.items() if team == RR]
    kept_os = sum(nat(pid) not in ("India", "India (uncapped)") for pid in kept)
    slots = {"squad_max": 25, "overseas_max": 8, "retained": len(kept), "retained_overseas": kept_os,
             "open": 25 - len(kept), "open_overseas": 8 - kept_os} if RR in announced else None

    # Target every area that was a leak against an average side, or that left RR behind the top four
    # (the bar for winning the title). Most behind the top four first. My picks marks which of the
    # top-10 players fill these roles.
    targets = sorted([g for g in gaps if g["gap_vs_avg"] < 0 or g["gap_vs_top4"] < 0], key=lambda g: g["gap_vs_top4"])
    recs = [{"gap": gp, "role": ROLE[gp["key"]][0], "role_desc": ROLE[gp["key"]][1]} for gp in targets]
    kept_squad = retained_squad(b, mp, [pid for pid, team in retained.items() if team == RR], nat, squad)
    # what the retained squad holds, by role: the context for which players RR most need
    squad_need = {r: sum(p["role"] == r for p in kept_squad) for r in ("batter", "keeper", "allrounder", "bowler")}

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
        "bench": bench,
        "phases": league_phase,
        "matchups": matchups,
        "order": order,
        "pressure": pressure,
        "matches": matches,
        "squad": squad,
        "gaps": gaps,
        "recommendations": recs,
        "pool": {"known": pool_known, "updated": pool.get("updated"), "announced": sorted(announced)},
        "slots": slots,
        "squad_need": squad_need,
        "retained_squad": kept_squad,
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

    # Players in RR's registered IPL 2026 squad who were not in its IPL 2025 squad: the 2026 additions.
    # The data pack does not say whether each came by trade or at the auction, nor the price paid.
    ipl_map = mp[mp.comp_name.str.startswith("IPL")]
    prev_squad = set(ipl_map[(ipl_map.comp_name == "IPL 2025") & (ipl_map.team_name == RR)].player_id)
    joined = []
    for pid, name in zip(sq.player_id, sq.player_name):
        if pid in prev_squad:
            continue
        hist = ipl_map[(ipl_map.player_id == pid) & (ipl_map.comp_id != 3298)].copy()
        hist["yr"] = hist.comp_name.str[-4:].astype(int)
        hist = hist.sort_values("yr")
        past = [{"season": int(r.yr), "team": r.team_name} for r in hist.itertuples()]
        joined.append({"id": int(pid), "name": name, "from_team": past[-1]["team"] if past else None,
                       "from_season": past[-1]["season"] if past else None,
                       "returning": any(x["team"] == RR for x in past), "ipl_seasons": len({x["season"] for x in past})})
    out["joined"] = joined
    out["provenance"] = provenance
    (OUT / "rr2026.json").write_text(json.dumps(out, separators=(",", ":"), default=str))
    # console digest
    print(table[["pos", "team", "won", "lost", "points", "nrr"]].to_string(index=False))
    print("\nGAPS (runs per match vs average side):")
    for g in gaps:
        print(f"  {g['discipline']:>4} {g['phase']:<9} {g['gap_vs_avg']:+.2f}  vs top4 {g['gap_vs_top4']:+.2f}  rank {g['rank']}")
    print("\ntarget roles:", [r["role"] for r in recs])
    print("\nmatchups", {k: v for k, v in matchups.items() if k != "teams"})
    print("pressure", {k: v for k, v in pressure.items() if k != "teams"})
    print("order", order)


if __name__ == "__main__":
    main()
