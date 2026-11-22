"""Unit tests on small synthetic data: no download needed."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from pressure_index.config import season_weights
from pressure_index.models.endgame import ENDGAME_BALLS, EndgameWP
from pressure_index.models.run_expectancy import grid
from pressure_index.rating.ratings import eligible_mask, rank, rate


class _ConstRate:
    """Stands in for the fitted regressor: scores 1.2 runs a ball, less with wickets down."""

    def predict(self, X):
        return 1.2 - 0.06 * X[:, 1]


def test_run_expectancy_grid_is_monotonic():
    g = grid(_ConstRate(), 1, 2025)
    assert g.shape == (121, 11)
    assert (np.diff(g, axis=0) >= -1e-9).all(), "more balls left must never mean fewer runs to come"
    assert (np.diff(g, axis=1) <= 1e-9).all(), "more wickets lost must never mean more runs to come"
    assert (g[0] == 0).all() and (g[:, 10] == 0).all()


def _endgame_fixture(seed=0, n=4000):
    rng = np.random.default_rng(seed)
    out = rng.choice(["0", "1", "2", "4", "6", "W", "X"], size=n, p=[0.3, 0.3, 0.08, 0.12, 0.08, 0.08, 0.04])
    return pd.DataFrame({
        "innings": 2, "balls_left": rng.integers(1, 13, n), "runs_needed": rng.integers(1, 40, n),
        "wkts_in_hand": rng.integers(1, 11, n), "is_ipl": rng.integers(0, 2, n),
        "is_wide": out == "X", "is_nb": False, "wkt": (out == "W").astype(int),
        "tot": np.where(np.isin(out, ["W", "X"]), np.where(out == "X", 1, 0), pd.to_numeric(out, errors="coerce")).astype(float),
    })


def test_endgame_boundaries_and_monotonicity():
    eg = EndgameWP().fit(_endgame_fixture())
    t = eg.table[1]
    # one run needed off the last ball with wickets in hand: a dot still ties (super over), so >= 0.5
    assert eg.predict([1], [1], [5], [1])[0] >= 0.5
    # needing more can never make winning likelier; more balls can never make it less likely
    assert (np.diff(t[1:, 1:, 1:], axis=0) <= 1e-12).all()
    assert (np.diff(t[1:, 1:, 1:], axis=1) >= -1e-12).all()
    # 13 off the last ball is only reachable through a run of wides: vanishingly unlikely, never impossible
    assert eg.predict([13], [1], [10], [1])[0] < 1e-6
    assert eg.predict([61], [6], [10], [1])[0] == 0.0  # beyond the model's range: treated as lost
    assert eg.table.shape[2] == ENDGAME_BALLS + 1


def _player_matches():
    rows = []
    rng = np.random.default_rng(1)
    for pid, skill in ((1, 0.10), (2, -0.05), (3, 0.0)):
        for match in range(12):
            for P in (0, 1):
                n = 20 if P == 0 else 8
                rv = rng.normal(skill + (0.05 if P else 0), 0.2, n).sum()
                rows.append({"pid": pid, "match_id": match + 100 * pid, "P": P, "R": int(match >= 6),
                             "n": n, "ne": n, "w": float(n), "wrv": rv, "rv": rv, "wpa": 0.01 * rv, "r": n, "out": 0, "li": n})
    return pd.DataFrame(rows)


def test_rating_formula_matches_definition():
    pm = _player_matches()
    t = rate(pm, K=200)
    for _, row in t.iterrows():
        normal = row.nwrv / (row.nw + 200)
        assert row.normal == pytest.approx(normal)
        assert row.rating == pytest.approx((row.pwrv + 200 * normal) / (row.pw + 200))
        assert row.lift == pytest.approx(row.rating - row.normal)


def test_shrinkage_pulls_short_records_toward_usual_level():
    pm = _player_matches()
    short, long = rate(pm, K=1e6), rate(pm, K=1e-6)
    assert np.allclose(short.rating, short.normal, atol=1e-4)       # huge K: no trust in the pressure record
    assert np.allclose(long.rating, long.pwrv / long.pw, atol=1e-4)  # tiny K: the raw pressure record


def test_bootstrap_multiplicity_equals_duplication():
    pm = _player_matches()
    doubled = rate(pd.concat([pm, pm]).assign(match_id=lambda d: d.match_id))
    weighted = rate(pm.assign(mult=2))
    for col in ("rating", "normal", "pn", "pw"):
        assert np.allclose(doubled[col], weighted[col])


def test_eligibility_and_rank():
    t = rate(_player_matches())
    elig = t[eligible_mask(t, min_balls=50, min_matches=4, min_recent=20)].index
    r = rank(t, elig)
    assert list(r.sort_values("rank").index) == list(r.sort_values("rating", ascending=False).index)
    assert r["rank"].min() == 1


def test_season_weights_step_down():
    w = season_weights(last=2026, first=2022)
    assert w[2026] == 1.0 and w[2022] == pytest.approx(0.2)
    assert all(w[y] > w[y - 1] for y in range(2023, 2027))
