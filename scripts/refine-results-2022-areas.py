"""Build geographically connected voting areas for the 2022 election map.

Each land cell belongs to its nearest reliable locality. Within
its CBS natural region, the cell is grouped by that locality's leading voting
bloc and then by spatial connectivity. This preserves left-leaning enclaves and
recognized Bedouin towns beside larger right-leaning cities.
"""

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


# Windows consoles default to a legacy code page; the progress lines are Hebrew.
sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "data" / "results-2022.json"
data = json.loads(TARGET.read_text(encoding="utf-8"))
source_areas = json.loads((ROOT / "data" / "locality-history.json").read_text(encoding="utf-8"))["regions"]
x0, y0, x1, y1 = data["map"]["bbox"]
STEP = 5  # map units are 0.1 km, so each raster cell is 0.5 km wide
width = (x1 - x0 + STEP - 1) // STEP + 2
height = (y1 - y0 + STEP - 1) // STEP + 2


def decode(encoded):
    x = y = 0
    result = []
    for i in range(0, len(encoded), 2):
        x += encoded[i]
        y += encoded[i + 1]
        result.append((x, y))
    return result


def pixels(ring):
    return [((x - x0) / STEP, (y - y0) / STEP) for x, y in decode(ring)]


# The land mask starts from the outlines of the CBS natural regions.
mask_image = Image.new("L", (width, height))
draw = ImageDraw.Draw(mask_image)
for area in source_areas:
    for ring in area["shape"]["rings"]:
        draw.polygon(pixels(ring), fill=1)
for water in data["map"]["water"]:
    draw.polygon(pixels(water), fill=0)
mask = np.asarray(mask_image, dtype=bool)
# Those outlines run far out to sea along the coast; cut them at the real
# coastline from the elevation model (scripts/sea_mask.py).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sea_mask import sea_cells
from sea_mask import KX as KX_MAP, KY as KY_MAP
sea = sea_cells(x0, y0, width, height, STEP)
print(f"· קו החוף: {int((mask & sea).sum() * STEP * STEP / 100)} קמ״ר של ים הוצאו מהמפה")
mask = mask & ~sea
# The cut leaves a few specks off the coast (islets, breakwaters): keep only the
# land that is the main mass or holds a locality.
speck_id = np.full(mask.shape, -1, dtype=np.int32)
specks = []
for seed_y, seed_x in zip(*np.nonzero(mask)):
    if speck_id[seed_y, seed_x] >= 0:
        continue
    speck_id[seed_y, seed_x] = len(specks)
    pending, cells = [(seed_y, seed_x)], []
    while pending:
        y, x = pending.pop()
        cells.append((y, x))
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < height and 0 <= xx < width and mask[yy, xx] and speck_id[yy, xx] < 0:
                speck_id[yy, xx] = len(specks)
                pending.append((yy, xx))
    specks.append(cells)
inhabited = set()
for l in data["localities"]:
    if l["x"] is not None and l["y"] is not None:
        cx, cy = int(((l["x"] - 34) * KX_MAP - x0) / STEP), int((-(l["y"] - 29) * KY_MAP - y0) / STEP)
        if 0 <= cy < height and 0 <= cx < width and speck_id[cy, cx] >= 0:
            inhabited.add(int(speck_id[cy, cx]))
largest = max(range(len(specks)), key=lambda i: len(specks[i]))
mask = mask.copy()
for i, cells in enumerate(specks):
    if i != largest and i not in inhabited:
        for y, x in cells:
            mask[y, x] = False

localities = [
    l for l in data["localities"]
    if l["x"] is not None and l["y"] is not None and "(שבט)" not in l["n"]
]
kx = 111.32 * np.cos(np.deg2rad(31.5)) * 10
ky = 110.57 * 10


def km_point(locality):
    return ((locality["x"] - 34) * kx / 10, -(locality["y"] - 29) * ky / 10)


# A handful of name-based source coordinates resolve to a different settlement
# with the same name. Flag a point only when it is far from every member of its
# own CBS natural region but immediately beside localities from other regions.
outliers = set()
km = [km_point(l) for l in localities]
region_members = defaultdict(list)
for i, locality in enumerate(localities):
    region_members[locality["r"]].append(i)
for i, locality in enumerate(localities):
    own = region_members[locality["r"]]
    if len(own) < 2:
        continue
    near_same = min(np.hypot(km[i][0] - km[j][0], km[i][1] - km[j][1]) for j in own if j != i)
    near_any = min(np.hypot(km[i][0] - km[j][0], km[i][1] - km[j][1]) for j in range(len(km)) if j != i)
    own_x = np.asarray([km[j][0] for j in own])
    own_y = np.asarray([km[j][1] for j in own])
    core = (np.median(own_x), np.median(own_y))
    spread = np.median(np.hypot(own_x - core[0], own_y - core[1]))
    distant_cluster = len(own) >= 5 and np.hypot(km[i][0] - core[0], km[i][1] - core[1]) > max(40, 3 * spread)
    near_other = min((np.hypot(km[i][0] - km[j][0], km[i][1] - km[j][1]) for j, peer in enumerate(localities) if peer["r"] != locality["r"]), default=999)
    if (near_same > 20 and near_same > max(near_any * 3, near_any + 18)) or (distant_cluster and near_other < 5):
        outliers.add(locality["c"])

# These two name-lookup points almost coincide with another natural region
# despite lying 16-18 km from the next locality in their recorded region.
# Their vote totals remain; their doubtful coordinates do not color land.
outliers.update({27, 32})

for locality in data["localities"]:
    locality["g"] = None
    if "(שבט)" in locality["n"] or locality["c"] in outliers:
        locality["x"] = locality["y"] = None

localities = [l for l in localities if l["c"] not in outliers]
xs = np.asarray([(l["x"] - 34) * kx for l in localities], dtype=np.float32)
ys = np.asarray([-(l["y"] - 29) * ky for l in localities], dtype=np.float32)
regions = np.asarray([l["r"] for l in localities], dtype=np.int16)
camp_indices = [[i for i, party in enumerate(data["parties"]) if party["camp"] == camp] for camp in ("R", "L", "A")]
winning_camps = np.asarray([
    np.argmax([sum(l["p"][i] for i in indices) for indices in camp_indices])
    for l in localities
], dtype=np.int16)
keys = regions * 3 + winning_camps
gy, gx = np.nonzero(mask)
label = np.full((height, width), -1, dtype=np.int16)
owner = np.full((height, width), -1, dtype=np.int16)

# Batch the distance matrix so memory stays bounded even on a small machine.
for start in range(0, len(gx), 2048):
    end = min(start + 2048, len(gx))
    px = x0 + (gx[start:end].astype(np.float32) + 0.5) * STEP
    py = y0 + (gy[start:end].astype(np.float32) + 0.5) * STEP
    dist = (px[:, None] - xs[None, :]) ** 2
    dist += (py[:, None] - ys[None, :]) ** 2
    nearest = np.argmin(dist, axis=1)
    yy, xx = gy[start:end], gx[start:end]
    label[yy, xx] = keys[nearest]
    owner[yy, xx] = nearest


# Split every natural-region/voting-bloc pair into connected pieces. Merely
# grouping by the same bloc would join remote pockets inside long regions.
components = np.full((height, width), -1, dtype=np.int32)
parts = []
for seed_y, seed_x in zip(*np.nonzero(label >= 0)):
    if components[seed_y, seed_x] >= 0:
        continue
    cid = len(parts)
    key = int(label[seed_y, seed_x])
    components[seed_y, seed_x] = cid
    pending = [seed_y * width + seed_x]
    ownership = Counter()
    size = sx = sy = 0
    while pending:
        cell = pending.pop()
        y, x = divmod(cell, width)
        size += 1
        sx += x
        sy += y
        ownership[int(owner[y, x])] += 1
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < height and 0 <= xx < width and components[yy, xx] < 0 and label[yy, xx] == key:
                components[yy, xx] = cid
                pending.append(yy * width + xx)
    parts.append({"key": key, "size": size, "x": sx / size, "y": sy / size, "owners": ownership})


# Give a locality the connected part of its own Voronoi cell nearest its
# recorded point. Duplicate coordinates can be won by a single point; those
# localities fall back to the nearest piece with the same region and bloc.
nearest_part = [None] * len(localities)
nearest_distance = np.full(len(localities), np.inf)
for y, x in zip(*np.nonzero(owner >= 0)):
    li = int(owner[y, x])
    distance = (x0 + (x + .5) * STEP - xs[li]) ** 2 + (y0 + (y + .5) * STEP - ys[li]) ** 2
    if distance < nearest_distance[li]:
        nearest_distance[li] = distance
        nearest_part[li] = int(components[y, x])
for li, cid in enumerate(nearest_part):
    if cid is not None:
        continue
    yy, xx = np.nonzero(label == keys[li])
    if not len(xx):
        continue
    distances = (x0 + (xx + .5) * STEP - xs[li]) ** 2 + (y0 + (yy + .5) * STEP - ys[li]) ** 2
    j = int(np.argmin(distances))
    nearest_part[li] = int(components[yy[j], xx[j]])

anchored = sorted({cid for cid in nearest_part if cid is not None})
area_of_part = {cid: ai for ai, cid in enumerate(anchored)}
# Land pieces without a locality join an anchored area only across a real
# shared border. Prefer their original natural region; leave no land uncolored.
part_borders = Counter()
for left, right in ((components[:, :-1], components[:, 1:]), (components[:-1, :], components[1:, :])):
    different = (left >= 0) & (right >= 0) & (left != right)
    pairs = np.sort(np.stack((left[different], right[different]), axis=1), axis=1)
    unique, counts = np.unique(pairs, axis=0, return_counts=True)
    part_borders.update({tuple(map(int, pair)): int(n) for pair, n in zip(unique, counts)})
while True:
    choices = [(parts[cid]["key"] // 3 != parts[known]["key"] // 3,
                parts[cid]["key"] % 3 != parts[known]["key"] % 3,
                -length, cid, known) for (a, b), length in part_borders.items()
               for cid, known in ((a, b), (b, a))
               if cid not in area_of_part and known in area_of_part]
    if not choices:
        break
    _, _, _, cid, known = min(choices)
    area_of_part[cid] = area_of_part[known]
if len(area_of_part) != len(parts):
    raise RuntimeError(f"{len(parts) - len(area_of_part)} detached land components cannot join a voting area")

# Work with voting-area numbers while deciding which connected neighbors to
# merge. The published map has at most 60 areas, so its boundaries stay legible
# at ordinary desktop size.
label = np.full((height, width), -1, dtype=np.int16)
for y, x in zip(*np.nonzero(components >= 0)):
    label[y, x] = area_of_part.get(int(components[y, x]), -1)
assert np.all(label[mask] >= 0), "Uncolored land cells before merging"

MAX_AREAS = 68
initial_count = len(anchored)
parent = list(range(initial_count))
votes = np.zeros((initial_count, 3), dtype=np.int64)
totals = np.zeros(initial_count, dtype=np.int64)
regional_votes = [Counter() for _ in anchored]
for li, locality in enumerate(localities):
    cid = nearest_part[li]
    if cid is None:
        continue
    ai = area_of_part[cid]
    totals[ai] += locality["v"]
    regional_votes[ai][locality["r"]] += locality["v"]
    for ci, indices in enumerate(camp_indices):
        votes[ai, ci] += sum(locality["p"][i] for i in indices)

cell_count = np.zeros(initial_count, dtype=np.int64)
min_x = np.full(initial_count, width, dtype=np.int32)
max_x = np.zeros(initial_count, dtype=np.int32)
min_y = np.full(initial_count, height, dtype=np.int32)
max_y = np.zeros(initial_count, dtype=np.int32)
for y, x in zip(*np.nonzero(label >= 0)):
    ai = int(label[y, x])
    cell_count[ai] += 1
    min_x[ai] = min(min_x[ai], x)
    max_x[ai] = max(max_x[ai], x)
    min_y[ai] = min(min_y[ai], y)
    max_y[ai] = max(max_y[ai], y)

adjacent = Counter()
for left, right in ((label[:, :-1], label[:, 1:]), (label[:-1, :], label[1:, :])):
    different = (left >= 0) & (right >= 0) & (left != right)
    pairs = np.sort(np.stack((left[different], right[different]), axis=1), axis=1)
    unique, counts = np.unique(pairs, axis=0, return_counts=True)
    adjacent.update({tuple(map(int, pair)): int(n) for pair, n in zip(unique, counts)})


def find(ai):
    while parent[ai] != ai:
        parent[ai] = parent[parent[ai]]
        ai = parent[ai]
    return ai


def merge_cost(a, b, border):
    va, vb = votes[a], votes[b]
    ca, cb = int(np.argmax(va)), int(np.argmax(vb))
    pa = va / max(1, va.sum())
    pb = vb / max(1, vb.sum())
    divergence = float(np.abs(pa - pb).sum() / 2)
    same_region = bool(regional_votes[a].keys() & regional_votes[b].keys())
    lo_x, hi_x = min(min_x[a], min_x[b]), max(max_x[a], max_x[b])
    lo_y, hi_y = min(min_y[a], min_y[b]), max(max_y[a], max_y[b])
    diagonal_km = np.hypot(hi_x - lo_x, hi_y - lo_y) * STEP / 10
    center_y = y0 + (lo_y + hi_y) * STEP / 2
    # The sparse southern desert needs larger geographic zones; populous
    # northern and central areas must never chain into cross-country strips.
    diameter_limit = 150 if center_y > -2200 else 75 if center_y > -2500 else 42
    if diagonal_km > diameter_limit:
        return float("inf")
    if border < 3 and diagonal_km > 25 and min(totals[a], totals[b]) >= 500:
        return float("inf")
    # Rising cost for sprawling merges keeps local clusters from forming long,
    # thin corridors merely because their voting bloc is alike.
    compactness = 20 * (diagonal_km / 55) ** 2
    cost = 18 * divergence + (0 if same_region else 9) + compactness
    cost += 3 * np.log1p(min(totals[a], totals[b]) / 500)
    cost -= 2 * np.log1p(border)
    if ca != cb:
        cost += 75
        for i, camp in ((a, ca), (b, cb)):
            center_y = y0 + (min_y[i] + max_y[i]) * STEP / 2
            if camp == 2 and center_y > -3000 and votes[i, 2] >= 1000:
                return float("inf")
            if camp == 2 and votes[i, 2] >= 1000:
                cost += 130
            if camp == 1 and center_y > -4000 and votes[i, 1] >= 2000:
                cost += 75
            # Rehovot/Gedera and Malachi contain substantial center-left
            # settlement clusters that disappear under their nearby cities if
            # population alone drives the last few merges.
            if camp == 1 and regional_votes[i][45] >= 5000 and votes[i, 1] >= 8000:
                cost += 400
            if camp == 1 and regional_votes[i][7] >= 4000 and votes[i, 1] >= 6000:
                cost += 150
    return cost


active = set(range(initial_count))
while len(active) > MAX_AREAS:
    borders = Counter()
    for (left, right), n in adjacent.items():
        a, b = find(left), find(right)
        if a != b:
            borders[tuple(sorted((a, b)))] += n
    if not borders:
        raise RuntimeError(f"Cannot reach {MAX_AREAS} connected map areas")
    a, b = min(borders, key=lambda pair: (merge_cost(pair[0], pair[1], borders[pair]), pair))
    if not np.isfinite(merge_cost(a, b, borders[a, b])):
        raise RuntimeError(f"Geographic diameter limit prevents reaching {MAX_AREAS} areas ({len(active)} remain)")
    parent[b] = a
    active.remove(b)
    votes[a] += votes[b]
    totals[a] += totals[b]
    regional_votes[a].update(regional_votes[b])
    cell_count[a] += cell_count[b]
    min_x[a], max_x[a] = min(min_x[a], min_x[b]), max(max_x[a], max_x[b])
    min_y[a], max_y[a] = min(min_y[a], min_y[b]), max(max_y[a], max_y[b])

roots = sorted(active, key=lambda ai: min(i for i in range(initial_count) if find(i) == ai))
root_index = {ai: i for i, ai in enumerate(roots)}
area_index = np.asarray([root_index[find(i)] for i in range(initial_count)], dtype=np.int16)
for li, locality in enumerate(localities):
    cid = nearest_part[li]
    if cid is not None:
        locality["g"] = int(area_index[area_of_part[cid]])
mapped = label >= 0
label[mapped] = area_index[label[mapped]]
assert np.all(label[mask] >= 0), "Uncolored land cells after merging"

# Strongholds join the nearest area of their own color. A locality that gave 80%
# or more to one bloc is never shown inside an area that another bloc leads (a
# kibbutz in a right-leaning valley, a right-wing village in the Besor): it and
# its land move to the area of the nearest locality whose area its bloc leads.
# The number of areas does not change; such a locality may become a detached
# patch of that area.
STRONG_SHARE = .8
moved_codes, touched = set(), set()
for _ in range(6):
    area_votes = np.zeros((len(roots), 3))
    for locality in localities:
        if locality["g"] is not None:
            area_votes[locality["g"]] += [sum(locality["p"][i] for i in indices) for indices in camp_indices]
    leader = area_votes.argmax(axis=1)
    misfits = []
    for li, locality in enumerate(localities):
        if locality["g"] is None or not locality["v"]:
            continue
        shares = [sum(locality["p"][i] for i in indices) / locality["v"] for indices in camp_indices]
        camp = int(np.argmax(shares))
        if shares[camp] >= STRONG_SHARE and leader[locality["g"]] != camp:
            misfits.append((li, camp))
    if not misfits:
        break
    for li, camp in misfits:
        candidates = [lj for lj, peer in enumerate(localities) if lj != li and peer["g"] is not None and leader[peer["g"]] == camp]
        if not candidates:
            continue
        nearest = min(candidates, key=lambda lj: (xs[lj] - xs[li]) ** 2 + (ys[lj] - ys[li]) ** 2)
        target = localities[nearest]["g"]
        touched.update((localities[li]["g"], target))
        localities[li]["g"] = target
        label[(owner == li) & mask] = target
        moved_codes.add(localities[li]["c"])
print(f"· {len(moved_codes)} יישובים (80% ומעלה לגוש אחד) עברו לאזור הקרוב בצבע שלהם")

# Areas that gave or received a stronghold may now have a detached patch; every
# other area must still be a single connected piece of land.
area_cell_counts = np.bincount(label[mask], minlength=len(roots))
visited = np.zeros((height, width), dtype=bool)
for ai in range(len(roots)):
    yy, xx = np.nonzero(label == ai)
    if not len(xx):
        raise RuntimeError(f"Voting area {ai} has no land cells")
    seed_y, seed_x = int(yy[0]), int(xx[0])
    pending = [seed_y * width + seed_x]
    visited[seed_y, seed_x] = True
    n = 0
    while pending:
        y, x = divmod(pending.pop(), width)
        n += 1
        for y2, x2 in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= y2 < height and 0 <= x2 < width and not visited[y2, x2] and label[y2, x2] == ai:
                visited[y2, x2] = True
                pending.append(y2 * width + x2)
    if n != area_cell_counts[ai] and ai not in touched:
        raise RuntimeError(f"Voting area {ai} is disconnected: {n} of {area_cell_counts[ai]} cells joined")


def encode(points):
    absolute = [(round(x0 + x * STEP), round(y0 + y * STEP)) for x, y in points]
    flat = []
    for i, (x, y) in enumerate(absolute):
        if i:
            flat.extend((x - absolute[i - 1][0], y - absolute[i - 1][1]))
        else:
            flat.extend((x, y))
    return flat


# Trace each shared cell edge only where two voting areas differ.
edges = [defaultdict(list) for _ in roots]
edge_neighbor = [{} for _ in roots]


def add_edge(ai, start, end, neighbor):
    edges[ai][start].append(end)
    edge_neighbor[ai][(start, end)] = neighbor


for y in range(height):
    for x in range(width):
        region = int(label[y, x])
        if region < 0:
            continue
        if y == 0 or label[y - 1, x] != region:
            add_edge(region, (x, y), (x + 1, y), int(label[y - 1, x]) if y else -1)
        if x == width - 1 or label[y, x + 1] != region:
            add_edge(region, (x + 1, y), (x + 1, y + 1), int(label[y, x + 1]) if x < width - 1 else -1)
        if y == height - 1 or label[y + 1, x] != region:
            add_edge(region, (x + 1, y + 1), (x, y + 1), int(label[y + 1, x]) if y < height - 1 else -1)
        if x == 0 or label[y, x - 1] != region:
            add_edge(region, (x, y + 1), (x, y), int(label[y, x - 1]) if x else -1)


def simplify(points, tolerance=.9):
    """Ramer-Douglas-Peucker on a boundary chain in raster-cell units."""
    if len(points) <= 2:
        return points
    start, end = points[0], points[-1]
    vx, vy = end[0] - start[0], end[1] - start[1]
    length2 = vx * vx + vy * vy
    farthest = 0
    max_dist2 = -1
    for i in range(1, len(points) - 1):
        px, py = points[i][0] - start[0], points[i][1] - start[1]
        t = max(0, min(1, (px * vx + py * vy) / length2)) if length2 else 0
        dx, dy = px - t * vx, py - t * vy
        d2 = dx * dx + dy * dy
        if d2 > max_dist2:
            max_dist2, farthest = d2, i
    if max_dist2 <= tolerance * tolerance:
        return [start, end]
    return simplify(points[:farthest + 1], tolerance)[:-1] + simplify(points[farthest:], tolerance)


def soften(points):
    """Cut raster corners by at most 0.8 cell while preserving endpoints."""
    if len(points) < 3:
        return points
    output = [points[0]]
    for before, current, after in zip(points, points[1:], points[2:]):
        ux, uy = before[0] - current[0], before[1] - current[1]
        vx, vy = after[0] - current[0], after[1] - current[1]
        ulen, vlen = np.hypot(ux, uy), np.hypot(vx, vy)
        if not ulen or not vlen or abs(ux * vy - uy * vx) < 1e-9:
            output.append(current)
            continue
        ru, rv = min(.2, .8 / ulen), min(.2, .8 / vlen)
        output.append((current[0] + ru * ux, current[1] + ru * uy))
        output.append((current[0] + rv * vx, current[1] + rv * vy))
    output.append(points[-1])
    return output


shared_simplification = {}


def smooth_ring(ring, neighbors):
    """Simplify shared border chains once, then reuse them in both polygons."""
    n = len(ring)
    breaks = [i for i in range(n) if neighbors[i] != neighbors[i - 1]]
    if not breaks:
        # A closed island without a junction: two opposite quarter arcs avoid
        # a degenerate zero-length first-to-last RDP segment.
        first = min(range(n), key=lambda i: ring[i])
        rotated = ring[first:] + ring[:first]
        backward = [rotated[0]] + list(reversed(rotated[1:]))
        reverse_output = tuple(backward) < tuple(rotated)
        if reverse_output:
            rotated = backward
        opposite = max(range(1, n), key=lambda i: (rotated[i][0] - rotated[0][0]) ** 2
                       + (rotated[i][1] - rotated[0][1]) ** 2)
        output = (soften(simplify(rotated[:opposite + 1]))[:-1]
                  + soften(simplify(rotated[opposite:] + [rotated[0]]))[:-1])
        return [output[0]] + list(reversed(output[1:])) if reverse_output else output
    first = breaks[0]
    rotated = ring[first:] + ring[:first]
    adjacent = neighbors[first:] + neighbors[:first]
    split = [i for i in range(n) if adjacent[i] != adjacent[i - 1]] + [n]
    output = []
    for start, end in zip(split, split[1:]):
        chain = rotated[start:end] + [rotated[end % n]]
        direct = tuple(chain)
        reverse = tuple(reversed(chain))
        cache_key = direct if direct < reverse else reverse
        if cache_key not in shared_simplification:
            shared_simplification[cache_key] = soften(simplify(list(cache_key)))
        smooth = shared_simplification[cache_key]
        output.extend((smooth if direct == cache_key else list(reversed(smooth)))[:-1])
    return output


def contours(index):
    boundary = edges[index]
    rings = []
    while boundary:
        start = next(iter(boundary))
        ring = [start]
        point = start
        for _ in range(width * height * 4):
            destinations = boundary[point]
            following = destinations.pop()
            if not destinations:
                del boundary[point]
            if following == start:
                break
            ring.append(following)
            point = following
        if len(ring) < 4:
            continue
        neighbors = [edge_neighbor[index][(ring[i], ring[(i + 1) % len(ring)])] for i in range(len(ring))]
        ring = smooth_ring(ring, neighbors)
        if len(ring) < 3:
            continue
        # Collinear vertices left by a short chain add no shape information.
        compact = []
        for i, current in enumerate(ring):
            before, after = ring[i - 1], ring[(i + 1) % len(ring)]
            if (current[0] - before[0]) * (after[1] - current[1]) != (current[1] - before[1]) * (after[0] - current[0]):
                compact.append(current)
        if len(compact) >= 3:
            rings.append(encode(compact))
    return rings


members_by_area = defaultdict(list)
for locality in data["localities"]:
    if locality["g"] is not None:
        members_by_area[locality["g"]].append(locality)
# The name and label come from the area's own largest locality, not from a
# stronghold that was moved into it.
representatives = [max([m for m in members_by_area[i] if m["c"] not in moved_codes] or members_by_area[i], key=lambda locality: locality["v"]) for i in range(len(roots))]
region_counts = Counter(main["r"] for main in representatives)
areas = []
for ai, main in enumerate(representatives):
    members = members_by_area[ai]
    assert members, f"Area {ai} has no voting locality"
    natural_region = main["r"]
    base_name = data["regions"][natural_region]
    name = base_name if region_counts[natural_region] == 1 else f"{base_name} · {main['n']}"
    district_votes = Counter()
    for locality in members:
        district_votes[locality["d"]] += locality["v"]
    label_point = [round((main["x"] - 34) * kx), round(-(main["y"] - 29) * ky)]
    areas.append({
        "name": name,
        "lead": main["n"],
        "d": district_votes.most_common(1)[0][0],
        "shape": {"rings": contours(ai), "label": label_point},
    })

assert all(area["shape"]["rings"] for area in areas)
assert all(locality["g"] is None or 0 <= locality["g"] < len(areas) for locality in data["localities"])
assert len(areas) <= MAX_AREAS
data["areas"] = areas
data["meta"]["areaMethod"] = (
    "אזורים מקומיים רציפים של דפוסי הצבעה דומים, על בסיס אזורים טבעיים של הלמ״ס והיישוב הקרוב. "
    "עד 68 אזורים. יישוב שנתן 80% ומעלה לגוש אחד משויך תמיד לאזור הקרוב שאותו גוש מוביל בו. "
    "קולות השבטים נספרים בלי שיוך נקודתי. באזורים דלילי יישוב הצבע משקף את היישוב האמין הקרוב."
)
TARGET.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Refined {len(areas)} connected voting areas from {len(localities)} reliable localities; excluded {len(outliers)} questionable coordinates")
