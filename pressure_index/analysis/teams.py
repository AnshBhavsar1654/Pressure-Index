"""Team analysis for every IPL season: where each side won and lost runs against an average side.

Every ball already carries a context-adjusted run value, so summing a team's runs added by phase, batting
order band and pressure shows exactly where it gained or lost runs per match. Outputs per season:
points table (with net run rate), and per team: phase profile with league rank, batting-order bands,
pressure performance, match-by-match results and the squad's contributions.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

PHASES = ["Powerplay", "Middle", "Death"]
PHASE_OVERS = {"Powerplay": "overs 1-6", "Middle": "overs 7-15", "Death": "overs 16-20"}
BANDS = {"Top order (1-3)": (1, 3), "Middle order (4-7)": (4, 7), "Lower order (8-11)": (8, 11)}


def r(x, d=1):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), d)


def points_table(s: pd.DataFrame) -> pd.DataFrame:
    lg = s[s.stage == "League"]
    teams = sorted(set(lg.team_name) | set(lg.opp_name))
    rows = []
    for t in teams:
        g = lg[(lg.team_name == t) | (lg.opp_name == t)].drop_duplicates("match_id")
        tid = np.where(g.team_name == t, g.batting_team_id, g.bowling_team_id)
        won = int((g.win_team_id == tid).sum())
        nr = int(g.win_team_id.isna().sum())

        def overs(d):
            o = 0.0
            for _, gi in d.groupby("match_id"):
                o += (gi.max_balls.iloc[0] if gi.wkt.sum() >= 10 else gi.legal.sum()) / 6  # all out = full quota
            return o

        x = lg[(lg.team_name == t) | (lg.opp_name == t)]
        x = x[x.win_team_id.notna()]
        f, a = x[x.team_name == t], x[x.opp_name == t]
        nrr = f.tot.sum() / max(overs(f), 1) - a.tot.sum() / max(overs(a), 1)
        rows.append({"team": t, "played": int(len(g)), "won": won, "lost": int(len(g) - won - nr), "nr": nr,
                     "points": 2 * won + nr, "nrr": round(float(nrr), 3)})
    tab = pd.DataFrame(rows).sort_values(["points", "nrr"], ascending=False).reset_index(drop=True)
    tab["pos"] = tab.index + 1
    return tab


def season(b: pd.DataFrame, year: int) -> dict:
    s = b[(b.is_ipl == 1) & (b.season_yr == year)]
    teams = sorted(s.team_name.unique())
    n_m = {t: s[(s.team_name == t) | (s.opp_name == t)].match_id.nunique() for t in teams}
    table = points_table(s)

    phase = {t: {} for t in teams}
    for t in teams:
        for ph in PHASES:
            bat, bowl = s[(s.team_name == t) & (s.phase == ph)], s[(s.opp_name == t) & (s.phase == ph)]
            phase[t][ph] = {"bat": bat.rv_bat.sum() / n_m[t], "bowl": bowl.rv_bowl.sum() / n_m[t],
                            "bat_rpo": 6 * bat.tot.sum() / max(bat.legal.sum(), 1),
                            "bowl_rpo": 6 * bowl.tot.sum() / max(bowl.legal.sum(), 1)}
    out_teams = {}
    for t in teams:
        tb, tw = s[(s.team_name == t) & ~s.is_wide], s[s.opp_name == t]
        nm = n_m[t]
        phases = []
        for ph in PHASES:
            v = phase[t][ph]
            phases.append({
                "phase": ph, "overs": PHASE_OVERS[ph],
                "bat": r(v["bat"], 2), "bowl": r(v["bowl"], 2), "bat_rpo": r(v["bat_rpo"], 2), "bowl_rpo": r(v["bowl_rpo"], 2),
                "bat_rank": int(sorted(teams, key=lambda x: -phase[x][ph]["bat"]).index(t) + 1),
                "bowl_rank": int(sorted(teams, key=lambda x: -phase[x][ph]["bowl"]).index(t) + 1),
            })
        order = []
        for name, (lo, hi) in BANDS.items():
            x = tb[tb.batting_order.between(lo, hi)]
            lgx = s[s.batting_order.between(lo, hi) & ~s.is_wide]
            order.append({"band": name, "balls_pm": r(len(x) / nm), "rv_pm": r(x.rv_bat.sum() / nm, 2),
                          "sr": r(100 * x.runs.sum() / max(len(x), 1)), "league_sr": r(100 * lgx.runs.sum() / max(len(lgx), 1))})
        pb, pw = tb[tb.pressure], tw[tw.pressure]
        pressure = {"bat_rv100": r(100 * pb.rv_bat.mean()), "bowl_rv100": r(100 * pw.rv_bowl.mean()),
                    "bat_rv_pm": r(pb.rv_bat.sum() / nm, 2), "bowl_rv_pm": r(pw.rv_bowl.sum() / nm, 2),
                    "balls_pm": r((len(pb) + len(pw)) / nm)}
        matches = []
        for mid, g in s[(s.team_name == t) | (s.opp_name == t)].groupby("match_id"):
            g = g.sort_values(["innings", "innings_ball_num"])
            us_bat = g.team_name.iloc[0] == t
            tid = g.batting_team_id.iloc[0] if us_bat else g.bowling_team_id.iloc[0]
            opp = g.opp_name.iloc[0] if us_bat else g.team_name.iloc[0]
            sc = {int(i): {"team": gi.team_name.iloc[0], "runs": int(gi.tot.sum()), "wkts": int(gi.wkt.sum()),
                           "balls": int(gi.legal.sum())} for i, gi in g.groupby("innings")}
            matches.append({"id": int(mid), "date": str(g.match_date.iloc[0])[:10], "opp": opp, "stage": g.stage.iloc[0],
                            "result": g.result.iloc[0],
                            "won": bool(g.win_team_id.iloc[0] == tid) if pd.notna(g.win_team_id.iloc[0]) else None,
                            "scores": sc,
                            "bat_rv": r(g[(g.team_name == t) & ~g.is_wide].rv_bat.sum()),
                            "bowl_rv": r(g[g.opp_name == t].rv_bowl.sum()),
                            "pressure_balls": int(g.pressure.sum())})
        matches.sort(key=lambda m: m["date"])
        squad = []
        for pid in set(tb.striker_id) | set(tw.bowler_id):
            xb, xw = tb[tb.striker_id == pid], tw[tw.bowler_id == pid]
            name = (xb.striker_name.iloc[0] if len(xb) else xw.bowler_name.iloc[0])
            row = {"id": int(pid), "name": name, "matches": int(len(set(xb.match_id) | set(xw.match_id)))}
            if len(xb) >= 1:
                outs = int(xb.striker_out.sum())
                row["bat"] = {"balls": int(len(xb)), "runs": int(xb.runs.sum()), "outs": outs,
                              "sr": r(100 * xb.runs.sum() / len(xb)), "rv": r(xb.rv_bat.sum()),
                              "p_balls": int(xb.pressure.sum()),
                              "p_rv100": r(100 * xb[xb.pressure].rv_bat.mean()) if xb.pressure.any() else None}
            if len(xw) >= 1:
                lg = int(xw.legal.sum())
                row["bowl"] = {"balls": lg, "runs": int(xw.bowler_runs.sum()), "wkts": int(xw.bowler_wkt.sum()),
                               "econ": r(6 * xw.bowler_runs.sum() / max(lg, 1), 2), "rv": r(xw.rv_bowl.sum()),
                               "p_balls": int(xw.pressure.sum()),
                               "p_rv100": r(100 * xw[xw.pressure].rv_bowl.mean()) if xw.pressure.any() else None}
            row["rv"] = r((row.get("bat") or {}).get("rv", 0) + (row.get("bowl") or {}).get("rv", 0))
            squad.append(row)
        squad.sort(key=lambda p: -(p["rv"] or 0))
        tr = table[table.team == t]
        out_teams[t] = {
            "summary": ({k: (int(v) if k != "nrr" else float(v)) for k, v in tr.iloc[0][["pos", "played", "won", "lost", "nr", "points", "nrr"]].items()}
                        if len(tr) else None) | {"matches": nm, "wins_all": sum(bool(m["won"]) for m in matches),
                                                 "bat_rv_pm": r(tb.rv_bat.sum() / nm, 2), "bowl_rv_pm": r(tw.rv_bowl.sum() / nm, 2)},
            "phases": phases, "order": order, "pressure": pressure, "matches": matches, "squad": squad,
        }
    final = s[s.stage == "Final"]
    champion = None
    if len(final):
        g = final.iloc[0]
        champion = g.team_name if g.win_team_id == g.batting_team_id else g.opp_name
    return {"season": year, "champion": champion, "table": table.to_dict(orient="records"), "teams": out_teams,
            "league": {"matches": int(s.match_id.nunique()), "balls": int(len(s))}}


def all_seasons(b: pd.DataFrame) -> dict:
    years = sorted(int(y) for y in b[b.is_ipl == 1].season_yr.unique())
    return {"seasons": years, "by_season": {str(y): season(b, y) for y in years}}
