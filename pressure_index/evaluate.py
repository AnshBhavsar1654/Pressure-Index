"""Evaluation stage: model comparison, hyperparameter sweep, next-season model.

Reads the scored balls from the core stage and writes artifacts/metrics/*.json, which the export stage folds
into the dashboard's Model Lab.
"""
from __future__ import annotations

import json
import os

from pressure_index.config import ARTIFACTS, log
from pressure_index.evaluation import next_season, tuning, wp_compare
from pressure_index.pipeline import load_cached

METRICS = ARTIFACTS / "metrics"


def _write(name: str, obj) -> None:
    METRICS.mkdir(parents=True, exist_ok=True)
    (METRICS / f"{name}.json").write_text(json.dumps(obj, indent=1, default=float))


def run(only: set[str] | None = None) -> None:
    b, models = load_cached()
    want = lambda k: only is None or k in only
    if want("wp"):
        # a match sample keeps the 3-model x 5-fold comparison to minutes; the production model's own
        # metrics (artifacts/metrics/win_probability.json) use every match
        n = int(os.environ.get("WP_COMPARE_MATCHES", 1500))
        _write("wp_comparison", wp_compare.compare(b, models["wp"], sample_matches=n) | {"sample_matches": n})
    if want("tuning"):
        _write("tuning", tuning.sweep(b))
    if want("next_season"):
        _write("next_season", next_season.evaluate(b))
    log("evaluation written to", METRICS)
