"""
Worked example for the methodology page: one player's rating rebuilt step by step from
the ball-level cache, with the same functions and constants pipeline.py uses. The script
checks that every figure matches the published rating before it writes anything.

Run after pipeline.py:  python analysis/worked_example.py   (not -I: it imports pipeline.py)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline as P  # noqa: E402

ROLE = "bat"
OUT = P.OUT / "example.json"


def main():
    b = pd.read_parquet(P.ROOT / "analysis" / "cache" / "balls.parquet")
    pub = json.loads((P.OUT / "batters.json").read_text())
    k = pub["k"]
    ranked = sorted((p for p in pub["players"] if p["rank"]), key=lambda p: p["rank"])
    me = ranked[0]  # the top batter RR could sign
    pid = me["id"]

    pm, d = P.player_match_table(b, ROLE)
    t, _ = P.rate(pm, ROLE, k)
    r = t.loc[pid]

    # ---- one real ball: the player's highest-stakes pressure ball that went for a boundary or a wicket
    mine = d[(d.pid == pid) & (d.P == 1)]
    ball = mine[(mine.runs >= 4) | (mine.out == 1)].sort_values("li", ascending=False).iloc[0]
    need = int(ball.runs_needed) if ball.innings == 2 else None
    one_ball = {
        "match": f"{ball.team_name} v {ball.opp_name}", "comp": ball.comp_name, "date": str(ball.match_date)[:10],
        "over": f"{int(ball.legal_before // 6)}.{int(ball.legal_before % 6) + 1}",
        "score": f"{int(ball.runs_before)}/{int(ball.wkts_before)}", "need": need,
        "balls_left": int(ball.balls_left), "wp": round(float(ball.wp_before), 3), "stakes": round(float(ball.li), 1),
        "runs": int(ball.runs), "out": int(ball.out), "expected": round(float(ball.x_runs), 2),
        "wkt_cost": round(float(ball.wkt_cost), 2), "rv": round(float(ball.rv), 2),
        # run value is centred so the average ball of each competition-season is exactly 0
        "centre": round(float(ball.rv - (ball.runs - ball.x_runs - ball.wkt_cost * ball.out)), 2),
    }

    # ---- the rating ingredients, with every intermediate value
    n_raw = r.nwrv / r.nwn
    p_raw = r.pwrv / r.pwn
    steps = {
        "p_balls": int(r.pn), "p_matches": int(r.pmatches), "n_balls": int(r.nn),
        "p_weighted": round(float(r.pwn), 1), "n_weighted": round(float(r.nwn), 1),
        "p_raw100": round(100 * p_raw, 2), "n_raw100": round(100 * n_raw, 2),
        "league100": round(100 * k["mun"], 2), "kn": k["kn"], "kp": k["kp"],
        "n_keep": round(float(r.nwn / (r.nwn + k["kn"])), 3),
        "n_rv100": round(100 * float(r.n_rv), 2),
        "gap100": round(100 * (p_raw - n_raw), 2),
        "p_keep": round(float(r.pwn / (r.pwn + k["kp"])), 3),
        "delta100": round(100 * float(r.delta), 2),
        "p_rv100": round(100 * float(r.p_rv), 2),
        "wpa_raw100": round(float(r.pwwpa / r.pwn * 100), 3), "wpa100": round(float(r.wpa100), 3),
        "c_n": int(r.c_n), "c_pos": int(r.c_pos), "c_prior": round(k["c_prior"], 3), "cons": round(float(r.cons), 3),
    }
    for key in ("p_rv100", "n_rv100", "delta100"):
        assert abs(steps[key] - me[key]) < 0.02, (key, steps[key], me[key])
    assert abs(steps["wpa100"] - me["wpa100"]) < 0.002 and abs(steps["cons"] - me["cons"]) < 0.002

    # ---- against the qualified pool: z-scores, weights, score
    elig = [p for p in pub["players"] if p["merit_rank"] is not None]
    cols = {"pressure": "p_rv100", "impact": "wpa100", "delta": "delta100", "consistency": "cons"}
    blend = []
    for name, col in cols.items():
        v = np.array([p[col] for p in elig])
        mean, sd = float(v.mean()), float(v.std())
        z = (me[col] - mean) / sd
        blend.append({"key": name, "value": me[col], "mean": round(mean, 3), "sd": round(sd, 3),
                      "z": round(z, 2), "weight": P.DEFAULT_WEIGHTS[name], "part": round(P.DEFAULT_WEIGHTS[name] * z, 3)})
    score = sum(x["part"] for x in blend)
    assert abs(score - me["score"]) < 0.01, (score, me["score"])

    out = {"id": pid, "name": me["name"], "role": ROLE, "ball": one_ball, "steps": steps, "blend": blend,
           "score": round(score, 2), "rank": me["rank"], "n_qualified": len(elig), "n_ranked": pub["eligibility"]["n_ranked"],
           "boot": me["boot"], "press": me["press"], "norm": me["norm"]}
    OUT.write_text(json.dumps(out, indent=1, default=str))
    print(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()
