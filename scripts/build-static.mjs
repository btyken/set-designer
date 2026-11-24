// Builds a static copy of the app (built-in rules only) into dist/ for static hosting.
// Usage: node scripts/build-static.mjs            (no passcode)
//        SD_PASSCODE='...' SD_TRACKER_URL='https://script.google.com/macros/s/.../exec' node scripts/build-static.mjs
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const three = path.join(root, 'node_modules', 'three');

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
for (const rel of [
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/environments/RoomEnvironment.js',
]) {
  const to = path.join(dist, 'vendor', 'three', rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(three, rel), to);
}
const pass = (process.env.SD_PASSCODE || '').trim();
// SD_PASS_HASH reuses the hash already published (from dist/config.js) without retyping the passcode.
const passHash = pass ? createHash('sha256').update(pass).digest('hex') : (process.env.SD_PASS_HASH || '').trim();
const config = passHash ? { passHash } : {};
// The B-roll tracker web app (see apps-script/). Without it, each person pastes the link once in Shoots.
const trackerUrl = (process.env.SD_TRACKER_URL || '').trim();
if (trackerUrl) config.trackerUrl = trackerUrl;
// The Reel Builder's web app, which the Quality check view talks to. Kept in .env, not in the repo.
const api = (process.env.SD_API_URL || '').trim();
if (api) config.api = api;
fs.writeFileSync(path.join(dist, 'config.js'), `window.SD_CONFIG = ${JSON.stringify(config)};\n`);
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log(`Built ${dist}${passHash ? ' with a passcode gate' : ' with no passcode'}${trackerUrl ? ', linked to the B-roll tracker' : ', no tracker link'}`);
