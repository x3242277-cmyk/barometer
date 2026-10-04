"""Locality trends from September 2019 and the forecast for 2026 (data/trends.json),
plus the actual growth of each kind of locality (data/sector-growth.json).

    python scripts/build-locality-trends.py

Reads data/elections/*.json (scripts/import-elections-history.py — 2019b to 2022,
the period in which every list keeps the same group) and the 2022 areas and
locality types from data/results-2022.json. Four groups only: R ימין · H חרדים ·
L מרכז־שמאל · A ערבים (O = lists under 1.5%).

For every locality:
  trend      — a weighted straight line through its group shares in the four
               elections, measured against the whole country (the national
               swing of each election cancels out). Small localities borrow
               their area's trend, no group moves more than 8 points. Stored at
               full strength; the page applies it at the strength the reader
               picks — 0 by default, because the backtest below shows that four
               elections in three years are too short a line to extend.
  electorate — the growth of its eligible voters 2019b–2022 (log-linear),
               between −3% and +10% a year.
  turnout    — its average over the four elections.
2026 = the 2022 result (+ the chosen share of four years of trend), times the
grown electorate and the usual turnout. Summed over all localities (and the external envelopes) this
gives the national forecast, split into demography / turnout / trend.

Turnout by group (for the page's controls) is estimated from where each group's
voters live: the turnout of every locality, weighted by the group's votes there.

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
DAMP = 1.0                 # stored at full strength; the page scales it (0 by default)
RELATIVE = True            # trend of the locality against the country, not its raw shares
SHRINK_VOTES = 3000        # a locality with this many votes gets half its own trend, half its area's
SHRINK_ELIG = 2000
MAX_SHIFT = 8.0            # points per group over the projection
ENVELOPES = 99999

index = json.loads((ROOT / "data/elections/index.json").read_text(encoding="utf-8"))
E = [json.loads((ROOT / f"data/elections/{e['id']}.json").read_text(encoding="utf-8")) for e in index]
base = json.loads((ROOT / "data/results-2022.json").read_text(encoding="utf-8"))
area_of = {l["c"]: l["g"] for l in base["localities"] if l.get("g") is not None}
sector_of = {l["c"]: l["s"] for l in base["localities"]}
years = lambda d: d.year + (d.timetuple().tm_yday - .5) / 365.25
T = np.array([years(date.fromisoformat(e["date"])) for e in E])

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


def trend_slopes(shares, present, t, last):
    """Weighted LS of each group's share on time. shares (K, 5) in points;
    returns slopes in points per year (5,), or None with fewer than 3 elections."""
    m = present
    if m.sum() < 3:
        return None
    tt = t[m] - t[last]
    w = np.sqrt(np.exp(tt / TAU))[:, None]
    X = np.stack([np.ones_like(tt), tt], 1)
    coef, *_ = np.linalg.lstsq(X * w, shares[m] * w, rcond=None)
    return coef[1]


def growth_rate(e, t, last):
    m = (e > 0) & (np.arange(len(t)) <= last)
    if m.sum() < 2:
        return None
    tt = t[m] - t[last]
    w = np.sqrt(np.exp(tt / TAU))
    X = np.stack([np.ones_like(tt), tt], 1) * w[:, None]
    coef, *_ = np.linalg.lstsq(X, np.log(e[m]) * w, rcond=None)
    return float(coef[1])


def model(upto, target_year, damp=DAMP):
    """Project from the elections 0..upto (inclusive) to target_year."""
    last = upto
    ks = np.arange(upto + 1)
    t = T[: upto + 1]
    dt = target_year - T[last]
    sh = np.where(valid[:, ks, None] > 0, 100 * gv[:, ks, :] / np.maximum(valid[:, ks, None], 1), 0)
    present = valid[:, ks] > 0
    # the trend is measured against the whole country: the national swing of each
    # election (mood, not a trend) cancels out, what is left is how the locality
    # itself is changing
    natsh = 100 * gv[:, ks, :].sum(0) / valid[:, ks].sum(0)[:, None]
    dev = sh - natsh[None, :, :] if RELATIVE else sh
    areas = {}
    for c, i in cidx.items():
        areas.setdefault(area_of.get(c, -1), []).append(i)
    area_slope, area_growth, area_turn = {}, {}, {}
    for a, ii in areas.items():
        av = valid[ii][:, ks].sum(0)
        ag = gv[ii][:, ks, :].sum(0)
        ash = np.where(av[:, None] > 0, 100 * ag / np.maximum(av[:, None], 1), 0)
        area_slope[a] = trend_slopes(ash - natsh if RELATIVE else ash, av > 0, t, last)
        area_growth[a] = growth_rate(elig[ii][:, ks].sum(0), t, last)
        ae, at = elig[ii][:, ks].sum(0), voted[ii][:, ks].sum(0)
        area_turn[a] = float(at.sum() / ae.sum()) if ae.sum() else None
    nat_growth = growth_rate(elig[:, ks].sum(0), t, last)
    out = {}
    for c, i in cidx.items():
        if valid[i, last] <= 0:
            continue
        a = area_of.get(c, -1)
        own = trend_slopes(dev[i], present[i], t, last)
        ref = area_slope.get(a)
        nv = valid[i, ks][present[i]].mean()
        if own is None:
            slope = ref if ref is not None else np.zeros(5)
        elif ref is None:
            slope = own
        else:
            wgt = nv / (nv + SHRINK_VOTES)
            slope = wgt * own + (1 - wgt) * ref
        shift = np.clip(damp * slope * dt, -MAX_SHIFT, MAX_SHIFT)
        s = np.clip(sh[i, last] + shift, 0, None)
        s = 100 * s / s.sum() if s.sum() > 0 else sh[i, last]
        if c == ENVELOPES:
            v26 = valid[i, last] * math.exp((nat_growth or 0.0) * dt)
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
            rec = [k for k in ks if elig[i, k] > 0]
            own_t = voted[i, rec].sum() / elig[i, rec].sum() if rec else None
            ref_t = area_turn.get(a)
            wgt = elig[i, last] / (elig[i, last] + SHRINK_ELIG)
            turn = own_t if ref_t is None else ref_t if own_t is None else wgt * own_t + (1 - wgt) * ref_t
            turn = min(max(turn or 0.0, 0.05), 0.98)
            vr = valid[i, last] / voted[i, last] if voted[i, last] else .99
            v26 = e26 * turn * vr
        out[c] = dict(i=i, share=s, shift=shift, e=e26, turn=turn, v=v26, slope=slope * damp)
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


def group_turnout(turn, votes):
    """Turnout of each group's voters, estimated from where they live:
    turn (N,) locality turnout, votes (N, 5) group votes."""
    w = votes[:, :4]
    return 100 * (turn[:, None] * w).sum(0) / np.maximum(w.sum(0), 1)


last = K - 1
target = years(TARGET)
proj = model(last, target)
nat22 = 100 * gv[:, last].sum(0) / valid[:, last].sum()
s_demo, _ = national(proj, last, "demography")
s_turn, _ = national(proj, last, "turnout")
s26, v26 = s_turn, national(proj, last, "turnout")[1]       # the default: no trend
actual22 = [sum(p["seats"] for p in E[last]["parties"] if p["camp"] == g) for g in GROUPS]

# turnout by group: every election, and the model's 2026 baseline
home = np.array([c != ENVELOPES for c in codes])
gt_series = []
for k in range(K):
    turn = np.where(elig[:, k] > 0, voted[:, k] / np.maximum(elig[:, k], 1), 0)
    gt_series.append(group_turnout(turn[home], gv[home, k]))
p_list = [(c, p) for c, p in proj.items() if c != ENVELOPES]
gt26 = group_turnout(np.array([p["turn"] for _, p in p_list]), np.array([p["v"] * p["share"] / 100 for _, p in p_list]))

# backtest: 2022 from the elections up to 2021, for a few strengths of the trend
def backtest(damp):
    bt = model(last - 1, T[last], damp)
    pred = np.zeros(5); err = naive = wsum = 0.0
    for c, p in bt.items():
        i = p["i"]
        if valid[i, last] <= 0:
            continue
        act = 100 * gv[i, last] / valid[i, last]
        prev = 100 * gv[i, last - 1] / max(valid[i, last - 1], 1)
        pred += p["v"] * p["share"] / 100
        w = valid[i, last]
        err += w * np.abs(p["share"] - act)[:4].sum() / 2
        naive += w * np.abs(prev - act)[:4].sum() / 2
        wsum += w
    return 100 * pred / pred.sum(), err / wsum, naive / wsum
bt = {}
for d in (0, .5, 1):
    pr, e1, e0 = backtest(d)
    bt[d] = (pr, e1, e0)
    print(f"· בדיקה לאחור, מגמה ×{d}: {np.round(pr[:4], 1)} · טעות ביישוב {e1:.2f} (כמו 2021: {e0:.2f})")
pred, err_model, err_naive = bt[1]
nat21 = 100 * gv[:, last - 1].sum(0) / valid[:, last - 1].sum()

r1 = lambda a: [round(float(x), 1) for x in a]
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
        t=[int(x) for x in voted[i]],
        f=[round(p["e"]), round(1000 * p["turn"]) if p["turn"] else 0, round(p["v"])],   # 2026: eligible, turnout ‰, valid
        tr=r1(p["shift"]),                               # full trend to 2026, points by group (R,H,L,A,O)
    )
data = dict(
    meta=dict(
        elections=[dict(id=e["id"], label=e["label"], date=e["date"]) for e in E],
        groups={"R": "ימין", "H": "חרדים", "L": "מרכז־שמאל", "A": "ערבים", "O": "אחרות"},
        target=TARGET.isoformat(),
        method=("כל יישוב מצביע כמו ב־2022, וגדל בקצב שלו: בעלי זכות הבחירה לפי קצב הגידול של היישוב מספטמבר 2019 עד 2022, "
                "ואחוז ההצבעה — הממוצע שלו בארבע הבחירות. אפשר להוסיף את המגמה של היישוב: קו דרך ארבע הבחירות, יחסית לכל הארץ "
                f"(התנודה הארצית של כל בחירות מתקזזת), לכל היותר {MAX_SHIFT:.0f} נקודות לקבוצה; יישוב קטן נשען על מגמת האזור שלו. "
                "רשימה נספרת בקבוצה שלה מ־1.5% מהקולות, גם אם לא עברה את אחוז החסימה."),
        sources="ועדת הבחירות המרכזית — תוצאות לפי יישובים, ספטמבר 2019–2022",
    ),
    national=dict(
        series=[r1(100 * gv[:, k].sum(0) / valid[:, k].sum()) for k in range(K)],
        valid=[int(valid[:, k].sum()) for k in range(K)],
        eligible=[int(elig[:, k].sum()) for k in range(K)],
        f26=r1(s26), votes26=[round(x) for x in v26], eligible26=round(sum(p["e"] for p in proj.values())),
        # 2022 = the official seats by group; 2026 = those plus the change in proportional seats
        seats22=actual22, prop22=seats(nat22), seats26=[a + n - o for a, n, o in zip(actual22, seats(s26), seats(nat22))],
        steps=dict(demography=r1(s_demo - nat22), turnout=r1(s_turn - s_demo), trend=r1(s26 - s_turn)),
        groupTurnout=dict(series=[r1(x) for x in gt_series], base26=r1(gt26)),
        backtest=dict(predicted=r1(pred), actual=r1(nat22), previous=r1(nat21),
                      locErr={str(d): round(bt[d][1], 2) for d in bt}, locErrNaive=round(err_naive, 2)),
    ),
    loc=loc,
)
(ROOT / "data/trends.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

# the actual growth of each kind of locality, for the demographic model
SECTORS = base["sectors"]
sg = []
for key, name in SECTORS.items():
    ii = [cidx[c] for c in codes if sector_of.get(c) == key]
    sg.append(dict(id=key, name=name, localities=len(ii),
                   eligible=[int(elig[ii, k].sum()) for k in range(K)],
                   voted=[int(voted[ii, k].sum()) for k in range(K)],
                   valid=[int(valid[ii, k].sum()) for k in range(K)],
                   groups=[[int(x) for x in gv[ii, k].sum(0)] for k in range(K)],
                   eligible26=round(sum(proj[c]["e"] for c in codes if sector_of.get(c) == key and c in proj)),
                   growth=round(100 * (math.exp(growth_rate(elig[ii].sum(0), T, last)) - 1), 2)))
(ROOT / "data/sector-growth.json").write_text(json.dumps(dict(
    meta=dict(elections=data["meta"]["elections"], target=TARGET.isoformat(),
              note="בעלי זכות הבחירה, המצביעים והקולות לכל קבוצה לפי סוג היישוב (סיווג הלמ״ס ו־2022). "
                   "growth — קצב הגידול השנתי של בעלי זכות הבחירה מספטמבר 2019 עד 2022; eligible26 — לפי המודל הגיאוגרפי.",
              source=data["meta"]["sources"]),
    national=dict(eligible=data["national"]["eligible"], eligible26=data["national"]["eligible26"],
                  growth=round(100 * (math.exp(growth_rate(elig[home].sum(0), T, last)) - 1), 2)),
    sectors=sg), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

fmt = lambda a: " · ".join(f"{g} {x:.1f}" for g, x in zip(G, a))
print(f"· 2022: {fmt(r1(nat22))}")
print(f"· 2026: {fmt(r1(s26))} · מנדטים {dict(zip(GROUPS, data['national']['seats26']))} (2022 בפועל: {dict(zip(GROUPS, actual22))})")
print(f"· פירוק: דמוגרפיה {r1(s_demo - nat22)} · הצבעה {r1(s_turn - s_demo)} · מגמה {r1(s26 - s_turn)}")
print(f"· הצבעה לפי קבוצה: {dict(zip([e['id'] for e in E], [r1(x) for x in gt_series]))} · 2026 {r1(gt26)}")
print(f"· גידול שנתי לפי סוג יישוב: {[(s['name'], s['growth']) for s in sg]} · ארצי {data['national'] and round(100 * (math.exp(growth_rate(elig[home].sum(0), T, last)) - 1), 2)}")
print(f"· data/trends.json — {len(loc)} יישובים, {(ROOT / 'data/trends.json').stat().st_size // 1024} KB")
