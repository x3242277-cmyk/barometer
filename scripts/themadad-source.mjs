// TheMadad publishes its poll table as JSON in the public polls26 page.
// Keep this adapter strict: a changed table must not silently corrupt a forecast.
export const THE_MADAD_URL = "https://themadad.com/polls26/";

const OUTLETS = {
  "חדשות 12": "channel_12", "חדשות 13": "channel_13",
  "ערוץ 14": "channel_14", "ערוץ 16": "channel_16",
  "מעריב": "maariv", "וואלה": "walla", "כאן חדשות": "kan_news",
  "ישראל היום": "israel_hayom", "זמן ישראל": "zman_israel",
  "i24 news": "i24news", "i24NEWS": "i24news"
};

const PARTIES = {
  likud: ["likud", "הליכוד", "Coalition"],
  bw: ["kahollavan", "כחול לבן", "Opposition"],
  israelBeitanu: ["ndi", "ישראל ביתנו", "Opposition"],
  utj: ["yahadut_hatora", "יהדות התורה", "Coalition"],
  shas: ["shas", "ש״ס", "Coalition"],
  hadashTal: ["hadash_taal", "חד״ש–תע״ל", "Arabs"],
  yeshAtid: ["yesh_atid", "יש עתיד", "Opposition"],
  meretz: ["meretz", "מרצ", "Opposition"],
  avoda: ["hademokratim", "הדמוקרטים", "Opposition"],
  smotrich: ["zionut_datit", "הציונות הדתית וזהות", "Coalition"],
  economy: ["hakalkalit", "הכלכלית", "Unknown"],
  raam: ["raam", "רע״מ", "Arabs"],
  ballad: ["balad", "בל״ד", "Arabs"],
  otzma: ["ozma_yehudit", "עוצמה יהודית", "Coalition"],
  tikvahHadash: ["tikvah_hadasha", "תקווה חדשה", "Opposition"],
  bennett: ["beyahad", "ביחד", "Opposition"],
  eisenkot: ["yashar", "ישר! עם איזנקוט.", "Opposition"],
  miluimnikim: ["hendel_zeliha_party", "מפלגת יועז הנדל וירון זליכה", "Unknown"],
  unifiedArabList: ["reshima_meshutefet", "הרשימה המשותפת", "Arabs"],
  erdan: ["erdan_party", "מפלגת ארדן ואדלשטיין", "Unknown"],
  winter: ["ofer_vinter_party", "עמך ישראל", "Coalition"]
};

const META_KEYS = new Set(["pollNumber", "version", "publisher", "pollster", "date", "respondents"]);
const POLLSTER_FIRM = {
  "מנו גבע": "Midgam", "המדד": "HaMadad",
  "שלמה פילבר": "Next Data", "מנחם לזר": "Panels Politics",
  "דודי חסיד": "Kantar", "יצחק כ״ץ": "Maagar Mochot",
  "יצחק כץ": "Maagar Mochot", "יוסי טאטיקה": "Yossi Tatika",
  "צוריאל שרון": "Direct Polls"
};

export function parseTheMadadHtml(html, { year, from, recentDays = null, firmBySource = {}, partyMeta = {} }) {
  const match = /\bconst\s+allPolls\s*=\s*(\[[\s\S]*?\]);/.exec(html);
  if (!match) throw new Error("לא נמצא מערך הסקרים בעמוד המדד");
  const rows = JSON.parse(match[1]);
  if (!Array.isArray(rows) || !rows.length) throw new Error("מערך הסקרים של המדד ריק");
  const floor = recentDays == null ? from : Math.max(from, Date.now() - recentDays * 864e5);
  const polls = [], skipped = [];
  for (const row of rows) {
    const ts = Date.parse(`${row.date}T00:00:00Z`);
    if (!Number.isFinite(ts) || ts < floor || new Date(ts).getUTCFullYear() !== year) continue;
    const sourceId = OUTLETS[row.publisher];
    if (!sourceId) { skipped.push(`${row.date} ${row.publisher}: כלי תקשורת לא מוכר`); continue; }
    const expectedFirm = POLLSTER_FIRM[row.pollster];
    if (!expectedFirm || firmBySource[sourceId] !== expectedFirm) {
      skipped.push(`${row.date} ${row.publisher}: שיוך מכון דורש בדיקה (${row.pollster})`);
      continue;
    }
    const parties = [];
    for (const [field, value] of Object.entries(row)) {
      if (META_KEYS.has(field) || value == null || value === "") continue;
      const meta = PARTIES[field];
      const mandates = Number(value);
      if (!meta || !Number.isInteger(mandates) || mandates < 0 || mandates > 120)
        throw new Error(`ערך מפלגה לא מוכר בסקר ${row.pollNumber}: ${field}=${value}`);
      const previous = partyMeta[meta[0]];
      parties.push({ id: meta[0], name: meta[1], logoUrl: previous?.logoUrl || "", mandates, alignment: meta[2] });
    }
    const total = parties.reduce((sum, party) => sum + party.mandates, 0);
    if (total !== 120) throw new Error(`סקר ${row.pollNumber}: סכום המנדטים ${total} במקום 120`);
    polls.push({
      id: `themadad-${row.pollNumber}`, date: `${row.date.slice(8, 10)}.${row.date.slice(5, 7)}.${row.date.slice(0, 4)}`,
      dateTimestamp: ts, publishedAt: ts, channel: "", channelHebrewName: row.publisher,
      sourceId, sourceUrl: THE_MADAD_URL, parties
    });
  }
  if (!polls.length) throw new Error("לא נמצאו סקרים מתאימים בעמוד המדד");
  return { polls, skipped };
}
