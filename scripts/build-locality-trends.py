"""Locality trends since 2003 and the demographic forecast for 2026 (data/trends.json).

    python scripts/build-locality-trends.py

Reads data/elections/*.json (scripts/import-elections-history.py) and the 2022
areas from data/results-2022.json. Four groups only: R ימין · H חרדים ·
L מרכז–שמאל · A ערבים (O = lists outside them).

For every locality:
  trend      — a weighted straight line through its group shares in all ten
               elections (recent ones weigh more, half-weight ≈ 7 years back).
               When a big party changed group (Yisrael Beiteinu, September 2019)
               the line gets a one-time step there, so a reclassification is not
               read as a trend. Small localities borrow their area's trend
               (weight by size), and no group moves more than 12 points.
  electorate — the growth of its eligible voters 2013–2022 (log-linear, recent
               elections weigh more), between −3% and +10% a year.
  turnout    — its average over the five elections 2019–2022.
2026 = the 2022 result + four years of trend, times the grown electorate and the
usual turnout. Summed over all localities (and the external envelopes) this
gives the national forecast, split into demography / turnout / trend.

A backtest runs the same model on the elections up to 2021 and "predicts" 2022.
"""
import json
import math
import sys
from datetime import date
from pathlib import Path

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
G = ["R", "H", "L", "A", "O"]
GROUPS = ["R", "H", "L", "A"]
TARGET = date(2026, 10, 27)
TAU = 10.0                 # recency: weight = exp(-years before the last election / TAU)
SHRINK_VOTES = 3000        # a locality with this many votes gets half its own trend, half its area's
SHRINK_ELIG = 2000
MAX_SHIFT = 12.0           # points per group over the projection
STEP_AT = "2019b"          # Yisrael Beiteinu changes group here
STEP_GROUPS = ("R", "L")
ENVELOPES = 99999

index = json.loads((ROOT / "data/elections/index.json").read_text(encoding="utf-8"))
E = [json.loads((ROOT / f"data/elections/{e['id']}.json").read_text(encoding="utf-8")) for e in index]
base = json.loads((ROOT / "data/results-2022.json").read_text(encoding="utf-8"))
area_of = {l["c"]: l["g"] for l in base["localities"] if l.get("g") is not None}
years = lambda d: d.year + (d.timetuple().tm_yday - .5) / 365.25
T = np.array([years(date.fromisoformat(e["date"])) for e in E])
step_idx = [e["id"] for e in E].index(STEP_AT)

# per locality, per election: eligible, voted, valid, votes by group
codes = sorted({r[0] for e in E for r in e["rows"]})
cidx = {c: i for i, c in enumerate(codes)}
N, K = len(codes), len(E)
elig = np.zeros((N, K)); voted = np.zeros((N, K)); valid = np.zeros((N, K)); gv = np.zeros((N, K, 5))
for k, e in enumerate(E):
    grp = [G.index(p["camp"]) for p in e["parties"]]
    for r in e["rows"]:
        i = cidx[r[0]]
        elig[i, k], voted[i, k], valid[i, k] = r[1], r[2], r[3]
        for j, v in enumerate(r[4:]):
            gv[i, k, grp[j]] += v


def trend_slopes(shares, present, t, last, step):
    """Weighted LS of each group's share on time, with a level step at `step`.
    shares (K, 5) in points; returns slopes in points per year (5,), or None."""
    m = present
    if m.sum() < 3:
        return None
    tt = t[m] - t[last]
    w = np.exp(tt / TAU)
    cols = [np.ones_like(tt), tt]
    d = (np.arange(len(t)) >= step)[m].astype(float)
    if 0 < d.sum() < m.sum() and d.sum() >= 1 and (1 - d).sum() >= 2:
        cols.append(d)
    W = np.sqrt(w)[:, None]
    out = np.zeros(shares.shape[1])
    for j in range(shares.shape[1]):
        # the step only where the reclassification moved votes: right and centre–left
        X = np.stack(cols if G[j] in STEP_GROUPS else cols[:2], 1)
        try:
            coef, *_ = np.linalg.lstsq(X * W, shares[m][:, j:j + 1] * W, rcond=None)
        except np.linalg.LinAlgError:
            return None
        out[j] = coef[1, 0]
    return out


def growth_rate(e, t, last, first_year=2012):
    m = (e > 0) & (t >= first_year) & (t <= t[last] + 1e-9)
    if m.sum() < 2:
        return None
    tt = t[m] - t[last]
    w = np.exp(tt / TAU)
    X = np.stack([np.ones_like(tt), tt], 1) * np.sqrt(w)[:, None]
    coef, *_ = np.linalg.lstsq(X, np.log(e[m]) * np.sqrt(w), rcond=None)
    return float(coef[1])


def model(upto, target_year):
    """Project from the elections 0..upto (inclusive) to target_year."""
    last = upto
    ks = np.arange(upto + 1)
    t = T[: upto + 1]
    dt = target_year - T[last]
    step = step_idx if step_idx <= upto else 10 ** 6
    sh = np.where(valid[:, ks, None] > 0, 100 * gv[:, ks, :] / np.maximum(valid[:, ks, None], 1), 0)
    present = valid[:, ks] > 0
    # area aggregates (for borrowing)
    areas = {}
    for c, i in cidx.items():
        areas.setdefault(area_of.get(c, -1), []).append(i)
    area_slope, area_growth, area_turn = {}, {}, {}
    for a, ii in areas.items():
        av = valid[ii][:, ks].sum(0)
        ag = gv[ii][:, ks, :].sum(0)
        ash = np.where(av[:, None] > 0, 100 * ag / np.maximum(av[:, None], 1), 0)
        area_slope[a] = trend_slopes(ash, av > 0, t, last, step)
        area_growth[a] = growth_rate(elig[ii][:, ks].sum(0), t, last)
        ae, at = elig[ii][:, ks].sum(0), voted[ii][:, ks].sum(0)
        rec = [k for k in ks if T[k] >= 2019 and ae[k] > 0][-5:]
        area_turn[a] = float(at[rec].sum() / ae[rec].sum()) if rec else None
    nat_growth = growth_rate(elig[:, ks].sum(0), t, last)
    out = {}
    for c, i in cidx.items():
        if valid[i, last] <= 0:
            continue
        a = area_of.get(c, -1)
        own = trend_slopes(sh[i], present[i], t, last, step)
        ref = area_slope.get(a)
        nv = valid[i, ks][present[i]].mean()
        if own is None:
            slope = ref if ref is not None else np.zeros(5)
        elif ref is None:
            slope = own
        else:
            wgt = nv / (nv + SHRINK_VOTES)
            slope = wgt * own + (1 - wgt) * ref
        shift = np.clip(slope * dt, -MAX_SHIFT, MAX_SHIFT)
        s = np.clip(sh[i, last] + shift, 0, None)
        s = 100 * s / s.sum() if s.sum() > 0 else sh[i, last]
        # electorate and turnout
        if c == ENVELOPES:
            g = nat_growth or 0.0
            v26 = valid[i, last] * math.exp(g * dt)
            e26, turn = 0.0, None
        else:
            gr = growth_rate(elig[i, ks], t, last)
            ga = area_growth.get(a) if area_growth.get(a) is not None else nat_growth
            if gr is None:
                gr = ga
            elif ga is not None:
                wgt = elig[i, last] / (elig[i, last] + SHRINK_ELIG)
                gr = wgt * gr + (1 - wgt) * ga
            gr = min(max(gr or 0.0, -.03), .10)
            e26 = elig[i, last] * math.exp(gr * dt)
            rec = [k for k in ks if T[k] >= 2019 and elig[i, k] > 0][-5:]
            own_t = voted[i, rec].sum() / elig[i, rec].sum() if rec else None
            ref_t = area_turn.get(a)
            turn = own_t if ref_t is None else ref_t if own_t is None else \
                (elig[i, last] / (elig[i, last] + SHRINK_ELIG)) * own_t + (1 - elig[i, last] / (elig[i, last] + SHRINK_ELIG)) * ref_t
            turn = min(max(turn or 0.0, 0.05), 0.98)
            vr = valid[i, last] / voted[i, last] if voted[i, last] else .99
            v26 = e26 * turn * vr
        out[c] = dict(i=i, share=s, e=e26, turn=turn, v=v26, slope=slope, last=last)
    return out


def national(proj, last, mode="full"):
    tot = np.zeros(5)
    for c, p in proj.items():
        i = p["i"]
        if mode == "demography":       # 2022 shares and turnout, grown electorate
            if c == ENVELOPES:
                v = p["v"]
            else:
                v = p["e"] * (voted[i, last] / elig[i, last] if elig[i, last] else 0) * (valid[i, last] / voted[i, last] if voted[i, last] else 1)
            tot += v * gv[i, last] / max(valid[i, last], 1)
        elif mode == "turnout":
            tot += p["v"] * gv[i, last] / max(valid[i, last], 1)
        else:
            tot += p["v"] * p["share"] / 100
    return 100 * tot / tot.sum(), tot


def seats(share):
    """Seats as if each group ran as one list (O gets none)."""
    s = np.array(share[:4], float)
    raw = 120 * s / s.sum()
    seat = np.floor(raw).astype(int)
    for k in np.argsort(-(raw - seat))[: 120 - seat.sum()]:
        seat[k] += 1
    return seat.tolist()


last = K - 1
target = years(TARGET)
proj = model(last, target)
nat22 = 100 * gv[:, last].sum(0) / valid[:, last].sum()
s_demo, _ = national(proj, last, "demography")
s_turn, _ = national(proj, last, "turnout")
s26, v26 = national(proj, last)

# backtest: 2022 from the elections up to 2021
bt = model(last - 1, T[last])
pred = np.zeros(5); err_model = err_naive = wsum = 0.0
for c, p in bt.items():
    i = p["i"]
    if valid[i, last] <= 0:
        continue
    act = 100 * gv[i, last] / valid[i, last]
    naive = 100 * gv[i, last - 1] / max(valid[i, last - 1], 1)
    pred += p["v"] * p["share"] / 100
    w = valid[i, last]
    err_model += w * np.abs(p["share"] - act)[:4].sum() / 2
    err_naive += w * np.abs(naive - act)[:4].sum() / 2
    wsum += w
pred = 100 * pred / pred.sum()
nat21 = 100 * gv[:, last - 1].sum(0) / valid[:, last - 1].sum()

r1 = lambda a: [round(float(x), 1) for x in a]
actual22 = [sum(p["seats"] for p in E[last]["parties"] if p["camp"] == g) for g in GROUPS]
loc = {}
for c, p in proj.items():
    i = p["i"]
    hist = []
    for k in range(K):
        hist += [int(x) for x in gv[i, k]]
    loc[str(c)] = dict(
        v=[int(x) for x in valid[i]],                    # valid votes per election
        g=hist,                                          # votes per group per election (R,H,L,A,O × elections)
        e=[int(x) for x in elig[i]],
        f=[round(p["e"]), round(1000 * p["turn"]) if p["turn"] else 0, round(p["v"])] + [round(p["v"] * x / 100) for x in p["share"]],
        tr=r1(p["slope"] * 4),                           # trend: points per 4 years, by group
    )
data = dict(
    meta=dict(
        elections=[dict(id=e["id"], label=e["label"], date=e["date"]) for e in E],
        groups={"R": "ימין", "H": "חרדים", "L": "מרכז–שמאל", "A": "ערבים", "O": "אחרות"},
        target=TARGET.isoformat(),
        method=("לכל יישוב: קו מגמה של חלקה של כל קבוצה בעשר מערכות הבחירות 2003–2022 (משקל גדול יותר לבחירות האחרונות; "
                "המעבר של ישראל ביתנו לצד השני בספטמבר 2019 נספר כקפיצה חד־פעמית ולא כמגמה; יישוב קטן נשען על מגמת האזור שלו; "
                f"לכל היותר {MAX_SHIFT:.0f} נקודות לקבוצה). גידול בעלי זכות הבחירה — לפי קצב היישוב 2013–2022; "
                "אחוז ההצבעה — הממוצע שלו בחמש הבחירות 2019–2022. התחזית = תוצאת 2022 + ארבע שנות מגמה, כפול הבוחרים הצפויים."),
        sources="ועדת הבחירות המרכזית — תוצאות לפי יישובים 2003–2022 (2003–2013 דרך הסדנא לידע ציבורי, odata.org.il)",
    ),
    national=dict(
        series=[r1(100 * gv[:, k].sum(0) / valid[:, k].sum()) for k in range(K)],
        valid=[int(valid[:, k].sum()) for k in range(K)],
        eligible=[int(elig[:, k].sum()) for k in range(K)],
        f26=r1(s26), votes26=[round(x) for x in v26], eligible26=round(sum(p["e"] for p in proj.values())),
        # 2022 = the official seats by group; 2026 = those plus the change in proportional seats
        seats22=actual22, seats26=[a + n - o for a, n, o in zip(actual22, seats(s26), seats(nat22))],
        steps=dict(demography=r1(s_demo - nat22), turnout=r1(s_turn - s_demo), trend=r1(s26 - s_turn)),
        backtest=dict(predicted=r1(pred), actual=r1(nat22), previous=r1(nat21),
                      locErrModel=round(err_model / wsum, 2), locErrNaive=round(err_naive / wsum, 2)),
    ),
    loc=loc,
)
(ROOT / "data/trends.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
fmt = lambda a: " · ".join(f"{g} {x:+.1f}" if isinstance(x, float) and x < 0 or False else f"{g} {x:.1f}" for g, x in zip(G, a))
print(f"· 2022: {fmt(r1(nat22))}")
print(f"· 2026: {fmt(r1(s26))} · מנדטים {dict(zip(GROUPS, data['national']['seats26']))} (2022 בפועל: {dict(zip(GROUPS, actual22))})")
print(f"· פירוק: דמוגרפיה {r1(s_demo - nat22)} · הצבעה {r1(s_turn - s_demo)} · מגמה {r1(s26 - s_turn)}")
print(f"· בדיקה לאחור (2022 מתוך עד 2021): תחזית {r1(pred)} · בפועל {r1(nat22)} · 2021 {r1(nat21)}")
print(f"· טעות ממוצעת ביישוב (נק׳): המודל {err_model / wsum:.2f} · 'כמו בבחירות הקודמות' {err_naive / wsum:.2f}")
print(f"· בעלי זכות בחירה 2026: {round(sum(p['e'] for p in proj.values())):,} (2022: {int(elig[:, last].sum()):,})")
print(f"· data/trends.json — {len(loc)} יישובים, {(ROOT / 'data/trends.json').stat().st_size // 1024} KB")
