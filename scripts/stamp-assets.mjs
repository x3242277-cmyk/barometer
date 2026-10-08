#!/usr/bin/env node
/**
 * חותמת גרסה על קישורי הנכסים ב-index.html וב-analytics.html (אזור הניהול)
 * -----------------------------------------
 *   node scripts/stamp-assets.mjs         # מעדכן את index.html במקום
 *   node scripts/stamp-assets.mjs --check # יוצא בשגיאה אם החותמת לא מעודכנת
 *
 * GitHub Pages מגיש את assets/ עם max-age=600. בלי חותמת, דפדפן שכבר ביקר
 * באתר ממשיך להריץ את ה-CSS וה-JS הישנים עד עשר דקות אחרי כל העלאה — ונראה
 * כאילו העדכון לא עלה. החותמת היא תקציר תוכן של הקובץ עצמו: היא משתנה רק
 * כשהקובץ משתנה, ואז הכתובת חדשה והדפדפן חייב למשוך אותו מחדש.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

const hash = async rel =>
  createHash("sha256").update(await readFile(path.join(ROOT, rel))).digest("hex").slice(0, 8);

let failed = false;
for (const name of ["index.html", "analytics.html"]) {
const HTML = path.join(ROOT, name);
let html = await readFile(HTML, "utf8");
const before = html;
const stamped = [];

/* כל href/src שמצביע לקובץ ב-assets/ מקבל ?v=<תקציר>, וחותמת קיימת מוחלפת. */
for (const m of [...html.matchAll(/(href|src)="(assets\/[^"?]+)(\?v=[0-9a-f]+)?"/g)]) {
  const [full, attr, file, old] = m;
  const v = await hash(file);
  html = html.replace(full, `${attr}="${file}?v=${v}"`);
  if (old !== `?v=${v}`) stamped.push(`${file} → ${v}`);
}

if (CHECK) {
  if (html !== before) {
    console.error(`✗ חותמות הנכסים ב-${name} אינן מעודכנות:`);
    stamped.forEach(x => console.error("   -", x));
    console.error("   הריצו: node scripts/stamp-assets.mjs");
    failed = true;
  } else console.log(`· חותמות הנכסים ב-${name} מעודכנות ✓`);
} else if (html === before) {
  console.log(`· אין שינוי בחותמות ב-${name}`);
} else {
  await writeFile(HTML, html, "utf8");
  stamped.forEach(x => console.log("·", x));
  console.log(`· ${name} עודכן ✓`);
}
}
if (failed) process.exit(1);
