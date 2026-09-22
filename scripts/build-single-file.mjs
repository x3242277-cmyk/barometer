#!/usr/bin/env node
/**
 * בונה שתי גרסאות עצמאיות (קובץ אחד, בלי fetch):
 *   dist/index.html    — עמוד HTML מלא, אפשר לפתוח ישירות מהדיסק
 *   dist/artifact.html — תוכן בלבד (בלי doctype/head/body), לפרסום כ-Artifact
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = f => readFile(path.join(ROOT, f), "utf8");

const html = await rd("index.html");
const stylesheets = ["styles", "upgrade", "home", "fit", "intro", "layout", "editorial", "experience", "pipeline", "election", "election-pages", "election-tools", "refinement"];
let css = (await Promise.all(stylesheets.map(name => rd(`assets/${name}.css`)))).join("\n");
// Imports must precede CSS rules, including imports from the final design layer.
// Font URLs themselves contain semicolons (weight lists), so keep each whole line.
const importLine = /^@import[^\r\n]*;/gm;
const fontImports = [...css.matchAll(importLine)].map(match => match[0]);
css = fontImports.join("\n") + "\n" + css.replace(importLine, "");
for (const motif of ['polls','community','growth','ballot']) {
  const file = `background-${motif}.svg`;
  css = css.replaceAll(file, 'data:image/svg+xml;base64,' + Buffer.from(await rd('assets/'+file)).toString('base64'));
}
const electionBackdrop = await readFile(path.join(ROOT, "assets/election-knesset.png"));
const electionBackdropDataUri = `data:image/png;base64,${electionBackdrop.toString("base64")}`;
css = css.replace(/url\(\s*(['"]?)(?:\.\/|assets\/)?election-knesset\.png(?:\?[^'"\)\s]*)?\1\s*\)/g, `url("${electionBackdropDataUri}")`);
const scripts = ["scenario", "upgrade", "analytics", "explore", "app", "intro", "pipeline", "election-tools", "election"];
const js = (await Promise.all(scripts.map(name => rd(`assets/${name}.js`)))).join("\n");
const files = ["data/historical-polls.json", "data/current-polls.json", "data/pollsters.json", "data/regions.json", "data/demographics.json", "data/haredi.json"];
const optionalFiles = ["data/leaders.json", "data/live-results.json", "data/historical-polls-2021.json", "data/historical-polls-2020.json", "data/forecast-history.json", "data/polls-archive.json"];
const data = Object.fromEntries(await Promise.all(files.map(async f => [f, JSON.parse(await rd(f))])));
for (const f of optionalFiles) { try { data[f] = JSON.parse(await rd(f)); } catch { /* optional */ } }

// הטמעת תמונות מקומיות כ-data URI כדי שהקובץ היחיד יעבוד בלי שרת
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml" };
const embedLocal = async (src, fallbackMime = "image/jpeg") => {
  if (typeof src !== "string" || !src.startsWith("assets/")) return src;
  try {
    const buf = await readFile(path.join(ROOT, src));
    return `data:${MIME[src.split(".").pop().toLowerCase()] || fallbackMime};base64,${buf.toString("base64")}`;
  } catch { return ""; }
};
if (data["data/leaders.json"]?.photos) {
  const photos = data["data/leaders.json"].photos;
  for (const id of Object.keys(photos)) photos[id] = await embedLocal(photos[id]);
}
// לוגואים מקומיים של מכוני הסקרים והערוצים ב-pollsters.json
if (data["data/pollsters.json"]) {
  const p = data["data/pollsters.json"];
  for (const f of p.firms || []) if (f.logo) f.logo = await embedLocal(f.logo, "image/png");
  for (const k of Object.keys(p.outletLogos || {})) p.outletLogos[k] = await embedLocal(p.outletLogos[k], "image/png");
}

const logo = (await rd("assets/logo.svg")).replace(/\s+/g, " ").trim();
const logoDataUri = "data:image/svg+xml;utf8," + encodeURIComponent(logo);
const electionMarkDataUri = "data:image/svg+xml;base64," + Buffer.from(await rd("assets/election-mark.svg")).toString("base64");

const inlineData = `<script>window.__BAROMETER_DATA__=${JSON.stringify(data).replace(/</g, "\\u003c")};<\/script>`;
const leafletTags = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"><script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>`;
const styleTag = `<style>\n${css}\n</style>`;
const scriptTag = `<script>\n${js}\n<\/script>`;

// גוף העמוד בלבד
let body = html.slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"));
// חותמות הגרסה (?v=...) נועדו לקאש של האתר החי; בקובץ היחיד הכול מוטמע ואין להן מקום
body = body.replace(/(assets\/[^"'?\s]+)\?v=[0-9a-f]+/g, "$1");
body = body.replaceAll("assets/logo.svg", logoDataUri);
body = body.replaceAll("assets/election-mark.svg", electionMarkDataUri);
const title = "ברומטר";
const fullTitle = "ברומטר · מדד הסקרים והאמינות";
const fontLink = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700;800&display=swap"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Hebrew:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">`;

const artifact = `<title>${title}</title>
<meta name="description" content="ברומטר — ניתוח עצמאי של סקרי הבחירות בישראל.">
${fontLink}
${leafletTags}
${styleTag}
<div dir="rtl" lang="he" id="barometer-root">
${body}
</div>
${inlineData}
${scriptTag}
<style>#barometer-root{text-align:start}</style>`;

const standalone = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${fullTitle}</title>
<link rel="icon" href="${logoDataUri}">
${leafletTags}
${styleTag}
</head><body>
${body}
${inlineData}
${scriptTag}
</body></html>`;

await mkdir(path.join(ROOT, "dist"), { recursive: true });
await writeFile(path.join(ROOT, "dist/index.html"), standalone, "utf8");
await writeFile(path.join(ROOT, "dist/artifact.html"), artifact, "utf8");
const kb = s => (Buffer.byteLength(s) / 1024).toFixed(0) + " KB";
console.log("· dist/index.html   ", kb(standalone));
console.log("· dist/artifact.html", kb(artifact));
