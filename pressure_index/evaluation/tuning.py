"""Walk-forward hyperparameter search for the three rating settings.

For every combination of (pressure line, K, recency step): build ratings from seasons before 2025 (then
before 2026), and score how well they predict each player's runs added per pressure ball in that season
(weighted correlation, pooled over both test seasons). The production settings are reported beside the best.
"""
from __future__ import annotations

import pandas as pd

from pressure_index.config import CFG, FIRST, log
from pressure_index.evaluation.reliability import TEST_YEARS, weighted_corr
from pressure_index.rating.ratings import player_match_table, rate

PCTLS = [0.70, 0.75, 0.80, 0.85, 0.90]
KS = [50, 100, 200, 400, 800]
STEPS = [0.0, 0.1, 0.2, 0.3]


def _weights(last: int, step: float) -> dict[int, float]:
    return {y: max(round(1 - step * (last - y), 4), 0.05) for y in range(FIRST, last + 1)}


def sweep(b: pd.DataFrame) -> dict:
    live = ~b.short_match
    rows = []
    for pctl in PCTLS:
        thr = float(b[live].li.quantile(pctl))
        bp = b.assign(pressure=live & ((b.li >= thr) | (b.is_knockout == 1)))
        for role in ("bat", "bowl"):
            # next-season actual output is fixed for a given pressure line
            actual = {}
            for test in TEST_YEARS:
                _, d = player_match_table(bp[bp.season_yr == test], role, {test: 1.0})
                a = d[d.P == 1].groupby("pid").rv.agg(["size", "mean"])
                actual[test] = a[a["size"] >= 24]
            for step in STEPS:
                pms = {test: player_match_table(bp[bp.season_yr < test], role, _weights(test - 1, step))[0]
                       for test in TEST_YEARS}
                for K in KS:
                    parts = []
                    for test in TEST_YEARS:
                        t = rate(pms[test], K=K)
                        j = t[t.pn >= 25].join(actual[test], how="inner")
                        j["year"] = test
                        parts.append(j)
                    j = pd.concat(parts)
                    rows.append({"role": role, "pctl": pctl, "K": K, "step": step, "n": int(len(j)),
                                 "r": weighted_corr(j, "rating")})
        log(f"  tuning: pressure line {pctl} done")
    df = pd.DataFrame(rows)
    df["mean_corr"] = df.groupby(["pctl", "K", "step"])["r"].transform("mean")
    prod = (CFG["model"]["pressure_pctl"], CFG["model"]["K"], CFG["model"]["recency_step"])
    best = df.sort_values("mean_corr", ascending=False).iloc[0]

    def at(p, k, s):
        x = df[(df.pctl == p) & (df.K == k) & (df.step == s)]
        return {row.role: row.r for row in x.itertuples()} | {"mean": round(float(x["r"].mean()), 3)}

    return {
        "grid": {"pctl": PCTLS, "K": KS, "step": STEPS},
        "rows": df.drop(columns="mean_corr").to_dict(orient="records"),
        "production": {"pctl": prod[0], "K": prod[1], "step": prod[2], **at(*prod)},
        "best": {"pctl": float(best.pctl), "K": int(best.K), "step": float(best.step),
                 **at(best.pctl, best.K, best.step)},
    }

