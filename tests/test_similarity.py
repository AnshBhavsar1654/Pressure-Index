"""The recommender's building blocks on synthetic data."""
from __future__ import annotations

import numpy as np

from pressure_index.analysis.similarity import _neighbours, reasons


def test_neighbours_exclude_self_and_rank_by_cosine():
    Z = np.array([[1.0, 0.0], [0.9, 0.1], [0.0, 1.0], [-1.0, 0.0]])
    idx, sim = _neighbours(Z, k=2)
    assert 0 not in idx[0]                      # never recommends the player to himself
    assert idx[0][0] == 1                       # closest direction first
    assert np.all(np.diff(sim, axis=1) <= 1e-12)  # similarities sorted, best first
    assert sim[0][0] > 0.95


def test_reasons_name_shared_distinctive_traits_only():
    cols = ["sr", "dot", "death"]
    a = np.array([2.0, -1.5, 0.1])
    b = np.array([1.8, -1.2, -2.0])
    out = reasons(a, b, cols)
    assert out[0] == "fast scorer"              # both far above average, same sign
    assert "few dot balls" in out               # both below average: the low label
    assert all("death" not in r for r in out)   # opposite signs are not a shared trait
