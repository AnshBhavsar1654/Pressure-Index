import csv

import pytest

from pressure_index import pipeline
from pressure_index.data import build, dataset


@pytest.fixture
def snapshot(tmp_path):
    rows = {
        dataset.DELIVERIES: {
            "match_id": 1, "innings": 1, "innings_ball_num": 1,
            "batting_team_id": 10, "bowling_team_id": 11,
            "striker_id": 15, "non_striker_id": 15, "bowler_id": 15,
            "is_four": False, "is_six": False, "is_wicket": False, "dismissed_player_id": "",
        },
        dataset.MATCHES: {
            "match_id": 1, "comp_id": 2, "cricsheet_id": 12345,
            "home_team_id": 10, "home_team": "Home", "away_team_id": 11, "away_team": "Away",
            "toss_win_team_id": "", "win_team_id": "",
        },
        dataset.COMPETITIONS: {"comp_id": 2},
        dataset.MEMBERSHIP: {"comp_id": 2, "team_id": 10, "team_name": "Home", "player_id": 15},
        dataset.PLAYERS: {"player_id": 15, "name": "Example Player", "cricsheet_id": "0000000f"},
    }
    for name, row in rows.items():
        with (tmp_path / name).open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=dataset.REQUIRED_COLUMNS[name].split())
            writer.writeheader()
            writer.writerow(row)
    for name, fields in dataset.LOOKUPS.items():
        (tmp_path / name).write_text(",".join(fields) + "\n", encoding="utf-8")
    return tmp_path


def test_snapshot_accepts_nullable_references_and_preserves_text_ids(snapshot):
    counts = dataset.validate(snapshot)
    assert counts[dataset.DELIVERIES] == 1
    assert len(counts) == 8
    assert dataset.read_table(snapshot, dataset.PLAYERS).cricsheet_id.iat[0] == "0000000f"


def test_snapshot_rejects_duplicate_delivery_keys(snapshot):
    deliveries = snapshot / dataset.DELIVERIES
    with deliveries.open("a", encoding="utf-8") as file:
        file.write(deliveries.read_text(encoding="utf-8").splitlines()[1] + "\n")
    with pytest.raises(ValueError, match=r"ball_by_ball\.csv: empty or duplicate key.*match_id.*1"):
        dataset.validate(snapshot)


def test_snapshot_rejects_orphaned_player_ids(snapshot):
    players = snapshot / dataset.PLAYERS
    players.write_text("player_id,name,cricsheet_id\n16,Other Player,00000010\n", encoding="utf-8")
    with pytest.raises(ValueError, match=r"ball_by_ball\.csv: unknown striker_id.*15"):
        dataset.validate(snapshot)


def test_nationality_lookup_prefers_selected_source_and_supports_legacy(snapshot, monkeypatch):
    file = snapshot / dataset.NATIONALITIES
    file.write_text("player_name,country\nExample Player,England\n", encoding="utf-8")
    monkeypatch.setattr(dataset, "DATASET", snapshot)
    legacy = snapshot / "legacy"
    legacy.mkdir()
    assert dataset.nationality_overrides(legacy) == {"Example Player": "England"}
    (legacy / file.name).write_text("player_name,country\nExample Player,Ireland\n", encoding="utf-8")
    assert dataset.nationality_overrides(legacy) == {"Example Player": "Ireland"}


@pytest.mark.parametrize("changed_file", [dataset.MATCHES, "win_probability.json"])
def test_changed_input_or_cache_requires_refitting(snapshot, monkeypatch, changed_file):
    outputs = (snapshot / "balls.parquet", snapshot / "pressure_models.joblib", snapshot / "win_probability.json")
    for variable, path in zip(("BALLS", "MODELS", "WP_METRICS"), outputs):
        path.write_bytes(b"original")
        monkeypatch.setattr(pipeline, variable, path)
    stamp = snapshot / "model-inputs.sha256"
    stamp.write_text(pipeline._cache_stamp(dataset.model_input_digest(snapshot), outputs), encoding="ascii")
    monkeypatch.setattr(pipeline, "MODEL_INPUTS", stamp)
    with (snapshot / changed_file).open("ab") as file:
        file.write(b"changed")
    with pytest.raises(ValueError, match="Run `python -m pressure_index model` first"):
        pipeline.load_cached(snapshot)


def test_build_preserves_documentation_updated_while_running(snapshot, monkeypatch):
    monkeypatch.setattr(build, "DATASET", snapshot)
    readme = snapshot / "README.md"
    readme.write_text("Original", encoding="utf-8")

    def rebuild(staged):
        for name in dataset.TABLES:
            (staged / name).write_bytes((snapshot / name).read_bytes())
        readme.write_text("Edited during the build", encoding="utf-8")

    monkeypatch.setattr(build, "build_tables", rebuild)
    build.main()
    assert readme.read_text(encoding="utf-8") == "Edited during the build"
    assert dataset.validate(snapshot)[dataset.DELIVERIES] == 1


def test_build_keeps_previous_snapshot_when_lookup_changes(snapshot, monkeypatch):
    monkeypatch.setattr(build, "DATASET", snapshot)
    deliveries = snapshot / dataset.DELIVERIES
    original = deliveries.read_bytes()

    def rebuild(staged):
        for name in dataset.TABLES:
            (staged / name).write_bytes((snapshot / name).read_bytes())
        (snapshot / dataset.CITY_COUNTRY).write_text("city,venue_country\nLondon,England\n", encoding="utf-8")

    monkeypatch.setattr(build, "build_tables", rebuild)
    with pytest.raises(ValueError, match="city_country.csv changed during the build"):
        build.main()
    assert deliveries.read_bytes() == original
    assert dataset.read_lookup(snapshot, dataset.CITY_COUNTRY) == {"London": "England"}
