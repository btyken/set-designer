// B-roll Production Tools server: serves the web app and proxies Set Designer requests to Claude.
// The API key stays on this machine; the browser never sees it.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const PORT = Number(process.env.PORT) || 4810;
const MODEL = process.env.SET_DESIGNER_MODEL || 'claude-opus-5-5';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');
const MAX_BODY = 25 * 1024 * 1024;

const hasCredentials = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
let client;
const getClient = () => (client ??= new Anthropic());

// ---------- Schemas ----------

const ItemAnalysis = z.object({
  name: z.string().describe('Short plain name, e.g. "Teal ceramic vase"'),
  category: z.string().describe('vase, book, candle, plant, bowl, product, ornament, textile, other'),
  shape: z.enum(['cylinder', 'box', 'sphere', 'cone', 'flat']).describe('Closest simple 3D shape'),
  material: z.string(),
  style: z.string().describe('Two or three words on the look, e.g. "rustic, handmade"'),
  colors: z.array(z.string()).describe('1-3 dominant colors of the item itself as #RRGGBB, most dominant first'),
  depth_ratio: z.number().describe('Estimated depth divided by width. 1 for round objects.'),
});

const Design = z.object({
  name: z.string(),
  concept: z.string().describe('Two sentences: the idea and why it suits these items'),
  wall_color: z.string().describe('#RRGGBB'),
  floor_color: z.string().describe('#RRGGBB'),
  floor_finish: z.enum(['wood', 'concrete', 'paper']),
  wall_suggestion: z.string(),
  floor_suggestion: z.string(),
  ambient_pct: z.number().describe('General room brightness, 10 for a dark moody set to 60 for a bright airy one'),
  palette: z.array(z.object({ hex: z.string(), role: z.string() })),
  furniture: z.array(z.object({
    id: z.string(),
    type: z.enum(['table', 'shelf', 'plinth', 'side_table', 'chair']),
    label: z.string(),
    x_cm: z.number(),
    z_cm: z.number(),
    rotation_deg: z.number(),
    w_cm: z.number(),
    d_cm: z.number(),
    h_cm: z.number(),
    levels_cm: z.array(z.number()).describe('Shelf board heights for a shelf, otherwise empty'),
    color_hex: z.string(),
    note: z.string(),
  })),
  person: z.object({
    present: z.boolean(),
    pose: z.enum(['standing', 'seated']),
    x_cm: z.number(),
    z_cm: z.number(),
    note: z.string(),
  }),
  placements: z.array(z.object({
    item_id: z.string(),
    x_cm: z.number(),
    y_cm: z.number().describe('Height of the surface the item stands on, 0 for the floor'),
    z_cm: z.number(),
    rotation_deg: z.number(),
    on: z.string().describe('Name of the surface, e.g. "Table" or "Shelf, level 2"'),
    note: z.string(),
  })),
  left_out: z.array(z.object({ item_id: z.string(), reason: z.string() })),
  lights: z.array(z.object({
    name: z.string(),
    role: z.enum(['key', 'fill', 'rim', 'background', 'accent']),
    fixture: z.enum(['white', 'rgb']),
    color_hex: z.string().describe('#RRGGBB the light emits'),
    kelvin: z.number().describe('Color temperature for white fixtures, 0 for rgb'),
    intensity_pct: z.number(),
    x_cm: z.number(),
    y_cm: z.number(),
    z_cm: z.number(),
    aim: z.enum(['set', 'hero', 'backdrop', 'person']),
    modifier: z.string().describe('softbox, diffusion, grid, bare, bounce...'),
    note: z.string(),
  })),
  color_combinations: z.array(z.object({
    name: z.string(),
    colors: z.array(z.string()),
    why: z.string(),
  })),
  styling_tips: z.array(z.string()),
  camera_note: z.string(),
});

const DesignSet = z.object({ designs: z.array(Design) });

// ---------- Prompts ----------

const ANALYZE_SYSTEM = `You catalogue props for a product photography studio. You get one cropped photo of a single item and its measured width and height. Describe the item itself and ignore the background, the table and any reference card in frame.`;

const DESIGN_SYSTEM = `You are a set designer and lighting director for photo and video shoots. You design a whole room set (wall, floor, furniture, props, lighting) from the props the studio actually owns, at their real measured sizes.

Coordinate system, all in centimetres:
- The origin is the centre of the set floor. x runs left (negative) to right (positive) as seen from the camera. z runs from the back wall (negative, the wall is at minus half the set depth) toward the camera (positive). y is height above the floor.
- Furniture x and z are the centre of its footprint. Keep furniture inside the set area and do not overlap footprints.
- Use only the furniture types the brief says are available, at the stated sizes. For a shelf, list its board heights in levels_cm; for everything else leave levels_cm empty.
- Every prop stands on a real surface: a table top, a shelf board, a plinth top, a side table, or the floor. Its y_cm is exactly that surface's height and its x and z lie within that surface. Do not let props overlap, and do not put a prop on a shelf level it is too tall for.
- Light positions use the same axes and may sit outside the set area.

Composition: design for the stated camera angle and photo shape. When there is a hero product it is the focal point and nothing may hide it from the camera. When a person is in the shot, place them, keep props from covering them, and give a seated person a chair. You do not have to use every prop; each one left out goes in left_out with a reason.

Lighting: the studio owns white key lights (bi-colour, 2700K to 6500K) and RGB colour-changing LEDs. Use only those two fixture types. For a white fixture give kelvin and set color_hex to how that temperature looks. For an RGB fixture give the exact colour in color_hex and set kelvin to 0. Each design needs a complete, shootable plan of three to five lights.

Colour: palette is the overall scheme, covering wall, floor, furniture and light colours. color_combinations are two or three alternative RGB light pairings that would also work with this arrangement.

The designs you return must differ clearly from each other in arrangement, mood and lighting, not just in colour. Write notes the way a stylist briefs an assistant: short and specific.`;

const FURNITURE_SIZES = {
  table: 'a table 120 wide, 60 deep, 75 high',
  shelf: 'an open shelf unit 80 wide, 30 deep, 160 high (boards at about 42, 82, 122 and 160)',
  plinths: 'three plinths or boxes, about 35 square, at 90, 60 and 35 high',
  side_table: 'a round side table 45 across, 55 high',
};

function briefText(brief, count) {
  const cameras = {
    front: 'straight on to the back wall at chest height',
    angle: 'a three-quarter view from one side',
    high: 'a high angle looking down on the set',
  };
  const furniture = Object.keys(FURNITURE_SIZES).filter((k) => brief.furniture[k]).map((k) => FURNITURE_SIZES[k]);
  const lines = [
    `Set area: ${brief.roomW} cm wide along the back wall by ${brief.roomD} cm deep.`,
    `Furniture available: ${furniture.length ? furniture.join('; ') : 'none, props go on the floor'}.`,
    `People: ${brief.person === 'none' ? 'no one in the shot' : `one person, ${brief.person}`}.`,
    `Camera: ${cameras[brief.camera]}. Photo shape ${brief.frame}.`,
    `Mood: ${brief.mood || 'designer\'s choice'}.`,
  ];
  if (brief.brand?.length) lines.push(`Brand colours to build around: ${brief.brand.join(', ')}.`);
  if (brief.surfaces) lines.push(`Backdrops and surfaces available: ${brief.surfaces}.`);
  if (brief.text) lines.push(`Brief from the client: ${brief.text}`);
  lines.push(`Return ${count} set designs.`);
  return lines.join('\n');
}

// ---------- Helpers ----------

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, fallback = '#888888') => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function imageBlock(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : null;
}

// Keep the model's output physically possible: known items only, inside the set.
function sanitizeDesign(d, items, brief) {
  const byId = new Map(items.map((it) => [String(it.id), it]));
  const seen = new Set();
  const halfW = brief.roomW / 2;
  const halfD = brief.roomD / 2;
  const placements = [];
  for (const p of d.placements || []) {
    const it = byId.get(String(p.item_id));
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    placements.push({
      ...p,
      item_id: it.id,
      x_cm: clamp(num(p.x_cm), -halfW, halfW),
      y_cm: clamp(num(p.y_cm), 0, 220),
      z_cm: clamp(num(p.z_cm), -halfD, halfD),
      rotation_deg: num(p.rotation_deg),
    });
  }
  return {
    ...d,
    wall_color: hex(d.wall_color, '#d9d4cc'),
    floor_color: hex(d.floor_color, '#b9b2a7'),
    ambient_pct: clamp(num(d.ambient_pct, 40), 5, 70),
    palette: (d.palette || []).map((p) => ({ ...p, hex: hex(p.hex) })),
    furniture: (d.furniture || []).slice(0, 12).map((f) => ({
      ...f,
      x_cm: clamp(num(f.x_cm), -halfW, halfW),
      z_cm: clamp(num(f.z_cm), -halfD, halfD),
      rotation_deg: num(f.rotation_deg),
      w_cm: clamp(num(f.w_cm, 40), 10, 300),
      d_cm: clamp(num(f.d_cm, 40), 10, 200),
      h_cm: clamp(num(f.h_cm, 60), 5, 240),
      levels_cm: (f.levels_cm || []).map((v) => clamp(num(v), 5, 240)),
      color_hex: hex(f.color_hex, '#e9e6e0'),
    })),
    person: {
      present: Boolean(d.person?.present) && brief.person !== 'none',
      pose: d.person?.pose === 'seated' ? 'seated' : 'standing',
      x_cm: clamp(num(d.person?.x_cm), -halfW, halfW),
      z_cm: clamp(num(d.person?.z_cm), -halfD, halfD),
      note: String(d.person?.note || ''),
    },
    placements,
    left_out: (d.left_out || []).filter((l) => byId.has(String(l.item_id)) && !seen.has(String(l.item_id))),
    lights: (d.lights || []).slice(0, 6).map((l) => ({
      ...l,
      color_hex: hex(l.color_hex, '#ffffff'),
      kelvin: l.fixture === 'white' ? clamp(num(l.kelvin, 5600), 2000, 8000) : 0,
      intensity_pct: clamp(num(l.intensity_pct, 60), 0, 100),
      x_cm: clamp(num(l.x_cm), -800, 800),
      y_cm: clamp(num(l.y_cm, 150), 0, 400),
      z_cm: clamp(num(l.z_cm), -800, 800),
    })),
    color_combinations: (d.color_combinations || []).map((c) => ({
      ...c,
      colors: (c.colors || []).map((h) => hex(h)),
    })),
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function apiError(res, err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return send(res, 401, { error: 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.' });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return send(res, 429, { error: 'Claude is rate limited right now. Try again in a minute.' });
  }
  if (err instanceof Anthropic.APIError) {
    return send(res, 502, { error: `Claude API error (${err.status ?? 'network'}): ${err.message}` });
  }
  console.error(err);
  return send(res, err.status || 500, { error: err.message || 'Server error' });
}

// ---------- API routes ----------

async function analyze(req, res) {
  if (!hasCredentials()) return send(res, 503, { error: 'No API key configured.' });
  const body = await readJson(req);
  const img = imageBlock(body.image);
  if (!img) return send(res, 400, { error: 'image must be a JPEG, PNG or WebP data URL' });
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: ANALYZE_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        img,
        { type: 'text', text: `Measured size: ${num(body.w)} cm wide by ${num(body.h)} cm tall. Catalogue this item.` },
      ],
    }],
    output_config: { effort: 'low', format: zodOutputFormat(ItemAnalysis) },
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    return send(res, 502, { error: 'Claude could not analyse this photo.' });
  }
  const a = response.parsed_output;
  send(res, 200, {
    ...a,
    colors: (a.colors || []).map((c) => hex(c, '')).filter(Boolean).slice(0, 3),
    depth_ratio: clamp(num(a.depth_ratio, 1), 0.05, 3),
  });
}

async function generate(req, res) {
  if (!hasCredentials()) return send(res, 503, { error: 'No API key configured.' });
  const body = await readJson(req);
  const brief = {
    roomW: clamp(num(body.brief?.roomW, 300), 100, 800),
    roomD: clamp(num(body.brief?.roomD, 250), 80, 600),
    camera: ['front', 'angle', 'high'].includes(body.brief?.camera) ? body.brief.camera : 'front',
    frame: ['16:9', '4:5', '1:1', '9:16'].includes(body.brief?.frame) ? body.brief.frame : '16:9',
    person: ['none', 'standing', 'seated'].includes(body.brief?.person) ? body.brief.person : 'none',
    furniture: Object.fromEntries(Object.keys(FURNITURE_SIZES).map((k) => [k, Boolean(body.brief?.furniture?.[k])])),
    mood: String(body.brief?.mood || '').slice(0, 80),
    brand: (body.brief?.brand || []).map((c) => hex(c, '')).filter(Boolean).slice(0, 6),
    surfaces: String(body.brief?.surfaces || '').slice(0, 400),
    text: String(body.brief?.text || '').slice(0, 1500),
  };
  const items = (body.items || []).slice(0, 30).map((it) => ({
    id: String(it.id),
    name: String(it.name || 'Item').slice(0, 80),
    w: clamp(num(it.w, 10), 0.5, 300),
    h: clamp(num(it.h, 10), 0.5, 300),
    d: clamp(num(it.d, 10), 0.5, 300),
    shape: String(it.shape || 'box'),
    material: String(it.material || '').slice(0, 60),
    style: String(it.style || '').slice(0, 60),
    colors: (it.colors || []).map((c) => hex(c, '')).filter(Boolean),
    hero: Boolean(it.hero),
    thumb: it.thumb,
  }));
  if (!items.length) return send(res, 400, { error: 'Add at least one item first.' });

  const content = [];
  for (const it of items) {
    content.push({
      type: 'text',
      text: `Item id "${it.id}": ${it.name}. ${it.w} x ${it.h} x ${it.d} cm (width x height x depth). Shape: ${it.shape}.` +
        (it.material ? ` Material: ${it.material}.` : '') +
        (it.style ? ` Style: ${it.style}.` : '') +
        (it.colors.length ? ` Colours: ${it.colors.join(', ')}.` : '') +
        (it.hero ? ' THIS IS THE HERO PRODUCT.' : ' Prop.'),
    });
    const img = imageBlock(it.thumb);
    if (img) content.push(img);
  }
  content.push({ type: 'text', text: briefText(brief, clamp(num(body.count, 3), 1, 4)) });

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: DESIGN_SYSTEM,
    messages: [{ role: 'user', content }],
    output_config: { effort: 'medium', format: zodOutputFormat(DesignSet) },
  });
  if (response.stop_reason === 'refusal') return send(res, 502, { error: 'Claude declined this request.' });
  if (!response.parsed_output?.designs?.length) {
    return send(res, 502, { error: 'Claude returned no usable designs. Try again.' });
  }
  send(res, 200, {
    source: 'ai',
    model: MODEL,
    designs: response.parsed_output.designs.map((d) => sanitizeDesign(d, items, brief)),
  });
}

// ---------- Static files ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function serveStatic(req, res, pathname) {
  let base = PUBLIC_DIR;
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel.startsWith('/vendor/three/')) {
    rel = rel.slice('/vendor/three'.length);
    if (!rel.startsWith('/build/') && !rel.startsWith('/examples/jsm/')) rel = '/__blocked__';
    base = THREE_DIR;
  }
  const file = path.resolve(base, '.' + rel);
  if (!file.startsWith(base + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': base === THREE_DIR ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  try {
    if (pathname === '/api/status' && req.method === 'GET') {
      return send(res, 200, { ai: hasCredentials(), model: MODEL });
    }
    if (pathname === '/api/analyze' && req.method === 'POST') return await analyze(req, res);
    if (pathname === '/api/generate' && req.method === 'POST') return await generate(req, res);
    if (pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('Method not allowed');
      return;
    }
    serveStatic(req, res, pathname);
  } catch (err) {
    apiError(res, err);
  }
});

server.listen(PORT, () => {
  console.log(`B-roll Production Tools running at http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) console.log(`  On your phone (same Wi-Fi): http://${ni.address}:${PORT}`);
    }
  }
  console.log(hasCredentials() ? `  Design brain: Claude (${MODEL})` : '  Design brain: built-in rules (no ANTHROPIC_API_KEY set)');
});
