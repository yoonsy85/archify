#!/usr/bin/env node
// Archify button UI: a tiny zero-dependency local server around bin/archify.mjs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cli = path.join(root, 'bin', 'archify.mjs');
const examplesDir = path.join(root, 'examples');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-gui-'));
const TYPES = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd', 'class', 'tree', 'timeline', 'waterfall'];
const port = Number(process.env.PORT || process.argv[2] || 4173);

const run = (args) => {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 120000 });
  return { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}`.trim() };
};
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((ok, bad) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 5e6) { bad(new Error('too large')); req.destroy(); } });
  req.on('end', () => ok(s));
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, fs.readFileSync(path.join(here, 'index.html'), 'utf8'), 'text/html');
    if (req.method === 'GET' && url.pathname === '/api/examples') {
      const list = fs.readdirSync(examplesDir).map((f) => f.match(/^(.+)\.(\w+)\.json$/)).filter((m) => m && TYPES.includes(m[2]))
        .map((m) => ({ name: m[1], type: m[2], file: m[0] }));
      return send(res, 200, { types: TYPES, examples: list });
    }
    if (req.method === 'GET' && url.pathname === '/api/example') {
      const f = path.basename(url.searchParams.get('file') || '');
      return send(res, 200, fs.readFileSync(path.join(examplesDir, f), 'utf8'), 'application/json');
    }
    if (req.method === 'POST' && url.pathname === '/api/render') {
      const { type, json } = JSON.parse(await readBody(req));
      if (!TYPES.includes(type)) return send(res, 400, { ok: false, output: 'Unknown type' });
      const id = `${type}-${Date.now()}`;
      const input = path.join(outDir, `${id}.json`);
      const output = path.join(outDir, `${id}.html`);
      fs.writeFileSync(input, typeof json === 'string' ? json : JSON.stringify(json));
      const r = run(['render', type, input, output]);
      return send(res, 200, { ...r, id: r.ok && fs.existsSync(output) ? id : null });
    }
    if (req.method === 'POST' && url.pathname === '/api/doctor') return send(res, 200, run(['doctor']));
    if (req.method === 'GET' && url.pathname.startsWith('/out/')) {
      const f = path.basename(url.pathname);
      const p = path.join(outDir, f);
      if (!fs.existsSync(p)) return send(res, 404, 'not found', 'text/plain');
      const dl = url.searchParams.has('download') ? { 'content-disposition': `attachment; filename="${f}"` } : {};
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...dl });
      return res.end(fs.readFileSync(p));
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    send(res, 500, { ok: false, output: String(e.message || e) });
  }
});

server.listen(port, '127.0.0.1', () => {
  const u = `http://127.0.0.1:${port}/`;
  console.log(`Archify UI running at ${u}  (Ctrl+C to stop)`);
  if (!process.env.NO_OPEN) {
    const [cmd, args] = process.platform === 'darwin' ? ['open', [u]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', u]] : ['xdg-open', [u]];
    try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch {}
  }
});
process.on('exit', () => fs.rmSync(outDir, { recursive: true, force: true }));
process.on('SIGINT', () => process.exit(0));
