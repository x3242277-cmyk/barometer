#!/usr/bin/env python3
"""חיתוך אחיד של דיוקנאות המנהיגים מהמקור ברזולוציה מלאה שבתיקיית תמונות/.
הפלט: assets/leaders/<id>-full.jpg — יחס 4:5, ממורכז על הפנים, ~760px, איכות גבוהה.
תמונות/ אינה נכנסת ל-Git; רק הפלט המעובד נשמר במאגר.

    python scripts/crop-leaders.py
"""
import os
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "תמונות")
OUT = os.path.join(ROOT, "assets", "leaders")

# שם קובץ המקור (עברית) -> מזהה המפלגה בנתוני הסקר
MAP = {
    "הליכוד.jpg": "likud",
    "שס.jpg": "shas",
    "יהדות התורה.jpg": "yahadut_hatora",
    "עוצמה יהודית.jpg": "ozma_yehudit",
    "הציונות הדתית.jpg": "zionut_datit",
    "עמך ישראל.jpg": "ofer_vinter_party",
    "ישר.jpg": "yashar",
    "ביחד.jpg": "beyahad",
    "הדמוקרטים.jpg": "hademokratim",
    "ישראל ביתנו.jpg": "ndi",
    "רעמ.jpg": "raam",
    "הרשימה המשותפת.jpg": "reshima_meshutefet",
}

TARGET_W = 700
ASPECT = 4 / 5          # רוחב/גובה של הכרטיס
SIDE = 0.092           # חיתוך המסגרת המעוטרת: ~9% מכל צד
TOP = 0.055            # ~5.5% מלמעלה — בלי פינת המסגרת המעוגלת
# ביחד הוא דיוקן של שני אנשים — פחות זום פנימה כדי לא לחתוך אף אחד
OVERRIDE = {"beyahad": dict(side=0.06, top=0.07)}

def process(src_path, out_path, party):
    im = Image.open(src_path)
    im = ImageOps.exif_transpose(im).convert("RGB")
    w, h = im.size
    o = OVERRIDE.get(party, {})
    side = o.get("side", SIDE)
    top = o.get("top", TOP)

    x0 = int(w * side)
    x1 = int(w * (1 - side))
    y0 = int(h * top)
    cw = x1 - x0
    ch = int(round(cw / ASPECT))
    y1 = y0 + ch
    if y1 > h:                       # התמונה נמוכה מדי ל-4:5 — מיישרים מהתחתית
        y1 = h
        y0 = max(0, y1 - ch)

    im = im.crop((x0, y0, x1, y1))
    im = im.resize((TARGET_W, int(round(TARGET_W / ASPECT))), Image.LANCZOS)
    im.save(out_path, "JPEG", quality=82, optimize=True, progressive=True)
    return im.size, os.path.getsize(out_path)

def main():
    missing = [f for f in MAP if not os.path.exists(os.path.join(SRC, f))]
    if missing:
        raise SystemExit("חסרים קבצי מקור בתיקיית תמונות/: " + ", ".join(missing))
    for fname, party in MAP.items():
        out = os.path.join(OUT, f"{party}-full.jpg")
        size, nbytes = process(os.path.join(SRC, fname), out, party)
        print(f"  {party:<20} {size[0]}x{size[1]}  {nbytes // 1024} KB   <- {fname}")

if __name__ == "__main__":
    main()
