// Set Designer: photograph props and products, describe the set, get three designs with
// lighting plans and sample frames. Started by main.js with initSetDesigner().
import { openMeasure, cutoutFromUrl } from './measure.js';
import { SetScene } from './scene.js';
import { localDesigns, FURNITURE } from './rules.js';
import { CATEGORIES, MATERIALS, STATUSES, statusOf, statusName, usable, suggestUses, findDuplicates, matchesFilter } from './props.js';
import { $, h } from '../shared/dom.js';
import { onPhone, shareImage } from '../shared/lightbox.js';
import { chatgptPhotos, chatgptPrompt, photoFileName } from './chatgpt.js';

const SHAPES = ['cylinder', 'box', 'sphere', 'cone', 'flat'];
const FRAMES = ['16:9', '4:5', '1:1', '9:16'];
const PRODUCT_CATS = ['Cleanser', 'Sunscreen', 'Serum', 'Moisturiser', 'Mask', 'Makeup', 'Bundle', 'Other'];
const MOODS = [
  { name: 'BTY studio', say: 'White sweep, white blocks, soft glow', colors: ['#f4f3f1', '#d9d7d3', '#e0626b'] },
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
const SET_TYPES = [
  { id: 'tabletop', name: 'Tabletop', say: 'Products on a table with small blocks, shot close', icon: '<path d="M4 28h48M12 28v-9h10v9M26 28V12h8v16M38 28v-6h8v6"/>' },
  { id: 'room', name: 'Room set', say: 'A corner of a room with furniture, room for a person', icon: '<path d="M4 31h48M4 31V6h48v25M12 31V16h9v15M30 31V20h16v11"/>' },
];
const DEFAULT_BRIEF = {
  setType: 'tabletop', tableW: 120, tableD: 70,
  products: [], roomW: 300, roomD: 250, camera: 'front', frame: '16:9', person: 'none',
  furniture: { table: true, shelf: true, plinths: true, side_table: false },
  mood: MOODS[0].name, brand: [], text: '', surfaces: '',
};

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
  filter: { q: '', category: '', status: '' },
  brief: structuredClone(DEFAULT_BRIEF),
  designs: [],
  source: '',
  active: 0,
  busy: false,
  message: null,
};
const openEditors = new Set();
let howTouched = false;
let scene;
/** Sample frames of the design on screen, for Copy for ChatGPT. */
let shown = { index: -1, shots: [] };
const saveItems = () => save('items', state.items);
const saveProducts = () => save('products', state.products);
const featuredIds = (brief = state.brief) => brief.products || (brief.product ? [brief.product] : []);
/** The products picked for the shot, in the order they were picked. The first is the main one. */
const featured = (brief = state.brief) => featuredIds(brief).map((id) => state.products.find((p) => p.id === id)).filter(Boolean);
function toggleFeatured(id) {
  const list = state.brief.products;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  saveBrief();
}
const isTabletop = (brief = state.brief) => brief.setType === 'tabletop';
/** The brief as the designer sees it: a tabletop set is a small "room" with no person in it. */
function effectiveBrief() {
  const b = structuredClone(state.brief);
  if (isTabletop(b)) Object.assign(b, { roomW: b.tableW, roomD: b.tableD, person: 'none' });
  return b;
}
/**
 * Props plus the featured products, in the shape the designer and 3D scene expect.
 * A new design only gets props that are available; `all` is for showing a saved design.
 */
function designThings(brief = state.brief, all = false) {
  const things = state.items.filter((it) => all || usable(it)).map((it) => ({ ...it, hero: false, product: false }));
  // A product is always shown as its real photo: the cut-out, or the full photo if chosen.
  featured(brief).forEach((p, i) => things.push({ ...p, product: true, hero: i === 0, cut: p.useCut && p.cut ? p.cut : p.thumb }));
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
  if (step === 'brief') renderBrief(); // names and sizes may have changed on the Items step
  if (step === 'designs') renderDesigns();
}

function renderBar() {
  const text = $('barText');
  const next = $('barNext');
  const back = $('barBack');
  $('bar').hidden = state.step === 'designs';
  text.className = state.message?.error ? 'error' : '';
  const n = state.items.filter(usable).length;
  const off = state.items.length - n;
  const prods = featured();
  const total = n + prods.length;
  const count = `${n} prop${n === 1 ? '' : 's'}${off ? ` (${off} not available)` : ''}`;
  const prodSay = prods.length > 1 ? `${prods[0].name} + ${prods.length - 1} more` : prods[0]?.name;
  if (state.step === 'items') {
    back.hidden = true;
    next.textContent = 'Next: describe the set';
    next.disabled = total === 0;
    text.textContent = total === 0 ? 'Add at least one prop or product to continue.' : `${count}. ${prods.length ? `Product${prods.length > 1 ? 's' : ''}: ${prodSay}.` : 'No product featured yet.'}`;
  } else if (state.step === 'brief') {
    back.hidden = false;
    next.textContent = state.busy ? 'Designing…' : 'Design the set';
    next.disabled = state.busy || total === 0;
    text.textContent = state.message?.text
      || (total === 0 ? 'Add at least one prop or product first.' : `${prods.length ? `${prods.length} product${prods.length > 1 ? 's' : ''}, ` : ''}${count}, ${isTabletop() ? `${fmt(state.brief.tableW)} × ${fmt(state.brief.tableD)} cm tabletop` : `${fmt(state.brief.roomW)} × ${fmt(state.brief.roomD)} cm room set`}. ${state.brief.mood}.`);
  }
}

// ---------- Items ----------

function renderItems() {
  const prod = state.tab === 'products';
  const all = prod ? state.products : state.items;
  const list = prod ? all : all.filter((it) => matchesFilter(it, state.filter));
  $('propTools').hidden = prod || state.items.length === 0;
  for (const b of $('libTabs').children) {
    const mine = b.dataset.tab === state.tab;
    b.setAttribute('aria-pressed', String(mine));
    const n = b.dataset.tab === 'products' ? state.products.length : state.items.length;
    b.querySelector('span').textContent = n ? ` ${n}` : '';
  }
  $('libSay').textContent = prod
    ? 'Register each BTY Advance product once. Its real photo is used in every mockup, so the label is never redrawn. For a clean cut-out, shoot it against a backdrop darker than the packaging.'
    : 'Photograph each prop once, then tell the app how tall it is. It works out the rest.';
  $('sampleBtn').hidden = prod;
  $('itemGrid').replaceChildren(...list.map((it) => itemCard(it, prod)));
  $('itemEmpty').hidden = list.length > 0;
  $('itemEmpty').replaceChildren(
    h('strong', {}, all.length ? 'No props match' : prod ? 'No products yet' : 'No props yet'),
    h('span', {}, all.length ? `Clear the search and filters to see all ${all.length}.`
      : prod ? 'Photograph the product front-on against a plain wall, label facing the camera.'
        : 'Add your first photo, or load the sample items to see how it works.'),
  );
  if (!howTouched) $('how').open = state.items.length + state.products.length === 0;
  $('itemCount').textContent = '';
  renderBar();
}

function itemCard(it, prod) {
  const open = openEditors.has(it.id);
  const store = prod ? saveProducts : saveItems;
  const order = prod ? state.brief.products.indexOf(it.id) : -1;
  const isFeatured = order >= 0;
  const off = !prod && !usable(it);
  const uses = prod ? [] : suggestUses(it);
  const pick = (label, key, options, blank) => h('label', {}, label, h('select', { onchange: (e) => { it[key] = e.target.value; store(); renderItems(); } },
    blank && h('option', { value: '', selected: !it[key] }, blank),
    options.map((o) => h('option', { value: o.id || o, selected: (key === 'status' ? statusOf(it) : it[key]) === (o.id || o) }, o.name || o))));
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

  return h('article', { class: 'card' + (isFeatured ? ' hero' : '') + (off ? ' off' : ''), 'data-id': it.id },
    h('div', { class: 'thumb' },
      h('img', { src: shown, alt: '' }),
      it.pending ? h('span', { class: 'flag busy' }, 'Analysing…') : isFeatured ? h('span', { class: 'flag' }, order === 0 ? 'Main product' : 'Featured') : off && h('span', { class: 'flag off' }, statusName(it)),
      !it.cut && h('span', { class: 'flag note', title: 'The background could not be removed. Shoot against a plain wall for a cleaner result.' }, prod ? 'Full photo' : 'No cut-out'),
    ),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-name' }, it.name),
      h('div', { class: 'card-size' }, `${prod && it.category ? it.category + ' · ' : ''}${fmt(it.w)} × ${fmt(it.h)} × ${fmt(it.d)} cm`,
        h('span', { class: 'dots' }, (it.colors || []).map((c) => h('i', { style: `background:${c}`, title: c })))),
      !prod && h('div', { class: 'card-meta' }, [it.category, it.material, it.photos?.length && `${it.photos.length + 1} photos`].filter(Boolean).join(' · ') || 'No category yet'),
      !prod && h('div', { class: 'card-uses' }, uses.map((u) => h('span', {}, u))),
    ),
    open && h('div', { class: 'editor' },
      h('label', {}, 'Name', h('input', {
        type: 'text', value: it.name,
        onchange: (e) => { it.name = e.target.value.trim() || it.name; it.named = true; store(); renderItems(); },
      })),
      prod && pick('Category', 'category', PRODUCT_CATS),
      !prod && h('div', { class: 'two' }, pick('Category', 'category', CATEGORIES, 'Choose…'), pick('Material', 'material', MATERIALS, 'Choose…')),
      !prod && pick('Status', 'status', STATUSES),
      h('div', { class: 'dims' }, numField('Width', 'w'), numField('Height', 'h'), numField('Depth', 'd')),
      h('label', {}, 'Closest shape', h('select', { onchange: (e) => { it.shape = e.target.value; store(); } },
        SHAPES.map((sh) => h('option', { value: sh, selected: it.shape === sh }, sh[0].toUpperCase() + sh.slice(1))))),
      prod && it.cut && h('div', { class: 'field' }, h('span', {}, 'Photo used in mockups'),
        h('div', { class: 'seg' },
          h('button', { type: 'button', 'aria-pressed': String(!!it.useCut), onclick: () => { it.useCut = true; store(); renderItems(); } }, 'Cut-out'),
          h('button', { type: 'button', 'aria-pressed': String(!it.useCut), onclick: () => { it.useCut = false; store(); renderItems(); } }, 'Full photo')),
        h('span', { class: 'help' }, 'If the cut-out has eaten into the label or packaging, switch to the full photo.')),
      prod && h('div', { class: 'extras' }, extraPhoto('side', 'side'), extraPhoto('back', 'back')),
      !prod && it.photos?.length > 0 && h('div', { class: 'field' }, h('span', {}, 'Other photos of this prop'),
        h('div', { class: 'photos' }, it.photos.map((src, i) => h('button', {
          type: 'button', 'aria-label': `Remove photo ${i + 2}`, title: 'Tap to remove',
          onclick: () => { it.photos.splice(i, 1); store(); renderItems(); },
        }, h('img', { src, alt: '' }), h('b', {}, '✕'))))),
    ),
    h('div', { class: 'card-actions' },
      prod && h('button', {
        'aria-pressed': String(isFeatured), title: 'Put this product in the shot. The first one picked is the main product.',
        onclick: () => { toggleFeatured(it.id); renderItems(); renderBrief(); },
      }, isFeatured ? (order === 0 ? '★ Main' : '★ Featured') : '☆ Feature'),
      h('button', {
        'aria-expanded': String(open),
        onclick: () => { open ? openEditors.delete(it.id) : openEditors.add(it.id); renderItems(); },
      }, open ? 'Done' : 'Edit'),
      h('button', {
        class: 'del', 'aria-label': `Remove ${it.name}`,
        onclick: () => {
          if (prod) {
            state.products = state.products.filter((o) => o !== it);
            if (isFeatured) toggleFeatured(it.id);
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
    if (!it.material && MATERIALS.includes(a.material)) it.material = a.material;
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
  const m = await openMeasure(file, { max: prod ? 1024 : 512, strict: prod });
  if (!m) return;
  const it = { id: newId(), shape: m.w > m.h * 2.5 ? 'flat' : 'box', named: false, ...m };
  delete it.hero;
  if (prod) {
    it.name = `Product ${state.products.length + 1}`;
    it.category = 'Other';
    it.useCut = Boolean(it.cut);
    state.products.push(it);
    if (!featured().length) { state.brief.products = [it.id]; saveBrief(); }
    renderBrief();
    saveProducts();
  } else {
    // A second photo of a prop the team already has is added to that prop, not saved twice.
    const dups = findDuplicates(it, state.items);
    const same = dups.length ? await askDuplicate(it, dups) : null;
    if (same) {
      same.photos = [...(same.photos || []), it.thumb].slice(-4);
      saveItems();
      showCard(same.id);
      return;
    }
    it.status = 'available';
    it.name = `Item ${state.items.length + 1}`;
    state.items.push(it);
    saveItems();
  }
  // Name, depth and shape are set on the card, so open its editor straight away.
  showCard(it.id);
  if (!prod) analyseItem(it);
}

/** Opens one card's editor and brings it into view, clearing any filter that would hide it. */
function showCard(id) {
  state.filter = { q: '', category: '', status: '' };
  $('pSearch').value = '';
  $('pCat').value = '';
  $('pStatus').value = '';
  openEditors.clear();
  openEditors.add(id);
  renderItems();
  document.querySelector(`#itemGrid .card[data-id="${id}"]`)?.scrollIntoView({ block: 'center' });
}

/** Asks whether a new photo is one of the look-alike props. Resolves to that prop, or null for "new". */
function askDuplicate(it, dups) {
  return new Promise((resolve) => {
    const close = (v) => { box.remove(); resolve(v); };
    const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Possible duplicate' },
      h('div', { class: 'sheet-in' },
        h('h2', {}, 'Same item as one of these?'),
        h('p', { class: 'help' }, 'This photo looks like a prop you already have. Tap it to add the photo there instead of saving a second copy.'),
        h('div', { class: 'dup-new' }, h('img', { src: it.cut || it.thumb, alt: '' }), h('span', {}, `Your new photo · ${fmt(it.w)} × ${fmt(it.h)} cm`)),
        h('div', { class: 'dup-list' }, dups.map((d) => h('button', { class: 'choice prod', type: 'button', onclick: () => close(d) },
          h('img', { src: d.cut || d.thumb, alt: '' }), h('strong', {}, d.name),
          h('span', {}, `${d.category ? d.category + ' · ' : ''}${fmt(d.w)} × ${fmt(d.h)} cm`)))),
        h('button', { class: 'btn primary', type: 'button', onclick: () => close(null) }, 'No, it is a new prop'),
      ));
    document.body.append(box);
  });
}

function loadSamples() {
  const samples = [
    { name: 'Amber serum bottle', w: 5, h: 14, d: 5, shape: 'cylinder', color: '#b8651b', hero: true, draw: 'bottle' },
    { name: 'Teal ceramic vase', w: 14, h: 30, d: 14, shape: 'cylinder', color: '#2f7f86', draw: 'vase', cat: 'Vase or vessel', mat: 'Ceramic' },
    { name: 'Stack of books', w: 24, h: 10, d: 16, shape: 'box', color: '#b5553c', draw: 'books', cat: 'Book or paper', mat: 'Paper' },
    { name: 'Cream pillar candle', w: 8, h: 14, d: 8, shape: 'cylinder', color: '#efe3cc', draw: 'candle', cat: 'Candle or lamp', mat: 'Other' },
    { name: 'White stone bowl', w: 22, h: 9, d: 22, shape: 'sphere', color: '#e7e2da', draw: 'bowl', cat: 'Tray or dish', mat: 'Stone' },
    { name: 'Tall pampas vase', w: 26, h: 78, d: 26, shape: 'cone', color: '#c9b38a', draw: 'pampas', cat: 'Plant or flower', mat: 'Plant' },
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
      state.brief.products = [rec.id];
      saveProducts();
      saveBrief();
      renderBrief();
    } else state.items.push({ ...rec, status: 'available', category: s.cat, material: s.mat });
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
  const tt = isTabletop(b);
  $('bW').value = tt ? b.tableW : b.roomW;
  $('bD').value = tt ? b.tableD : b.roomD;
  $('areaTitle').textContent = tt ? 'Table size' : 'Set area';
  $('areaHelp').textContent = tt
    ? 'The table top you are shooting on. The backdrop stands along its back edge.'
    : 'The floor space you can dress, measured along the back wall and out toward the camera.';
  $('bWLabel').textContent = tt ? 'Width, left to right' : 'Width along the wall';
  $('bDLabel').textContent = tt ? 'Depth, back to front' : 'Depth toward camera';
  $('peopleBlock').hidden = tt;
  $('furnBlock').hidden = tt;
  $('bText').value = b.text;
  $('bSurf').value = b.surfaces;
  $('notesBlock').hidden = !state.ai;
  const radio = (list, key, target) => $(target).replaceChildren(...list.map((c) => h('button', {
    class: 'choice', type: 'button', role: 'radio', 'aria-checked': String(b[key] === c.id),
    onclick: () => { b[key] = c.id; saveBrief(); renderBrief(); },
  }, svg(c.icon), h('strong', {}, c.name), h('span', {}, c.say))));
  $('prodPick').replaceChildren(...[
    ...state.products.map((p) => {
      const order = b.products.indexOf(p.id);
      return h('button', {
        class: 'choice prod', type: 'button', role: 'checkbox', 'aria-checked': String(order >= 0),
        onclick: () => { toggleFeatured(p.id); renderBrief(); renderItems(); },
      }, h('img', { src: p.useCut && p.cut ? p.cut : p.thumb, alt: '' }), h('strong', {}, p.name),
      h('span', {}, `${order === 0 ? 'Main product · ' : order > 0 ? `Product ${order + 1} · ` : ''}${p.category || 'Product'} · ${fmt(p.h)} cm tall`));
    }),
    state.products.length > 0 && featured().length === 0 && h('p', { class: 'muted' }, 'None picked, so the set will use props only.'),
    state.products.length === 0 && h('p', { class: 'muted' }, 'No products registered yet. ',
      h('button', { class: 'btn small', type: 'button', onclick: () => { state.tab = 'products'; goto('items'); renderItems(); } }, 'Add a product')),
  ].filter(Boolean));
  radio(SET_TYPES, 'setType', 'setTypes');
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
  // The two size boxes edit the table or the room, depending on the kind of set.
  const numIn = (id, room, table) => $(id).addEventListener('change', (e) => {
    const [key, lo, hi] = isTabletop(b) ? table : room;
    const v = Number(e.target.value);
    if (v >= lo && v <= hi) b[key] = v;
    else e.target.value = b[key];
    saveBrief();
    renderBar();
  });
  numIn('bW', ['roomW', 100, 800], ['tableW', 40, 300]);
  numIn('bD', ['roomD', 80, 600], ['tableD', 30, 200]);
  $('bText').addEventListener('input', (e) => { b.text = e.target.value; saveBrief(); });
  $('bSurf').addEventListener('input', (e) => { b.surfaces = e.target.value; saveBrief(); });
}

// ---------- Generate ----------

async function generate() {
  const things = designThings();
  if (state.busy || !things.length) return;
  const brief = effectiveBrief();
  state.busy = true;
  state.message = state.ai ? { text: 'Claude is designing your sets. This usually takes under a minute…' } : null;
  $('regenBtn').disabled = true;
  renderBar();
  let fallbackNote = null;
  try {
    if (state.ai) {
      try {
        const out = await api('api/generate', { items: things.map(({ cut, side, back, ...it }) => it), brief, count: 3 });
        state.designs = out.designs;
        state.source = 'ai';
      } catch (err) {
        fallbackNote = `Claude was unavailable (${err.message}). These designs come from the built-in rules instead.`;
        state.designs = localDesigns(things, brief);
        state.source = 'rules';
      }
    } else {
      state.designs = localDesigns(things, brief);
      state.source = 'rules';
    }
    state.active = 0;
    state.designBrief = brief;
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
  $('mockups').replaceChildren(h('p', { class: 'muted' }, 'Rendering sample frames…'));
  const ready = await scene.setDesign(d, designThings(brief, true), brief);
  if (!ready || index !== state.active) return;
  const shots = scene.renderShots();
  shown = { index, shots };
  const slug = `set-option-${index + 1}`;
  $('mockups').replaceChildren(...shots.map((shot) => h('figure', {},
    h('button', { class: 'shot', 'aria-label': `Open ${shot.name} mockup`, onclick: () => tool.openLightbox({ ...shot, alt: `${shot.name} mockup` }, slug, { onPin: tool.pinToShoot(shot.url, `Set design: ${d.name}, ${shot.name}${shot.cam ? `. ${shot.cam}` : ''}`) }) },
      h('img', { src: shot.url, alt: `${shot.name} mockup`, width: shot.w, height: shot.h })),
    h('figcaption', {}, h('strong', {}, shot.name), h('span', {}, shot.note), shot.cam && h('span', { class: 'cam' }, shot.cam)),
  )));
}

function renderDetails(d, brief) {
  const names = new Map(designThings(brief, true).map((it) => [it.id, (it.hero ? '★ ' : it.product ? '☆ ' : '') + it.name]));
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

// ---------- Copy for ChatGPT ----------

/** Copies text, falling back to a selected textarea where the clipboard API is blocked. */
async function copyText(text, area) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!area) return false;
    area.focus();
    area.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
}

async function dataUrlToFile(url, name) {
  const blob = await (await fetch(url)).blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

/**
 * Sheet that packs the design on screen for ChatGPT: a prompt to paste and the photos to attach
 * (a sample frame as the layout, an optional photo of the real room, then the products and props).
 */
function openChatGpt() {
  const d = state.designs[state.active];
  if (!d) return;
  if (shown.index !== state.active || !shown.shots.length) {
    state.message = { text: 'The sample frames are still rendering. Try again in a moment.' };
    renderBar();
    return;
  }
  const brief = state.designBrief || state.brief;
  const things = designThings(brief, true);
  const mood = MOODS.find((m) => m.name === brief.mood);
  const camera = CAMERAS.find((c) => c.id === brief.camera);
  const shots = shown.shots;
  let frame = 0;
  let background = null; // data URL of the real room, for this pack only
  let edited = false;
  let pack;

  const area = h('textarea', { 'aria-label': 'Prompt for ChatGPT', oninput: () => { edited = true; } });
  const frames = h('div', { class: 'gpt-frames', role: 'group', 'aria-label': 'Layout frame' });
  const photos = h('div', { class: 'gpt-photos' });
  const msg = h('p', { class: 'help', role: 'status' });
  const bgInput = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    background = await fileToDataUrl(f, 1600);
    build();
  } });

  const urlOf = (p) => (p.kind === 'layout' ? shots[frame].url : p.kind === 'background' ? background : p.item.thumb);
  const labelOf = (p) => (p.kind === 'layout' ? `Layout · ${shots[frame].name}` : p.kind === 'background' ? 'Your room' : p.item.name);

  function build() {
    const { photos: list, dropped } = chatgptPhotos(d, things, { background: Boolean(background) });
    pack = list;
    if (!edited) area.value = chatgptPrompt({ design: d, brief, things, photos: list, dropped, mood, camera, frameName: shots[frame].name });
    frames.replaceChildren(...shots.map((s, i) => h('button', {
      type: 'button', 'aria-pressed': String(i === frame),
      onclick: () => { frame = i; build(); },
    }, h('img', { src: s.url, alt: '' }), h('span', {}, s.name))));
    photos.replaceChildren(
      ...list.map((p, i) => h('figure', {},
        h('img', { src: urlOf(p), alt: labelOf(p) }),
        h('figcaption', { title: labelOf(p) }, `${i + 1}. ${labelOf(p)}`))),
      h('figure', {},
        h('button', { type: 'button', class: 'gpt-add', onclick: () => (background ? (background = null, build()) : bgInput.click()) },
          background ? 'Remove room photo' : '+ Photo of the real room (optional)'),
        h('figcaption', {}, background ? 'Room photo added' : 'Background')),
    );
    msg.textContent = dropped.length ? `ChatGPT takes up to ${list.length} photos at once, so ${dropped.map((t) => t.name).join(', ')} ${dropped.length === 1 ? 'is' : 'are'} described in words only.` : '';
  }

  async function files() {
    return Promise.all(pack.map((p, i) => dataUrlToFile(urlOf(p), photoFileName(p, i))));
  }
  async function copyPrompt() {
    const ok = await copyText(area.value, area);
    msg.textContent = ok ? 'Prompt copied. Paste it in ChatGPT after attaching the photos.' : 'Could not copy. Select the prompt and copy it by hand.';
    return ok;
  }
  async function savePhotos() {
    const list = await files();
    for (const f of list) {
      const url = URL.createObjectURL(f);
      h('a', { href: url, download: f.name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      await new Promise((r) => setTimeout(r, 250)); // browsers drop downloads fired all at once
    }
    msg.textContent = `Saved ${list.length} photos, numbered in the order the prompt uses them.`;
  }
  async function send() {
    await copyText(area.value, area);
    const list = await files();
    if (!navigator.canShare?.({ files: list })) return savePhotos();
    try {
      await navigator.share({ files: list, text: area.value, title: `Set design: ${d.name}` });
      msg.textContent = 'Sent. If the prompt did not come through, it is copied: paste it in the ChatGPT message.';
    } catch (err) {
      if (err?.name !== 'AbortError') msg.textContent = `Could not open the share sheet (${err.message}). Use Save photos instead.`;
    }
  }

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  const phone = onPhone() && Boolean(navigator.canShare);
  const box = h('div', { class: 'sheet gpt-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Copy for ChatGPT', onclick: (e) => { if (e.target === box) close(); } },
    h('div', { class: 'sheet-in' },
      h('h2', {}, 'Realistic preview in ChatGPT'),
      h('ol', { class: 'gpt-steps' },
        phone
          ? [h('li', {}, h('strong', {}, 'Send to ChatGPT'), ' below and pick the ChatGPT app.'), h('li', {}, 'If the text did not come along, paste it: it is already copied.')]
          : [h('li', {}, h('strong', {}, 'Save photos'), ' and ', h('strong', {}, 'Copy prompt'), '.'), h('li', {}, 'In ChatGPT, attach all the photos, paste the prompt and send.')],
        h('li', {}, 'Ask for changes in the same chat, e.g. "warmer light" or "move the serum to the left".'),
      ),
      h('strong', {}, 'Layout frame'),
      frames,
      h('strong', {}, 'Photos to attach'),
      photos,
      bgInput,
      h('strong', {}, 'Prompt'),
      area,
      msg,
      h('div', { class: 'gpt-actions' },
        phone && h('button', { type: 'button', class: 'btn primary', onclick: send }, 'Send to ChatGPT'),
        h('button', { type: 'button', class: phone ? 'btn' : 'btn primary', onclick: copyPrompt }, 'Copy prompt'),
        h('button', { type: 'button', class: 'btn', onclick: savePhotos }, 'Save photos'),
        h('a', { class: 'btn', href: 'https://chatgpt.com/', target: '_blank', rel: 'noopener' }, 'Open ChatGPT'),
        h('button', { type: 'button', class: 'btn', onclick: close }, 'Close'),
      ),
      h('p', { class: 'help' }, 'ChatGPT can change small details like label text. Use the picture as a look for the set, not as a product photo.'),
    ));
  build();
  document.body.append(box);
}

// ---------- Start ----------

/** Hooks from main.js: the shared picture viewer, and pinning a frame to a shoot (null when not connected). */
const tool = { openLightbox: () => {}, pinToShoot: () => null };

/** The Set Designer becomes visible: show whichever step the person was on. */
export function showSetDesigner() {
  goto(state.step);
}

export async function initSetDesigner(hooks = {}) {
  Object.assign(tool, hooks);
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
  $('gptBtn').addEventListener('click', openChatGpt);
  $('pCat').append(...CATEGORIES.map((c) => h('option', { value: c }, c)));
  $('pStatus').append(...STATUSES.map((s) => h('option', { value: s.id }, s.name)));
  $('pSearch').addEventListener('input', (e) => { state.filter.q = e.target.value; renderItems(); });
  $('pCat').addEventListener('change', (e) => { state.filter.category = e.target.value; renderItems(); });
  $('pStatus').addEventListener('change', (e) => { state.filter.status = e.target.value; renderItems(); });
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

  const [items, brief, designs, products] = await Promise.all([load('items'), load('brief'), load('designs'), load('products')]);
  if (Array.isArray(items)) state.items = items.map(({ pending, ...it }) => it);
  if (Array.isArray(products)) state.products = products;
  if (brief) {
    for (const key of Object.keys(DEFAULT_BRIEF)) if (brief[key] != null) state.brief[key] = brief[key];
    if (!CAMERAS.some((c) => c.id === state.brief.camera)) state.brief.camera = 'front';
    if (!brief.setType) state.brief.setType = 'room'; // briefs saved before tabletop existed were room sets
    // Briefs saved when only one product could be featured.
    if (!Array.isArray(brief.products)) state.brief.products = brief.product ? [brief.product] : [];
    state.brief.furniture = { ...DEFAULT_BRIEF.furniture, ...state.brief.furniture };
  }
  // Older versions marked one item as the hero. That item becomes the featured product.
  const oldHero = state.items.find((it) => it.hero);
  if (oldHero) {
    if (!state.products.length) {
      state.items = state.items.filter((it) => it !== oldHero);
      const { hero, ...rest } = oldHero;
      state.products.push({ ...rest, category: 'Other', useCut: Boolean(rest.cut) });
      state.brief.products = [rest.id];
      saveProducts();
      saveBrief();
    }
    for (const it of state.items) delete it.hero;
    saveItems();
  }
  state.brief.products = state.brief.products.filter((id) => state.products.some((p) => p.id === id));
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
  chip.classList.toggle('on', state.ai);

  renderItems();
  renderBrief();
  backfillCutouts();
}
