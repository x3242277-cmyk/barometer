"""Real shapes for cities and local councils on the 2022 election map.

Source: OpenStreetMap municipal boundaries (boundary=administrative, admin_level=8,
mostly "Israel Ministry of Interior"), via the Overpass API — © OpenStreetMap
contributors, ODbL. Each boundary is matched to the locality it governs:
by its CBS code (ref:IL:cbs) when tagged, otherwise to the locality inside it
that holds most of its votes. A boundary whose votes are split among several
localities (a regional council) is skipped — those localities keep a dot.
Shapes are stored per locality as "b": rings in map units (0.1 km), delta encoded.

    python scripts/add-locality-shapes.py
"""
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "data" / "results-2022.json"
data = json.loads(TARGET.read_text(encoding="utf-8"))
KX = 111.32 * math.cos(math.radians(31.5)) * 10
KY = 110.57 * 10
TOLERANCE = 1.5                   # simplification, map units (150 m)

QUERY = '[out:json][timeout:120];area["ISO3166-1"="IL"][admin_level=2]->.a;rel(area.a)["boundary"="administrative"]["admin_level"="8"];out geom;'
def fetch_relations():
    """Overpass is often busy: try the main server and a mirror, a few times each."""
    import time
    last = None
    for attempt in range(4):
        for url in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": QUERY}).encode(),
                                             headers={"User-Agent": "barometer-map/1.0 (+https://github.com/x3242277-cmyk/barometer)"})
                return json.loads(urllib.request.urlopen(req, timeout=180).read())["elements"]
            except Exception as e:     # 429/504 under load
                last = e
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Overpass לא זמין: {last}")


relations = fetch_relations()
print(f"· {len(relations)} גבולות שיפוט מ־OpenStreetMap")


def assemble(rel):
    """Join the outer member ways into closed rings."""
    ways = [[(p["lon"], p["lat"]) for p in m["geometry"]] for m in rel.get("members", [])
            if m.get("type") == "way" and m.get("role") in ("outer", "") and m.get("geometry")]
    rings = []
    while ways:
        ring = ways.pop(0)
        while ring[0] != ring[-1]:
            for i, w in enumerate(ways):
                if w[0] == ring[-1]:
                    ring += w[1:]
                elif w[-1] == ring[-1]:
                    ring += w[::-1][1:]
                elif w[-1] == ring[0]:
                    ring = w[:-1] + ring
                elif w[0] == ring[0]:
                    ring = w[::-1][:-1] + ring
                else:
                    continue
                ways.pop(i)
                break
            else:
                break                 # an open chain — keep what closed
        if len(ring) >= 4 and ring[0] == ring[-1]:
            rings.append(ring)
    return rings


def project(ring):
    return [((lon - 34) * KX, -(lat - 29) * KY) for lon, lat in ring]


def inside(pt, rings):
    x, y = pt
    hit = False
    for ring in rings:
        for (ax, ay), (bx, by) in zip(ring, ring[1:]):
            if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
                hit = not hit
    return hit


def simplify(points, tol):
    if len(points) <= 3:
        return points
    (sx, sy), (ex, ey) = points[0], points[-1]
    vx, vy = ex - sx, ey - sy
    L2 = vx * vx + vy * vy or 1e-9
    best, idx = -1, 0
    for i in range(1, len(points) - 1):
        px, py = points[i][0] - sx, points[i][1] - sy
        t = max(0, min(1, (px * vx + py * vy) / L2))
        d = (px - t * vx) ** 2 + (py - t * vy) ** 2
        if d > best:
            best, idx = d, i
    if best <= tol * tol:
        return [points[0], points[-1]]
    return simplify(points[:idx + 1], tol)[:-1] + simplify(points[idx:], tol)


def encode(ring):
    flat, px, py = [], 0, 0
    for i, (x, y) in enumerate(ring):
        x, y = round(x), round(y)
        flat += [x, y] if i == 0 else [x - px, y - py]
        px, py = x, y
    return flat


localities = [l for l in data["localities"] if l.get("x") is not None]
by_code = {l["c"]: l for l in data["localities"]}
for l in data["localities"]:
    l.pop("b", None)
placed, skipped = 0, []
for rel in relations:
    rings = [project(r) for r in assemble(rel)]
    if not rings:
        continue
    tags = rel.get("tags", {})
    inner = [l for l in localities if inside(((l["x"] - 34) * KX, -(l["y"] - 29) * KY), rings)]
    total = sum(l["v"] for l in inner)
    code = tags.get("ref:IL:cbs")
    target = by_code.get(int(code)) if code and code.isdigit() else None
    if target is None and inner:
        main = max(inner, key=lambda l: l["v"])
        if main["v"] >= .7 * total:
            target = main
    if target is None:
        skipped.append(tags.get("name:he") or tags.get("name"))
        continue
    shape = []
    for ring in rings:
        s = simplify(ring[:-1], TOLERANCE)
        if len(s) >= 3:
            shape.append(encode(s))
    if shape:
        target["b"] = shape
        placed += 1
TARGET.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"· {placed} יישובים קיבלו את צורת השטח שלהם; דולגו {len(skipped)} (מועצות אזוריות ושטחים בלי יישוב מרכזי)")
