"""Core modelling stage: deliveries in, every ball scored out.

    canonical CSVs -> match state -> run expectancy -> win probability (+ exact final over)
                   -> stakes / pressure balls -> runs added -> data/cache/balls.parquet

Fitted models are saved to artifacts/models/ and their validation metrics to artifacts/metrics/.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import pandas as pd

from pressure_index.config import ARTIFACTS, CACHE, SOURCE, log
from pressure_index.features.match_state import build_state, load
from pressure_index.models.leverage import flag_pressure, leverage
from pressure_index.models.run_expectancy import run_expectancy
from pressure_index.models.win_prob import fit_wp
from pressure_index.rating.run_value import run_value

BALLS = CACHE / "balls.parquet"


def run(source: Path = SOURCE) -> dict:
    b, m, mp = load(source)
    log(f"loaded {len(b):,} deliveries, {len(m):,} matches from {source}")
    b = build_state(b, m)
    re, re_reg = run_expectancy(b)
    wp, wp_metrics = fit_wp(b, re)
    b, outcome_probs = leverage(b, wp)
    b, thr = flag_pressure(b)
    b = run_value(b, re)

    CACHE.mkdir(parents=True, exist_ok=True)
    b.to_parquet(BALLS, index=False)
    (ARTIFACTS / "models").mkdir(parents=True, exist_ok=True)
    joblib.dump({"wp": wp, "re": re, "re_regressor": re_reg, "outcome_probs": outcome_probs, "threshold": thr},
                ARTIFACTS / "models" / "pressure_models.joblib")
    (ARTIFACTS / "metrics").mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "metrics" / "win_probability.json").write_text(json.dumps(wp_metrics, indent=1))
    log(f"cached {len(b):,} scored balls -> {BALLS}")
    return {"balls": b, "matches": m, "mapping": mp, "wp": wp, "wp_metrics": wp_metrics, "re": re,
            "outcome_probs": outcome_probs, "threshold": thr}


def load_cached() -> tuple[pd.DataFrame, dict]:
    models = joblib.load(ARTIFACTS / "models" / "pressure_models.joblib")
    return pd.read_parquet(BALLS), models
