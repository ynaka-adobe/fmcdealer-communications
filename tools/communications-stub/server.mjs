/*
 * Local stub of the communications service, for trying the site against the real contract
 * (docs/communications-api.md) before any AEM work exists.
 *
 *   node tools/communications-stub/server.mjs   ->  http://localhost:8788/tools/communications-stub/
 *
 * Serves this repo as static files and the API under /api/fmc/communications on the same
 * origin, so the page can run in remote mode. Drafts live in memory and move through the
 * workflow states on a timer so the list can be seen updating. Listens on localhost only.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// The site's .js files are browser ES modules, but the repo's package.json has no "type":
// "module", so load the (import-free) sample data module from source as an ES module.
const dataSource = await readFile(join(ROOT, 'blocks/communications/communications-data.js'), 'utf8');
const { default: getCommunications, getCommunicationDetail } = await import(`data:text/javascript;base64,${Buffer.from(dataSource).toString('base64')}`);
const PORT = Number(process.env.PORT) || 8788;
const MAX_BODY = 256 * 1024;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// demo clock: seconds since creation -> status
const STAGES = [[15, 'DRAFT'], [30, 'REVIEWER PENDING'], [45, 'FINAL APPROVAL PENDING'], [Infinity, 'PUBLISHED']];
const statusFor = (createdMs) => STAGES.find(([limit]) => (Date.now() - createdMs) / 1000 < limit)[1];

const drafts = [];
let counter = 90;
const iso = (ms) => new Date(ms).toISOString().slice(0, 19);

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
};
const sendJson = (res, status, data) => send(res, status, JSON.stringify(data), { 'content-type': 'application/json' });

function readBody(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { fail(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

const row = (d) => ({
  id: d.id,
  fileName: d.fileName,
  title: d.title,
  status: statusFor(d.createdMs),
  reviewer: d.reviewer,
  author: d.author,
  created: iso(d.createdMs),
  modified: iso(Math.max(d.createdMs, Date.now() - ((Date.now() - d.createdMs) % 15000))),
});

async function api(req, res, url) {
  const parts = url.pathname.replace(/^\/api\/fmc\/communications\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (req.method === 'GET' && parts.length === 0) {
    const type = url.searchParams.get('type') === 'archive' ? 'archive' : 'active';
    if (type === 'archive') return sendJson(res, 200, await getCommunications('archive'));
    return sendJson(res, 200, [...drafts.map(row).reverse(), ...await getCommunications()]);
  }
  if (req.method === 'POST' && parts.length === 0) {
    let payload;
    try { payload = JSON.parse(await readBody(req)); } catch (e) { return sendJson(res, 400, { error: 'invalid json' }); }
    if (!payload || typeof payload.title !== 'string' || !payload.title.trim()) return sendJson(res, 422, { error: 'title is required' });
    counter += 1;
    const d = {
      id: `draft-${counter}`,
      fileName: `EFC2600${counter}`,
      title: payload.title.trim().slice(0, 250),
      reviewer: String(payload.reviewer || '-').slice(0, 64),
      author: String(payload.originator || '-').slice(0, 64),
      createdMs: Date.now(),
    };
    drafts.push(d);
    return sendJson(res, 201, { id: d.id, fileName: d.fileName, status: 'DRAFT' });
  }
  if (req.method === 'GET' && parts.length === 2 && parts[1] === 'status') {
    const d = drafts.find((x) => x.id === parts[0]);
    return d ? sendJson(res, 200, { id: d.id, status: statusFor(d.createdMs), updated: row(d).modified }) : sendJson(res, 404, { error: 'not found' });
  }
  if (req.method === 'GET' && parts.length === 1) {
    const detail = await getCommunicationDetail(parts[0]);
    return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'not found' });
  }
  return sendJson(res, 404, { error: 'not found' });
}

async function serveStatic(res, pathname) {
  const target = normalize(join(ROOT, decodeURIComponent(pathname === '/' ? '/tools/communications-stub/index.html' : pathname.replace(/\/$/, '/index.html'))));
  if (!target.startsWith(ROOT) || /\/\.|node_modules/.test(target.slice(ROOT.length))) return send(res, 403, 'Forbidden');
  try {
    return send(res, 200, await readFile(target), { 'content-type': TYPES[extname(target)] || 'application/octet-stream' });
  } catch (e) {
    return send(res, 404, 'Not found');
  }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/fmc/communications')) return await api(req, res, url);
    return await serveStatic(res, url.pathname);
  } catch (e) {
    return sendJson(res, 500, { error: 'server error' });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`communications stub on http://localhost:${PORT}/ (static + /api/fmc/communications)`));
