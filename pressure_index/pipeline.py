"""Core modelling stage: deliveries in, every ball scored out.

    canonical CSVs -> match state -> run expectancy -> win probability (+ exact final over)
                   -> stakes / pressure balls -> runs added -> data/cache/balls.parquet

Fitted models are saved to artifacts/models/ and their validation metrics to artifacts/metrics/.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import joblib
import pandas as pd

from pressure_index.config import ARTIFACTS, CACHE, SOURCE, log
from pressure_index.data.dataset import model_input_digest
from pressure_index.features.match_state import build_state, load
from pressure_index.models.leverage import flag_pressure, leverage
from pressure_index.models.run_expectancy import run_expectancy
from pressure_index.models.win_prob import fit_wp
from pressure_index.rating.run_value import run_value

BALLS = CACHE / "balls.parquet"
MODELS = ARTIFACTS / "models" / "pressure_models.joblib"
WP_METRICS = ARTIFACTS / "metrics" / "win_probability.json"
MODEL_INPUTS = CACHE / "model-inputs.sha256"


def _cache_stamp(input_digest: str, paths: tuple[Path, ...]) -> str:
    digests = [input_digest]
    for path in paths:
        with path.open("rb") as file:
            digests.append(hashlib.file_digest(file, "sha256").hexdigest())
    return "\n".join(digests)


def run(source: Path = SOURCE) -> dict:
    input_digest = model_input_digest(source)
    b, m, mp = load(source)
    if model_input_digest(source) != input_digest:
        raise ValueError(f"CSV inputs changed while reading {source}. Rerun the model stage.")
    log(f"loaded {len(b):,} deliveries, {len(m):,} matches from {source}")
    b = build_state(b, m)
    re, re_reg = run_expectancy(b)
    wp, wp_metrics = fit_wp(b, re)
    b, outcome_probs = leverage(b, wp)
    b, thr = flag_pressure(b)
    b = run_value(b, re)

    outputs = (BALLS, MODELS, WP_METRICS)
    for path in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
    models = {"wp": wp, "re": re, "re_regressor": re_reg, "outcome_probs": outcome_probs, "threshold": thr}
    with TemporaryDirectory(prefix=".model-", dir=CACHE) as temp:
        stage = Path(temp)
        b.to_parquet(stage / BALLS.name, index=False)
        joblib.dump(models, stage / MODELS.name)
        (stage / WP_METRICS.name).write_text(json.dumps(wp_metrics, indent=1), encoding="utf-8")
        stamp = _cache_stamp(input_digest, tuple(stage / path.name for path in outputs))
        (stage / MODEL_INPUTS.name).write_text(stamp, encoding="ascii")
        MODEL_INPUTS.unlink(missing_ok=True)
        for path in (*outputs, MODEL_INPUTS):
            (stage / path.name).replace(path)
    log(f"cached {len(b):,} scored balls -> {BALLS}")
    return {"balls": b, "matches": m, "mapping": mp, "wp": wp, "wp_metrics": wp_metrics, "re": re,
            "outcome_probs": outcome_probs, "threshold": thr}


def load_cached(source: Path = SOURCE) -> tuple[pd.DataFrame, dict]:
    stale = f"Model cache is missing or out of date for {source}. Run `python -m pressure_index model` first."
    try:
        stamp = MODEL_INPUTS.read_text(encoding="ascii")
        if stamp != _cache_stamp(model_input_digest(source), (BALLS, MODELS, WP_METRICS)):
            raise ValueError(stale)
        models = joblib.load(MODELS)
        balls = pd.read_parquet(BALLS)
        if MODEL_INPUTS.read_text(encoding="ascii") != stamp:
            raise ValueError(stale)
    except FileNotFoundError as exc:
        raise ValueError(stale) from exc
    return balls, models
