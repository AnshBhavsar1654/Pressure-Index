"""Paths, settings and logging shared by every stage."""
from __future__ import annotations

import os
import sys
import tomllib
from pathlib import Path

PKG = Path(__file__).resolve().parent
ROOT = PKG.parent
DATA = ROOT / "data"
RAW = DATA / "raw" / "cricsheet"          # downloaded match files (not committed)
PROCESSED = DATA / "processed"            # canonical CSVs built from the raw files (not committed)
REFERENCE = DATA / "reference"            # small hand-checked lookup tables (committed)
CACHE = DATA / "cache"                    # ball-level model output (parquet, not committed)
ARTIFACTS = ROOT / "artifacts"            # metrics, model cards, saved models
WEB_DATA = ROOT / "web" / "data"          # JSON the dashboard reads
WEB_PUBLIC = ROOT / "web" / "public"
WEB_MATCHES = WEB_PUBLIC / "matches"           # one small JSON per match, fetched on demand
WEB_PLAYERS = WEB_PUBLIC / "data" / "players"  # one JSON per player and role, loaded on demand

CFG = tomllib.loads((PKG / "config.toml").read_text(encoding="utf-8"))

# The source of the canonical CSVs. Defaults to the Cricsheet build; PI_SOURCE points at another folder
# with the same five files (used to check that refactors reproduce earlier outputs exactly).
SOURCE = Path(os.environ.get("PI_SOURCE", PROCESSED))
N_BOOT = int(os.environ.get("N_BOOT", CFG["evaluation"]["n_boot"]))

FIRST, LAST = CFG["data"]["first_season"], CFG["data"]["last_season"]
SEASONS = list(range(FIRST, LAST + 1))
FULL_MEMBERS = set(CFG["data"]["full_members"])
TOP_LEVEL = ("IPL", "T20I Full")


def season_weights(last: int = LAST, first: int = FIRST) -> dict[int, float]:
    """Recency weights: the latest season counts 1.0 and each season back `recency_step` less."""
    step = CFG["model"]["recency_step"]
    return {y: round(1 - step * (last - y), 4) for y in range(first, last + 1)}


def log(*a) -> None:
    print(*a, file=sys.stderr, flush=True)
