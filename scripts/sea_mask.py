"""Which cells of the 2022 map grid are open sea (Mediterranean, Gulf of Eilat).

The region outlines the map starts from run far out to sea along the coast
(about 25 km off Ashdod). The real coastline comes from the elevation model:
AWS Terrain Tiles (Mapzen "terrarium", zoom 10 ≈ 150 m) — a cell is sea when
its ground is at or below sea level AND it is connected to the map's west or
south edge. The Dead Sea, the Kinneret and the Jordan valley are below sea
level too, but closed in by higher ground, so they stay land (the lakes are
drawn separately).

Tiles are cached in the system temp folder, so reruns do not download again.
"""
import io
import math
import tempfile
import urllib.request
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

KX = 111.32 * math.cos(math.radians(31.5)) * 10
KY = 110.57 * 10
Z = 10
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
CACHE = Path(tempfile.gettempdir()) / "barometer-terrain-tiles"


def _tile(tx, ty):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / f"{Z}-{tx}-{ty}.png"
    if not f.exists():
        req = urllib.request.Request(TILE_URL.format(z=Z, x=tx, y=ty), headers={"User-Agent": "barometer-coast/1.0"})
        f.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    rgb = np.asarray(Image.open(io.BytesIO(f.read_bytes())).convert("RGB")).astype(np.float32)
    return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768


def sea_cells(x0, y0, width, height, step):
    """Boolean (height, width) grid: True where the cell centre is open sea."""
    ux = x0 + (np.arange(width) + .5) * step
    uy = y0 + (np.arange(height) + .5) * step
    lon, lat = np.meshgrid(ux / KX + 34, 29 - uy / KY)
    n = 2 ** Z
    mx = (lon + 180) / 360 * n * 256
    my = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n * 256
    tx0, tx1, ty0, ty1 = int(mx.min() // 256), int(mx.max() // 256), int(my.min() // 256), int(my.max() // 256)
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = _tile(tx, ty)
    iy = np.clip((my - ty0 * 256).astype(int), 0, mosaic.shape[0] - 1)
    ix = np.clip((mx - tx0 * 256).astype(int), 0, mosaic.shape[1] - 1)
    low = mosaic[iy, ix] <= 0

    sea = np.zeros_like(low)
    pending = deque()
    for y in range(height):
        if low[y, 0]:
            sea[y, 0] = True
            pending.append((y, 0))
    for x in range(width):
        if low[height - 1, x]:
            sea[height - 1, x] = True
            pending.append((height - 1, x))
    while pending:
        y, x = pending.popleft()
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < height and 0 <= xx < width and low[yy, xx] and not sea[yy, xx]:
                sea[yy, xx] = True
                pending.append((yy, xx))
    return sea
