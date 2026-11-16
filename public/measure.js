// Photo measuring: mark a reference object of known length, then box the item.
import { rgbToHex } from './rules.js';

const $ = (id) => document.getElementById(id);
const MAX_SIDE = 1800;

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

/** Opens the measuring screen for a photo. Resolves to item fields, or null if cancelled. */
export async function openMeasure(file) {
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

  const st = { mode: 'ref', pts: [], box: null, drag: null };
  $('mName').value = '';
  $('mDepth').value = '';
  $('mHero').checked = false;
  overlay.hidden = false;

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
  const size = () => {
    const ppc = pxPerCm();
    const b = boxRect();
    if (!ppc || !b || b.w < 8 || b.h < 8) return null;
    return { w: Math.round((b.w / ppc) * 10) / 10, h: Math.round((b.h / ppc) * 10) / 10 };
  };

  function fit() {
    const r = stage.getBoundingClientRect();
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
      const sz = size();
      if (sz) label(`${sz.w} × ${sz.h} cm`, b.x + b.w / 2, b.y - 16 * u, '#7ee0c3');
    }
    if (st.pts.length) {
      ctx.strokeStyle = '#ffc857';
      ctx.fillStyle = '#ffc857';
      ctx.lineWidth = 3 * u;
      if (st.pts.length === 2) {
        ctx.beginPath();
        ctx.moveTo(st.pts[0].x, st.pts[0].y);
        ctx.lineTo(st.pts[1].x, st.pts[1].y);
        ctx.stroke();
        label(`${refLength()} cm`, (st.pts[0].x + st.pts[1].x) / 2, (st.pts[0].y + st.pts[1].y) / 2 - 18 * u, '#ffc857');
      }
      for (const p of st.pts) {
        ctx.fillStyle = '#ffc857';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#14110f';
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        ctx.strokeStyle = '#ffc857';
      }
    }
    updateUi();
  }

  function updateUi() {
    $('mModeRef').setAttribute('aria-pressed', String(st.mode === 'ref'));
    $('mModeBox').setAttribute('aria-pressed', String(st.mode === 'box'));
    $('mRefCustom').hidden = $('mRef').value !== 'custom';
    const sz = size();
    $('mSave').disabled = !sz;
    $('mHint').textContent = st.mode === 'ref'
      ? st.pts.length < 2
        ? 'Step 1: tap the two ends of the long edge of the card. Drag a dot to adjust.'
        : 'Reference set. Now choose "Box the item".'
      : sz
        ? `Measured ${sz.w} cm wide × ${sz.h} cm tall. Redraw the box to adjust.`
        : st.pts.length < 2
          ? 'Mark the reference first so the size can be worked out.'
          : 'Step 2: drag a box tightly around the item.';
  }

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) * (canvas.width / r.width), 0), canvas.width),
      y: Math.min(Math.max((e.clientY - r.top) * (canvas.height / r.height), 0), canvas.height),
    };
  };

  function down(e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (st.mode === 'ref') {
      const near = st.pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 28 * unit());
      if (near >= 0) st.drag = { pt: near };
      else if (st.pts.length < 2) {
        st.pts.push(p);
        st.drag = { pt: st.pts.length - 1 };
      } else {
        st.pts = [p];
        st.drag = { pt: 0 };
      }
    } else {
      st.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      st.drag = { box: true };
    }
    draw();
  }
  function move(e) {
    if (!st.drag) return;
    const p = pos(e);
    if (st.drag.box) {
      st.box.x1 = p.x;
      st.box.y1 = p.y;
    } else st.pts[st.drag.pt] = p;
    draw();
  }
  function up() {
    if (!st.drag) return;
    const wasRef = !st.drag.box;
    st.drag = null;
    if (wasRef && st.pts.length === 2 && !st.box) st.mode = 'box';
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
      resolve(result);
    };
    on(canvas, 'pointerdown', down);
    on(canvas, 'pointermove', move);
    on(canvas, 'pointerup', up);
    on(canvas, 'pointercancel', up);
    on($('mModeRef'), 'click', () => { st.mode = 'ref'; draw(); });
    on($('mModeBox'), 'click', () => { st.mode = 'box'; draw(); });
    on($('mRef'), 'change', draw);
    on($('mRefCustom'), 'input', draw);
    on($('mCancel'), 'click', () => finish(null));
    on($('mSave'), 'click', () => {
      const sz = size();
      if (!sz) return;
      const thumb = cropToThumb(src, boxRect());
      const depth = Number($('mDepth').value);
      finish({
        name: $('mName').value.trim(),
        w: sz.w,
        h: sz.h,
        d: depth > 0 ? depth : sz.w,
        depthSet: depth > 0,
        hero: $('mHero').checked,
        colors: dominantColors(thumb),
        thumb: thumb.toDataURL('image/jpeg', 0.85),
        cut: makeCutout(thumb),
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
