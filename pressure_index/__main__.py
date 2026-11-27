"""Command line: python -m pressure_index <stage> [...]

    download   fetch Cricsheet IPL + men's T20I archives and registers   -> data/raw/cricsheet/
    build      convert to canonical CSVs using the tracked lookups          -> data/dataset/
    validate-data  check the CSV schemas, keys, and references in the selected dataset
    model      fit run expectancy + win probability, score every ball     -> data/cache/, artifacts/models/
    evaluate   model comparison, tuning sweep, next-season model          -> artifacts/metrics/
    export     ratings, bootstrap, teams, similar players, per-player and per-match JSON -> web/data/, web/public/
    all        build, model, evaluate, export

    PI_SOURCE selects the CSV folder for validation, modeling, evaluation, and export.
    Download and build use the repository's default paths.
"""
from __future__ import annotations

import sys
import time

from pressure_index.config import SOURCE, log

REBUILD_STAGES = ("build", "model", "evaluate", "export")
STAGES = ("download", *REBUILD_STAGES, "validate-data")


def main(argv: list[str]) -> None:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    stages = REBUILD_STAGES if argv[0] == "all" else argv
    for s in stages:
        t = time.time()
        log(f"== {s}")
        if s == "download":
            from pressure_index.data.download import download
            download()
        elif s == "build":
            from pressure_index.data.build import main as build
            build()
        elif s == "validate-data":
            from pressure_index.data.dataset import validate
            try:
                counts = validate(SOURCE)
            except (OSError, ValueError) as exc:
                sys.exit(str(exc))
            for name, count in counts.items():
                log(f"{name}: {count:,} rows")
        elif s == "model":
            from pressure_index.pipeline import run
            run()
        elif s == "evaluate":
            from pressure_index.evaluate import run
            run()
        elif s == "export":
            from pressure_index.export.dashboard import run
            run()
        else:
            sys.exit(f"unknown stage {s!r}; choose from {', '.join(STAGES)} or all")
        log(f"== {s} done in {time.time() - t:.0f}s")


def cli() -> None:
    main(sys.argv[1:])


if __name__ == "__main__":
    cli()
