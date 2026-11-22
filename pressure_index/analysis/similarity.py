"""Similar-player recommender: "show me players who play like X".

Each player (300+ balls in top-level cricket) is described by a style-and-pressure profile:
    batting  share of balls in powerplay / middle / death, strike rate, boundary %, dot %, dismissal rate,
             usual level, pressure rating, lift
    bowling  phase shares, economy, wicket rate, boundary %, dot %, extras %, usual level, pressure rating, lift
Features are standardised (z-scores within the role) and neighbours are found by cosine similarity, so two
players match on the *shape* of their game, not only on how good they are.

Every recommendation carries a reason: the traits the two players share that are most distinctive (both far
from average in the same direction).

Validation (split-half stability): rebuild every profile from odd-numbered matches only and from even-numbered
matches only, and measure how many of a player's top-10 neighbours from one half reappear in the other.
Compared with the overlap expected by chance, this shows whether the neighbours reflect a stable playing style
rather than noise in a handful of games.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from pressure_index.config import log
from pressure_index.rating.ratings import rate

MIN_BALLS = 300
K = 10

LABELS = {
    "powerplay": ("powerplay-heavy", "rarely in the powerplay"),
    "middle": ("middle-overs specialist", "little middle-overs work"),
    "death": ("death-overs role", "rarely at the death"),
    "sr": ("fast scorer", "slow, steady scorer"),
    "econ": ("expensive", "economical"),
    "boundary": ("boundary hitter", "few boundaries"),
    "dot": ("many dot balls", "few dot balls"),
    "out_rate": ("gets out often", "hard to dismiss"),
    "wkt_rate": ("wicket-taker", "few wickets"),
    "extras": ("concedes extras", "few extras"),
    "usual": ("strong usual level", "below-average usual level"),
    "rating": ("strong under pressure", "struggles under pressure"),
    "lift": ("rises under pressure", "dips under pressure"),
}


def profile(d: pd.DataFrame, t: pd.DataFrame, role: str, min_balls: int = MIN_BALLS) -> pd.DataFrame:
    """One row per player with enough balls; `d` is the role's ball table, `t` its rating table."""
    g = d.groupby("pid")
    balls = g.size()
    keep = balls[balls >= min_balls].index
    f = pd.DataFrame(index=keep)
    ph = d.groupby(["pid", "phase"]).size().unstack(fill_value=0)
    share = ph.div(ph.sum(axis=1), axis=0)
    for p in ("Powerplay", "Middle", "Death"):
        f[p.lower()] = share.get(p, 0)
    if role == "bat":
        f["sr"] = 100 * g.r.sum() / balls
        f["out_rate"] = 100 * g.out.sum() / balls
    else:
        f["econ"] = 6 * g.r.sum() / g.lg.sum().replace(0, np.nan)
        f["wkt_rate"] = 100 * g.out.sum() / balls
        f["extras"] = 100 * (d.is_wide | d.is_nb).groupby(d.pid).mean()
    f["boundary"] = 100 * g.bnd.mean()
    f["dot"] = 100 * g.dotb.mean()
    f["usual"] = 100 * t.normal
    f["rating"] = 100 * t.rating
    f["lift"] = 100 * t.lift
    f = f.reindex(keep).dropna()
    f["balls"] = balls.reindex(f.index)
    return f


def _neighbours(Z: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
    nn = NearestNeighbors(n_neighbors=min(k + 1, len(Z)), metric="cosine").fit(Z)
    dist, idx = nn.kneighbors(Z)
    return idx[:, 1:], 1 - dist[:, 1:]  # drop self


def reasons(za: np.ndarray, zb: np.ndarray, cols: list[str], n: int = 3) -> list[str]:
    """The shared traits that are most distinctive: same sign, both far from average."""
    shared = np.where(np.sign(za) == np.sign(zb), np.minimum(np.abs(za), np.abs(zb)), 0.0)
    out = []
    for i in np.argsort(-shared)[:n]:
        if shared[i] < 0.5:
            break
        hi, lo = LABELS.get(cols[i], (cols[i], cols[i]))
        out.append(hi if za[i] > 0 else lo)
    return out


def stability(d: pd.DataFrame, role: str, k: int = K) -> dict:
    """Overlap@k of neighbours built on odd vs even matches, against chance."""
    halves = []
    for par in (1, 0):
        dh = d[d.match_id % 2 == par]
        pm = dh.groupby(["pid", "match_id", "P", "R"]).agg(
            n=("rv", "size"), ne=("cnt", "sum"), w=("w", "sum"), wrv=("wrv", "sum"), rv=("rv", "sum"),
            wpa=("wpa", "sum"), r=("r", "sum"), out=("out", "sum"), li=("li", "sum")).reset_index()
        halves.append(profile(dh, rate(pm), role, MIN_BALLS // 2))
    common = halves[0].index.intersection(halves[1].index)
    cols = [c for c in halves[0].columns if c != "balls"]
    nbrs = []
    for h in halves:
        X = StandardScaler().fit_transform(h.loc[common, cols])
        idx, _ = _neighbours(X, k)
        nbrs.append([set(common[row]) for row in idx])
    overlap = float(np.mean([len(a & b) / k for a, b in zip(*nbrs)]))
    chance = k / max(len(common) - 1, 1)
    return {"players": int(len(common)), "k": k, "overlap": round(overlap, 3), "chance": round(chance, 3),
            "lift_over_chance": round(overlap / chance, 1)}


def build(d: pd.DataFrame, t: pd.DataFrame, role: str, names: pd.Series) -> dict:
    f = profile(d, t, role)
    cols = [c for c in f.columns if c != "balls"]
    sc = StandardScaler().fit(f[cols])
    Z = sc.transform(f[cols])
    idx, sim = _neighbours(Z, K)
    pca = PCA(n_components=2, random_state=0).fit(Z)
    xy = pca.transform(Z)
    ids = f.index.to_numpy()
    rec = {}
    for i, pid in enumerate(ids):
        rec[int(pid)] = {
            "x": round(float(xy[i, 0]), 3), "y": round(float(xy[i, 1]), 3),
            "traits": reasons(Z[i], Z[i], cols, 4),
            "similar": [{"id": int(ids[j]), "name": names[ids[j]], "sim": round(float(s), 3),
                         "why": reasons(Z[i], Z[j], cols)} for j, s in zip(idx[i], sim[i])],
        }
    st = stability(d, role)
    log(f"similarity {role}: {len(ids)} players, split-half overlap@{K} {st['overlap']} vs chance {st['chance']}")
    return {"players": rec, "features": cols, "explained": [round(float(v), 3) for v in pca.explained_variance_ratio_],
            "mean": {c: round(float(v), 3) for c, v in zip(cols, sc.mean_)}, "stability": st, "min_balls": MIN_BALLS}
