"""Convert Cricsheet match JSON into the five canonical CSVs the pipeline reads.

    ball_by_ball.csv                       one row per delivery (innings 1-2 and any super over)
    matches.csv                            one row per match: teams, venue country, stage, result, rain revisions
    competitions.csv                       IPL seasons, ICC tournaments, and bilateral T20Is grouped by year
    competition_team_player_mapping.csv    who played for whom in each competition
    players.csv                            id, display name, Cricsheet identifier

Identity comes from Cricsheet's people register, so every player has one stable id across the IPL and
internationals. Display names are full names from Cricsheet's names register where it has one.

    python -m pressure_index build
"""
from __future__ import annotations

import json
from collections import defaultdict

import numpy as np
import pandas as pd

from pressure_index.config import CFG, PROCESSED, RAW, REFERENCE, log
from pressure_index.data.download import raw_files

TEAM_ALIASES = {"Royal Challengers Bangalore": "Royal Challengers Bengaluru", "Kings XI Punjab": "Punjab Kings",
                "Delhi Daredevils": "Delhi Capitals"}
DISMISSAL = {"caught": "Caught", "caught and bowled": "Caught", "bowled": "Bowled", "lbw": "LBW", "run out": "RunOut",
             "stumped": "Stump", "hit wicket": "Hit Wicket", "retired out": "Retire Out",
             "obstructing the field": "Obstructing the field"}
NOT_OUT = {"retired hurt", "retired not out"}
# Stages that end a team's tournament if lost. Group-stage "Qualifier" rounds are not knockouts.
STAGE = {"final": "Final", "semi final": "Semi Final", "qualifier 1": "Qualifier", "qualifier 2": "Qualifier",
         "eliminator": "Eliminator", "quarter final": "Quarter Final"}
ICC_EVENTS = ("ICC Men's T20 World Cup", "ICC World Twenty20")


def team(n: str) -> str:
    return TEAM_ALIASES.get(n, n)


def overs_to_balls(o) -> float:
    """Cricsheet writes overs as 15 or 14.4 (14 overs and 4 balls)."""
    if o is None:
        return np.nan
    whole = int(o)
    return whole * 6 + round((float(o) - whole) * 10)


def display_names() -> dict[str, str]:
    """Cricsheet identifier -> display name: the hand-checked table first, then the people register's name
    when it is already a full name ("Kuldeep Yadav"), then the shortest full name in the names register."""
    people = pd.read_csv(RAW / "people.csv", usecols=["identifier", "name"])
    alt = pd.read_csv(RAW / "names.csv")
    fixed = json.loads((REFERENCE / "player_names.json").read_text(encoding="utf-8"))["names"]

    def full(n: str) -> bool:
        parts = n.split()
        return len(parts) >= 2 and not parts[0].isupper() and len(parts[0]) > 1 and "." not in parts[0]

    best = dict(zip(people.identifier, people.name))
    for ident, g in alt.groupby("identifier"):
        cands = [n for n in g.name if full(n)]
        if cands and not full(best.get(ident, "")):
            best[ident] = min(cands, key=lambda n: (len(n.split()), len(n)))
    best.update(fixed)
    return best


def load_matches() -> list[dict]:
    out = []
    for key in ("ipl", "t20i"):
        for p in raw_files(key):
            j = json.loads(p.read_text(encoding="utf-8"))
            if j["info"].get("gender", "male") != "male" or j["info"].get("match_type") not in ("T20", "IT20"):
                continue
            j["_id"], j["_kind"] = int(p.stem), key
            out.append(j)
    out.sort(key=lambda j: (j["info"]["dates"][0], j["_id"]))
    return out


def competition_of(j: dict) -> tuple[str, str, int]:
    """(competition name, format, season). IPL by season; ICC World Cups by edition; other T20Is by year."""
    info = j["info"]
    yr = int(info["dates"][0][:4])
    if j["_kind"] == "ipl":
        return f"IPL {yr}", "T20", yr
    ev = info.get("event", {}).get("name", "")
    if ev in ICC_EVENTS:
        return f"ICC Men's T20 World Cup {yr}", "T20I", yr
    return f"T20 Internationals {yr}", "T20I", yr


def main() -> None:
    cities = json.loads((REFERENCE / "city_country.json").read_text(encoding="utf-8"))["cities"]
    names = display_names()
    raw = load_matches()
    first, last = CFG["data"]["first_season"], CFG["data"]["last_season"]
    raw = [j for j in raw if first <= int(j["info"]["dates"][0][:4]) <= last]
    log(f"{len(raw)} matches ({sum(j['_kind'] == 'ipl' for j in raw)} IPL)")

    teams = sorted({team(t) for j in raw for t in j["info"]["teams"]})
    tid = {t: i + 1 for i, t in enumerate(teams)}
    comps: dict[str, int] = {}
    comp_rows, matches, balls, mapping = [], [], [], []
    pid = lambda ident: int(ident, 16)  # Cricsheet ids are 8 hex digits: a stable integer id
    seen_people: dict[int, str] = {}
    missing_city = defaultdict(int)

    for n, j in enumerate(raw, start=1):
        info, reg = j["info"], j["info"]["registry"]["people"]
        cname, fmt, season = competition_of(j)
        if cname not in comps:
            comps[cname] = len(comps) + 1
            comp_rows.append({"comp_id": comps[cname], "comp_name": cname, "match_format": fmt, "season": season})
        cid = comps[cname]
        mid = n
        t1, t2 = (team(t) for t in info["teams"])
        ev = info.get("event", {})
        stage = STAGE.get(str(ev.get("stage", "")).strip().lower(), "League")
        city = info.get("city") or ("Buenos Aires" if "Buenos Aires" in info.get("venue", "") else "")
        country = "India" if j["_kind"] == "ipl" and not city else cities.get(city)
        if country is None:
            missing_city[city or info.get("venue", "?")] += 1
        outcome = info.get("outcome", {})
        winner = team(outcome["winner"]) if "winner" in outcome else None
        by = outcome.get("by", {})
        if winner and "runs" in by:
            result = f"{winner} Won by {by['runs']} runs"
        elif winner and "wickets" in by:
            result = f"{winner} Won by {by['wickets']} wickets"
        elif winner:
            result = f"{winner} Won the super over" if outcome.get("eliminator") else f"{winner} Won"
        else:
            result = str(outcome.get("result", "No Result")).title()
        sched = info.get("overs", 20)
        inns = [i for i in j.get("innings", []) if not i.get("super_over")]
        first_tot = sum(d["runs"]["total"] for ov in inns[0].get("overs", []) for d in ov["deliveries"]) if inns else 0
        tgt = inns[1].get("target", {}) if len(inns) > 1 else {}
        t_balls = overs_to_balls(tgt.get("overs")) if tgt.get("overs") else np.nan
        rev2 = t_balls if t_balls == t_balls and t_balls < sched * 6 else (sched * 6 if sched < 20 else np.nan)
        rev_target = tgt["runs"] if tgt.get("runs") and tgt["runs"] != first_tot + 1 else np.nan
        toss = info.get("toss", {})
        matches.append({
            "match_id": mid, "comp_id": cid, "match_number": n, "match_date": info["dates"][0], "stage": stage,
            "venue": info.get("venue"), "city": city or None, "venue_country": country,
            "home_team_id": tid[t1], "home_team": t1, "away_team_id": tid[t2], "away_team": t2,
            "toss_win_team_id": tid.get(team(toss.get("winner", "")), np.nan),
            "toss_opted": {"field": "Fielding", "bat": "Batting"}.get(toss.get("decision"), np.nan),
            "player_of_match": names.get(reg.get((info.get("player_of_match") or [None])[0], ""), None),
            "first_inn_revised_overs": sched * 6 if sched < 20 else np.nan, "second_inn_revised_overs": rev2,
            "revised_target": rev_target, "knock_out": int(stage != "League"),
            "win_team_id": tid.get(winner, np.nan), "result": result, "cricsheet_id": j["_id"],
        })
        for t, squad in info.get("players", {}).items():
            for nm in squad:
                p = pid(reg[nm])
                seen_people[p] = reg[nm]
                mapping.append({"comp_id": cid, "comp_name": cname, "team_id": tid[team(t)], "team_name": team(t),
                                "player_id": p, "player_name": names.get(reg[nm], nm)})
        order: dict[int, dict] = defaultdict(dict)
        for ii, inn in enumerate(j.get("innings", []), start=1):
            bat_team = team(inn["team"])
            bowl_team = t2 if bat_team == t1 else t1
            k = 0
            for ov in inn.get("overs", []):
                for pos, d in enumerate(ov["deliveries"], start=1):
                    k += 1
                    bat, non, bowler = (pid(reg[d[x]]) for x in ("batter", "non_striker", "bowler"))
                    for x in (bat, non):
                        order[ii].setdefault(x, len(order[ii]) + 1)
                    ex, r = d.get("extras", {}), d["runs"]
                    etype, e1, e2 = np.nan, 0, 0
                    if "wides" in ex:
                        etype, e1 = "wide", ex["wides"]
                    elif "noballs" in ex:
                        etype, e1, e2 = "Overstep", ex["noballs"], ex.get("byes", 0) + ex.get("legbyes", 0)
                    elif "legbyes" in ex:
                        etype, e1 = "legbyes", ex["legbyes"]
                    elif "byes" in ex:
                        etype, e1 = "byes", ex["byes"]
                    if "penalty" in ex:
                        if pd.isna(etype):
                            etype, e1 = "Penalty", ex["penalty"]
                        else:
                            e2 += ex["penalty"]
                    w = next((x for x in d.get("wickets", []) if x["kind"] not in NOT_OUT), None)
                    balls.append({
                        "match_id": mid, "innings": ii, "overid": ov["over"] + 1, "over_ball_num": pos,
                        "innings_ball_num": k, "batting_team_id": tid[bat_team], "bowling_team_id": tid[bowl_team],
                        "striker_id": bat, "striker_name": names.get(reg[d["batter"]], d["batter"]),
                        "non_striker_id": non, "non_striker_name": names.get(reg[d["non_striker"]], d["non_striker"]),
                        "bowler_id": bowler, "bowler_name": names.get(reg[d["bowler"]], d["bowler"]),
                        "batting_order": order[ii][bat], "runs": r["batter"],
                        "is_four": r["batter"] == 4 and not r.get("non_boundary"), "is_six": r["batter"] == 6,
                        "is_wicket": w is not None,
                        "dismissal_type": DISMISSAL.get(w["kind"], w["kind"].title()) if w else np.nan,
                        "dismissed_player_id": pid(reg[w["player_out"]]) if w else np.nan,
                        "extras_type": etype, "extras1_runs": e1, "extras_2_runs": e2,
                    })
    if missing_city:
        log("WARNING cities with no country (add to data/reference/city_country.json):", dict(missing_city))

    PROCESSED.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(balls).to_csv(PROCESSED / "ball_by_ball.csv", index=False)
    pd.DataFrame(matches).to_csv(PROCESSED / "matches.csv", index=False)
    pd.DataFrame(comp_rows).to_csv(PROCESSED / "competitions.csv", index=False)
    pd.DataFrame(mapping).drop_duplicates(["comp_id", "team_id", "player_id"]).to_csv(
        PROCESSED / "competition_team_player_mapping.csv", index=False)
    pd.DataFrame([{"player_id": p, "name": names.get(i, i), "cricsheet_id": i} for p, i in seen_people.items()]).to_csv(
        PROCESSED / "players.csv", index=False)
    log(f"wrote {len(matches)} matches, {len(balls)} deliveries, {len(seen_people)} players to {PROCESSED}")
