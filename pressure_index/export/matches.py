"""Match explorer data: an index of every top-level match plus one compact JSON per match.

Per match: both innings ball by ball (win probability of the side batting first, stakes, pressure flag,
outcome), the players involved, the biggest swings, and runs added for every batter and bowler.
Written to web/public/matches/<id>.json and fetched by the browser only when a match is opened.
"""
from __future__ import annotations

import json
import shutil

import numpy as np
import pandas as pd

from pressure_index.config import WEB_MATCHES


def _outcome(row) -> str:
    if row.wkt:
        return "W"
    if row.is_wide:
        return "wd"
    if row.is_nb:
        return "nb"
    return str(int(row.tot))


def export(b: pd.DataFrame) -> list[dict]:
    keep = b.top_level | b.comp_name.str.contains("World Cup", na=False)
    d = b[keep & (b.innings <= 2)].sort_values(["match_id", "innings", "innings_ball_num"])
    if WEB_MATCHES.exists():
        shutil.rmtree(WEB_MATCHES)
    WEB_MATCHES.mkdir(parents=True)
    index = []
    for mid, g in d.groupby("match_id", sort=False):
        first = g[g.innings == 1]
        if first.empty:
            continue
        t1 = first.team_name.iloc[0]
        t2 = first.opp_name.iloc[0]
        wp1 = np.where(g.innings == 1, g.wp_before, 1 - g.wp_before)  # side batting first
        people = pd.unique(pd.concat([g.striker_name, g.bowler_name]))
        pidx = {n: i for i, n in enumerate(people)}
        balls = [[int(r.innings), f"{int(r.overid) - 1}.{int(r.over_ball_num)}", round(float(w), 3),
                  round(float(r.li), 2), int(r.pressure), _outcome(r), pidx[r.striker_name], pidx[r.bowler_name]]
                 for r, w in zip(g.itertuples(), wp1)]
        inns = []
        for _, gi in g.groupby("innings"):
            inns.append({"team": gi.team_name.iloc[0], "runs": int(gi.tot.sum()), "wkts": int(gi.wkt.sum()),
                         "balls": int(gi.legal.sum()), "pressure": int(gi.pressure.sum())})
        bat = (g[~g.is_wide].groupby(["striker_name", "team_name"])
               .agg(r=("runs", "sum"), b=("runs", "size"), rv=("rv_bat", "sum"), wpa=("wpa_bat", "sum")).reset_index())
        bowl = (g.groupby(["bowler_name", "opp_name"])
                .agg(r=("bowler_runs", "sum"), b=("legal", "sum"), w=("bowler_wkt", "sum"), rv=("rv_bowl", "sum"),
                     wpa=("wpa_bat", "sum")).reset_index())
        swing = g.assign(sw=g.wpa_bat.abs()).sort_values("sw", ascending=False).head(6)
        winner = None
        if pd.notna(g.win_team_id.iloc[0]):
            winner = t1 if g.win_team_id.iloc[0] == first.batting_team_id.iloc[0] else t2
        rec = {
            "id": int(mid), "date": str(g.match_date.iloc[0])[:10], "comp": g.comp_name.iloc[0], "stage": g.stage.iloc[0],
            "teams": [t1, t2], "winner": winner, "result": g.result.iloc[0], "venue_country": g.venue_country.iloc[0],
            "knockout": bool(g.is_knockout.iloc[0]), "target": int(g[g.innings == 2].target.iloc[0]) if (g.innings == 2).any() else None,
            "innings": inns, "people": list(people), "balls": balls,
            "batting": [{"name": x.striker_name, "team": x.team_name, "r": int(x.r), "b": int(x.b), "rv": round(float(x.rv), 1),
                         "wpa": round(float(x.wpa), 3)} for x in bat.sort_values("rv", ascending=False).itertuples()],
            "bowling": [{"name": x.bowler_name, "team": x.opp_name, "r": int(x.r), "b": int(x.b), "w": int(x.w),
                         "rv": round(float(x.rv), 1), "wpa": round(float(-x.wpa), 3)}
                        for x in bowl.sort_values("rv", ascending=False).itertuples()],
            "swings": [{"inn": int(x.innings), "over": f"{int(x.overid) - 1}.{int(x.over_ball_num)}", "striker": x.striker_name,
                        "bowler": x.bowler_name, "outcome": _outcome(x), "wpa": round(float(x.wpa_bat), 3),
                        "bat_team": x.team_name} for x in swing.itertuples()],
        }
        (WEB_MATCHES / f"{int(mid)}.json").write_text(json.dumps(rec, separators=(",", ":"), default=str))
        index.append({"id": int(mid), "date": rec["date"], "comp": rec["comp"], "stage": rec["stage"], "teams": [t1, t2],
                      "winner": winner, "result": rec["result"], "knockout": rec["knockout"],
                      "score": " v ".join(f"{x['runs']}/{x['wkts']}" for x in inns),
                      "max_li": round(float(g.li.max()), 1), "pressure": int(g.pressure.sum()),
                      "drama": round(float(np.abs(np.diff(wp1)).sum()), 2)})
    index.sort(key=lambda r: r["date"], reverse=True)
    return index
