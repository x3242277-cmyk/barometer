#!/usr/bin/env python3
"""
כיווץ לוגואים של מכוני הסקרים והערוצים אל assets/logos/.
המקורות יושבים בתיקיית תמונות/ (שאינה נכנסת ל-git). הפלט הוא PNG ברוחב
מרבי 256px — חד מספיק לתצוגה ב-~52px גם במסך רטינה, וקטן מספיק שלא לנפח
את dist/index.html כשהוא מוטמע כ-data URI בבנייה.

    python scripts/resize-logos.py

הרשימה למטה ממפה קובץ-מקור -> שם-יעד. שם היעד חייב להתאים לנתיב
ב-data/pollsters.json (firms[].logo ו-outletLogos).
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "תמונות"
OUT_DIR = ROOT / "assets" / "logos"
MAX_W = 256

MAP = {
    # מכוני סקרים
    "פאנלס פוליטיקס.jpg": "panels-politics.png",
    "מדגם.png": "midgam.png",
    "מאגר מוחות.jpg": "maagar-mochot.png",
    "המדד.png": "hamadad.png",
    # ערוצים
    "וואלה.jpg": "walla.png",
    "16.png": "channel-16.png",
    "זמן ישראל.jpg": "zman-israel.png",
    "i24.png": "i24news.png",
}


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    missing = [s for s in MAP if not (SRC_DIR / s).exists()]
    if missing:
        print("✗ חסרים קבצי מקור בתיקיית תמונות/:", ", ".join(missing))
        return 1

    for src_name, out_name in MAP.items():
        im = Image.open(SRC_DIR / src_name)
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        out = OUT_DIR / out_name
        im.save(out, "PNG", optimize=True)
        print(f"· {src_name}  ->  assets/logos/{out_name}  ({im.width}x{im.height}, {out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
