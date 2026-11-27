"""Read and validate the CSV input tables."""
from __future__ import annotations

import hashlib
from pathlib import Path

import pandas as pd

from pressure_index.config import DATASET

DELIVERIES = "ball_by_ball.csv"
MATCHES = "matches.csv"
COMPETITIONS = "competitions.csv"
MEMBERSHIP = "competition_team_player_mapping.csv"
PLAYERS = "players.csv"
CITY_COUNTRY = "city_country.csv"
PLAYER_NAMES = "player_name_overrides.csv"
NATIONALITIES = "nationality_overrides.csv"

MODEL_TABLES = (DELIVERIES, MATCHES, COMPETITIONS, MEMBERSHIP)
TABLES = (*MODEL_TABLES, PLAYERS)
LOOKUPS = {
    CITY_COUNTRY: ("city", "venue_country"),
    PLAYER_NAMES: ("cricsheet_id", "display_name"),
    NATIONALITIES: ("player_name", "country"),
}
KEYS = {
    DELIVERIES: ("match_id", "innings", "innings_ball_num"),
    MATCHES: ("match_id",),
    COMPETITIONS: ("comp_id",),
    MEMBERSHIP: ("comp_id", "team_id", "player_id"),
    PLAYERS: ("player_id",),
}
REQUIRED_COLUMNS = {
    DELIVERIES: (
        "match_id innings overid over_ball_num innings_ball_num batting_team_id bowling_team_id "
        "striker_id striker_name non_striker_id non_striker_name bowler_id bowler_name batting_order "
        "runs is_four is_six is_wicket dismissal_type dismissed_player_id extras_type extras1_runs extras_2_runs"
    ),
    MATCHES: (
        "match_id comp_id match_number match_date stage venue city venue_country home_team_id home_team "
        "away_team_id away_team toss_win_team_id toss_opted player_of_match first_inn_revised_overs "
        "second_inn_revised_overs revised_target knock_out win_team_id result cricsheet_id"
    ),
    COMPETITIONS: "comp_id comp_name match_format season",
    MEMBERSHIP: "comp_id comp_name team_id team_name player_id player_name",
    PLAYERS: "player_id name cricsheet_id",
}


def read_table(source: Path, name: str) -> pd.DataFrame:
    path = source / name
    dtypes = {"cricsheet_id": "string"} if name == PLAYERS else {}
    if name == DELIVERIES:
        dtypes = {"is_four": bool, "is_six": bool, "is_wicket": bool}
    try:
        return pd.read_csv(path, dtype=dtypes, low_memory=False)
    except ValueError as exc:
        raise ValueError(f"{path}: {exc}") from exc


def _require_columns(path: Path, frame: pd.DataFrame, columns: list[str]) -> None:
    missing = sorted(set(columns) - set(frame.columns))
    if missing:
        raise ValueError(f"{path}: missing columns {', '.join(missing)}")


def _check_key(path: Path, frame: pd.DataFrame, columns: list[str]) -> None:
    keys = frame[columns]
    invalid = keys.isna().any(axis=1) | keys.eq("").any(axis=1) | keys.duplicated()
    if invalid.any():
        raise ValueError(f"{path}: empty or duplicate key {keys.loc[invalid].iloc[0].to_dict()}")


def read_lookup(source: Path, name: str) -> dict[str, str]:
    path = source / name
    key, value = LOOKUPS[name]
    rows = pd.read_csv(path, dtype=str, keep_default_na=False)
    _require_columns(path, rows, [key, value])
    _check_key(path, rows, [key])
    if rows[value].eq("").any():
        raise ValueError(f"{path}: blank {value} for {rows.loc[rows[value].eq(''), key].iloc[0]!r}")
    return dict(zip(rows[key], rows[value]))


def nationality_overrides(source: Path) -> dict[str, str]:
    # Older PI_SOURCE folders contain only the generated tables.
    if (source / NATIONALITIES).is_file():
        return read_lookup(source, NATIONALITIES)
    return read_lookup(DATASET, NATIONALITIES)


def model_input_digest(source: Path) -> str:
    digest = hashlib.sha256()
    for name in MODEL_TABLES:
        with (source / name).open("rb") as table:
            digest.update(name.encode("ascii"))
            digest.update(hashlib.file_digest(table, "sha256").digest())
    return digest.hexdigest()


def validate(source: Path) -> dict[str, int]:
    frames = {}
    for name in TABLES:
        path = source / name
        frame = read_table(source, name)
        _require_columns(path, frame, REQUIRED_COLUMNS[name].split())
        _check_key(path, frame, list(KEYS[name]))
        frames[name] = frame

    for name in (MATCHES, PLAYERS):
        _check_key(source / name, frames[name], ["cricsheet_id"])

    deliveries = frames[DELIVERIES]
    ordered = deliveries.sort_values(list(KEYS[DELIVERIES]))
    expected = ordered.groupby(["match_id", "innings"], sort=False).cumcount() + 1
    out_of_sequence = ordered.loc[ordered.innings_ball_num.ne(expected), list(KEYS[DELIVERIES])]
    if not out_of_sequence.empty:
        raise ValueError(f"{source / DELIVERIES}: non-consecutive delivery key {out_of_sequence.iloc[0].to_dict()}")

    matches = frames[MATCHES]
    home = matches[["home_team_id", "home_team"]].set_axis(["team_id", "team_name"], axis=1)
    away = matches[["away_team_id", "away_team"]].set_axis(["team_id", "team_name"], axis=1)
    team_names = pd.concat([home, away]).drop_duplicates()
    _check_key(source / MATCHES, team_names, ["team_id"])
    teams = set(team_names.team_id)
    match_ids = set(frames[MATCHES].match_id)
    competition_ids = set(frames[COMPETITIONS].comp_id)
    player_ids = set(frames[PLAYERS].player_id)
    references = {
        DELIVERIES: {
            "match_id": match_ids, "batting_team_id": teams, "bowling_team_id": teams,
            "striker_id": player_ids, "non_striker_id": player_ids, "bowler_id": player_ids,
            "dismissed_player_id": player_ids,
        },
        MATCHES: {"comp_id": competition_ids, "toss_win_team_id": teams, "win_team_id": teams},
        MEMBERSHIP: {"comp_id": competition_ids, "player_id": player_ids, "team_id": teams},
    }
    nullable = {"dismissed_player_id", "toss_win_team_id", "win_team_id"}
    for name, columns in references.items():
        for column, valid in columns.items():
            values = frames[name][column]
            if column in nullable:
                values = values.dropna()
            unknown = values[~values.isin(valid)]
            if not unknown.empty:
                raise ValueError(f"{source / name}: unknown {column} {unknown.iloc[0]!r}")

    membership = frames[MEMBERSHIP]
    expected_team = membership.team_id.map(team_names.set_index("team_id").team_name)
    wrong_team = membership.loc[membership.team_name.ne(expected_team), ["team_id", "team_name"]]
    if not wrong_team.empty:
        raise ValueError(f"{source / MEMBERSHIP}: inconsistent team name {wrong_team.iloc[0].to_dict()}")

    return {name: len(frame) for name, frame in frames.items()} | {
        name: len(read_lookup(source, name)) for name in LOOKUPS
    }
