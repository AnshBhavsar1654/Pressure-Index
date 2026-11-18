# Public data added to the data pack

## ICC Men's T20 World Cup 2026 (`t20wc2026/`)

The official SupeRR Selector data pack has no World Cup matches. The Round 1 brief allows publicly available
data alongside it, so the 2026 T20 World Cup (India and Sri Lanka, 7 February to 8 March 2026) is added here in
the data pack's own file format, and `analysis/pipeline.py` reads it next to the pack.

- **Source:** [Cricsheet](https://cricsheet.org) ball-by-ball match files, used under Cricsheet's CC BY licence
  (attribution: Cricsheet, cricsheet.org). Fetched from the public Hugging Face mirror
  `jeyasuryaur/cricket-data-by-cricsheet` (folder `t20s_json`), because cricsheet.org blocks scripted downloads.
- **Coverage:** 49 of the tournament's 55 matches, including both semi-finals and the final, which count as
  knockouts. Of the other six, two were washed out with no play (match 32, Ireland v Zimbabwe; match 41, Pakistan v
  New Zealand), and the source has no file for Afghanistan's four group games (match 4 v New Zealand, 13 v South
  Africa, 28 v UAE, 39 v Canada; Cricsheet ids 1512722, 1512731, 1512746, 1512757). To add them, download
  Cricsheet's T20I zip in a browser, put those four files in `cricsheet_raw/` and rerun the converter.
- **Player identity:** Cricsheet writes names with initials ("BKG Mendis" is Kusal, "PHKD Mendis" is Kamindu).
  Matches that appear in both Cricsheet and the data pack (2025–26 bilateral T20Is) are lined up delivery by
  delivery, and every delivery votes on which data pack player each Cricsheet person is. A person never seen in
  such a match is matched by surname and initial within his own country only when exactly one player fits;
  otherwise he gets a new id (9,100,000 and up). Every decision is listed in `t20wc2026/player_map.csv`.
- **Fields the source does not have** (bowling speed, delivery style, batting hand for new players) are left
  empty; batting hand and bowling style are filled from the player's data pack record where he has one.

Rebuild: `python -I analysis/public_wc2026.py --download` (raw files go to `cricsheet_raw/`, which is not
committed).
