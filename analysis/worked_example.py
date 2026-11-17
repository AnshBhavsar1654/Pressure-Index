"""
Worked example for the methodology page: the top-ranked batter's rating rebuilt by hand from the
ball-level cache, with the same functions and constants pipeline.py uses. The script checks that every
figure matches the published rating before it writes anything.

Run after pipeline.py:  python analysis/worked_example.py   (not -I: it imports pipeline.py)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline as P  # noqa: E402

ROLE = "bat"
OUT = P.OUT / "example.json"


def main():
    b = pd.read_parquet(P.ROOT / "analysis" / "cache" / "balls.parquet")
    pub = json.loads((P.OUT / "batters.json").read_text())
    ranked = sorted((p for p in pub["players"] if p["rank"]), key=lambda p: p["rank"])
    me = ranked[0]  # the top batter RR could buy
    pid = me["id"]

    pm, d = P.player_match_table(b, ROLE)
    t = P.rate(pm)
    r = t.loc[pid]
    mine = d[d.pid == pid]

    # ---- one real ball: the player's highest-stakes pressure ball that went for a boundary or a wicket
    press = mine[mine.P == 1]
    ball = press[(press.runs >= 4) | (press.out == 1)].sort_values("li", ascending=False).iloc[0]
    centre = float(ball.rv - (ball.runs - ball.x_runs - ball.wkt_cost * ball.out))
    one_ball = {
        "match": f"{ball.team_name} v {ball.opp_name}", "comp": ball.comp_name, "date": str(ball.match_date)[:10],
        "over": f"{int(ball.overid) - 1}.{int(ball.over_ball_num)}",
        "score": f"{int(ball.runs_before)}/{int(ball.wkts_before)}",
        "need": int(ball.runs_needed) if ball.innings == 2 else None, "balls_left": int(ball.balls_left),
        "knockout": bool(ball.is_knockout), "threshold": None,
        "wp": round(float(ball.wp_before), 3), "wp_after": round(float(ball.wp_after), 3),
        "stakes": round(float(ball.li), 1), "runs": int(ball.runs), "out": int(ball.out),
        "expected": round(float(ball.x_runs), 2), "wkt_cost": round(float(ball.wkt_cost), 2),
        "centre": round(centre, 2), "rv": round(float(ball.rv), 2),
    }

    # ---- step 2: every pressure ball, season by season, with its recency weight
    seasons = []
    for yr, g in mine.groupby("season_yr"):
        gp, gn = g[g.P == 1], g[g.P == 0]
        seasons.append({"season": int(yr), "weight": P.SEASON_WEIGHT[int(yr)],
                        "p_balls": int(len(gp)), "p_runs": round(float(gp.rv.sum()), 1),
                        "n_balls": int(len(gn)), "n_runs": round(float(gn.rv.sum()), 1)})

    K = P.K
    normal = r.nwrv / (r.nw + K)
    rating = (r.pwrv + K * normal) / (r.pw + K)
    steps = {
        "K": K,
        "p_balls": int(r.pn), "p_matches": int(r.pmatches), "p_weighted": round(float(r.pw), 1),
        "p_sum": round(float(r.pwrv), 1), "p_raw100": round(100 * float(r.pwrv / r.pw), 1),
        "n_balls": int(r.nn), "n_weighted": round(float(r.nw), 1), "n_sum": round(float(r.nwrv), 1),
        "n_raw100": round(100 * float(r.nwrv / r.nw), 1), "n_rv100": round(100 * float(normal), 1),
        "n_keep": round(float(r.nw / (r.nw + K)), 3),
        "share": round(float(r.pw / (r.pw + K)), 3), "rating100": round(100 * float(rating), 1),
        "lift100": round(100 * float(rating - normal), 1),
        "wpa_sum": round(float(r.pwpa), 3), "wpa100": round(float(r.wpa100), 3),
        "c_pos": int(r.c_pos), "c_n": int(r.c_n),
        "recent_balls": int(r.rn), "recent100": round(100 * float(r.recent), 1), "recent_from": P.RECENT_FROM,
    }
    assert abs(100 * rating - me["p_rv100"]) < 0.02, (rating, me["p_rv100"])
    assert abs(100 * normal - me["n_rv100"]) < 0.02 and abs(100 * (rating - normal) - me["delta100"]) < 0.02
    assert abs(sum(s["weight"] * s["p_runs"] for s in seasons) - r.pwrv) < 0.5
    assert steps["p_balls"] == me["p_balls"]

    # ---- against the rest: who sits just below
    elig = [p for p in pub["players"] if p["merit_rank"] is not None]
    next_up = [{"rank": p["rank"], "name": p["name"], "rating": p["p_rv100"]} for p in ranked[1:4]]

    out = {"id": pid, "name": me["name"], "role": ROLE, "ball": one_ball, "seasons": seasons, "steps": steps,
           "rank": me["rank"], "merit_rank": me["merit_rank"], "n_qualified": len(elig),
           "n_ranked": pub["eligibility"]["n_ranked"], "next": next_up,
           "boot": me["boot"], "press": me["press"], "norm": me["norm"]}
    OUT.write_text(json.dumps(out, indent=1, default=str))
    print(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()
