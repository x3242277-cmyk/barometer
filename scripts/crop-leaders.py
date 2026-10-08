#!/usr/bin/env python3
"""הכנת דיוקנאות המנהיגים מהמקור ברזולוציה מלאה שבתיקיית תמונות/, ללא חיתוך.
הפלט: assets/leaders/<id>-full.jpg — מסגרת 4:5, 720px, איכות גבוהה,
ולצדו <id>-64/96/128/192/256/384.jpg לכרטיסים הקטנים (srcset).
תמונות/ אינה נכנסת ל-Git; רק הפלט המעובד נשמר במאגר.

    python scripts/crop-leaders.py
"""
import os
import json
import hashlib
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
    "זליכה.jpg": "hendel_zeliha_party",
}

TARGET_W = 720
ASPECT = 4 / 5          # רוחב/גובה של הכרטיס
# גרסאות מוקטנות (LANCZOS) לכרטיסים הקטנים: הדפדפן מקטין איור קווים דקים
# (הצללה בקווים מקבילים) במסנן מהיר, והקווים הופכים למוארה — במיוחד כשהדף
# מוקטן (zoom-out). עם srcset צפוף הדפדפן תמיד מקבל גרסה שגודלה קרוב לגודל
# התצוגה בפיקסלים אמיתיים, וההקטנה שנותרה היא ≤1.5:1 — נקייה בכל זום.
SMALL = [64, 96, 128, 192, 256, 384]

def process(src_path, out_path, party):
    im = Image.open(src_path)
    im = ImageOps.exif_transpose(im).convert("RGB")
    # Keep the supplied artwork intact, including both people in joint portraits.
    im = ImageOps.pad(im, (TARGET_W, int(round(TARGET_W / ASPECT))),
                      method=Image.Resampling.LANCZOS, color=im.getpixel((0, 0)))
    # באיורים יש הרבה קווים דקים. דחיסת JPEG רגילה והפחתת צבע יוצרות סביבם
    # רעש וטשטוש ב-DPI גבוה, לכן שומרים ברזולוציה גדולה ובדגימת צבע מלאה.
    im.save(out_path, "JPEG", quality=94, subsampling=0, optimize=True, progressive=True)
    for w in SMALL:
        small = im.resize((w, int(round(w / ASPECT))), Image.LANCZOS)
        small.save(out_path.replace("-full.jpg", f"-{w}.jpg"), "JPEG", quality=90, subsampling=0, optimize=True)
    return im.size, os.path.getsize(out_path)

def main():
    missing = [f for f in MAP if not os.path.exists(os.path.join(SRC, f))]
    if missing:
        raise SystemExit("חסרים קבצי מקור בתיקיית תמונות/: " + ", ".join(missing))
    for fname, party in MAP.items():
        out = os.path.join(OUT, f"{party}-full.jpg")
        size, nbytes = process(os.path.join(SRC, fname), out, party)
        print(f"  {party:<20} {size[0]}x{size[1]}  {nbytes // 1024} KB   <- {fname}")
    registry_path = os.path.join(ROOT, "data", "leaders.json")
    with open(registry_path, encoding="utf-8") as source:
        registry = json.load(source)
    for party, url in registry["photos"].items():
        local_path = url.split("?")[0]
        if local_path.startswith("assets/leaders/") and local_path.endswith("-full.jpg"):
            with open(os.path.join(ROOT, local_path), "rb") as image:
                version = hashlib.sha256(image.read()).hexdigest()[:8]
            registry["photos"][party] = f"{local_path}?v={version}"
    registry["mappingNote"] = "שיוך לפי שמות הקבצים שסופקו בתיקיית תמונות; האיורים נשמרים ללא חיתוך בתוך מסגרת 4:5, עם גרסאות מוקטנות וחותמת תוכן לעדכון המטמון."
    with open(registry_path, "w", encoding="utf-8", newline="\n") as target:
        target.write(json.dumps(registry, ensure_ascii=False, indent=2) + "\n")

if __name__ == "__main__":
    main()
