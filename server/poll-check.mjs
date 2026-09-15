// Shared by the local preview and the hosted Worker. No client-supplied URLs.
const ORIGIN = 'https://www.skarim.org';
const HOME = `${ORIGIN}/`;
const SITEMAP = `${ORIGIN}/api/static/sitemap-polls`;
const DAY = 864e5;
const LIMIT = 24;
const MAX_BYTES = 4 * 1024 * 1024;

export function nextData(html) {
  const match = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) throw new Error('source-format');
  return JSON.parse(match[1]);
}

export function normalizePoll(p, sourceUrl = '', now = Date.now()) {
  if (!p || !Array.isArray(p.parties) || p.parties.length > 80) return null;
  const dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(p.date || '');
  const dateTimestamp = Number(p.dateTimestamp) || (dateMatch ? Date.parse(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`) : Date.parse(p.date));
  const aliases = { zionut_datit_zehut: 'zionut_datit' };
  const parties = p.parties.map(x => ({ id: aliases[x.id] || String(x.id || ''), name: String(x.name || x.hebrewName || x.id || '').slice(0, 160),
    mandates: Number(x.mandates ?? x.seats), alignment: ['Coalition', 'Opposition', 'Arabs', 'Unknown'].includes(x.alignment) ? x.alignment : 'Unknown' }));
  if (!p.id || !p.sourceId || !p.channelHebrewName || !Number.isFinite(dateTimestamp) || dateTimestamp > now + DAY ||
      parties.some(x => !x.id || !Number.isFinite(x.mandates) || x.mandates < 0 || x.mandates > 120) ||
      new Set(parties.map(x => x.id)).size !== parties.length || Math.abs(parties.reduce((t, x) => t + x.mandates, 0) - 120) > .01) return null;
  return { id: String(p.id).slice(0, 200), sourceId: String(p.sourceId).slice(0, 120), channelHebrewName: String(p.channelHebrewName).slice(0, 120),
    date: dateMatch ? p.date : new Date(dateTimestamp).toLocaleDateString('he-IL'), dateTimestamp,
    publishedAt: Number(p.publishedAt) || dateTimestamp, sourceUrl, parties };
}

function pollURL(value) {
  try { const u = new URL(value); return u.origin === ORIGIN && /^\/polls\/[a-z0-9_-]+-\d{4}-\d{2}-\d{2}\/?$/i.test(u.pathname) && !u.search ? u.href : null; }
  catch { return null; }
}

async function getText(fetcher, url, signal) {
  const response = await fetcher(url, { signal, redirect: 'error', headers: { Accept: 'text/html,application/xml', 'User-Agent': 'Barometer-Poll-Check/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('source-too-large');
  const reader = response.body.getReader();
  let bytes = 0, text = ''; const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.length; if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('source-too-large'); }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function checkRemotePolls({ fetcher = fetch, now = Date.now(), timeoutMs = 25000 } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  const sources = [], found = new Map(); let rejected = 0, checkedPages = 0, missingPages = 0, capped = false;
  const add = (raw, url) => { const p = normalizePoll(raw, url, now); if (!p) { rejected++; return; } if (p.dateTimestamp >= now - 14 * DAY) found.set(p.id, p); };
  try {
    const [home, sitemap] = await Promise.allSettled([
      getText(fetcher, HOME, controller.signal).then(nextData), getText(fetcher, SITEMAP, controller.signal)
    ]);
    const initial = home.status === 'fulfilled' ? home.value?.props?.pageProps?.landing?.initialPolls : null;
    sources.push({ name: 'סקרים — פרסומים אחרונים', url: HOME, ok: Array.isArray(initial) });
    if (Array.isArray(initial)) initial.forEach(p => add(p, pollURL(p.sourceUrl) || HOME));
    let pages = [];
    if (sitemap.status === 'fulfilled') {
      pages = [...new Set([...sitemap.value.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => pollURL(m[1].replaceAll('&amp;', '&'))).filter(Boolean))]
        .map(url => ({ url, ts: Date.parse(url.match(/(\d{4}-\d{2}-\d{2})\/?$/)[1]) }))
        .filter(x => x.ts >= now - 14 * DAY && x.ts <= now + DAY).sort((a, b) => b.ts - a.ts);
    }
    sources.push({ name: 'סקרים — מפתח דפי הסקרים', url: SITEMAP, ok: sitemap.status === 'fulfilled' && pages.length > 0 });
    capped = pages.length > LIMIT;
    const queue = pages.slice(0, LIMIT);
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length && !controller.signal.aborted) {
        const { url } = queue.shift();
        try { const raw = nextData(await getText(fetcher, url, controller.signal)); add(raw?.props?.pageProps?.data?.poll, url); checkedPages++; }
        catch { missingPages++; }
      }
    }));
    missingPages += queue.length;
    const polls = [...found.values()].sort((a, b) => b.dateTimestamp - a.dateTimestamp);
    const status = !polls.length ? 'error' : sources.every(s => s.ok) && !missingPages && !rejected && !capped ? 'complete' : 'partial';
    return { status, checkedAt: new Date(now).toISOString(), polls, sources, scope: { days: 14, checkedPages, missingPages, rejected, capped }, cached: false };
  } finally { clearTimeout(timer); }
}

export function createPollCheckHandler(options = {}) {
  let inFlight = null, cached = null;
  return async function handle(request) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 });
    if (cached && Date.now() - cached.savedAt < 120000) return Response.json({ ...cached.value, cached: true }, { headers: { 'Cache-Control': 'no-store' } });
    if (!inFlight) inFlight = checkRemotePolls(options).then(value => { if (value.status !== 'error') cached = { value, savedAt: Date.now() }; return value; }).finally(() => { inFlight = null; });
    const value = await inFlight;
    return Response.json(value, { status: value.status === 'error' ? 502 : 200, headers: { 'Cache-Control': 'no-store' } });
  };
}
