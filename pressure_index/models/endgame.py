"""Exact win probability for the final over of a chase.

A smooth logistic model is far too pessimistic at the very end of a chase (it gave "4 off the last ball" a
9% chance when one boundary wins it). In the final over the game is short enough to solve exactly: take how
often each outcome happens in the last two overs of chases (by competition, runs needed per ball and
wickets in hand), then work backwards ball by ball to the chance of getting home.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pressure_index.config import CFG

E = CFG["endgame"]
ENDGAME_BALLS, ENDGAME_FIT_BALLS, ENDGAME_NMAX, EG_PRIOR = E["balls"], E["fit_balls"], E["max_need"], E["prior"]
EG_OUT = ["0", "1", "2", "3", "4", "6", "W", "X"]   # X = wide or no-ball: a run, and the ball is bowled again
EG_RUNS = [0, 1, 2, 3, 4, 6]
EG_NEED = [1.5, 3.0]              # runs needed per ball: under 1.5, 1.5 to 3, 3 or more
EG_WKTS = [2, 4, 6]               # wickets in hand: 1, 2-3, 4-5, 6 or more


def outcome_label(d: pd.DataFrame) -> np.ndarray:
    lab = np.where(d.is_wide | d.is_nb, "X", np.where(d.wkt == 1, "W", np.clip(d.tot, 0, 6).astype(int).astype(str)))
    return np.where(lab == "5", "4", lab)


class EndgameWP:
    """Backward recursion over (runs needed, balls left, wickets in hand)."""

    def fit(self, b: pd.DataFrame) -> EndgameWP:
        c = b[(b.innings == 2) & (b.balls_left <= ENDGAME_FIT_BALLS) & (b.runs_needed > 0)]
        lab = pd.Series(outcome_label(c), index=c.index)
        nb = np.searchsorted(EG_NEED, (c.runs_needed / c.balls_left).to_numpy(), side="right")
        wb = np.searchsorted(EG_WKTS, c.wkts_in_hand.to_numpy(), side="right")
        self.dist = np.zeros((2, len(EG_NEED) + 1, len(EG_WKTS) + 1, len(EG_OUT)))
        for g in (0, 1):
            m = (c.is_ipl == g).to_numpy()
            pooled = lab[m].value_counts(normalize=True).reindex(EG_OUT, fill_value=0).to_numpy()
            for i in range(len(EG_NEED) + 1):
                for j in range(len(EG_WKTS) + 1):
                    cnt = lab[m & (nb == i) & (wb == j)].value_counts().reindex(EG_OUT, fill_value=0).to_numpy()
                    self.dist[g, i, j] = (cnt + EG_PRIOR * pooled) / (cnt.sum() + EG_PRIOR)
        self.table = np.zeros((2, ENDGAME_NMAX + 1, ENDGAME_BALLS + 1, 11))
        for g in (0, 1):
            T = self.table[g]

            def v(n, bl, w):
                if n <= 0:
                    return 1.0
                if bl == 0 or w == 0:
                    return 0.5 if n == 1 else 0.0  # scores level: a super over, a coin flip
                return 0.0 if n > ENDGAME_NMAX else T[n, bl, w]

            for bl in range(1, ENDGAME_BALLS + 1):
                for w in range(1, 11):
                    for n in range(1, ENDGAME_NMAX + 1):  # ascending, so a wide's state is ready
                        p = self.dist[g, np.searchsorted(EG_NEED, n / bl, side="right"),
                                      np.searchsorted(EG_WKTS, w, side="right")]
                        T[n, bl, w] = (sum(p[i] * v(n - r, bl - 1, w) for i, r in enumerate(EG_RUNS))
                                       + p[6] * v(n, bl - 1, w - 1) + p[7] * v(n - 1, bl, w))
        return self

    def predict(self, need, balls_left, wkts_in_hand, is_ipl) -> np.ndarray:
        n = np.asarray(need, float).astype(int)
        out = self.table[np.asarray(is_ipl, float).astype(int), np.clip(n, 0, ENDGAME_NMAX),
                         np.clip(np.asarray(balls_left, float).astype(int), 0, ENDGAME_BALLS),
                         np.clip(np.asarray(wkts_in_hand, float).astype(int), 0, 10)]
        return np.where(n > ENDGAME_NMAX, 0.0, out)


def endgame_evidence(b: pd.DataFrame, model) -> dict:
    """How the smooth model and the exact final-over model compare with what actually happened."""
    d = b[(b.innings == 2) & (b.balls_left <= ENDGAME_BALLS) & (b.runs_needed > 0) & b.bat_won.notna()
          & b.result.str.contains("won", case=False, na=False)]
    X = model.features(2, d.runs_needed.to_numpy(float), d.balls_left.to_numpy(float), d.wkts_in_hand.to_numpy(float),
                       d.is_ipl.to_numpy(float), d.season_yr.to_numpy(float))
    old = model.predict(2, X)
    new = model.endgame.predict(d.runs_needed, d.balls_left, d.wkts_in_hand, d.is_ipl)
    y = d.bat_won.to_numpy(float)
    groups = [
        ("Last ball, 2 or 3 needed", (d.balls_left == 1) & d.runs_needed.between(2, 3)),
        ("Last ball, a boundary needed (4 to 6)", (d.balls_left == 1) & d.runs_needed.between(4, 6)),
        ("Last 2 balls, 7 to 12 needed", (d.balls_left == 2) & d.runs_needed.between(7, 12)),
        ("Last 3 balls, 7 to 12 needed", (d.balls_left == 3) & d.runs_needed.between(7, 12)),
        ("Last over, 6 to 10 needed", (d.balls_left == 6) & d.runs_needed.between(6, 10)),
        ("Last over, 11 to 16 needed", (d.balls_left == 6) & d.runs_needed.between(11, 16)),
    ]
    rows = []
    for label, mask in groups:
        m = mask.to_numpy()
        first = ~d[m].duplicated("match_id").to_numpy()  # one state per match
        idx = np.flatnonzero(m)[first]
        if len(idx) == 0:
            continue
        rows.append({"situation": label, "n": int(len(idx)), "actual": round(float(y[idx].mean()), 3),
                     "old": round(float(old[idx].mean()), 3), "new": round(float(new[idx].mean()), 3)})

    def brier(p):
        return round(float(((p - y) ** 2).mean()), 4)

    return {"balls": int(len(d)), "brier_old": brier(old), "brier_new": brier(new), "rows": rows}
