// Copy for ChatGPT: prompt and photo order (public/set-designer/chatgpt.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatgptPhotos, chatgptPrompt, photoFileName, MAX_PHOTOS } from '../public/set-designer/chatgpt.js';

const hero = { id: 'p1', name: '4EVER GLOW Serum', product: true, hero: true, w: 4, h: 12, d: 4, thumb: 'data:p1' };
const second = { id: 'p2', name: 'SPF50 Sunscreen', product: true, hero: false, w: 5, h: 14, d: 3, thumb: 'data:p2' };
const vase = { id: 'i1', name: 'White vase', product: false, w: 10, h: 22, d: 10, material: 'Ceramic', thumb: 'data:i1' };
const things = [vase, second, hero];
const design = {
  name: 'Soft glow', concept: 'Bright white set with a pink rim.',
  palette: [{ role: 'Backdrop', hex: '#f4f3f1' }, { role: 'Accent', hex: '#e0626b' }],
  wall_suggestion: 'White sweep.', floor_suggestion: 'White acrylic.',
  furniture: [{ label: 'Plinth A', w_cm: 20, d_cm: 20, h_cm: 30, x_cm: -20, z_cm: 0, note: '' }],
  placements: [
    { item_id: 'i1', on: 'Table top', x_cm: 30, z_cm: -10, y_cm: 0 },
    { item_id: 'p2', on: 'Table top', x_cm: -25, z_cm: 5, y_cm: 0 },
    { item_id: 'p1', on: 'Plinth A', x_cm: 0, z_cm: 0, y_cm: 30, rotation_deg: 15, note: 'Label to camera.' },
  ],
  lights: [{ name: 'Key', fixture: 'white', kelvin: 5600, intensity_pct: 80, modifier: 'softbox', x_cm: -60, y_cm: 120, z_cm: 60, aim: 'hero', color_hex: '#ffffff' }],
  color_combinations: [], styling_tips: ['Wipe fingerprints off the bottles.'], left_out: [],
  person: { present: false }, camera_note: 'Phone at 2× zoom.',
};
const brief = { setType: 'tabletop', tableW: 120, tableD: 70, frame: '9:16', mood: 'BTY studio', text: 'Keep it clean.', surfaces: '' };

test('photos go layout, room, hero product, other products, then props', () => {
  const { photos, dropped } = chatgptPhotos(design, things, { background: true });
  assert.deepEqual(photos.map((p) => p.kind + (p.item ? ':' + p.item.id : '')), ['layout', 'background', 'product:p1', 'product:p2', 'prop:i1']);
  assert.equal(dropped.length, 0);
  assert.deepEqual(photos.map(photoFileName), ['01-layout.jpg', '02-background.jpg', '03-product-4ever-glow-serum.jpg', '04-product-spf50-sunscreen.jpg', '05-prop-white-vase.jpg']);
});

test('only placed items are attached, and the count stays under the limit', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ id: 'x' + i, name: 'Prop ' + i, w: 5, h: 5, d: 5 }));
  const d = { ...design, placements: many.map((t) => ({ item_id: t.id, on: 'Table top', x_cm: 0, z_cm: 0 })) };
  const { photos, dropped } = chatgptPhotos(d, [...many, { id: 'unused', name: 'Not placed', w: 1, h: 1, d: 1 }], {});
  assert.equal(photos.length, MAX_PHOTOS);
  assert.equal(dropped.length, 14 + 1 - MAX_PHOTOS);
  assert.ok(!photos.some((p) => p.item?.id === 'unused'));
});

test('the prompt numbers photos to match and keeps the product rules', () => {
  const { photos, dropped } = chatgptPhotos(design, things, {});
  const text = chatgptPrompt({ design, brief, things, photos, dropped, mood: { name: 'BTY studio', say: 'White sweep, white blocks, soft glow' }, camera: { name: 'Straight on', say: 'Facing the back wall at chest height' }, frameName: 'Wide shot' });
  assert.match(text, /Photo 1: a rough 3D layout of this set, seen from the camera \(wide shot\)/);
  assert.match(text, /Photo 2: BTY product "4EVER GLOW Serum" \(the main product/);
  assert.match(text, /Photo 4: prop "White vase", about 10 cm wide, 22 cm tall, ceramic\./);
  assert.match(text, /Do not redraw, translate, blur or invent any label text/);
  assert.match(text, /A tabletop set about 120 cm wide and 70 cm deep/);
  assert.match(text, /- BTY 4EVER GLOW Serum \(photo 2\): on the plinth a, in the centre, turned 15°\. Label to camera\./);
  assert.match(text, /- Key: white light, about 5600K, 80% power, softbox, 60 cm left of centre, 60 cm towards the camera, 120 cm high, aimed at the hero\./);
  assert.match(text, /Frame: 9:16 \(vertical\)\./);
  assert.match(text, /NOTES FROM THE TEAM: Keep it clean\./);
  assert.doesNotMatch(text, /room or backdrop/);
});

test('a room photo is described when attached, and dropped items are named', () => {
  const { photos } = chatgptPhotos(design, things, { background: true });
  const text = chatgptPrompt({ design, brief: { ...brief, setType: 'room', roomW: 300, roomD: 250, frame: '16:9' }, things, photos, dropped: [{ name: 'Tray' }] });
  assert.match(text, /Photo 2: the real room or backdrop where we will shoot/);
  assert.match(text, /A room set about 300 cm wide and 250 cm deep/);
  assert.match(text, /No photo attached for Tray/);
  assert.match(text, /Frame: 16:9 \(horizontal\)\./);
});
