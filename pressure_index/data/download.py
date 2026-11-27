"""Download Cricsheet IPL and men's T20I ball-by-ball data (ODC-BY 1.0).

Cricsheet publishes each competition as one zip archive of per-match JSON files, plus a people register
(stable ids) and a names register (alternative spellings, which include full names). Only matches from
`first_season` on are extracted.

    python -m pressure_index download
"""
from __future__ import annotations

import io
import re
import shutil
import urllib.request
import zipfile
from pathlib import Path

from pressure_index.config import CFG, RAW, log

BASE = "https://cricsheet.org"
ARCHIVES = {"ipl": "downloads/ipl_json.zip", "t20i": "downloads/t20s_male_json.zip"}
REGISTERS = {"people.csv": "register/people.csv", "names.csv": "register/names.csv"}
UA = {"User-Agent": "pressure-index (open-source cricket analytics)"}


def _get(path: str, timeout: int = 180) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(f"{BASE}/{path}", headers=UA), timeout=timeout) as r:
        return r.read()


def _season_of(raw: bytes) -> int:
    m = re.search(rb'"dates"\s*:\s*\[\s*"(\d{4})', raw)
    return int(m.group(1)) if m else 0


def download() -> None:
    first = CFG["data"]["first_season"]
    for key, path in ARCHIVES.items():
        out = RAW / key
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        z = zipfile.ZipFile(io.BytesIO(_get(path)))
        kept = 0
        for name in z.namelist():
            if not name.endswith(".json"):
                continue
            raw = z.read(name)
            if _season_of(raw) >= first:
                (out / Path(name).name).write_bytes(raw)
                kept += 1
        log(f"{key}: {kept} matches from {first} on")
    for name, path in REGISTERS.items():
        (RAW / name).write_bytes(_get(path))
    log("registers:", ", ".join(REGISTERS))


def raw_files(key: str) -> list[Path]:
    return sorted((RAW / key).glob("*.json"), key=lambda p: int(p.stem))
