// Builds a static copy of the app (built-in rules only) into dist/ for static hosting.
// Usage: node scripts/build-static.mjs            (no passcode)
//        SD_PASSCODE='...' node scripts/build-static.mjs
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
const config = pass ? { passHash: createHash('sha256').update(pass).digest('hex') } : {};
fs.writeFileSync(path.join(dist, 'config.js'), `window.SD_CONFIG = ${JSON.stringify(config)};\n`);
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log(`Built ${dist}${pass ? ' with a passcode gate' : ' with no passcode'}`);
