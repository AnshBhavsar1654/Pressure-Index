"""
ICC Men's T20 World Cup 2026 (India and Sri Lanka, 7 February - 8 March 2026), added from public data.

The official data pack has no World Cup matches. Unstop's brief allows publicly available data alongside
it, so this script converts Cricsheet's ball-by-ball files (cricsheet.org, CC BY licence; fetched from the
public Hugging Face mirror "jeyasuryaur/cricket-data-by-cricsheet") into the data pack's own file format.

Player identity: Cricsheet writes names with initials ("BKG Mendis" is Kusal, "PHKD Mendis" is Kamindu), so
names alone are not safe. Matches that appear in both sources (the 2025-26 bilateral T20Is) are lined up
delivery by delivery, and every delivery votes on which data pack player each Cricsheet person is. A
person never seen in an overlap match is matched by surname and initial within his own country, only when
exactly one data pack player fits; otherwise he gets a new id. The result is checked and printed.

Output (read by pipeline.py next to the data pack): public_data/t20wc2026/
    ball_by_ball.csv, matches.csv, competitions.csv, competition_team_player_mapping.csv, player_map.csv

Run:  python -I analysis/public_wc2026.py [--download]
      (--download fetches the Cricsheet files into public_data/cricsheet_raw/ first)
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "Data Pack"
RAW = ROOT / "public_data" / "cricsheet_raw"
OUT = ROOT / "public_data" / "t20wc2026"
MIRROR = "https://huggingface.co/datasets/jeyasuryaur/cricket-data-by-cricsheet"
EVENT = "ICC Men's T20 World Cup"
COMP_ID, COMP_NAME = 9026, "ICC Men's T20 World Cup 2026"
MATCH_ID0 = 9_000_000          # new match ids, clear of the data pack's
NEW_PLAYER0 = 9_100_000        # players the data pack has never seen
SL_CITIES = {"Colombo", "Kandy", "Pallekele", "Dambulla", "Galle", "Hambantota"}
TEAM_ALIASES = {"United States of America": "United States Of America", "USA": "United States Of America", "UAE": "United Arab Emirates"}
DISMISSAL = {"caught": "Caught", "caught and bowled": "Caught", "bowled": "Bowled", "lbw": "LBW", "run out": "RunOut",
             "stumped": "Stump", "hit wicket": "Hit Wicket", "retired out": "Retire Out", "obstructing the field": "Obstructing the field"}
NOT_OUT = {"retired hurt", "retired not out"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- fetch (optional)
def download(min_id: int = 1440000):
    RAW.mkdir(parents=True, exist_ok=True)
    url = f"{MIRROR.replace('/datasets/', '/api/datasets/')}/tree/main/t20s_json"
    names = []
    while url:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "pressure-index"})) as r:
            names += [f["path"].split("/")[-1] for f in json.load(r)]
            m = re.search(r'<([^>]+)>;\s*rel="next"', r.headers.get("Link") or "")
            url = m.group(1) if m else None
    ids = sorted(int(n[:-5]) for n in names if n.endswith(".json") and n[:-5].isdigit() and int(n[:-5]) >= min_id)
    for i in ids:
        p = RAW / f"{i}.json"
        if not p.exists():
            with urllib.request.urlopen(f"{MIRROR}/resolve/main/t20s_json/{i}.json", timeout=60) as r:
                p.write_bytes(r.read())
    log(f"cricsheet files on disk: {len(list(RAW.glob('*.json')))}")


# ---------------------------------------------------------------- cricsheet helpers
def load_raw() -> list[dict]:
    out = []
    for p in sorted(RAW.glob("*.json")):
        j = json.loads(p.read_text(encoding="utf-8"))
        if j["info"].get("gender") == "male":
            j["_id"] = int(p.stem)
            out.append(j)
    return out


def team(n: str) -> str:
    return TEAM_ALIASES.get(n, n)


def deliveries(j: dict):
    """Each delivery with innings, over (1-based), position in the over (1-based, every delivery) and
    position in the innings, as the data pack numbers them."""
    for ii, inn in enumerate(j["innings"][:2], start=1):
        k = 0
        for ov in inn.get("overs", []):
            for pos, d in enumerate(ov["deliveries"], start=1):
                k += 1
                yield ii, team(inn["team"]), ov["over"] + 1, pos, k, d


# ---------------------------------------------------------------- identity map
def identity_map(raw: list[dict], b: pd.DataFrame, m: pd.DataFrame, mp: pd.DataFrame) -> dict:
    """Cricsheet person id -> data pack player id, by voting over deliveries of matches in both sources."""
    m = m.assign(d=pd.to_datetime(m.match_date))
    key = {}
    for r in m.itertuples():
        key.setdefault((frozenset((team(r.home_team), team(r.away_team)))), []).append((r.d, r.match_id))
    bb = {k: v for k, v in zip(zip(b.match_id, b.innings, b.overid, b.over_ball_num),
                                zip(b.striker_id, b.non_striker_id, b.bowler_id))}
    votes = defaultdict(Counter)
    paired = 0
    for j in raw:
        if j["info"].get("event", {}).get("name", "").startswith(EVENT):
            continue
        teams = frozenset(team(t) for t in j["info"]["teams"])
        day = pd.Timestamp(j["info"]["dates"][0])
        cand = [mid for d, mid in key.get(teams, []) if abs((d - day).days) <= 1]
        if len(cand) != 1:
            continue
        mid, reg = cand[0], j["info"]["registry"]["people"]
        paired += 1
        for ii, _, ov, pos, _, d in deliveries(j):
            row = bb.get((mid, ii, ov, pos))
            if row is None:
                continue
            for cs_name, pid in zip((d["batter"], d["non_striker"], d["bowler"]), row):
                if cs_name in reg and pd.notna(pid):
                    votes[reg[cs_name]][int(pid)] += 1
    ident = {}
    for person, c in votes.items():
        (pid, n), total = c.most_common(1)[0], sum(c.values())
        if n >= 3 and n / total >= 0.8:
            ident[person] = pid
    log(f"identity map: {paired} overlapping matches lined up, {len(ident)} people matched")
    return ident


def name_fallback(cs_name: str, country: str, mp: pd.DataFrame, taken: set) -> int | None:
    """Surname and initial within the player's country, used only when exactly one data pack player fits."""
    parts = cs_name.replace(".", " ").split()
    if len(parts) < 2:
        return None
    sur, initials = parts[-1].lower(), "".join(p[0] for p in parts[:-1]).upper() if not parts[0].isupper() else parts[0]
    pool = mp[mp.team_name == country].drop_duplicates("player_id")
    fits = [r.player_id for r in pool.itertuples()
            if r.player_name.split()[-1].lower() == sur and r.player_name.split()[0][0].upper() in initials and r.player_id not in taken]
    return int(fits[0]) if len(fits) == 1 else None


# ---------------------------------------------------------------- convert
def main():
    if "--download" in sys.argv:
        download()
    raw = load_raw()
    wc = [j for j in raw if j["info"].get("event", {}).get("name", "") == EVENT and j["info"]["dates"][0].startswith("2026")]
    if not wc:
        sys.exit("no 2026 T20 World Cup files found in public_data/cricsheet_raw (run with --download)")
    b = pd.read_csv(DATA / "ball_by_ball.csv", low_memory=False)
    m = pd.read_csv(DATA / "matches.csv")
    mp = pd.read_csv(DATA / "competition_team_player_mapping.csv")
    ident = identity_map(raw, b, m, mp)

    # team ids from the data pack; new ids for sides it has never had
    tid = {}
    for r in m.itertuples():
        tid[team(r.home_team)] = int(r.home_team_id)
        tid[team(r.away_team)] = int(r.away_team_id)
    next_tid = max(tid.values()) + 1
    for j in wc:
        for t in j["info"]["teams"]:
            if team(t) not in tid:
                tid[team(t)], next_tid = next_tid, next_tid + 1

    # player ids: overlap vote, then a strict name fallback, then a new id
    pid_of, how, names = {}, {}, {}
    new = NEW_PLAYER0
    for j in sorted(wc, key=lambda j: j["info"]["dates"][0]):
        reg = j["info"]["registry"]["people"]
        for t, squad in j["info"]["players"].items():
            for nm in squad:
                person = reg[nm]
                if person in pid_of:
                    continue
                if person in ident:
                    pid_of[person], how[person] = ident[person], "matched ball by ball"
                elif (fb := name_fallback(nm, team(t), mp, set(pid_of.values()))) is not None:
                    pid_of[person], how[person] = fb, "matched by name in country"
                else:
                    pid_of[person], how[person], new = new, "new to the data", new + 1
                names[person] = (nm, team(t))
    dp_name = mp.groupby("player_id").player_name.last()
    style = b.groupby("striker_id").batting_type.agg(lambda s: s.mode().iat[0] if s.notna().any() else np.nan)
    bowl_style = b.groupby("bowler_id").bowling_type.agg(lambda s: s.mode().iat[0] if s.notna().any() else np.nan)
    pace = b.groupby("bowler_id").pace_or_spin.agg(lambda s: s.mode().iat[0] if s.notna().any() else np.nan)
    pname = lambda person: dp_name.get(pid_of[person], names[person][0])

    balls, matches, mapping = [], [], []
    for n, j in enumerate(sorted(wc, key=lambda j: (j["info"]["dates"][0], j["_id"])), start=1):
        info, reg = j["info"], j["info"]["registry"]["people"]
        mid = MATCH_ID0 + n
        t1, t2 = (team(t) for t in info["teams"])
        ev = info.get("event", {})
        stage_raw = str(ev.get("stage", ev.get("group", "")))
        stage = "Final" if stage_raw.lower() == "final" else "Semi Final" if "semi" in stage_raw.lower() else "League"
        city = info.get("city") or ""
        outcome = info.get("outcome", {})
        winner = team(outcome["winner"]) if "winner" in outcome else None
        by = outcome.get("by", {})
        result = (f"{winner} Won by {by['runs']} runs" if "runs" in by else f"{winner} Won by {by['wickets']} wickets" if "wickets" in by
                  else f"{winner} Won the super over" if outcome.get("eliminator") else outcome.get("result", "No Result").title()) if winner or outcome else "No Result"
        overs = info.get("overs", 20)
        tgt = j["innings"][1].get("target", {}) if len(j["innings"]) > 1 else {}
        rev2 = int(tgt["overs"] * 6) if tgt.get("overs") and tgt["overs"] < overs else (overs * 6 if overs < 20 else np.nan)
        matches.append({"match_id": mid, "comp_id": COMP_ID, "match_number": n, "match_date": info["dates"][0], "stage": stage,
                        "venue_id": np.nan, "venue_country": "Sri Lanka" if city in SL_CITIES or "Colombo" in str(info.get("venue", "")) else "India",
                        "home_team_id": tid[t1], "home_team": t1, "away_team_id": tid[t2], "away_team": t2,
                        "home_team_captain_id": np.nan, "away_team_captain_id": np.nan,
                        "toss_win_team_id": tid.get(team(info.get("toss", {}).get("winner", "")), np.nan),
                        "toss_opted": {"field": "Fielding", "bat": "Batting"}.get(info.get("toss", {}).get("decision"), np.nan),
                        "man_of_the_match": np.nan,
                        "first_inn_revised_overs": overs * 6 if overs < 20 else np.nan, "second_inn_revised_overs": rev2,
                        "revised_target": tgt.get("runs") if (tgt.get("overs") or 20) < 20 else np.nan,
                        "knock_out": int(stage in ("Final", "Semi Final")), "win_team_id": tid.get(winner, np.nan), "result": result})
        for t, squad in info["players"].items():
            for nm in squad:
                mapping.append({"comp_id": COMP_ID, "comp_name": COMP_NAME, "team_id": tid[team(t)], "team_name": team(t),
                                "player_id": pid_of[reg[nm]], "player_name": pname(reg[nm])})
        order = defaultdict(dict)
        for ii, bat_team, ov, pos, k, d in deliveries(j):
            bowl_team = t2 if bat_team == t1 else t1
            bat, non, bowler = (pid_of[reg[d[x]]] for x in ("batter", "non_striker", "bowler"))
            for x in (bat, non):
                order[ii].setdefault(x, len(order[ii]) + 1)
            ex = d.get("extras", {})
            r = d["runs"]
            etype, e1, e2 = np.nan, 0, 0
            if "wides" in ex:
                etype, e1 = "wide", ex["wides"]
            elif "noballs" in ex:
                etype, e1, e2 = "Overstep", ex["noballs"], ex.get("byes", 0) + ex.get("legbyes", 0)
            elif "legbyes" in ex:
                etype, e1 = "legbyes", ex["legbyes"]
            elif "byes" in ex:
                etype, e1 = "byes", ex["byes"]
            elif "penalty" in ex:
                etype, e1 = "Penalty", ex["penalty"]
            w = next((x for x in d.get("wickets", []) if x["kind"] not in NOT_OUT), None)
            balls.append({"match_id": mid, "innings": ii, "overid": ov, "over_ball_num": pos, "innings_ball_num": k,
                          "batting_team_id": tid[bat_team], "bowling_team_id": tid[bowl_team],
                          "striker_id": bat, "striker_name": pname(reg[d["batter"]]),
                          "non_striker_id": non, "non_striker_name": pname(reg[d["non_striker"]]),
                          "bowler_id": bowler, "bowler_name": pname(reg[d["bowler"]]),
                          "batting_type": style.get(bat, np.nan), "bowling_type": bowl_style.get(bowler, np.nan),
                          "batting_order": order[ii][bat], "runs": r["batter"], "is_four": r["batter"] == 4 and not r.get("non_boundary"),
                          "is_six": r["batter"] == 6, "is_wicket": w is not None,
                          "dismissal_type_id": np.nan, "dismissal_type": DISMISSAL.get(w["kind"], w["kind"].title()) if w else np.nan,
                          "dismissed_player_id": pid_of[reg[w["player_out"]]] if w else np.nan,
                          "extras_type": etype, "extras1_runs": e1, "extras_2_runs": e2,
                          "pace_or_spin": pace.get(bowler, np.nan), "bowl_speed": np.nan, "stroke": np.nan,
                          "delivery_style": np.nan, "over_or_around": np.nan, "on_or_off": np.nan, "delivery_ist_time": np.nan})

    OUT.mkdir(parents=True, exist_ok=True)
    cols = list(pd.read_csv(DATA / "ball_by_ball.csv", nrows=1).columns)
    pd.DataFrame(balls)[cols].to_csv(OUT / "ball_by_ball.csv", index=False)
    mcols = list(m.columns)
    pd.DataFrame(matches)[mcols].to_csv(OUT / "matches.csv", index=False)
    pd.DataFrame([{"comp_id": COMP_ID, "comp_name": COMP_NAME, "match_format": "T20I", "season": 2026}]).to_csv(OUT / "competitions.csv", index=False)
    pd.DataFrame(mapping).drop_duplicates(["team_id", "player_id"]).to_csv(OUT / "competition_team_player_mapping.csv", index=False)
    pm = pd.DataFrame([{"cricsheet_id": p, "cricsheet_name": names[p][0], "team": names[p][1], "player_id": pid_of[p],
                        "data_pack_name": dp_name.get(pid_of[p], ""), "how": how[p]} for p in pid_of])
    pm.sort_values(["team", "how", "cricsheet_name"]).to_csv(OUT / "player_map.csv", index=False)
    log(f"wrote {len(matches)} matches, {len(balls)} deliveries to {OUT}")
    log(pm.how.value_counts().to_string())


if __name__ == "__main__":
    main()
