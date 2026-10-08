#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selectDisplayPolls } from './update-polls.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (root, name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const keyOf = p => p.sourceId + ':' + p.dateTimestamp;
const publication = p => typeof p.publishedAt === 'number' ? p.publishedAt : Date.parse(p.publishedAt) || 0;
const signature = p => JSON.stringify(p.parties.map(x => [x.id, x.mandates]).sort(([a], [b]) => a.localeCompare(b)));

export function validateLiveFeed(feed, sources) {
  if (!feed || !Array.isArray(feed.polls) || !feed.polls.length) throw Error('האתר לא החזיר ארכיון סקרים תקין. הקבצים הקיימים נשמרו.');
  const seen = new Set();
  for (const p of feed.polls) {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(p.date || '');
    const timestamp = match ? Date.parse(match[3] + '-' + match[2] + '-' + match[1] + 'T00:00:00Z') : NaN;
    if (!p.id || !sources[p.sourceId] || !Number.isFinite(p.dateTimestamp) || timestamp !== p.dateTimestamp ||
        !Array.isArray(p.parties) || !p.parties.length || seen.has(keyOf(p))) throw Error('סקר לא תקין או כפול בארכיון החי: ' + (p.id || 'ללא מזהה'));
    seen.add(keyOf(p));
    const parties = new Set();
    for (const row of p.parties) {
      if (!row.id || parties.has(row.id) || !Number.isInteger(row.mandates) || row.mandates < 0 || row.mandates > 120) throw Error('נתוני מפלגות לא תקינים: ' + p.id);
      parties.add(row.id);
    }
    if (p.parties.reduce((sum, row) => sum + row.mandates, 0) !== 120) throw Error('סכום הסקר אינו 120: ' + p.id);
  }
  return feed.polls;
}

export function mergeLivePolls(existing, incoming) {
  const map = new Map(existing.map(p => [keyOf(p), p]));
  let added = 0, changed = 0;
  for (const p of incoming) {
    const old = map.get(keyOf(p));
    if (!old) { map.set(keyOf(p), p); added++; }
    else if (signature(old) !== signature(p) && publication(p) > publication(old)) {
      map.set(keyOf(p), p); changed++;
    }
  }
  return { polls: [...map.values()].sort((a, b) => b.dateTimestamp - a.dateTimestamp || publication(b) - publication(a)), added, changed };
}

export async function syncLivePolls({ root = ROOT, siteUrl, file, fetcher = fetch } = {}) {
  const config = await read(root, 'scripts/config.json');
  const liveUrl = siteUrl || process.env.BAROMETER_LIVE_URL || config.liveSiteUrl;
  let feed;
  if (file) feed = JSON.parse(await readFile(file, 'utf8'));
  else {
    if (!liveUrl) throw Error('לא הוגדרה כתובת אתר לסנכרון.');
    const url = new URL('/api/content/polls-archive.json', liveUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('כתובת האתר חייבת להיות HTTPS ללא פרטי התחברות.');
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!response.ok || response.headers.get('X-Barometer-Data-Status') === 'fallback') throw Error('מאגר הסקרים החי אינו זמין. הקבצים הקיימים נשמרו.');
    feed = await response.json();
  }
  const sources = (await read(root, 'data/pollsters.json')).sourceMap;
  const incoming = validateLiveFeed(feed, sources);
  const archive = await read(root, 'data/polls-archive.json'), current = await read(root, 'data/current-polls.json');
  /* סקרים שנמחקו בניהול: האתר החי מחזיר את רשימת המחיקות, והיא מקור האמת — נשמרת
     בארכיון (archive.deleted) כדי שעדכון הסקרים האוטומטי לא ייבא אותם שוב. */
  const deleted = validateDeleted(feed.deleted);
  const gone = new Set(deleted.map(d => d.id));
  const kept = [...archive.polls, ...current.polls].filter(p => !gone.has(p.id));
  const removed = new Set([...archive.polls, ...current.polls].filter(p => gone.has(p.id)).map(p => p.id)).size;
  const sameDeleted = JSON.stringify((archive.deleted || []).map(d => d.id).sort()) === JSON.stringify([...gone].sort());
  const merged = mergeLivePolls(kept, incoming.filter(p => !gone.has(p.id)));
  if (!merged.added && !merged.changed && !removed && sameDeleted) return { added: 0, changed: 0, removed: 0, total: merged.polls.length };
  const backupDir = path.join(root, '.site-stage', 'poll-backups');
  await mkdir(backupDir, { recursive: true });
  const backupDate = new Date().toISOString().replaceAll(':', '-');
  await writeFile(path.join(backupDir, backupDate + '-live.json'), JSON.stringify(feed, null, 2) + '\n');
  await writeFile(path.join(backupDir, backupDate + '-repository.json'), JSON.stringify({ current, archive }, null, 2) + '\n');
  const generatedAt = new Date(Math.max(Date.parse(current.generatedAt) || 0, Date.parse(feed.updatedAt || feed.generatedAt) || 0, ...merged.polls.map(publication))).toISOString();
  const polls = selectDisplayPolls(merged.polls, { year: config.year, maxPerOutlet: config.maxPerOutlet, from: Date.parse(config.from) });
  const nextCurrent = { ...current, generatedAt, selection: { ...current.selection, outlets: new Set(polls.map(p => p.channelHebrewName)).size }, polls };
  await writeFile(path.join(root, 'data/polls-archive.json'), JSON.stringify({ ...archive, updatedAt: generatedAt, polls: merged.polls, deleted }, null, 2) + '\n');
  await writeFile(path.join(root, 'data/current-polls.json'), JSON.stringify(nextCurrent, null, 2) + '\n');
  return { added: merged.added, changed: merged.changed, removed, total: merged.polls.length };
}

export function validateDeleted(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 500) throw Error('רשימת הסקרים שנמחקו אינה תקינה. הקבצים הקיימים נשמרו.');
  return list.map(d => {
    if (!d || typeof d.id !== 'string' || !d.id || d.id.length > 200) throw Error('רשומת מחיקה לא תקינה. הקבצים הקיימים נשמרו.');
    return { id: d.id, sourceId: d.sourceId, dateTimestamp: d.dateTimestamp, date: d.date, outlet: d.outlet, at: d.at };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
  const result = await syncLivePolls({ siteUrl: arg('--url'), file: arg('--file') });
  console.log('סנכרון האתר: נוספו ' + result.added + ', עודכנו ' + result.changed + ', נמחקו ' + (result.removed || 0) + ', בארכיון ' + result.total + ' סקרים.');
}
