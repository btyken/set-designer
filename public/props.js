// Prop records: fixed lists, suggested uses, duplicate matching and search.
// Pure functions with no DOM, so they can be tested with `npm test`.

export const CATEGORIES = [
  'Block or riser', 'Backdrop', 'Fabric', 'Vase or vessel', 'Plant or flower', 'Tray or dish',
  'Book or paper', 'Candle or lamp', 'Furniture', 'Decor object', 'Other',
];
export const MATERIALS = ['Wood', 'Glass', 'Ceramic', 'Metal', 'Plastic', 'Acrylic', 'Paper', 'Fabric', 'Stone', 'Plant', 'Other'];
export const STATUSES = [
  { id: 'available', name: 'Available' },
  { id: 'reserved', name: 'Reserved' },
  { id: 'damaged', name: 'Damaged' },
  { id: 'unavailable', name: 'Unavailable' },
];

/** Props saved before statuses existed count as available. */
export const statusOf = (it) => (STATUSES.some((s) => s.id === it.status) ? it.status : 'available');
export const statusName = (it) => STATUSES.find((s) => s.id === statusOf(it)).name;
/** Only available props may appear in a design. */
export const usable = (it) => statusOf(it) === 'available';

/** What a prop is good for on set, worked out from its category and size. */
export function suggestUses(it) {
  const uses = [];
  const add = (u) => { if (!uses.includes(u)) uses.push(u); };
  const { w = 0, h = 0 } = it;
  if (it.category === 'Backdrop') add('Backdrop');
  if (it.category === 'Fabric') add('Surface cover');
  if (it.category === 'Block or riser') add('Riser');
  if (it.category === 'Tray or dish') add('Base for small pieces');
  if (it.category === 'Plant or flower') add('Colour and texture');
  if (it.category === 'Candle or lamp') add('Warm accent');
  if (it.category === 'Furniture') add('Main surface');
  if (h <= 12 && w >= 15 && !['Backdrop', 'Fabric'].includes(it.category)) add('Riser');
  if (h >= 30 && h >= w * 1.8) add('Background accent');
  if (h >= 15 && h < 30) add('Height balance');
  if (h < 12 && w < 15) add('Foreground detail');
  if (!uses.length) add('Supporting piece');
  return uses.slice(0, 3);
}

const rgb = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Distance between two hex colours, 0 (same) to about 441 (black against white). */
export function colourGap(a, b) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/**
 * Existing props that could be the same object as a newly photographed one:
 * close in height, width and main colour, and not of a different category.
 */
export function findDuplicates(candidate, props, max = 3) {
  const near = (a, b) => Math.abs(a - b) / Math.max(a, b, 0.1);
  const out = [];
  for (const p of props) {
    if (p === candidate || p.id === candidate.id) continue;
    if (candidate.category && p.category && candidate.category !== p.category) continue;
    const dh = near(candidate.h, p.h);
    const dw = near(candidate.w, p.w);
    if (dh > 0.15 || dw > 0.25) continue;
    const ca = candidate.colors?.[0];
    const cb = p.colors?.[0];
    const gap = ca && cb ? colourGap(ca, cb) : 0;
    if (gap > 70) continue;
    out.push({ prop: p, score: dh + dw + gap / 200 });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, max).map((o) => o.prop);
}

/** Search box plus category and status filters. Empty filters match everything. */
export function matchesFilter(it, { q = '', category = '', status = '' } = {}) {
  if (category && it.category !== category) return false;
  if (status && statusOf(it) !== status) return false;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [it.name, it.category, it.material, statusName(it), ...suggestUses(it)].filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}
