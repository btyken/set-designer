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

  const st = { mode: 'ref', pts: [], box: null, drag: null, loupe: null };
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
  const size = () => {
    const ppc = pxPerCm();
    const b = boxRect();
    if (!ppc || !b || b.w < 8 || b.h < 8) return null;
    return { w: Math.round((b.w / ppc) * 10) / 10, h: Math.round((b.h / ppc) * 10) / 10 };
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
    const zoom = 2.4;
    const half = R / zoom;
    const onLeft = !(p.x < canvas.width / 2 && p.y < R * 2 + 30 * u);
    const cx = onLeft ? R + 10 * u : canvas.width - R - 10 * u;
    const cy = R + 10 * u;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#14110f';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.imageSmoothingEnabled = true;
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
      if (st.mode === 'box') {
        for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
          ctx.fillStyle = '#7ee0c3';
          ctx.beginPath();
          ctx.arc(x, y, 9 * u, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#14110f';
          ctx.lineWidth = 2 * u;
          ctx.stroke();
        }
      }
      const sz = size();
      if (sz) label(`${sz.w} × ${sz.h} cm`, b.x + b.w / 2, b.y + b.h + 22 * u, '#7ee0c3');
    }
    if (st.pts.length) {
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
        ctx.fillStyle = st.mode === 'ref' ? 'rgba(255,200,87,0.35)' : '#ffc857';
        ctx.beginPath();
        ctx.arc(p.x, p.y, (st.mode === 'ref' ? 13 : 6) * u, 0, Math.PI * 2);
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
    $('mModeRef').setAttribute('aria-pressed', String(st.mode === 'ref'));
    $('mModeBox').setAttribute('aria-pressed', String(st.mode === 'box'));
    $('mRefCustom').hidden = $('mRef').value !== 'custom';
    const sz = size();
    $('mSave').disabled = !sz;
    $('mSave').textContent = sz ? `Save item · ${sz.w} × ${sz.h} cm` : 'Save item';
    $('mReset').disabled = !st.pts.length && !st.box;
    $('mHint').textContent = st.mode === 'ref'
      ? st.pts.length === 0 ? 'Touch one end of the card’s long edge. Slide your finger to place the dot exactly.'
        : st.pts.length === 1 ? 'Now touch the other end of the same edge.'
          : 'Card marked. Drag a dot to adjust, or go to 2 Item.'
      : sz
        ? 'Drag a corner to tighten the box, or drag inside it to move it.'
        : st.pts.length < 2
          ? 'Mark the card first (1 Card) so the size can be worked out.'
          : 'Drag a box around the item, from one corner to the opposite corner.';
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
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const p = pos(e);
    const grab = GRAB * unit();
    st.loupe = p;
    if (st.mode === 'ref') {
      const near = st.pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < grab);
      if (near >= 0) st.drag = { pt: near };
      else if (st.pts.length < 2) {
        st.pts.push(p);
        st.drag = { pt: st.pts.length - 1 };
      } else {
        st.pts = [p];
        st.drag = { pt: 0 };
      }
    } else {
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
    const wasRef = 'pt' in st.drag;
    st.drag = null;
    st.loupe = null;
    const b = boxRect();
    if (b) st.box = b.w < 8 || b.h < 8 ? null : { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
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
      document.documentElement.classList.remove('locked');
      resolve(result);
    };
    on(canvas, 'pointerdown', down);
    on(canvas, 'pointermove', move);
    on(canvas, 'pointerup', up);
    on(canvas, 'pointercancel', up);
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on($('mModeRef'), 'click', () => { st.mode = 'ref'; draw(); });
    on($('mModeBox'), 'click', () => { st.mode = 'box'; draw(); });
    on($('mRef'), 'change', draw);
    on($('mRefCustom'), 'input', draw);
    on($('mReset'), 'click', () => { st.mode = 'ref'; st.pts = []; st.box = null; draw(); });
    on($('mCancel'), 'click', () => finish(null));
    on($('mSave'), 'click', () => {
      const sz = size();
      if (!sz) return;
      const thumb = cropToThumb(src, boxRect());
      finish({
        name: '',
        w: sz.w,
        h: sz.h,
        d: sz.w,
        depthSet: false,
        hero: false,
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
