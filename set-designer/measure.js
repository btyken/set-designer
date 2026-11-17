// Photo sizing: the app boxes the item, then a typed height (or a card of known length) gives the scale.
import { rgbToHex } from './rules.js';

const $ = (id) => document.getElementById(id);
const MAX_SIDE = 1800;

// Everyday items used as height references, smallest to biggest. Each drawing is
// in centimetres: `w` wide and `cm` tall. `c` = solid, `k` = cut-out detail.
const REFS = [
  { name: 'Lipstick', cm: 7, w: 2.2, art: '<rect class="c" y="3.4" width="2.2" height="3.6" rx=".2"/><rect class="c" x=".2" y="2.5" width="1.8" height=".7" opacity=".6"/><path class="c" d="M.5 2.5V1L1.7.2v2.3z"/>' },
  { name: 'Coffee mug', cm: 10, w: 12.6, art: '<rect class="c" width="9.5" height="10" rx="1"/><path d="M9.5 2.6h.9a1.7 1.7 0 0 1 1.7 1.7v1.4a1.7 1.7 0 0 1-1.7 1.7h-.9" fill="none" stroke="currentColor" stroke-width="1.1"/>' },
  { name: 'Soda can', cm: 12, w: 6.6, art: '<rect class="c" y=".5" width="6.6" height="11.5" rx="1"/><rect class="c" x=".7" width="5.2" height="1" rx=".3"/><rect class="k" y="4" width="6.6" height="3.4"/>' },
  { name: 'iPhone', cm: 15, w: 7.2, art: '<rect class="c" width="7.2" height="15" rx="1.2"/><rect class="k" x=".6" y=".6" width="6" height="13.8" rx=".8"/><rect class="c" x="2.5" y="1.1" width="2.2" height=".7" rx=".35"/>' },
  { name: 'Water bottle', cm: 21, w: 6.5, art: '<rect class="c" x="2" width="2.5" height="1.5" rx=".3"/><path class="c" d="M2.2 1.8h2.1C4.5 4 6.5 4.5 6.5 7v13a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V7c0-2.5 2-3 2.2-5.2z"/><rect class="k" y="10" width="6.5" height="4.5"/>' },
  { name: 'Aquaflask', cm: 27, w: 8, art: '<rect class="c" x="1.6" width="4.8" height="3" rx=".7"/><rect class="k" x="2.8" y=".8" width="2.4" height="1.1" rx=".5"/><path class="c" d="M1.2 3.4h5.6C7.6 5 8 6 8 8v18a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V8c0-2 .4-3 1.2-4.6z"/><rect class="k" y="22.4" width="8" height=".6"/>' },
  { name: 'A4 paper', cm: 30, w: 21, art: '<rect class="c" width="21" height="30" rx=".6"/><rect class="k" x="1.2" y="1.2" width="18.6" height="27.6"/><rect class="c" x="4" y="6" width="13" height="1"/><rect class="c" x="4" y="10" width="13" height="1"/><rect class="c" x="4" y="14" width="9" height="1"/>' },
  { name: '1.5 L bottle', cm: 33, w: 9.5, art: '<rect class="c" x="3.3" width="2.9" height="1.8" rx=".3"/><path class="c" d="M3.4 2.1h2.7c.2 5 3.4 6 3.4 10v20a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V12.1c0-4 3.2-5 3.4-10z"/><rect class="k" y="15" width="9.5" height="7"/>' },
  { name: 'Stool', cm: 45, w: 36, art: '<rect class="c" x="2" width="32" height="4.5" rx="1.2"/><path class="c" d="M5 4.5h4L4 45H0zM27 4.5h4L36 45h-4z"/><rect class="c" x="5" y="26" width="26" height="2.6"/>' },
  { name: 'Table', cm: 75, w: 120, art: '<rect class="c" width="120" height="6" rx="1"/><rect class="c" x="6" y="6" width="6" height="69"/><rect class="c" x="108" y="6" width="6" height="69"/>' },
  { name: 'Stand fan', cm: 120, w: 46, art: '<circle class="c" cx="23" cy="23" r="23"/><circle class="k" cx="23" cy="23" r="18.5"/><path d="M23 6v34M6 23h34" stroke="currentColor" stroke-width="3"/><circle class="c" cx="23" cy="23" r="6"/><rect class="c" x="21" y="45" width="4" height="70"/><ellipse class="c" cx="23" cy="116.5" rx="19" ry="3.5"/>' },
  { name: 'Shelf', cm: 180, w: 80, art: '<rect class="c" width="80" height="180" rx="1"/><rect class="k" x="4" y="4" width="72" height="31"/><rect class="k" x="4" y="39" width="72" height="31"/><rect class="k" x="4" y="74" width="72" height="31"/><rect class="k" x="4" y="109" width="72" height="31"/><rect class="k" x="4" y="144" width="72" height="32"/>' },
];
// Pictures share one scale so bigger items look bigger. It is a compressed scale:
// at true scale the lipstick would be 2 px beside the shelf.
const PIC_MAX = 96;
function buildChips() {
  const top = REFS[REFS.length - 1].cm;
  $('mChips').innerHTML = REFS.map((r) => {
    const hpx = Math.round(PIC_MAX * (r.cm / top) ** 0.35 * 10) / 10;
    const wpx = Math.round(hpx * (r.w / r.cm) * 10) / 10;
    return `<button type="button" data-v="${r.cm}"><i><svg viewBox="0 0 ${r.w} ${r.cm}" width="${wpx}" height="${hpx}" aria-hidden="true">${r.art}</svg></i><b>${r.name}</b><span>${r.cm} cm</span></button>`;
  }).join(''); // static markup from the list above, never user text
}
buildChips();

async function loadImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// Most common colours in the middle of a canvas, ignoring near-duplicates.
export function dominantColors(canvas, count = 3) {
  const s = 48;
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = s;
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  const iw = canvas.width;
  const ih = canvas.height;
  ctx.drawImage(canvas, iw * 0.2, ih * 0.15, iw * 0.6, ih * 0.7, 0, 0, s, s);
  const data = ctx.getImageData(0, 0, s, s).data;
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((b) => rgbToHex(b.r / b.n, b.g / b.n, b.b / b.n));
}

export function cropToThumb(source, box, max = 512) {
  const w = Math.max(1, Math.round(box.w));
  const h = Math.max(1, Math.round(box.h));
  const k = Math.min(1, max / Math.max(w, h));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * k));
  out.height = Math.max(1, Math.round(h * k));
  out.getContext('2d').drawImage(source, box.x, box.y, w, h, 0, 0, out.width, out.height);
  return out;
}

/**
 * Marks the background of a photo taken against a plain backdrop. Works on a small copy,
 * where the item's outline is a sharp step even when the item is nearly the backdrop's
 * colour (white packaging on white paper). Returns { bg, w, h, k }: bg[p] is 1 for background.
 */
function backgroundMask(source, maxSide, STEP) {
  const k = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.max(8, Math.round(source.width * k));
  const h = Math.max(8, Math.round(source.height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  // Background seeds: edge pixels whose colour is common along the photo's edge
  // (the wall, a table top). An item that touches the edge is too small a share to count.
  const edge = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
  const bucket = (p) => ((d[p * 4] >> 5) << 6) | ((d[p * 4 + 1] >> 5) << 3) | (d[p * 4 + 2] >> 5);
  const counts = new Map();
  for (const p of edge) counts.set(bucket(p), (counts.get(bucket(p)) || 0) + 1);
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (const p of edge) {
    if (counts.get(bucket(p)) >= edge.length * 0.1 && !bg[p]) {
      bg[p] = 1;
      stack.push(p);
    }
  }
  // STEP is the largest colour step between neighbours that still reads as background.
  const spread = (p, from) => {
    if (bg[p]) return;
    const i = p * 4;
    const j = from * 4;
    if (Math.hypot(d[i] - d[j], d[i + 1] - d[j + 1], d[i + 2] - d[j + 2]) > STEP) return;
    bg[p] = 1;
    stack.push(p);
  };
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    if (x > 0) spread(p - 1, p);
    if (x < w - 1) spread(p + 1, p);
    if (p >= w) spread(p - w, p);
    if (p < w * (h - 1)) spread(p + w, p);
  }
  return { bg, w, h, k };
}

/**
 * Cuts the item out of the photo. The background is found in a padded area around the
 * box, so the backdrop (not the item) is what touches the edges. Returns a PNG data URL
 * the size of the thumbnail, or null when the item cannot be separated.
 */
export function cutoutInBox(source, box, max = 512, strict = false) {
  const padX = box.w * 0.18;
  const padY = box.h * 0.18;
  const x0 = Math.max(0, Math.floor(box.x - padX));
  const y0 = Math.max(0, Math.floor(box.y - padY));
  const x1 = Math.min(source.width, Math.ceil(box.x + box.w + padX));
  const y1 = Math.min(source.height, Math.ceil(box.y + box.h + padY));
  const area = document.createElement('canvas');
  area.width = x1 - x0;
  area.height = y1 - y0;
  if (area.width < 16 || area.height < 16) return null;
  area.getContext('2d').drawImage(source, x0, y0, area.width, area.height, 0, 0, area.width, area.height);
  const { bg, w, h, k } = backgroundMask(area, 360, 8);

  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext('2d');
  const md = mctx.createImageData(w, h);
  for (let p = 0; p < bg.length; p++) {
    md.data[p * 4] = md.data[p * 4 + 1] = md.data[p * 4 + 2] = 255;
    md.data[p * 4 + 3] = bg[p] ? 0 : 255;
  }
  mctx.putImageData(md, 0, 0);

  const out = cropToThumb(source, box, max);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mask, (box.x - x0) * k, (box.y - y0) * k, box.w * k, box.h * k, 0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'source-over';

  // The scaled-up mask has a wide soft edge. Tighten it to a couple of pixels.
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  let kept = 0;
  for (let i = 3; i < d.length; i += 4) {
    const a = Math.min(255, Math.max(0, (d[i] - 96) * 4));
    d[i] = a;
    if (a > 127) kept++;
  }
  const W = out.width;
  const H = out.height;
  const share = kept / (W * H);
  if (share < 0.1 || share > 0.97) return null;

  if (!strict) {
    ctx.putImageData(img, 0, 0);
    return out.toDataURL('image/png');
  }
  // Trust check, used for products. On white packaging against a white backdrop the
  // background search leaks into the item and leaves holes or missing ends. A sound cut-out
  // is nearly solid inside its own outline and reaches all four sides of the box. Anything
  // less is rejected so the untouched full photo is used instead of a damaged product.
  const on = (x, y) => d[(y * W + x) * 4 + 3] > 127;
  const rowMin = new Int32Array(H).fill(W);
  const rowMax = new Int32Array(H).fill(-1);
  const colMin = new Int32Array(W).fill(H);
  const colMax = new Int32Array(W).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!on(x, y)) continue;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      if (y < colMin[x]) colMin[x] = y;
      if (y > colMax[x]) colMax[x] = y;
    }
  }
  let outline = 0;
  for (let y = 0; y < H; y++) {
    for (let x = rowMin[y]; x <= rowMax[y]; x++) if (y >= colMin[x] && y <= colMax[x]) outline++;
  }
  if (kept / Math.max(outline, 1) < 0.9) return null;
  const band = (x0, y0, x1, y1) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (on(x, y)) n++;
    return n / Math.max((x1 - x0) * (y1 - y0), 1);
  };
  const bx = Math.max(2, Math.round(W * 0.1));
  const by = Math.max(2, Math.round(H * 0.1));
  if (Math.min(band(0, 0, W, by), band(0, H - by, W, H), band(0, 0, bx, H), band(W - bx, 0, W, H)) < 0.12) return null;
  ctx.putImageData(img, 0, 0);
  return out.toDataURL('image/png');
}

/**
 * Finds the item in a photo taken against a plain background. Returns its
 * bounding box in source pixels, or null when nothing clear stands out.
 */
export function findItemBox(source, STEP = 8) {
  const { bg, w, h, k } = backgroundMask(source, 240, STEP);
  const stack = [];

  // The largest connected patch that is not background is the item.
  let best = null;
  const parts = [];
  for (let start = 0; start < bg.length; start++) {
    if (bg[start]) continue;
    const box = { n: 0, x0: w, y0: h, x1: 0, y1: 0 };
    bg[start] = 2;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p - x) / w;
      box.n++;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q >= 0 && q < bg.length && !bg[q]) {
          bg[q] = 2;
          stack.push(q);
        }
      }
    }
    parts.push(box);
    if (!best || box.n > best.n) best = box;
  }
  // A pump or cap can separate from the body where its colour is close to the backdrop.
  // Pieces sitting directly above the main piece belong to it. Pieces below are reflections.
  if (best) {
    best = { ...best };
    const main = { ...best };
    const mw = main.x1 - main.x0 + 1;
    parts.sort((a, b) => b.y1 - a.y1); // nearest piece first, so a stack of pieces chains upward
    for (const part of parts) {
      if (part === best || part.n < main.n * 0.004 || part.y1 >= main.y0 + (main.y1 - main.y0) * 0.25) continue;
      const cx = (part.x0 + part.x1) / 2;
      if (cx < main.x0 - mw * 0.15 || cx > main.x1 + mw * 0.15) continue;
      if (best.y0 - part.y1 > h * 0.06) continue;
      best.x0 = Math.min(best.x0, part.x0);
      best.x1 = Math.max(best.x1, part.x1);
      best.y0 = Math.min(best.y0, part.y0);
    }
  }
  if (!best || best.n < w * h * 0.008) return null;
  const bw = best.x1 - best.x0 + 1;
  const bh = best.y1 - best.y0 + 1;
  if (bw > w * 0.96 && bh > h * 0.96) return null;
  return {
    x0: Math.max(0, (best.x0 - 1) / k),
    y0: Math.max(0, (best.y0 - 1) / k),
    x1: Math.min(source.width, (best.x1 + 2) / k),
    y1: Math.min(source.height, (best.y1 + 2) / k),
  };
}

/** Opens the sizing screen for a photo. Resolves to item fields, or null if cancelled. */
export async function openMeasure(file, { max = 512, strict = false } = {}) {
  const img = await loadImage(file);
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const src = document.createElement('canvas');
  src.width = Math.round(img.width * k);
  src.height = Math.round(img.height * k);
  src.getContext('2d').drawImage(img, 0, 0, src.width, src.height);

  const overlay = $('measure');
  const canvas = $('measureCanvas');
  const stage = $('measureStage');
  const ctx = canvas.getContext('2d');
  canvas.width = src.width;
  canvas.height = src.height;

  // mode 'size': the box gives the proportions and a typed height gives the scale.
  // mode 'card': two dots on a card of known length give the scale.
  const found = findItemBox(src);
  const st = {
    mode: 'size', pts: [], drag: null, loupe: null, auto: Boolean(found),
    box: found || { x0: src.width * 0.2, y0: src.height * 0.15, x1: src.width * 0.8, y1: src.height * 0.85 },
  };
  $('mSize').value = '';
  overlay.hidden = false;
  document.documentElement.classList.add('locked');

  const refLength = () => {
    const v = $('mRef').value;
    return v === 'custom' ? Number($('mRefCustom').value) || 0 : Number(v);
  };
  const pxPerCm = () => (st.pts.length === 2 && refLength() > 0
    ? Math.hypot(st.pts[1].x - st.pts[0].x, st.pts[1].y - st.pts[0].y) / refLength()
    : 0);
  const boxRect = () => st.box && {
    x: Math.min(st.box.x0, st.box.x1),
    y: Math.min(st.box.y0, st.box.y1),
    w: Math.abs(st.box.x1 - st.box.x0),
    h: Math.abs(st.box.y1 - st.box.y0),
  };
  const r1 = (v) => Math.round(v * 10) / 10;
  const size = () => {
    const b = boxRect();
    if (!b || b.w < 8 || b.h < 8) return null;
    if (st.mode === 'size') {
      const tall = Number($('mSize').value);
      if (!(tall >= 0.5 && tall <= 400)) return null;
      return { w: r1((tall * b.w) / b.h), h: r1(tall) };
    }
    const ppc = pxPerCm();
    return ppc ? { w: r1(b.w / ppc), h: r1(b.h / ppc) } : null;
  };

  function fit() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = Math.min(r.width / src.width, r.height / src.height);
    canvas.style.width = `${Math.floor(src.width * s)}px`;
    canvas.style.height = `${Math.floor(src.height * s)}px`;
    draw();
  }
  const unit = () => canvas.width / (canvas.getBoundingClientRect().width || canvas.width); // canvas px per screen px

  function label(text, x, y, color) {
    const u = unit();
    ctx.font = `600 ${14 * u}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 12 * u;
    const h = 22 * u;
    const lx = Math.min(Math.max(x - w / 2, 2 * u), canvas.width - w - 2 * u);
    const ly = Math.min(Math.max(y - h / 2, 2 * u), canvas.height - h - 2 * u);
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly, w, h);
    ctx.fillStyle = '#14110f';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx + 6 * u, ly + h / 2);
  }

  // Magnified view of what is under the finger, drawn in a top corner away from it.
  function loupe(p) {
    const u = unit();
    const shown = canvas.getBoundingClientRect().width;
    const R = Math.min(64, shown * 0.2) * u;
    const half = R / 2.4;
    const onLeft = !(p.x < canvas.width / 2 && p.y < R * 2 + 30 * u);
    const cx = onLeft ? R + 10 * u : canvas.width - R - 10 * u;
    const cy = R + 10 * u;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#14110f';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.drawImage(src, p.x - half, p.y - half, half * 2, half * 2, cx - R, cy - R, R * 2, R * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 6 * u, cy);
    ctx.moveTo(cx + 6 * u, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - 6 * u);
    ctx.moveTo(cx, cy + 6 * u); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
  }

  function draw() {
    const u = unit();
    ctx.drawImage(src, 0, 0);
    const b = boxRect();
    if (b) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#7ee0c3';
      ctx.lineWidth = 2.5 * u;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
        ctx.fillStyle = '#7ee0c3';
        ctx.beginPath();
        ctx.arc(x, y, 9 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#14110f';
        ctx.lineWidth = 2 * u;
        ctx.stroke();
      }
      const sz = size();
      if (sz) label(`${sz.w} × ${sz.h} cm`, b.x + b.w / 2, b.y + b.h + 22 * u, '#7ee0c3');
    }
    if (st.mode === 'card' && st.pts.length) {
      ctx.strokeStyle = '#ffc857';
      ctx.lineWidth = 3 * u;
      if (st.pts.length === 2) {
        ctx.beginPath();
        ctx.moveTo(st.pts[0].x, st.pts[0].y);
        ctx.lineTo(st.pts[1].x, st.pts[1].y);
        ctx.stroke();
        if (!st.drag) label(`${refLength()} cm`, (st.pts[0].x + st.pts[1].x) / 2, (st.pts[0].y + st.pts[1].y) / 2 - 18 * u, '#ffc857');
      }
      for (const p of st.pts) {
        ctx.fillStyle = 'rgba(255,200,87,0.35)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffc857';
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        ctx.fillStyle = '#14110f';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (st.loupe) loupe(st.loupe);
    updateUi();
  }

  function updateUi() {
    const card = st.mode === 'card';
    $('mModeSize').setAttribute('aria-pressed', String(!card));
    $('mModeCard').setAttribute('aria-pressed', String(card));
    $('mSizeRow').hidden = card;
    $('mCardRow').hidden = !card;
    $('mRefCustom').hidden = $('mRef').value !== 'custom';
    $('mReset').disabled = !st.pts.length;
    const typed = Number($('mSize').value);
    for (const chip of $('mChips').children) chip.setAttribute('aria-pressed', String(Number(chip.dataset.v) === typed));
    const sz = size();
    $('mSave').disabled = !sz;
    $('mSave').textContent = sz ? `Save item · ${sz.w} × ${sz.h} cm` : 'Save item';
    const boxSay = st.auto ? 'The app found your item. Now' : 'Drag the corners so the box fits the item, then';
    $('mHint').textContent = !card
      ? sz ? 'Looks good? Save it. Drag a corner if the box is off.'
        : `${boxSay} tap something about as tall, or type the height.`
      : st.pts.length === 0 ? 'Touch one end of the card’s long edge and slide to place the dot.'
        : st.pts.length === 1 ? 'Now touch the other end of the same edge.'
          : 'Card marked. Drag a corner if the box does not fit the item.';
  }

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) * (canvas.width / r.width), 0), canvas.width),
      y: Math.min(Math.max((e.clientY - r.top) * (canvas.height / r.height), 0), canvas.height),
    };
  };
  const GRAB = 34; // screen px: how close a touch must be to grab a dot or corner

  function down(e) {
    if (st.drag) return; // ignore a second finger
    e.preventDefault();
    document.activeElement?.blur?.(); // put the keyboard away
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const p = pos(e);
    const grab = GRAB * unit();
    st.loupe = p;
    if (st.mode === 'card') {
      const near = st.pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < grab);
      if (near >= 0) st.drag = { pt: near };
      else if (st.pts.length < 2) {
        st.pts.push(p);
        st.drag = { pt: st.pts.length - 1 };
      }
    }
    if (!st.drag) {
      const b = boxRect();
      const corner = b && [['x0', 'y0'], ['x1', 'y0'], ['x0', 'y1'], ['x1', 'y1']]
        .map(([xk, yk]) => ({ xk, yk, dist: Math.hypot(st.box[xk] - p.x, st.box[yk] - p.y) }))
        .sort((m, n) => m.dist - n.dist)[0];
      if (corner && corner.dist < grab) {
        st.drag = { xk: corner.xk, yk: corner.yk };
        st.loupe = { x: st.box[corner.xk], y: st.box[corner.yk] };
      } else if (b && p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) {
        st.drag = { move: p };
        st.loupe = null;
      } else {
        st.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        st.drag = { xk: 'x1', yk: 'y1' };
      }
    }
    st.drag.id = e.pointerId;
    draw();
  }
  function move(e) {
    if (!st.drag || e.pointerId !== st.drag.id) return;
    const p = pos(e);
    if (st.drag.move) {
      const b = boxRect();
      const dx = Math.min(Math.max(p.x - st.drag.move.x, -b.x), canvas.width - b.x - b.w);
      const dy = Math.min(Math.max(p.y - st.drag.move.y, -b.y), canvas.height - b.y - b.h);
      st.box = { x0: b.x + dx, y0: b.y + dy, x1: b.x + b.w + dx, y1: b.y + b.h + dy };
      st.drag.move = { x: st.drag.move.x + dx, y: st.drag.move.y + dy };
    } else if (st.drag.xk) {
      st.box[st.drag.xk] = p.x;
      st.box[st.drag.yk] = p.y;
      st.loupe = p;
    } else {
      st.pts[st.drag.pt] = p;
      st.loupe = p;
    }
    draw();
  }
  function up(e) {
    if (!st.drag || (e && e.pointerId !== st.drag.id)) return;
    st.drag = null;
    st.loupe = null;
    const b = boxRect();
    if (b) st.box = b.w < 8 || b.h < 8 ? null : { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
    draw();
  }

  return new Promise((resolve) => {
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    const ac = new AbortController();
    const on = (el, ev, fn) => el.addEventListener(ev, fn, { signal: ac.signal });
    const finish = (result) => {
      ac.abort();
      ro.disconnect();
      overlay.hidden = true;
      document.documentElement.classList.remove('locked');
      resolve(result);
    };
    on(canvas, 'pointerdown', down);
    on(canvas, 'pointermove', move);
    on(canvas, 'pointerup', up);
    on(canvas, 'pointercancel', up);
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on($('mModeSize'), 'click', () => { st.mode = 'size'; draw(); });
    on($('mModeCard'), 'click', () => { st.mode = 'card'; draw(); });
    on($('mSize'), 'input', draw);
    on($('mSize'), 'keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    on($('mChips'), 'click', (e) => {
      const chip = e.target.closest('button');
      if (!chip) return;
      $('mSize').value = chip.dataset.v;
      chip.scrollIntoView({ inline: 'center', block: 'nearest' });
      draw();
    });
    on($('mRef'), 'change', draw);
    on($('mRefCustom'), 'input', draw);
    on($('mReset'), 'click', () => { st.pts = []; draw(); });
    on($('mCancel'), 'click', () => finish(null));
    on($('mSave'), 'click', () => {
      const sz = size();
      if (!sz) return;
      const thumb = cropToThumb(src, boxRect(), max);
      finish({
        name: '',
        w: sz.w,
        h: sz.h,
        d: sz.w,
        depthSet: false,
        hero: false,
        colors: dominantColors(thumb),
        thumb: thumb.toDataURL('image/jpeg', max > 512 ? 0.92 : 0.85),
        cut: cutoutInBox(src, boxRect(), max, strict),
      });
    });
    fit();
  });
}

/**
 * Removes a plain background from an item photo by flood-filling inward from the
 * edges. Returns a PNG data URL with transparency, or null when the background
 * is too busy (or too close to the item's colour) to separate cleanly.
 */
export function makeCutout(source) {
  const w = source.width;
  const h = source.height;
  if (w < 8 || h < 8) return null;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Average colour of the outer frame is the background reference.
  let br = 0, bg = 0, bb = 0, bn = 0;
  const sample = (x, y) => { const i = (y * w + x) * 4; br += d[i]; bg += d[i + 1]; bb += d[i + 2]; bn++; };
  for (let x = 0; x < w; x++) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y++) { sample(0, y); sample(w - 1, y); }
  br /= bn; bg /= bn; bb /= bn;

  const GLOBAL = 62; // how far a pixel may drift from the frame colour (allows soft shadows)
  const LOCAL = 16; // how big a step between neighbours still counts as background
  const mask = new Uint8Array(w * h); // 1 = background
  const stack = [];
  const tryPush = (x, y, from) => {
    const p = y * w + x;
    if (mask[p]) return;
    const i = p * 4;
    if (Math.hypot(d[i] - br, d[i + 1] - bg, d[i + 2] - bb) > GLOBAL) return;
    if (from >= 0) {
      const j = from * 4;
      if (Math.hypot(d[i] - d[j], d[i + 1] - d[j + 1], d[i + 2] - d[j + 2]) > LOCAL) return;
    }
    mask[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) { tryPush(x, 0, -1); tryPush(x, h - 1, -1); }
  for (let y = 0; y < h; y++) { tryPush(0, y, -1); tryPush(w - 1, y, -1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) tryPush(x - 1, y, p);
    if (x < w - 1) tryPush(x + 1, y, p);
    if (y > 0) tryPush(x, y - 1, p);
    if (y < h - 1) tryPush(x, y + 1, p);
  }

  let removed = 0;
  for (let p = 0; p < mask.length; p++) removed += mask[p];
  const share = removed / mask.length;
  if (share < 0.04 || share > 0.9) return null;

  // Soft edge: alpha is the share of item pixels in a 3x3 neighbourhood.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let keep = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          n++;
          keep += 1 - mask[yy * w + xx];
        }
      }
      d[(y * w + x) * 4 + 3] = mask[y * w + x] ? 0 : Math.round((keep / n) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return out.toDataURL('image/png');
}

/** Builds a cut-out from a saved thumbnail data URL (for items added before cut-outs existed). */
export async function cutoutFromUrl(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return makeCutout(c);
}
