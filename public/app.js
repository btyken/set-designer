import { openMeasure, cutoutFromUrl } from './measure.js';
import { SetScene } from './scene.js';
import { localDesigns, FURNITURE } from './rules.js';

const $ = (id) => document.getElementById(id);
const SHAPES = ['cylinder', 'box', 'sphere', 'cone', 'flat'];
const FRAMES = ['16:9', '4:5', '1:1', '9:16'];
const PRODUCT_CATS = ['Cleanser', 'Sunscreen', 'Serum', 'Moisturiser', 'Mask', 'Makeup', 'Bundle', 'Other'];
const MOODS = [
  { name: 'Clean minimal', say: 'Bright, airy, lots of space', colors: ['#f2f0ec', '#dcd8d1', '#9aa3a8'] },
  { name: 'Warm cozy', say: 'Soft, golden, homely', colors: ['#e9d3b4', '#c98a4b', '#7a4a2b'] },
  { name: 'Moody dark', say: 'Deep shadows, strong rim light', colors: ['#1d1f24', '#3b4a5a', '#c2542d'] },
  { name: 'Bold colorful', say: 'Saturated, playful contrast', colors: ['#ff5a4f', '#2f7bff', '#ffd23f'] },
  { name: 'Luxe', say: 'Black, gold, polished', colors: ['#141414', '#3a3327', '#c9a24a'] },
  { name: 'Fresh natural', say: 'Daylight, greens, linen', colors: ['#eef0e6', '#a9bf96', '#5d7a55'] },
];
const CAMERAS = [
  { id: 'front', name: 'Straight on', say: 'Facing the back wall at chest height', icon: '<path d="M6 30h44M18 30V16h20v14M40 30V8h8v22"/><path d="M2 18l8-4v8z" fill="currentColor"/>' },
  { id: 'angle', name: 'Three-quarter', say: 'From one side, shows more depth', icon: '<path d="M6 30h44M14 30V18l16-3v15M30 15l10 3v12M42 30V9h7v21"/><path d="M2 26l9-1-4 6z" fill="currentColor"/>' },
  { id: 'high', name: 'High angle', say: 'Looking down on the set', icon: '<path d="M10 31h42M22 31V19h12v12M38 31V13h8v18"/><path d="M3 5l10 3-6 6z" fill="currentColor"/><path d="M11 12l8 7" stroke-dasharray="2 3"/>' },
];
const PEOPLE = [
  { id: 'none', name: 'Items only', say: 'A styled set with no one in it', icon: '<path d="M8 30h40M16 30V18h10v12M32 30V10h8v20"/>' },
  { id: 'standing', name: 'Person standing', say: 'Leaves a marked spot for a presenter or model', icon: '<path d="M6 31h44"/><circle cx="28" cy="7" r="4"/><path d="M28 11v12M28 23l-5 8M28 23l5 8M21 16h14"/>' },
  { id: 'seated', name: 'Person seated', say: 'Adds a chair, for talking-head shots', icon: '<path d="M6 31h44"/><circle cx="24" cy="7" r="4"/><path d="M24 11v10h9v10M18 14v17M18 22h6"/>' },
];
const DEFAULT_BRIEF = {
  product: null, roomW: 300, roomD: 250, camera: 'front', frame: '16:9', person: 'none',
  furniture: { table: true, shelf: true, plinths: true, side_table: false },
  mood: MOODS[0].name, brand: [], text: '', surfaces: '',
};

/** Tiny element builder. Text always goes in as text nodes, never as HTML. */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
function svg(inner) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 56 36');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.4');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = inner; // static icon markup defined above, never user text
  return el;
}

// ---------- Storage (IndexedDB key-value) ----------

const dbReady = new Promise((resolve) => {
  try {
    const req = indexedDB.open('set-designer', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  } catch {
    resolve(null);
  }
});
async function load(key) {
  const db = await dbReady;
  if (!db) return undefined;
  return new Promise((resolve) => {
    const req = db.transaction('kv').objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}
async function save(key, value) {
  const db = await dbReady;
  if (!db) return;
  try {
    db.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
  } catch { /* storage is a convenience only */ }
}

// ---------- State ----------

const state = {
  ai: false,
  step: 'items',
  items: [],
  products: [],
  tab: 'props',
  brief: structuredClone(DEFAULT_BRIEF),
  designs: [],
  source: '',
  active: 0,
  busy: false,
  message: null,
};
const openEditors = new Set();
let howTouched = false;
const onPhone = () => matchMedia('(pointer: coarse)').matches;

/** Opens the phone share sheet for an image (save to Photos, send in chat). False if unsupported. */
async function shareImage(url, filename, title) {
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], filename, { type: blob.type });
    if (!navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({ files: [file], title });
    return true;
  } catch (err) {
    return err?.name === 'AbortError'; // closing the sheet is not a failure
  }
}
let scene;
const saveItems = () => save('items', state.items);
const saveProducts = () => save('products', state.products);
const featured = (brief = state.brief) => state.products.find((p) => p.id === brief.product) || null;
/** Props plus the featured product, in the shape the designer and 3D scene expect. */
function designThings(brief = state.brief) {
  const p = featured(brief);
  const things = state.items.map((it) => ({ ...it, hero: false }));
  // The product is always shown as its real photo: the cut-out, or the full photo if chosen.
  if (p) things.push({ ...p, hero: true, cut: p.useCut && p.cut ? p.cut : p.thumb });
  return things;
}
async function fileToDataUrl(file, max = 900) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
const saveBrief = () => save('brief', state.brief);
const newId = () => 'i' + Math.random().toString(36).slice(2, 8);
const fmt = (n) => String(Math.round(n * 10) / 10);

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- Passcode gate (static hosting) ----------

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function passGate() {
  const want = window.SD_CONFIG?.passHash;
  if (!want) return Promise.resolve();
  try {
    if (localStorage.getItem('sd-pass') === want) return Promise.resolve();
  } catch { /* fall through to the form */ }
  return new Promise((resolve) => {
    $('gate').hidden = false;
    $('gateInput').focus();
    $('gateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if ((await sha256($('gateInput').value.trim())) === want) {
        try { localStorage.setItem('sd-pass', want); } catch { /* not remembered */ }
        $('gate').hidden = true;
        resolve();
      } else {
        $('gateMsg').textContent = 'That passcode is not right. Check with the team and try again.';
        $('gateInput').select();
      }
    });
  });
}

// ---------- Steps and bottom bar ----------

function goto(step) {
  state.step = step;
  for (const s of ['items', 'brief', 'designs']) $(`step-${s}`).hidden = s !== step;
  for (const b of document.querySelectorAll('.steps button')) {
    b.setAttribute('aria-current', String(b.dataset.step === step));
    const done = (b.dataset.step === 'items' && state.items.length + state.products.length > 0) || (b.dataset.step === 'designs' && state.designs.length > 0);
    b.classList.toggle('done', done && b.dataset.step !== step);
  }
  renderBar();
  window.scrollTo(0, 0);
  if (step === 'designs') renderDesigns();
}

function renderBar() {
  const text = $('barText');
  const next = $('barNext');
  const back = $('barBack');
  $('bar').hidden = state.step === 'designs';
  text.className = state.message?.error ? 'error' : '';
  const n = state.items.length;
  const hero = featured();
  const total = n + (hero ? 1 : 0);
  const count = `${n} prop${n === 1 ? '' : 's'}`;
  if (state.step === 'items') {
    back.hidden = true;
    next.textContent = 'Next: describe the set';
    next.disabled = total === 0;
    text.textContent = total === 0 ? 'Add at least one prop or product to continue.' : `${count}. ${hero ? `Product: ${hero.name}.` : 'No product featured yet.'}`;
  } else if (state.step === 'brief') {
    back.hidden = false;
    next.textContent = state.busy ? 'Designing…' : 'Design the set';
    next.disabled = state.busy || total === 0;
    text.textContent = state.message?.text
      || (total === 0 ? 'Add at least one prop or product first.' : `${hero ? `${hero.name} + ` : ''}${count} in a ${fmt(state.brief.roomW)} × ${fmt(state.brief.roomD)} cm set. ${state.brief.mood}.`);
  }
}

// ---------- Items ----------

function renderItems() {
  const prod = state.tab === 'products';
  const list = prod ? state.products : state.items;
  for (const b of $('libTabs').children) {
    const mine = b.dataset.tab === state.tab;
    b.setAttribute('aria-pressed', String(mine));
    const n = b.dataset.tab === 'products' ? state.products.length : state.items.length;
    b.querySelector('span').textContent = n ? ` ${n}` : '';
  }
  $('libSay').textContent = prod
    ? 'Register each BTY Advance product once. Its real photo is used in every mockup, so the label is never redrawn.'
    : 'Photograph each prop once, then tell the app how tall it is. It works out the rest.';
  $('sampleBtn').hidden = prod;
  $('itemGrid').replaceChildren(...list.map((it) => itemCard(it, prod)));
  $('itemEmpty').hidden = list.length > 0;
  $('itemEmpty').replaceChildren(
    h('strong', {}, prod ? 'No products yet' : 'No props yet'),
    h('span', {}, prod ? 'Photograph the product front-on against a plain wall, label facing the camera.'
      : 'Add your first photo, or load the sample items to see how it works.'),
  );
  if (!howTouched) $('how').open = state.items.length + state.products.length === 0;
  $('itemCount').textContent = '';
  renderBar();
}

function itemCard(it, prod) {
  const open = openEditors.has(it.id);
  const store = prod ? saveProducts : saveItems;
  const isFeatured = prod && state.brief.product === it.id;
  const numField = (label, key) => h('label', {}, label, h('span', { class: 'unit' }, h('input', {
    type: 'number', min: 0.5, step: 0.1, value: it[key], inputMode: 'decimal',
    onchange: (e) => {
      const v = Number(e.target.value);
      if (v > 0) it[key] = v;
      if (key === 'd') it.depthSet = true;
      store();
      renderItems();
    },
  }), h('em', {}, 'cm')));
  const extraPhoto = (key, label) => h('label', { class: 'btn small extra' },
    it[key] ? h('img', { src: it[key], alt: '' }) : null,
    it[key] ? `Replace ${label}` : `Add ${label} photo`,
    h('input', {
      type: 'file', accept: 'image/*', hidden: true,
      onchange: async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        it[key] = await fileToDataUrl(file).catch(() => it[key]);
        store();
        renderItems();
      },
    }));
  const shown = prod && !(it.useCut && it.cut) ? it.thumb : it.cut || it.thumb;

  return h('article', { class: 'card' + (isFeatured ? ' hero' : '') },
    h('div', { class: 'thumb' },
      h('img', { src: shown, alt: '' }),
      it.pending ? h('span', { class: 'flag busy' }, 'Analysing…') : isFeatured && h('span', { class: 'flag' }, 'Featured'),
      !it.cut && h('span', { class: 'flag note', title: 'The background could not be removed. Shoot against a plain wall for a cleaner result.' }, prod ? 'Full photo' : 'No cut-out'),
    ),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-name' }, it.name),
      h('div', { class: 'card-size' }, `${prod && it.category ? it.category + ' · ' : ''}${fmt(it.w)} × ${fmt(it.h)} × ${fmt(it.d)} cm`,
        h('span', { class: 'dots' }, (it.colors || []).map((c) => h('i', { style: `background:${c}`, title: c })))),
    ),
    open && h('div', { class: 'editor' },
      h('label', {}, 'Name', h('input', {
        type: 'text', value: it.name,
        onchange: (e) => { it.name = e.target.value.trim() || it.name; it.named = true; store(); renderItems(); },
      })),
      prod && h('label', {}, 'Category', h('select', { onchange: (e) => { it.category = e.target.value; store(); renderItems(); } },
        PRODUCT_CATS.map((c) => h('option', { value: c, selected: it.category === c }, c)))),
      h('div', { class: 'dims' }, numField('Width', 'w'), numField('Height', 'h'), numField('Depth', 'd')),
      h('label', {}, 'Closest shape', h('select', { onchange: (e) => { it.shape = e.target.value; store(); } },
        SHAPES.map((sh) => h('option', { value: sh, selected: it.shape === sh }, sh[0].toUpperCase() + sh.slice(1))))),
      prod && it.cut && h('div', { class: 'field' }, h('span', {}, 'Photo used in mockups'),
        h('div', { class: 'seg' },
          h('button', { type: 'button', 'aria-pressed': String(!!it.useCut), onclick: () => { it.useCut = true; store(); renderItems(); } }, 'Cut-out'),
          h('button', { type: 'button', 'aria-pressed': String(!it.useCut), onclick: () => { it.useCut = false; store(); renderItems(); } }, 'Full photo')),
        h('span', { class: 'help' }, 'If the cut-out has eaten into the label or packaging, switch to the full photo.')),
      prod && h('div', { class: 'extras' }, extraPhoto('side', 'side'), extraPhoto('back', 'back')),
    ),
    h('div', { class: 'card-actions' },
      prod && h('button', {
        'aria-pressed': String(isFeatured), title: 'The product the set is built around',
        onclick: () => { state.brief.product = isFeatured ? null : it.id; saveBrief(); renderItems(); renderBrief(); },
      }, isFeatured ? '★ Featured' : '☆ Feature'),
      h('button', {
        'aria-expanded': String(open),
        onclick: () => { open ? openEditors.delete(it.id) : openEditors.add(it.id); renderItems(); },
      }, open ? 'Done' : 'Edit'),
      h('button', {
        class: 'del', 'aria-label': `Remove ${it.name}`,
        onclick: () => {
          if (prod) {
            state.products = state.products.filter((o) => o !== it);
            if (state.brief.product === it.id) { state.brief.product = state.products[0]?.id || null; saveBrief(); }
            renderBrief();
          } else state.items = state.items.filter((o) => o !== it);
          store();
          renderItems();
        },
      }, 'Remove'),
    ),
  );
}

async function analyseItem(it) {
  if (!state.ai) return;
  it.pending = true;
  renderItems();
  try {
    const a = await api('api/analyze', { image: it.thumb, w: it.w, h: it.h });
    if (!it.named && a.name) it.name = a.name;
    if (SHAPES.includes(a.shape)) it.shape = a.shape;
    if (a.colors?.length) it.colors = a.colors;
    if (!it.depthSet && a.depth_ratio) it.d = Math.round(it.w * a.depth_ratio * 10) / 10;
    it.material = a.material;
    it.style = a.style;
    it.category = a.category;
  } catch (err) {
    console.warn('Analyse failed:', err.message);
  }
  delete it.pending;
  saveItems();
  renderItems();
}

async function addPhoto(file) {
  const prod = state.tab === 'products';
  // Products keep a sharper photo because they are the hero of every mockup.
  const m = await openMeasure(file, { max: prod ? 1024 : 512 });
  if (!m) return;
  const it = { id: newId(), shape: m.w > m.h * 2.5 ? 'flat' : 'box', named: false, ...m };
  delete it.hero;
  if (prod) {
    it.name = `Product ${state.products.length + 1}`;
    it.category = 'Other';
    it.useCut = Boolean(it.cut);
    state.products.push(it);
    if (!featured()) { state.brief.product = it.id; saveBrief(); renderBrief(); }
    saveProducts();
  } else {
    it.name = `Item ${state.items.length + 1}`;
    state.items.push(it);
    saveItems();
  }
  // Name, depth and shape are set on the card, so open its editor straight away.
  openEditors.clear();
  openEditors.add(it.id);
  renderItems();
  document.querySelector('#itemGrid .card:last-child')?.scrollIntoView({ block: 'center' });
  if (!prod) analyseItem(it);
}

function loadSamples() {
  const samples = [
    { name: 'Amber serum bottle', w: 5, h: 14, d: 5, shape: 'cylinder', color: '#b8651b', hero: true, draw: 'bottle' },
    { name: 'Teal ceramic vase', w: 14, h: 30, d: 14, shape: 'cylinder', color: '#2f7f86', draw: 'vase' },
    { name: 'Stack of books', w: 24, h: 10, d: 16, shape: 'box', color: '#b5553c', draw: 'books' },
    { name: 'Cream pillar candle', w: 8, h: 14, d: 8, shape: 'cylinder', color: '#efe3cc', draw: 'candle' },
    { name: 'White stone bowl', w: 22, h: 9, d: 22, shape: 'sphere', color: '#e7e2da', draw: 'bowl' },
    { name: 'Tall pampas vase', w: 26, h: 78, d: 26, shape: 'cone', color: '#c9b38a', draw: 'pampas' },
  ];
  for (const s of samples) {
    const k = 480 / Math.max(s.w, s.h);
    const W = Math.round(s.w * k);
    const H = Math.round(s.h * k);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const shade = ctx.createLinearGradient(0, 0, W, 0);
    shade.addColorStop(0, 'rgba(255,255,255,0.28)');
    shade.addColorStop(0.45, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.28)');
    const fill = (path) => { ctx.fillStyle = s.color; ctx.fill(path); ctx.fillStyle = shade; ctx.fill(path); };
    const p = new Path2D();
    if (s.draw === 'bottle') {
      p.roundRect(W * 0.08, H * 0.3, W * 0.84, H * 0.7, W * 0.16);
      fill(p);
      ctx.fillStyle = '#2a2623';
      ctx.fillRect(W * 0.3, 0, W * 0.4, H * 0.3);
      ctx.fillStyle = '#f4ecdd';
      ctx.fillRect(W * 0.08, H * 0.5, W * 0.84, H * 0.26);
    } else if (s.draw === 'vase') {
      p.moveTo(W * 0.34, 0);
      p.lineTo(W * 0.66, 0);
      p.bezierCurveTo(W * 0.62, H * 0.22, W, H * 0.3, W, H * 0.6);
      p.bezierCurveTo(W, H * 0.9, W * 0.8, H, W * 0.7, H);
      p.lineTo(W * 0.3, H);
      p.bezierCurveTo(W * 0.2, H, 0, H * 0.9, 0, H * 0.6);
      p.bezierCurveTo(0, H * 0.3, W * 0.38, H * 0.22, W * 0.34, 0);
      fill(p);
    } else if (s.draw === 'books') {
      ['#b5553c', '#2e4a62', '#d9c9a8'].forEach((col, i) => {
        const b = new Path2D();
        b.roundRect(i === 1 ? W * 0.04 : 0, (H / 3) * i + 1, i === 1 ? W * 0.92 : W - i * W * 0.03, H / 3 - 2, 3);
        ctx.fillStyle = col;
        ctx.fill(b);
        ctx.fillStyle = shade;
        ctx.fill(b);
      });
    } else if (s.draw === 'candle') {
      p.roundRect(0, H * 0.14, W, H * 0.86, W * 0.08);
      fill(p);
      ctx.fillStyle = '#3a332c';
      ctx.fillRect(W * 0.47, H * 0.03, W * 0.06, H * 0.12);
    } else if (s.draw === 'bowl') {
      p.moveTo(0, 0);
      p.lineTo(W, 0);
      p.bezierCurveTo(W, H * 0.8, W * 0.75, H, W * 0.62, H);
      p.lineTo(W * 0.38, H);
      p.bezierCurveTo(W * 0.25, H, 0, H * 0.8, 0, 0);
      fill(p);
    } else {
      ctx.strokeStyle = '#d8c59c';
      ctx.lineCap = 'round';
      for (let i = -3; i <= 3; i++) {
        ctx.lineWidth = W * 0.09;
        ctx.beginPath();
        ctx.moveTo(W / 2, H * 0.72);
        ctx.quadraticCurveTo(W / 2 + i * W * 0.06, H * 0.4, W / 2 + i * W * 0.13, H * 0.06 + Math.abs(i) * H * 0.04);
        ctx.stroke();
      }
      p.roundRect(W * 0.26, H * 0.66, W * 0.48, H * 0.34, W * 0.1);
      ctx.fillStyle = '#8a8378';
      ctx.fill(p);
      ctx.fillStyle = shade;
      ctx.fill(p);
    }
    const flat = document.createElement('canvas');
    flat.width = W;
    flat.height = H;
    const fctx = flat.getContext('2d');
    fctx.fillStyle = '#ecebe8';
    fctx.fillRect(0, 0, W, H);
    fctx.drawImage(c, 0, 0);
    const rec = {
      id: newId(), name: s.name, named: true, w: s.w, h: s.h, d: s.d, depthSet: true, shape: s.shape,
      colors: [s.color], thumb: flat.toDataURL('image/jpeg', 0.85), cut: c.toDataURL('image/png'),
    };
    if (s.hero) {
      // The sample bottle stands in for a product until a real one is registered.
      if (state.products.length) continue;
      state.products.push({ ...rec, name: 'Sample serum bottle', category: 'Serum', useCut: true });
      state.brief.product = rec.id;
      saveProducts();
      saveBrief();
      renderBrief();
    } else state.items.push(rec);
  }
  saveItems();
  renderItems();
}

// Items saved before cut-outs existed get one made from their thumbnail.
async function backfillCutouts() {
  let changed = false;
  for (const it of state.items) {
    if ('cut' in it) continue;
    it.cut = await cutoutFromUrl(it.thumb).catch(() => null);
    changed = true;
  }
  if (changed) {
    saveItems();
    renderItems();
  }
}

// ---------- Brief ----------

function renderBrief() {
  const b = state.brief;
  $('bW').value = b.roomW;
  $('bD').value = b.roomD;
  $('bText').value = b.text;
  $('bSurf').value = b.surfaces;
  $('notesBlock').hidden = !state.ai;
  const radio = (list, key, target) => $(target).replaceChildren(...list.map((c) => h('button', {
    class: 'choice', type: 'button', role: 'radio', 'aria-checked': String(b[key] === c.id),
    onclick: () => { b[key] = c.id; saveBrief(); renderBrief(); },
  }, svg(c.icon), h('strong', {}, c.name), h('span', {}, c.say))));
  $('prodPick').replaceChildren(...[
    ...state.products.map((p) => h('button', {
      class: 'choice prod', type: 'button', role: 'radio', 'aria-checked': String(b.product === p.id),
      onclick: () => { b.product = p.id; saveBrief(); renderBrief(); renderItems(); },
    }, h('img', { src: p.useCut && p.cut ? p.cut : p.thumb, alt: '' }), h('strong', {}, p.name), h('span', {}, `${p.category || 'Product'} · ${fmt(p.h)} cm tall`))),
    state.products.length > 0 && h('button', {
      class: 'choice', type: 'button', role: 'radio', 'aria-checked': String(!featured()),
      onclick: () => { b.product = null; saveBrief(); renderBrief(); renderItems(); },
    }, h('strong', {}, 'No product'), h('span', {}, 'Design a set with props only')),
    state.products.length === 0 && h('p', { class: 'muted' }, 'No products registered yet. ',
      h('button', { class: 'btn small', type: 'button', onclick: () => { state.tab = 'products'; goto('items'); renderItems(); } }, 'Add a product')),
  ].filter(Boolean));
  radio(PEOPLE, 'person', 'people');
  radio(CAMERAS, 'camera', 'cams');

  $('furn').replaceChildren(...Object.entries(FURNITURE).map(([key, f]) => h('button', {
    class: 'choice', type: 'button', role: 'checkbox', 'aria-checked': String(!!b.furniture[key]),
    onclick: () => { b.furniture[key] = !b.furniture[key]; saveBrief(); renderBrief(); },
  }, h('strong', {}, f.label), h('span', {}, f.say))));

  $('frames').replaceChildren(...FRAMES.map((f) => h('button', {
    type: 'button', 'aria-pressed': String(b.frame === f),
    onclick: () => { b.frame = f; saveBrief(); renderBrief(); },
  }, f)));

  $('moods').replaceChildren(...MOODS.map((m) => h('button', {
    class: 'choice', type: 'button', role: 'radio', 'aria-checked': String(b.mood === m.name),
    onclick: () => { b.mood = m.name; saveBrief(); renderBrief(); },
  }, h('div', { class: 'swatch-row' }, m.colors.map((c) => h('i', { style: `background:${c}` }))),
  h('strong', {}, m.name), h('span', {}, m.say))));

  $('brand').replaceChildren(
    ...b.brand.map((c, i) => h('span', { class: 'brand-chip' },
      h('input', { type: 'color', value: c, 'aria-label': `Brand colour ${i + 1}`, onchange: (e) => { b.brand[i] = e.target.value; saveBrief(); renderBrief(); } }),
      h('code', {}, c),
      h('button', { type: 'button', 'aria-label': `Remove ${c}`, onclick: () => { b.brand.splice(i, 1); saveBrief(); renderBrief(); } }, '✕'),
    )),
    b.brand.length < 5 && h('button', { class: 'btn small', type: 'button', onclick: () => { b.brand.push('#c9a24a'); saveBrief(); renderBrief(); } }, '+ Add a colour'),
    b.brand.length === 0 && h('span', { class: 'muted' }, 'None. Colours will come from your items.'),
  );
  renderBar();
}

function bindBrief() {
  const b = state.brief;
  const numIn = (id, key, lo, hi) => $(id).addEventListener('change', (e) => {
    const v = Number(e.target.value);
    if (v >= lo && v <= hi) b[key] = v;
    else e.target.value = b[key];
    saveBrief();
    renderBar();
  });
  numIn('bW', 'roomW', 100, 800);
  numIn('bD', 'roomD', 80, 600);
  $('bText').addEventListener('input', (e) => { b.text = e.target.value; saveBrief(); });
  $('bSurf').addEventListener('input', (e) => { b.surfaces = e.target.value; saveBrief(); });
}

// ---------- Generate ----------

async function generate() {
  const things = designThings();
  if (state.busy || !things.length) return;
  state.busy = true;
  state.message = state.ai ? { text: 'Claude is designing your sets. This usually takes under a minute…' } : null;
  $('regenBtn').disabled = true;
  renderBar();
  let fallbackNote = null;
  try {
    if (state.ai) {
      try {
        const out = await api('api/generate', { items: things.map(({ cut, side, back, ...it }) => it), brief: state.brief, count: 3 });
        state.designs = out.designs;
        state.source = 'ai';
      } catch (err) {
        fallbackNote = `Claude was unavailable (${err.message}). These designs come from the built-in rules instead.`;
        state.designs = localDesigns(things, state.brief);
        state.source = 'rules';
      }
    } else {
      state.designs = localDesigns(things, state.brief);
      state.source = 'rules';
    }
    state.active = 0;
    state.designBrief = structuredClone(state.brief);
    state.designNote = fallbackNote;
    save('designs', { designs: state.designs, source: state.source, brief: state.designBrief });
  } finally {
    state.busy = false;
    state.message = null;
    $('regenBtn').disabled = false;
  }
  goto('designs');
}

// ---------- Designs ----------

const where = (o) => {
  const part = (v, neg, pos) => (Math.abs(v) < 8 ? null : `${Math.round(Math.abs(v))} cm ${v < 0 ? neg : pos}`);
  return [part(o.x_cm, 'left', 'right'), part(o.z_cm, 'back', 'forward')].filter(Boolean).join(' · ') || 'centre of the set';
};

function openLightbox(shot, name) {
  $('lbTitle').textContent = shot.name;
  $('lbImg').src = shot.url;
  $('lbImg').alt = `${shot.name} mockup`;
  $('lbSave').href = shot.url;
  const file = `${name}-${shot.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
  $('lbSave').download = file;
  $('lbShare').hidden = !(onPhone() && navigator.canShare);
  $('lbShare').onclick = async () => { if (!(await shareImage(shot.url, file, shot.name))) $('lbSave').click(); };
  $('lightbox').hidden = false;
}

async function renderDesigns() {
  const has = state.designs.length > 0;
  $('designEmpty').hidden = has;
  $('designWrap').hidden = !has;
  if (!has) return;
  const brief = state.designBrief || state.brief;
  $('sourceChip').textContent = state.source === 'ai' ? 'Designed by Claude' : 'Built-in rules';

  $('designTabs').replaceChildren(...state.designs.map((d, i) => h('button', {
    class: 'option', role: 'tab', 'aria-selected': String(i === state.active),
    onclick: () => { state.active = i; renderDesigns(); },
  },
  h('small', {}, `Option ${i + 1}`),
  h('strong', {}, d.name),
  h('div', { class: 'swatch-row' }, d.palette.map((p) => h('i', { style: `background:${p.hex}` }))))));

  const d = state.designs[state.active];
  const [fa, fb] = brief.frame.split(':').map(Number);
  const stage = document.querySelector('.stage');
  stage.style.aspectRatio = `${fa} / ${fb}`;
  stage.style.maxWidth = `calc(72vh * ${fa / fb})`;
  renderDetails(d, brief);

  scene ??= new SetScene($('scene'));
  const index = state.active;
  $('mockups').replaceChildren(h('p', { class: 'muted' }, 'Rendering mockups…'));
  const ready = await scene.setDesign(d, designThings(brief), brief);
  if (!ready || index !== state.active) return;
  const shots = scene.renderShots();
  const slug = `set-option-${index + 1}`;
  $('mockups').replaceChildren(...shots.map((shot) => h('figure', {},
    h('button', { class: 'shot', 'aria-label': `Open ${shot.name} mockup`, onclick: () => openLightbox(shot, slug) },
      h('img', { src: shot.url, alt: `${shot.name} mockup`, width: shot.w, height: shot.h })),
    h('figcaption', {}, h('strong', {}, shot.name), h('span', {}, shot.note)),
  )));
}

function renderDetails(d, brief) {
  const names = new Map(designThings(brief).map((it) => [it.id, (it.hero ? '★ ' : '') + it.name]));
  const li = (badge, title, spec, say) => h('li', {}, badge, h('strong', {}, title), h('div', { class: 'spec' }, spec), h('div', { class: 'say' }, say || ''));
  $('details').replaceChildren(...[
    state.designNote && h('p', { class: 'note', style: 'color:var(--danger);margin:0 0 12px' }, state.designNote),
    h('h2', { class: 'title' }, d.name),
    h('p', {}, d.concept),

    h('h3', {}, 'Colour palette'),
    h('div', { class: 'palette' }, d.palette.map((p) => h('div', { class: 'sw' },
      h('i', { style: `background:${p.hex}` }), h('div', {}, h('code', {}, p.hex), p.role)))),
    h('p', { class: 'note' }, `Wall: ${d.wall_suggestion} Floor: ${d.floor_suggestion}`),

    h('h3', {}, 'Furniture and people'),
    h('ul', { class: 'list' },
      d.furniture.map((f, i) => li(h('span', { class: 'num' }, String.fromCharCode(65 + i)), f.label,
        `${where(f)} · ${f.w_cm} × ${f.d_cm} × ${f.h_cm} cm`, f.note)),
      d.person?.present && li(h('span', { class: 'num' }, '☺'), 'Person on camera', where(d.person), d.person.note),
    ),
    d.furniture.length === 0 && h('p', { class: 'note' }, 'No furniture selected, so everything sits on the floor.'),

    h('h3', {}, 'Where each item goes'),
    h('ul', { class: 'list' }, d.placements.map((p, i) => li(h('span', { class: 'num' }, String(i + 1)), names.get(p.item_id) || 'Item',
      `${p.on} · ${where(p)}${p.y_cm ? ` · ${Math.round(p.y_cm)} cm up` : ''}${p.rotation_deg ? ` · turned ${Math.round(p.rotation_deg)}°` : ''}`, p.note))),
    d.left_out.length > 0 && h('p', { class: 'note' },
      'Left out: ' + d.left_out.map((l) => `${names.get(l.item_id) || 'item'} (${l.reason})`).join(' ')),

    h('h3', {}, 'Lighting plan'),
    h('ul', { class: 'list' }, d.lights.map((l, i) => li(
      h('span', { class: 'num', style: `background:${l.color_hex};color:#14110f` }, String(i + 1)), l.name,
      [l.fixture === 'white' ? `White ${Math.round(l.kelvin)}K` : `RGB ${l.color_hex}`, `${Math.round(l.intensity_pct)}%`, l.modifier].filter(Boolean).join(' · '),
      `${where(l)}, ${Math.round(l.y_cm)} cm high. Aimed at the ${l.aim === 'backdrop' ? 'back wall' : l.aim}. ${l.note || ''}`))),

    h('h3', {}, 'Other light colours to try'),
    h('ul', { class: 'list' }, d.color_combinations.map((c) => li(
      h('span', { class: 'pair' }, c.colors.slice(0, 2).map((x) => h('i', { style: `background:${x}`, title: x }))),
      c.name, c.colors.join(' + '), c.why))),

    h('h3', {}, 'Styling tips'),
    h('ul', { class: 'tips' }, d.styling_tips.map((t) => h('li', {}, t))),
    d.camera_note && h('p', { class: 'note' }, `Camera: ${d.camera_note}`),
  ].filter(Boolean));
}

// ---------- Boot ----------

async function boot() {
  await passGate();
  bindBrief();
  for (const b of document.querySelectorAll('.steps button')) b.addEventListener('click', () => goto(b.dataset.step));
  for (const b of document.querySelectorAll('[data-goto]')) b.addEventListener('click', () => goto(b.dataset.goto));
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => scene?.setView(b.dataset.view));
  $('barNext').addEventListener('click', () => (state.step === 'items' ? goto('brief') : generate()));
  $('barBack').addEventListener('click', () => goto('items'));
  for (const id of ['fileInput', 'galleryInput']) {
    $(id).addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file && $('measure').hidden) await addPhoto(file);
    });
  }
  $('how').querySelector('summary').addEventListener('click', () => { howTouched = true; });
  $('sampleBtn').addEventListener('click', loadSamples);
  for (const b of $('libTabs').children) b.addEventListener('click', () => { state.tab = b.dataset.tab; openEditors.clear(); renderItems(); });
  $('regenBtn').addEventListener('click', generate);
  $('tLabels').addEventListener('change', (e) => { if (scene) { scene.showLabels = e.target.checked; scene.applyVisibility(); } });
  $('tLights').addEventListener('change', (e) => { if (scene) { scene.showLights = e.target.checked; scene.applyVisibility(); } });
  $('snapBtn').addEventListener('click', async () => {
    if (!scene) return;
    scene.renderer.render(scene.scene, scene.camera);
    const url = $('scene').toDataURL('image/png');
    const file = `set-plan-option-${state.active + 1}.png`;
    if (onPhone() && (await shareImage(url, file, 'Set plan'))) return;
    h('a', { href: url, download: file }).click();
  });
  $('lbClose').addEventListener('click', () => { $('lightbox').hidden = true; });
  $('lightbox').addEventListener('click', (e) => { if (e.target === $('lightbox')) $('lightbox').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('lightbox').hidden = true; });

  const [items, brief, designs, products] = await Promise.all([load('items'), load('brief'), load('designs'), load('products')]);
  if (Array.isArray(items)) state.items = items.map(({ pending, ...it }) => it);
  if (Array.isArray(products)) state.products = products;
  if (brief) {
    for (const key of Object.keys(DEFAULT_BRIEF)) if (brief[key] != null) state.brief[key] = brief[key];
    if (!CAMERAS.some((c) => c.id === state.brief.camera)) state.brief.camera = 'front';
    state.brief.furniture = { ...DEFAULT_BRIEF.furniture, ...state.brief.furniture };
  }
  // Older versions marked one item as the hero. That item becomes the featured product.
  const oldHero = state.items.find((it) => it.hero);
  if (oldHero) {
    if (!state.products.length) {
      state.items = state.items.filter((it) => it !== oldHero);
      const { hero, ...rest } = oldHero;
      state.products.push({ ...rest, category: 'Other', useCut: Boolean(rest.cut) });
      state.brief.product = rest.id;
      saveProducts();
      saveBrief();
    }
    for (const it of state.items) delete it.hero;
    saveItems();
  }
  if (!featured()) state.brief.product = null;
  if (designs?.designs?.[0]?.furniture && designs.brief?.roomW) {
    state.designs = designs.designs;
    state.source = designs.source;
    state.designBrief = designs.brief;
  }

  try {
    state.ai = (await api('api/status')).ai;
  } catch { /* static hosting or offline: rules mode */ }
  if (onPhone()) $('planHint').textContent = 'swipe sideways to turn, pinch to zoom';
  const chip = $('brain');
  chip.textContent = state.ai ? 'Claude AI on' : 'Built-in rules';
  chip.className = 'tag' + (state.ai ? ' on' : '');

  renderItems();
  renderBrief();
  goto('items');
  backfillCutouts();
}

boot();
