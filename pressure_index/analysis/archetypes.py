"""Player archetypes: unsupervised clustering of how and when players are used.

Features (standardised): share of balls in the powerplay, middle and death overs; scoring/economy style
(strike rate or economy, boundary %, dot %); usual level and lift under pressure. K-means is fitted for
k = 4..7 and the k with the best silhouette score is kept. A 2-D PCA projection is exported for the map, and
each cluster is named from its centroid (dominant phase + style). k = 3 is excluded: it only splits players
by phase, which the phase shares already show; silhouette scores are flat (~0.2) from 3 to 7, so the
finer split costs little separation.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from pressure_index.config import log

MIN_BALLS = 300


def profile(d: pd.DataFrame, t: pd.DataFrame, role: str) -> pd.DataFrame:
    g = d.groupby("pid")
    f = pd.DataFrame(index=t.index)
    ph = d.groupby(["pid", "phase"]).size().unstack(fill_value=0)
    share = ph.div(ph.sum(axis=1), axis=0)
    for p in ("Powerplay", "Middle", "Death"):
        f[p.lower()] = share.get(p, 0)
    balls = g.size()
    if role == "bat":
        f["pace"] = 100 * g.r.sum() / balls          # strike rate
    else:
        f["pace"] = 6 * g.r.sum() / g.lg.sum().replace(0, np.nan)  # economy
        f["wkt_rate"] = 100 * g.out.sum() / balls
    f["boundary"] = 100 * g.bnd.mean()
    f["dot"] = 100 * g.dotb.mean()
    f["usual"] = 100 * t.normal
    f["lift"] = 100 * t.lift
    f["balls"] = balls
    return f[f.balls >= MIN_BALLS].dropna()


def name_cluster(c: pd.Series, role: str, overall: pd.Series, spread: pd.Series) -> str:
    """Dominant phase (largest share above the average player) + the most distinctive style trait."""
    z = (c - overall) / spread
    phase = max(("powerplay", "middle", "death"), key=lambda p: z[p])
    if role == "bat":
        where = {"powerplay": "Opener", "middle": "Middle-order", "death": "Finisher"}[phase]
        traits = {"aggressor": z["pace"] + z["boundary"], "anchor": z["dot"] - z["pace"], "accumulator": -abs(z["pace"]) - z["dot"]}
        style = max(traits, key=traits.get)
        if where == "Finisher":
            return "Power finisher" if style == "aggressor" else "Finisher"
        return f"{where} {style}"
    where = {"powerplay": "New-ball", "middle": "Middle-overs", "death": "Death-overs"}[phase]
    traits = {"strike bowler": z["wkt_rate"], "controller": -z["pace"] + z["dot"], "enforcer": z["usual"] + z["lift"]}
    if z["pace"] > 0.8 and z["usual"] < -0.5:
        return f"{where} expensive option"
    return f"{where} {max(traits, key=traits.get)}"


def cluster(d: pd.DataFrame, t: pd.DataFrame, role: str) -> dict:
    f = profile(d, t, role)
    cols = [c for c in f.columns if c != "balls"]
    X = StandardScaler().fit_transform(f[cols])
    scores = {}
    for k in range(4, 8):
        lab = KMeans(n_clusters=k, n_init=20, random_state=0).fit_predict(X)
        scores[k] = float(silhouette_score(X, lab))
    k = max(scores, key=scores.get)
    km = KMeans(n_clusters=k, n_init=20, random_state=0).fit(X)
    f["cluster"] = km.labels_
    xy = PCA(n_components=2, random_state=0).fit(X)
    pts = xy.transform(X)
    overall, spread = f[cols].mean(), f[cols].std()
    cents = {c: f[f.cluster == c][cols].mean() for c in range(k)}
    names = {c: name_cluster(cents[c], role, overall, spread) for c in range(k)}
    dup = {c for c in range(k) if list(names.values()).count(names[c]) > 1}
    for c in dup:  # clusters sharing a name are told apart by their usual level
        zu = (cents[c]["usual"] - overall["usual"]) / spread["usual"]
        names[c] += " (high-impact)" if zu > 0.5 else " (below par)" if zu < -0.5 else " (steady)"
    for c in range(k):  # still tied: number them
        same = [x for x in range(k) if names[x] == names[c]]
        if len(same) > 1:
            for i, x in enumerate(same, start=1):
                names[x] = f"{names[x]} {i}"
    log(f"archetypes {role}: k={k} silhouette={scores[k]:.3f} {list(names.values())}")
    return {
        "k": k, "silhouette": {str(kk): round(v, 3) for kk, v in scores.items()},
        "explained": [round(float(v), 3) for v in xy.explained_variance_ratio_],
        "features": cols,
        "clusters": [{"id": c, "name": names[c], "size": int((f.cluster == c).sum()),
                      "centroid": {col: round(float(f[f.cluster == c][col].mean()), 2) for col in cols}}
                     for c in range(k)],
        "points": {int(pid): {"c": int(c), "x": round(float(x), 3), "y": round(float(y), 3)}
                   for pid, c, (x, y) in zip(f.index, f.cluster, pts)},
        "names": names,
    }
