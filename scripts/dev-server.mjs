import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPollCheckHandler } from '../server/poll-check.mjs';
import { createManagementHandler } from '../server/management.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = process.env.PORT || 8000;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
};

const checkPolls = createPollCheckHandler();
/* אזור הניהול בפיתוח מקומי: אותו שרת ניהול כמו ב־Netlify, עם אחסון בזיכרון (נמחק בכל הפעלה).
   סיסמת הפיתוח: BAROMETER_ADMIN_TOKEN, או "local-dev-admin" כשלא הוגדרה — רק ל־localhost. */
const memory = new Map();
const devStore = ({ name }) => {
  if (!memory.has(name)) memory.set(name, new Map());
  const map = memory.get(name);
  return {
    async get(k) { return map.get(k)?.data ?? null; },
    async getWithMetadata(k) { return map.get(k) ?? null; },
    async setJSON(k, data, o = {}) { const old = map.get(k); if (o.onlyIfNew && old || o.onlyIfMatch && old?.etag !== o.onlyIfMatch) return { modified: false }; map.set(k, { data: structuredClone(data), etag: String(Number(old?.etag || 0) + 1) }); return { modified: true }; },
    list({ prefix = '' }) { return { async *[Symbol.asyncIterator]() { yield { blobs: [...map.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; } }; },
    async delete(k) { map.delete(k); }
  };
};
const manage = createManagementHandler({ getStore: devStore, secret: () => process.env.BAROMETER_ADMIN_TOKEN || 'local-dev-admin', remote: async () => ({ status: 'error', polls: [], scope: {} }) });
http.createServer(async (req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); res.end(); return; }
  if (urlPath === '/api/polls/check') {
    try {
      const response = await checkPolls(new Request(`http://localhost:${port}/api/polls/check`, { method: req.method, headers: req.headers }));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
    } catch { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'error', polls: [] })); }
    return;
  }
  if (/^\/api\/(admin|analytics|content)\//.test(urlPath)) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const headers = { ...req.headers }; if (!headers.origin && req.method === 'POST') headers.origin = `http://localhost:${port}`;
    const response = await manage(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
    const out = Object.fromEntries(response.headers); if (out['set-cookie']) out['set-cookie'] = out['set-cookie'].replace('; Secure', '');
    res.writeHead(response.status, out); res.end(await response.text());
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.resolve(root, '.' + urlPath);
  if (!filePath.startsWith(root + path.sep) || !/^\/(?:index\.html|analytics\.html|privacy\.html|about\.html|favicon\.svg|assets\/[^.].*|data\/[^.].*)$/.test(urlPath) || urlPath.includes('..')) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(port, '127.0.0.1', () => console.log(`dev server on http://localhost:${port}`));
