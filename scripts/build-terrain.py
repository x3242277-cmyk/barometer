"""Topographic relief for the 2022 election map (assets/relief-bg.jpg).

Elevation: AWS Terrain Tiles (Mapzen "terrarium" encoding, zoom 9 ≈ 250 m), public
open data — attribution "Terrain Tiles: Mapzen, AWS Open Data (SRTM and others)".
The tiles are reprojected onto the map's own units (0.1 km, north up, the same
projection as data/results-2022.json) and turned into a hillshade with a light
elevation tint. The page lays it over the map with multiply blending, so flat
lowland stays white (no change) and slopes and highlands darken slightly.

    python scripts/build-terrain.py
"""
import io
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "data" / "results-2022.json").read_text(encoding="utf-8"))
x0, y0, x1, y1 = data["map"]["bbox"]
PAD = 10                          # the page draws the map with 10 units of padding
x0, y0, x1, y1 = x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD
UNITS_PER_PX = 2.5                # 250 m per pixel, about the tiles' own resolution
W, H = int(math.ceil((x1 - x0) / UNITS_PER_PX)), int(math.ceil((y1 - y0) / UNITS_PER_PX))
KX = 111.32 * math.cos(math.radians(31.5)) * 10
KY = 110.57 * 10
Z = 9
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

# map units → lon/lat for every output pixel centre
ux = x0 + (np.arange(W) + .5) * UNITS_PER_PX
uy = y0 + (np.arange(H) + .5) * UNITS_PER_PX
lon = ux / KX + 34
lat = 29 - uy / KY
LON, LAT = np.meshgrid(lon, lat)
n = 2 ** Z
mx = (LON + 180) / 360 * n * 256
my = (1 - np.log(np.tan(np.radians(LAT)) + 1 / np.cos(np.radians(LAT))) / math.pi) / 2 * n * 256

# download the mosaic that covers the map
tx0, tx1 = int(mx.min() // 256), int(mx.max() // 256)
ty0, ty1 = int(my.min() // 256), int(my.max() // 256)
mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        url = TILE_URL.format(z=Z, x=tx, y=ty)
        raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "barometer-terrain/1.0"}), timeout=60).read()
        rgb = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB")).astype(np.float32)
        elev = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
        mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = elev
print(f"· {(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} אריחי גובה (זום {Z})")

# bilinear sample
fx, fy = mx - tx0 * 256 - .5, my - ty0 * 256 - .5
ix, iy = np.clip(np.floor(fx).astype(int), 0, mosaic.shape[1] - 2), np.clip(np.floor(fy).astype(int), 0, mosaic.shape[0] - 2)
ax, ay = np.clip(fx - ix, 0, 1), np.clip(fy - iy, 0, 1)
elev = (mosaic[iy, ix] * (1 - ax) * (1 - ay) + mosaic[iy, ix + 1] * ax * (1 - ay)
        + mosaic[iy + 1, ix] * (1 - ax) * ay + mosaic[iy + 1, ix + 1] * ax * ay)

# hillshade (light from the north-west, 45°), with modest vertical exaggeration
cell = UNITS_PER_PX * 100.0       # metres per pixel
z = elev * 2.2
dzdx = np.gradient(z, axis=1) / cell
dzdy = np.gradient(z, axis=0) / cell
slope = np.arctan(np.hypot(dzdx, dzdy))
aspect = np.arctan2(-dzdx, dzdy)
az, alt = math.radians(315), math.radians(45)
shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
shade = np.clip(shade / math.sin(alt), 0, 1.25)          # 1 = flat
light = np.clip(.70 + .30 * shade, .62, 1.0)             # never darker than 62%

# elevation tint: white lowlands, warm sand in the highlands
t = np.clip(elev / 1100, 0, 1)[..., None]
low, high = np.array([255, 255, 255], np.float32), np.array([228, 214, 186], np.float32)
tint = low * (1 - t) + high * t
rgb = np.clip(tint * light[..., None], 0, 255).astype(np.uint8)

out = ROOT / "assets" / "relief-bg.jpg"
Image.fromarray(rgb).save(out, quality=80, optimize=True, progressive=True)
meta = {"x": x0, "y": y0, "w": round(W * UNITS_PER_PX, 1), "h": round(H * UNITS_PER_PX, 1),
        "credit": "תבליט: Terrain Tiles (Mapzen, AWS Open Data)"}
data["map"]["terrain"] = meta
(ROOT / "data" / "results-2022.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"· assets/relief-bg.jpg — {W}×{H}, {out.stat().st_size // 1024} KB")
