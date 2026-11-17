// Try the Shoots screen without Google: serves the app with a pretend tracker sheet in memory.
// Usage: npm run mock   → open http://localhost:4811/#shoots, passcode "team-pass".
// Nothing here touches the real tracker. Restarting the script resets the data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { world, planRow, day } from '../test/helpers/gas-world.js';

const PORT = Number(process.env.PORT) || 4811;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');

// This week and next, counted from today, so the screen always has something to show.
const now = new Date();
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
const on = (offset) => day(monday.getFullYear(), monday.getMonth() + 1, monday.getDate() + offset);
const w = world({
  rows: [
    planRow(on(1), '4EVER GLOW SET', 'Internal', 75, 'Maye', { 'Content Type': 'Product Shots', 'Video Stream': 'Internal - Massive', 'Captured Clips': 60, 'QC Passed Clips': 52, 'Shoot Status': 'QC', 'Pre-Shoot Approval': 'Approved', 'Set / Lighting / Props / Angles': 'White sweep, stepped blocks, warm rim from back left', 'Member Shoot Task': 'Hero bottle turns + texture swatches' }),
    planRow(on(1), '4EVER GLOW SET', 'Internal', 45, 'Abe', { 'Content Type': 'Product Shots', 'Video Stream': 'Internal - CBQ', 'Captured Clips': 20, 'Shoot Status': 'Shooting', 'Pre-Shoot Approval': 'Approved' }),
    planRow(on(1), '4EVER GLOW SET', 'External', 60, 'Maegan', { 'Content Type': 'Faceless with Model', 'Captured Clips': 38, 'Pre-Shoot Approval': 'Approved', 'Moodboard / Reference Link': 'https://www.pinterest.com/pin/000000/' }),
    planRow(on(3), 'SUNSCREEN SPF50', 'Internal', 40, 'Marie', { 'Content Type': 'Product Shots', 'Pre-Shoot Approval': 'Pending', 'Shoot Status': 'Planned' }),
    planRow(on(3), 'SUNSCREEN SPF50', 'Internal', 30, 'Luiz', { 'Content Type': 'Faceless with Model', 'Shoot Status': 'Planned' }),
    planRow(on(8), 'GLASS SKIN BUNDLE', 'External', 30, 'Lana', { 'Content Type': 'Faceless with Model', 'Shoot Status': 'Planned' }),
  ],
});
w.setToken(); // passcode "team-pass"

// A few pegs on the first shoot so the board is not empty.
const first = w.post({ action: 'week', token: w.token, weekStart: dayKey(monday) }).rows[0].board;
for (const [i, note] of ['Low angle, bottle on the tallest block', 'Hand pump close-up, soft side light', 'Texture swatch on frosted acrylic'].entries()) {
  const file = path.join(ROOT, 'test', 'fixtures', `peg-${i + 1}.jpg`);
  if (!fs.existsSync(file)) continue;
  const image = 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64');
  w.post({ action: 'upload', token: w.token, board: first, name: `peg-${i + 1}`, note, by: i ? 'Maegan' : 'Maye', image });
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/mock-tracker' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const out = w.ctx.doPost({ postData: { contents: Buffer.concat(chunks).toString('utf8') } });
      setTimeout(() => res.writeHead(200, { 'Content-Type': 'application/json' }).end(out.body), 250); // feel a little like the real thing
    });
    return;
  }
  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'] }).end(`window.SD_CONFIG = ${JSON.stringify({ trackerUrl: `http://localhost:${PORT}/mock-tracker` })};\n`);
    return;
  }
  let base = PUBLIC_DIR;
  let rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  if (rel.startsWith('/vendor/three/')) {
    base = THREE_DIR;
    rel = rel.slice('/vendor/three'.length);
  }
  const file = path.resolve(base, '.' + rel);
  if (!file.startsWith(base + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  });
}).listen(PORT, () => {
  console.log(`Mock tracker running: http://localhost:${PORT}/#shoots  (passcode: team-pass)`);
});
