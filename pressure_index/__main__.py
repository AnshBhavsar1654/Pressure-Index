"""Command line: python -m pressure_index <stage> [...]

    download   fetch Cricsheet IPL + men's T20I archives and registers   -> data/raw/cricsheet/
    build      convert to canonical CSVs                                   -> data/processed/
    model      fit run expectancy + win probability, score every ball     -> data/cache/, artifacts/models/
    evaluate   model comparison, tuning sweep, next-season model          -> artifacts/metrics/
    export     ratings, bootstrap, teams, matches, archetypes              -> web/data/, web/public/matches/
    all        every stage after download, in order
"""
from __future__ import annotations

import sys
import time

from pressure_index.config import log

STAGES = ("download", "build", "model", "evaluate", "export")


def main(argv: list[str]) -> None:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    stages = list(STAGES[1:]) if argv[0] == "all" else argv
    for s in stages:
        t = time.time()
        log(f"== {s}")
        if s == "download":
            from pressure_index.data.download import download
            download()
        elif s == "build":
            from pressure_index.data.build import main as build
            build()
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
