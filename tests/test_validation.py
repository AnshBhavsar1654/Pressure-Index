"""Leakage checks on the validation scheme."""
from __future__ import annotations

import numpy as np
from sklearn.model_selection import GroupKFold

from pressure_index.data.build import overs_to_balls


def test_groupkfold_never_splits_a_match():
    rng = np.random.default_rng(0)
    match = np.repeat(np.arange(200), rng.integers(100, 250, 200))
    X = np.zeros((len(match), 1))
    for tr, te in GroupKFold(n_splits=5).split(X, groups=match):
        assert not set(match[tr]) & set(match[te])


def test_overs_notation():
    assert overs_to_balls(15) == 90
    assert overs_to_balls(14.4) == 88
    assert np.isnan(overs_to_balls(None))
