#!/usr/bin/env node
/**
 * חותמת גרסה על קישורי הנכסים ב-index.html
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
const HTML = path.join(ROOT, "index.html");

const hash = async rel =>
  createHash("sha256").update(await readFile(path.join(ROOT, rel))).digest("hex").slice(0, 8);

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
    console.error("✗ חותמות הנכסים ב-index.html אינן מעודכנות:");
    stamped.forEach(x => console.error("   -", x));
    console.error("   הריצו: node scripts/stamp-assets.mjs");
    process.exit(1);
  }
  console.log("· חותמות הנכסים מעודכנות ✓");
} else if (html === before) {
  console.log("· אין שינוי בחותמות");
} else {
  await writeFile(HTML, html, "utf8");
  stamped.forEach(x => console.log("·", x));
  console.log("· index.html עודכן ✓");
}
