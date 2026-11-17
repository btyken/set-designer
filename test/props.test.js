import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, usable, statusOf, suggestUses, findDuplicates, matchesFilter } from '../public/set-designer/props.js';
import { localDesigns } from '../public/set-designer/rules.js';

const prop = (id, o = {}) => ({ id, name: id, w: 10, h: 20, d: 10, shape: 'box', colors: ['#808080'], ...o });
const brief = { setType: 'tabletop', roomW: 120, roomD: 70, person: 'none', camera: 'front', frame: '16:9', mood: 'BTY studio', brand: [], furniture: {} };

test('there are eleven fixed categories', () => assert.equal(CATEGORIES.length, 11));

test('only available props are usable; old props with no status count as available', () => {
  assert.equal(usable(prop('a')), true);
  assert.equal(statusOf(prop('a', { status: 'nonsense' })), 'available');
  for (const status of ['unavailable', 'damaged', 'reserved']) assert.equal(usable(prop('a', { status })), false);
});

test('uses come from category and size', () => {
  assert.ok(suggestUses(prop('a', { w: 24, h: 10 })).includes('Riser'));
  assert.ok(suggestUses(prop('a', { w: 14, h: 60 })).includes('Background accent'));
  assert.ok(suggestUses(prop('a', { w: 6, h: 7 })).includes('Foreground detail'));
  assert.deepEqual(suggestUses(prop('a', { w: 200, h: 5, category: 'Fabric' })), ['Surface cover']);
});

test('a repeat photo is matched to the existing prop', () => {
  const vase = prop('vase', { w: 14, h: 30, colors: ['#2f7f86'] });
  const books = prop('books', { w: 24, h: 10, colors: ['#b5553c'] });
  const again = prop('new', { w: 15, h: 30, colors: ['#35858c'] });
  assert.deepEqual(findDuplicates(again, [books, vase]), [vase]);
});

test('different size, colour or category is not a match', () => {
  const vase = prop('vase', { w: 14, h: 30, colors: ['#2f7f86'], category: 'Vase or vessel' });
  assert.deepEqual(findDuplicates(prop('n', { w: 14, h: 45, colors: ['#2f7f86'] }), [vase]), []);
  assert.deepEqual(findDuplicates(prop('n', { w: 14, h: 30, colors: ['#e0626b'] }), [vase]), []);
  assert.deepEqual(findDuplicates(prop('n', { w: 14, h: 30, colors: ['#2f7f86'], category: 'Decor object' }), [vase]), []);
});

test('search and filters', () => {
  const vase = prop('Teal vase', { category: 'Vase or vessel', material: 'Ceramic', status: 'damaged' });
  assert.equal(matchesFilter(vase, { q: 'teal ceramic' }), true);
  assert.equal(matchesFilter(vase, { q: 'wood' }), false);
  assert.equal(matchesFilter(vase, { category: 'Fabric' }), false);
  assert.equal(matchesFilter(vase, { status: 'damaged' }), true);
  assert.equal(matchesFilter(vase, { status: 'available' }), false);
  assert.equal(matchesFilter(vase, {}), true);
});

test('every featured product is placed in each tabletop design, none on top of another', () => {
  const things = [
    ...['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => prop(id, { w: 6, h: 18 - i * 2, d: 6, product: true, hero: i === 0 })),
    prop('bowl', { w: 22, h: 9 }), prop('candle', { w: 8, h: 14 }),
  ];
  for (const d of localDesigns(things, brief)) {
    const placed = d.placements.filter((p) => p.item_id.startsWith('p'));
    assert.equal(placed.length, 5, d.name);
    assert.equal(d.placements[0].item_id, 'p1');
    for (const a of placed) for (const b of placed) {
      if (a === b) continue;
      assert.ok(Math.hypot(a.x_cm - b.x_cm, a.z_cm - b.z_cm) >= 6, `${d.name}: ${a.item_id} overlaps ${b.item_id}`);
    }
    for (const p of placed) assert.equal(p.rotation_deg, 0);
  }
});

test('in a room set the products share the table, not the shelf', () => {
  const room = { ...brief, setType: 'room', roomW: 300, roomD: 250, furniture: { table: true, shelf: true, plinths: true } };
  const things = ['p1', 'p2', 'p3'].map((id, i) => prop(id, { w: 6, h: 18, d: 6, product: true, hero: i === 0 }));
  for (const d of localDesigns(things, room)) {
    for (const p of d.placements) assert.ok(!p.on.startsWith('Shelf'), `${d.name}: ${p.item_id} on ${p.on}`);
  }
});
