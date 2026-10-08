"""Official results by locality for the Knesset elections from September 2019 (2019b–2022).

The table below goes back to 2003; FROM picks where the site starts (the user's
decision, 04.10.2026: from September 2019, after Yisrael Beiteinu moved to the
anti-Netanyahu side, so every election uses the same grouping).

    python scripts/import-elections-history.py            # downloads the ten files
    python scripts/import-elections-history.py --dir DIR  # reads 2003.xls … 2022.csv from DIR

Sources — Central Elections Committee result files:
  2003–2013: ballot-box files, mirrored by the Public Knowledge Workshop (odata.org.il)
  2015:      data.gov.il;  2019–2022: mediaXX.bechirot.gov.il (by locality)
Needs pandas + xlrd (2003, 2006 .xls) + openpyxl (2009, 2013 .xlsx).

Every list is placed in one of four groups (the user's decisions, 04.10.2026):
  R ימין · H חרדים · L מרכז–שמאל · A ערבים   (O = other, no group)
by its ideology — Kadima, Shinui, Gil, Hatnua are centre–left; Kulanu is right —
except Yisrael Beiteinu (from September 2019) and New Hope (2021), counted
centre–left because they sat against Netanyahu. For comparison with 2026, Jewish
Home in 2022 is assigned to centre–left as a modelling assumption. A list counts
in its group above 1% of the national vote, also when it missed the threshold; smaller lists are O.

Output: data/elections/<id>.json — the lists (name, group, colour, official seats),
the national totals and, per locality (CBS code, stable across elections),
eligible / voted / valid and the votes of each list. Lists under 1% that are not
named are summed per group ("other_R" …). A seat check (Bader–Ofer without surplus
agreements) must land within one seat of the official result for every list.
"""
import io
import json
import ssl
import sys
import tempfile
import urllib.request
from pathlib import Path

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "elections"
args = sys.argv[1:]
SRC_DIR = Path(args[args.index("--dir") + 1]) if "--dir" in args else Path(tempfile.gettempdir()) / "barometer-elections"
ENVELOPES = 99999
GROUPS = ["R", "H", "L", "A", "O"]

ODATA = "https://www.odata.org.il/dataset/c0ec706c-5970-4c6d-942f-aaf60187dcbb/resource/"
# letter → (party id, official seats); group and colour come from PARTY (group may be overridden per election)
ELECTIONS = [
    dict(id="2003", knesset=16, date="2003-01-28", label="2003", threshold=1.5,
         url=ODATA + "f48bb80f-9fac-4e0b-b542-5d8e91381174/download/-16-2003.xls",
         lists={"מחל": ("likud", 38), "אמת": ("labor_meimad", 19), "יש": ("shinui", 15), "שס": ("shas", 11),
                "ל": ("national_union", 7), "מרצ": ("meretz", 6), "ב": ("nrp", 6), "ג": ("utj", 5),
                "ו": ("hadash_taal", 3), "ם": ("am_ehad", 3), "ד": ("balad", 3), "כן": ("yisrael_baaliyah", 2),
                "עם": ("ual", 2), "קנ": ("green_leaf", 0), "נץ": ("herut", 0)}),
    dict(id="2006", knesset=17, date="2006-03-28", label="2006", threshold=2,
         url=ODATA + "456e09c0-784d-4d62-8856-b8916a5ddcd3/download/-17-2006.xls",
         lists={"כן": ("kadima", 29), "אמת": ("labor_meimad", 19), "שס": ("shas", 12), "מחל": ("likud", 12),
                "ל": ("yisrael_beiteinu", 11), "טב": ("national_union_nrp", 9), "זך": ("gil", 7), "ג": ("utj", 6),
                "מרצ": ("meretz", 5), "עם": ("ual_taal", 4), "ו": ("hadash", 3), "ד": ("balad", 3),
                "רק": ("greens", 0), "קנ": ("green_leaf", 0)}),
    dict(id="2009", knesset=18, date="2009-02-10", label="2009", threshold=2,
         url=ODATA + "837efc9e-7c7c-4d9e-b6ed-ac9728c91498/download/-18-.xlsx",
         lists={"כן": ("kadima", 28), "מחל": ("likud", 27), "ל": ("yisrael_beiteinu", 15), "אמת": ("labor", 13),
                "שס": ("shas", 11), "ג": ("utj", 5), "עם": ("ual_taal", 4), "ט": ("national_union", 4),
                "ו": ("hadash", 4), "מרצ": ("meretz", 3), "ב": ("jewish_home", 3), "ד": ("balad", 3),
                "ה": ("green_meimad", 0), "זך": ("gil", 0)}),
    dict(id="2013", knesset=19, date="2013-01-22", label="2013", threshold=2,
         url=ODATA + "2517a360-134d-4370-a81e-5d2c70d7f9fe/download/-19-.xlsx",
         lists={"מחל": ("likud_beiteinu", 31), "פה": ("yesh_atid", 19), "אמת": ("labor", 15), "טב": ("jewish_home", 12),
                "שס": ("shas", 11), "ג": ("utj", 7), "צפ": ("hatnua", 6), "מרץ": ("meretz", 6), "עם": ("ual_taal", 4),
                "ו": ("hadash", 4), "ד": ("balad", 3), "כן": ("kadima", 2), "נץ": ("otzma", 0), "קנ": ("green_leaf", 0)}),
    dict(id="2015", knesset=20, date="2015-03-17", label="2015", threshold=3.25,
         url="https://data.gov.il/dataset/26f9fa06-fcd7-4173-8df5-65797b63e857/resource/929b50c6-f455-4be2-b438-ec6af01421f2/download/expc-5.csv",
         lists={"מחל": ("likud", 30), "אמת": ("zionist_union", 24), "ודעם": ("joint_list", 13), "פה": ("yesh_atid", 11),
                "כ": ("kulanu", 10), "טב": ("jewish_home", 8), "שס": ("shas", 7), "ל": ("yisrael_beiteinu", 6),
                "ג": ("utj", 6), "מרצ": ("meretz", 5), "קץ": ("yachad", 0), "קנ": ("green_leaf", 0)}),
    dict(id="2019a", knesset=21, date="2019-04-09", label="אפריל 2019", threshold=3.25,
         url="https://media21.bechirot.gov.il/files/expc.csv",
         lists={"מחל": ("likud", 35), "פה": ("blue_white", 35), "שס": ("shas", 8), "ג": ("utj", 8), "ום": ("hadash_taal", 6),
                "אמת": ("labor", 6), "ל": ("yisrael_beiteinu", 5), "טב": ("urwp", 5), "מרצ": ("meretz", 4), "כ": ("kulanu", 4),
                "דעם": ("raam_balad", 4), "נ": ("new_right", 0), "ז": ("zehut", 0), "נר": ("gesher", 0)}),
    dict(id="2019b", knesset=22, date="2019-09-17", label="ספטמבר 2019", threshold=3.25,
         url="https://media22.bechirot.gov.il/files/expc.csv",
         lists={"פה": ("blue_white", 33), "מחל": ("likud", 32), "ודעם": ("joint_list", 13), "שס": ("shas", 9),
                "ל": ("yisrael_beiteinu", 8), "ג": ("utj", 7), "טב": ("yamina", 7), "אמת": ("labor_gesher", 6),
                "מרצ": ("democratic_union", 5), "כף": ("otzma", 0)}),
    dict(id="2020", knesset=23, date="2020-03-02", label="2020", threshold=3.25,
         url="https://media23.bechirot.gov.il/files/expc.csv",
         lists={"מחל": ("likud", 36), "פה": ("blue_white", 33), "ודעם": ("joint_list", 15), "שס": ("shas", 9), "ג": ("utj", 7),
                "אמת": ("labor_gesher_meretz", 7), "ל": ("yisrael_beiteinu", 7), "טב": ("yamina", 6), "נץ": ("otzma", 0)}),
    dict(id="2021", knesset=24, date="2021-03-23", label="2021", threshold=3.25,
         url="https://media24.bechirot.gov.il/files/expc.csv",
         lists={"מחל": ("likud", 30), "פה": ("yesh_atid", 17), "שס": ("shas", 9), "כן": ("blue_white", 8), "ב": ("yamina", 7),
                "אמת": ("labor", 7), "ג": ("utj", 7), "ל": ("yisrael_beiteinu", 7), "ט": ("religious_zionism", 6),
                "ודעם": ("joint_list", 6), "ת": ("new_hope", 6), "מרצ": ("meretz", 6), "עם": ("raam", 4)}),
    dict(id="2022", knesset=25, date="2022-11-01", label="2022", threshold=3.25,
         url="https://media25.bechirot.gov.il/files/expc.csv",
         lists={"מחל": ("likud", 32), "פה": ("yesh_atid", 24), "ט": ("religious_zionism", 14), "כן": ("national_unity", 12),
                "שס": ("shas", 11), "ג": ("utj", 7), "ל": ("yisrael_beiteinu", 6), "עם": ("raam", 5), "ום": ("hadash_taal", 5),
                "אמת": ("labor", 4), "מרצ": ("meretz", 0), "ד": ("balad", 0), "ב": ("jewish_home", 0)}),
]
# Yisrael Beiteinu sat against Netanyahu from September 2019 (the user's rule)
GROUP_OVERRIDE = {("yisrael_beiteinu", e): "L" for e in ("2019b", "2020", "2021", "2022")}
GROUP_OVERRIDE[("jewish_home", "2022")] = "L"

# id → (name, short, group, colour)
PARTY = {
    "likud": ("הליכוד", "הליכוד", "R", "#1B4E8E"),
    "likud_beiteinu": ("הליכוד ביתנו", "הליכוד ביתנו", "R", "#1B4E8E"),
    "national_union": ("האיחוד הלאומי", "האיחוד הלאומי", "R", "#3E3A6E"),
    "national_union_nrp": ("האיחוד הלאומי–המפד״ל", "האיחוד הלאומי–מפד״ל", "R", "#3E3A6E"),
    "nrp": ("המפד״ל", "המפד״ל", "R", "#4B7BA8"),
    "jewish_home": ("הבית היהודי", "הבית היהודי", "R", "#4B7BA8"),
    "yisrael_baaliyah": ("ישראל בעלייה", "ישראל בעלייה", "R", "#5E7FB8"),
    "yisrael_beiteinu": ("ישראל ביתנו", "ישראל ביתנו", "R", "#8A6318"),
    "kulanu": ("כולנו", "כולנו", "R", "#5B8FD0"),
    "yachad": ("יחד", "יחד", "R", "#44507A"),
    "herut": ("חרות", "חרות", "R", "#2A4F7A"),
    "otzma": ("עוצמה יהודית", "עוצמה יהודית", "R", "#2F2C55"),
    "urwp": ("איחוד מפלגות הימין", "איחוד הימין", "R", "#3E3A6E"),
    "new_right": ("הימין החדש", "הימין החדש", "R", "#3D6FA8"),
    "zehut": ("זהות", "זהות", "R", "#7A8FB0"),
    "yamina": ("ימינה", "ימינה", "R", "#3D6FA8"),
    "religious_zionism": ("הציונות הדתית", "הציונות הדתית", "R", "#3E3A6E"),
    "new_hope": ("תקווה חדשה", "תקווה חדשה", "L", "#4A7FBF"),
    "shas": ("ש״ס", "ש״ס", "H", "#4A4A4A"),
    "utj": ("יהדות התורה", "יהדות התורה", "H", "#5B4B8A"),
    "labor_meimad": ("העבודה–מימד", "העבודה–מימד", "L", "#C0392B"),
    "labor": ("העבודה", "העבודה", "L", "#C0392B"),
    "labor_gesher": ("העבודה–גשר", "העבודה–גשר", "L", "#C0392B"),
    "labor_gesher_meretz": ("העבודה–גשר–מרצ", "העבודה–גשר–מרצ", "L", "#C0392B"),
    "zionist_union": ("המחנה הציוני", "המחנה הציוני", "L", "#C0392B"),
    "meretz": ("מרצ", "מרצ", "L", "#2E8B57"),
    "democratic_union": ("המחנה הדמוקרטי", "המחנה הדמוקרטי", "L", "#2E8B57"),
    "shinui": ("שינוי", "שינוי", "L", "#E08A1E"),
    "am_ehad": ("עם אחד", "עם אחד", "L", "#D9534F"),
    "kadima": ("קדימה", "קדימה", "L", "#1F7FA6"),
    "gil": ("גיל — גמלאים", "גיל", "L", "#B5651D"),
    "green_meimad": ("התנועה הירוקה–מימד", "הירוקה–מימד", "L", "#6BA368"),
    "hatnua": ("התנועה", "התנועה", "L", "#5DADE2"),
    "yesh_atid": ("יש עתיד", "יש עתיד", "L", "#2AA5C9"),
    "blue_white": ("כחול לבן", "כחול לבן", "L", "#6E8CA8"),
    "national_unity": ("המחנה הממלכתי", "המחנה הממלכתי", "L", "#6E8CA8"),
    "gesher": ("גשר", "גשר", "L", "#C77C9E"),
    "hadash": ("חד״ש", "חד״ש", "A", "#B03024"),
    "hadash_taal": ("חד״ש–תע״ל", "חד״ש–תע״ל", "A", "#B03024"),
    "ual": ("רע״מ", "רע״מ", "A", "#2E8467"),
    "ual_taal": ("רע״מ–תע״ל", "רע״מ–תע״ל", "A", "#2E8467"),
    "raam": ("רע״מ", "רע״מ", "A", "#2E8467"),
    "balad": ("בל״ד", "בל״ד", "A", "#1F7A6E"),
    "raam_balad": ("רע״מ–בל״ד", "רע״מ–בל״ד", "A", "#1F7A6E"),
    "joint_list": ("הרשימה המשותפת", "המשותפת", "A", "#2E8467"),
    "green_leaf": ("עלה ירוק", "עלה ירוק", "O", "#6BAA3A"),
    "greens": ("הירוקים", "הירוקים", "O", "#7CB342"),
}
OTHER = {"R": ("אחרות — ימין", "#8FA6C4"), "H": ("אחרות — חרדים", "#9D93B8"), "L": ("אחרות — מרכז־שמאל", "#C99791"),
         "A": ("אחרות — ערבים", "#8DB3A3"), "O": ("אחרות", "#96A0AB")}

FROM = "2019b"
MIN_SHARE = 1              # strictly above this % of valid votes to count in a group
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"}


def fetch(e):
    ext = e["url"].rsplit(".", 1)[-1]
    f = SRC_DIR / f"{e['id']}.{ext}"
    if not f.exists():
        SRC_DIR.mkdir(parents=True, exist_ok=True)
        ctx = ssl.create_default_context()
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")       # the CEC servers use older ciphers
        f.write_bytes(urllib.request.urlopen(urllib.request.Request(e["url"], headers=UA), timeout=180, context=ctx).read())
    return f


def read(e):
    f = fetch(e)
    if f.suffix == ".csv":
        raw = f.read_bytes()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("cp1255")
        df = pd.read_csv(io.StringIO(text))
    else:
        df = pd.read_excel(f)
    df.columns = [str(c).strip() for c in df.columns]
    col = lambda *names: next(c for c in df.columns if c in names)
    c_code, c_name = col("סמל ישוב"), col("שם ישוב")
    c_elig = col("בוחרים", "בעלי זכות בחירה", "בז''ב", "בזב")
    c_voted, c_valid = col("מצביעים"), col("כשרים")
    skip = {c_code, c_name, c_elig, c_voted, c_valid, "פסולים", "סמל קלפי", "מספר קלפי", "כתובת", "סמל ועדה", "ריכוז", "שופט"}
    # some files end with a stray ^Z line: anything that is not a number is dropped
    df[c_code] = pd.to_numeric(df[c_code], errors="coerce")
    df = df[df[c_code].notna()].copy()
    for c in df.columns:
        if c not in (c_name, "כתובת"):
            df[c] = pd.to_numeric(df[c], errors="coerce")
    letters = [c for c in df.columns if c not in skip and not c.startswith("Unnamed") and df[c].notna().any()]
    df[[c_elig, c_voted, c_valid] + letters] = df[[c_elig, c_voted, c_valid] + letters].fillna(0)
    df[c_name] = df[c_name].fillna("").astype(str).str.strip()
    envelope = (df[c_code].astype(int) == 0) | df[c_name].str.contains("מעטפות")
    df["code"] = df[c_code].astype(int).where(~envelope, ENVELOPES)
    df.loc[envelope, c_elig] = 0                 # envelope rows carry no electorate of their own
    g = df.groupby("code")
    out = g[[c_elig, c_voted, c_valid] + letters].sum().astype(int)
    names = g[c_name].first()
    return out.rename(columns={c_elig: "e", c_voted: "t", c_valid: "v"}), names, letters


def bader_ofer(votes, threshold):
    total = sum(votes.values())
    passed = {k: v for k, v in votes.items() if v >= total * threshold / 100}
    seats = dict.fromkeys(passed, 0)
    for _ in range(120):
        k = max(passed, key=lambda k: passed[k] / (seats[k] + 1))
        seats[k] += 1
    return seats


base = json.loads((ROOT / "data" / "results-2022.json").read_text(encoding="utf-8"))
sector = {l["c"]: l["s"] for l in base["localities"]}
known = {l["c"] for l in base["localities"]}
OUT.mkdir(parents=True, exist_ok=True)
index = []
for e in ELECTIONS[[x["id"] for x in ELECTIONS].index(FROM):]:
    table, names, letters = read(e)
    nat = table.sum()
    valid = int(nat["v"])
    parties, cols = [], []
    for L in letters:
        if L in e["lists"]:
            pid, seats = e["lists"][L]
            name, short, grp, color = PARTY[pid]
            grp = GROUP_OVERRIDE.get((pid, e["id"]), grp)
            if 100 * nat[L] / valid <= MIN_SHARE:
                grp = "O"
            parties.append(dict(id=pid, name=name, short=short, camp=grp, color=color, seats=seats, letter=L))
            cols.append([L])
    rest = [L for L in letters if L not in e["lists"] and nat[L] > 0]
    big = [L for L in rest if 100 * nat[L] / valid > MIN_SHARE]
    if big:
        raise SystemExit(f"{e['label']}: רשימה בלי שיוך עם יותר מ־{MIN_SHARE}%: {big}")
    if rest:
        parties.append(dict(id="other", name="אחרות", short="אחרות", camp="O", color=OTHER["O"][1], seats=0, letter=""))
        cols.append(rest)
    votes = [int(sum(nat[L] for L in c)) for c in cols]
    order = sorted(range(len(parties)), key=lambda i: (parties[i]["id"].startswith("other"), -votes[i]))
    parties, cols, votes = [parties[i] for i in order], [cols[i] for i in order], [votes[i] for i in order]

    # seat check: Bader–Ofer without surplus agreements, within one seat of the official count
    named = {p["id"]: v for p, v in zip(parties, votes) if not p["id"].startswith("other")}
    calc = bader_ofer(named, e["threshold"])
    bad = [(p["short"], p["seats"], calc.get(p["id"], 0)) for p in parties if abs(calc.get(p["id"], 0) - p["seats"]) > 1]
    if bad or sum(p["seats"] for p in parties) != 120:
        raise SystemExit(f"{e['label']}: המנדטים לא מתאימים לתוצאה הרשמית {bad} (סה״כ {sum(p['seats'] for p in parties)})")
    named_share = sum(named.values()) / valid
    if named_share < .93:
        raise SystemExit(f"{e['label']}: הרשימות המזוהות מכסות רק {named_share:.1%} מהקולות")

    rows = []
    for code, r in table.iterrows():
        if r["v"] <= 0 and r["e"] <= 0:
            continue
        rows.append([int(code), int(r["e"]), int(r["t"]), int(r["v"])] + [int(sum(r[L] for L in c)) for c in cols])
    extra = {int(c): names[c] for c in table.index if c not in known and c != ENVELOPES}
    data = dict(id=e["id"], knesset=e["knesset"], date=e["date"], label=e["label"], threshold=e["threshold"],
                source=e["url"], parties=parties,
                national=dict(eligible=int(nat["e"]), voted=int(nat["t"]), valid=valid, votes=votes),
                rows=rows, names=extra)
    (OUT / f"{e['id']}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    groups = {g: sum(v for p, v in zip(parties, votes) if p["camp"] == g) / valid * 100 for g in GROUPS}
    index.append(dict(id=e["id"], label=e["label"], date=e["date"], knesset=e["knesset"]))
    print(f"· {e['label']}: {len(rows)} יישובים · {valid:,} קולות · "
          + " · ".join(f"{g} {groups[g]:.1f}%" for g in GROUPS)
          + (f" · הפרשי מנדטים בלי הסכמי עודפים: {[(p['short'], p['seats'], calc.get(p['id'], 0)) for p in parties if calc.get(p['id'], 0) != p['seats']]}" if any(calc.get(p['id'], 0) != p['seats'] for p in parties) else ""))
(OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"· נכתב data/elections/ — {len(index)} מערכות בחירות")
