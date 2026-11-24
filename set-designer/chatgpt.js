// "Copy for ChatGPT": turns a finished set design into an image prompt plus the reference photos
// to attach, so ChatGPT can render a realistic preview of the set. No API key: the person pastes
// the prompt and photos into ChatGPT themselves. Pure functions only (tested in node).

/** ChatGPT takes a limited number of photos per message; stay under it. */
export const MAX_PHOTOS = 10;

const cm = (n) => `${Math.round(n)} cm`;
const side = (v, neg, pos) => (Math.abs(v) < 8 ? null : `${cm(Math.abs(v))} ${v < 0 ? neg : pos}`);
/** Position on the set floor, from the camera's point of view. */
const spot = (o) => [side(o.x_cm || 0, 'left of centre', 'right of centre'), side(o.z_cm || 0, 'towards the back', 'towards the camera')].filter(Boolean).join(', ') || 'in the centre';
const size = (it) => `about ${Math.round(it.w)} cm wide, ${Math.round(it.h)} cm tall`;

/**
 * Which photos to attach, in order. The numbers in the prompt follow this order.
 * @param things  props and featured products, as the designer sees them (designThings)
 */
export function chatgptPhotos(design, things, { layout = true, background = false } = {}) {
  const byId = new Map(things.map((t) => [t.id, t]));
  const used = [];
  for (const p of design.placements || []) {
    const it = byId.get(p.item_id);
    if (it && !used.includes(it)) used.push(it);
  }
  // Products first (they must look exact), then props in the order they are placed.
  const products = used.filter((t) => t.product).sort((a, b) => Number(b.hero) - Number(a.hero));
  const props = used.filter((t) => !t.product);
  const list = [];
  if (layout) list.push({ kind: 'layout' });
  if (background) list.push({ kind: 'background' });
  for (const it of [...products, ...props]) list.push({ kind: it.product ? 'product' : 'prop', item: it });
  const kept = list.slice(0, MAX_PHOTOS);
  const dropped = list.slice(MAX_PHOTOS).map((p) => p.item);
  return { photos: kept, dropped };
}

/** The prompt to paste into ChatGPT, matching the photos from chatgptPhotos. */
export function chatgptPrompt({ design, brief, things, photos, dropped = [], mood, camera, frameName = 'Wide shot' }) {
  const num = new Map(photos.map((p, i) => [p.item?.id ?? p.kind, i + 1]));
  const ref = (it) => (num.has(it.id) ? ` (photo ${num.get(it.id)})` : '');
  const byId = new Map(things.map((t) => [t.id, t]));
  const tabletop = brief.setType === 'tabletop';
  const [fw, fh] = String(brief.frame || '16:9').split(':');
  const lines = [];
  const add = (...l) => lines.push(...l);

  add(
    'Create one photorealistic photo of a product video set for BTY Advance, a Philippine skincare and beauty brand. It should look like a real behind-the-camera frame from a studio shoot, shot on a good camera, not a 3D render or illustration.',
    '',
    'ATTACHED PHOTOS',
  );
  for (const [i, p] of photos.entries()) {
    const n = i + 1;
    if (p.kind === 'layout') add(`Photo ${n}: a rough 3D layout of this set, seen from the camera (${frameName.toLowerCase()}). Copy its arrangement, scale and camera angle, but make every surface, material and light look real.`);
    else if (p.kind === 'background') add(`Photo ${n}: the real room or backdrop where we will shoot. Build the set in this space and keep its walls, floor and windows as they are.`);
    else if (p.kind === 'product') add(`Photo ${n}: BTY product "${p.item.name}"${p.item.hero ? ' (the main product, the hero of the shot)' : ''}, ${size(p.item)}.`);
    else add(`Photo ${n}: prop "${p.item.name}", ${size(p.item)}${p.item.material && p.item.material !== 'Other' ? `, ${p.item.material.toLowerCase()}` : ''}.`);
  }
  add(
    '',
    'PRODUCTS MUST STAY EXACT',
    'Show the BTY products exactly as they appear in their photos: same bottle or jar shape, cap, colours, label layout, logo and printed text. Do not redraw, translate, blur or invent any label text. Do not add other brands or logos.',
    '',
    'THE SET',
    tabletop
      ? `A tabletop set about ${cm(brief.tableW)} wide and ${cm(brief.tableD)} deep, shot close.`
      : `A room set about ${cm(brief.roomW)} wide and ${cm(brief.roomD)} deep.`,
    `Look: ${design.name}. ${design.concept}`,
  );
  if (mood) add(`Mood: ${mood.name}, ${mood.say.toLowerCase()}.`);
  if (design.palette?.length) add(`Colours: ${design.palette.map((p) => `${p.role} ${p.hex}`).join('; ')}.`);
  if (design.wall_suggestion || design.floor_suggestion) add(`Wall: ${design.wall_suggestion || 'as in the layout'} Floor: ${design.floor_suggestion || 'as in the layout'}`);
  if (brief.surfaces) add(`Surfaces we have: ${brief.surfaces}.`);

  if (design.furniture?.length) {
    add('', 'FURNITURE');
    for (const f of design.furniture) add(`- ${f.label}: ${Math.round(f.w_cm)} × ${Math.round(f.d_cm)} cm, ${cm(f.h_cm)} tall, ${spot(f)}.${f.note ? ` ${f.note}` : ''}`);
  }
  if (design.person?.present) add('', `PERSON: a presenter ${design.person.pose === 'seated' ? 'seated' : 'standing'} ${spot(design.person)}, natural and relaxed, not looking at the camera unless the shot needs it.${design.person.note ? ` ${design.person.note}` : ''}`);

  add('', 'WHERE EACH ITEM GOES');
  for (const p of design.placements || []) {
    const it = byId.get(p.item_id);
    if (!it) continue;
    const bits = [`on the ${String(p.on || 'set').toLowerCase()}`, spot(p)];
    if (p.rotation_deg) bits.push(`turned ${Math.round(p.rotation_deg)}°`);
    add(`- ${it.product ? 'BTY ' : ''}${it.name}${ref(it)}: ${bits.join(', ')}.${p.note ? ` ${p.note}` : ''}`);
  }
  if (dropped.length) add(`(No photo attached for ${dropped.map((d) => d.name).join(', ')}: keep them simple and in the same colours as the palette.)`);

  if (design.lights?.length) {
    add('', 'LIGHTING');
    for (const l of design.lights) {
      const kind = l.fixture === 'white' ? `white light, about ${Math.round(l.kelvin)}K` : `coloured light ${l.color_hex}`;
      add(`- ${l.name}: ${kind}, ${Math.round(l.intensity_pct)}% power${l.modifier ? `, ${l.modifier}` : ''}, ${spot(l)}, ${cm(l.y_cm)} high, aimed at the ${l.aim === 'backdrop' ? 'back wall' : l.aim}.`);
    }
    add('Show the light as it falls on the set (soft shadows, highlights on glossy bottles). Do not show the light stands or fixtures in the frame.');
  }

  add('', 'CAMERA');
  if (camera) add(`${camera.name}: ${camera.say.toLowerCase()}.`);
  if (design.camera_note) add(design.camera_note);
  add(`Frame: ${fw}:${fh}${Number(fw) < Number(fh) ? ' (vertical)' : Number(fw) > Number(fh) ? ' (horizontal)' : ' (square)'}.`);

  if (design.styling_tips?.length) {
    add('', 'STYLING');
    for (const t of design.styling_tips) add(`- ${t}`);
  }
  if (brief.text) add('', `NOTES FROM THE TEAM: ${brief.text}`);
  add(
    '',
    'Keep real-world scale: the products are small next to the furniture. No captions, watermarks or extra text in the image. If something in this brief clashes with the photos, follow the photos.',
  );
  return lines.join('\n');
}

/** File names that keep the photos in prompt order when attached together. */
export function photoFileName(p, i) {
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
  const n = String(i + 1).padStart(2, '0');
  if (p.kind === 'layout') return `${n}-layout.jpg`;
  if (p.kind === 'background') return `${n}-background.jpg`;
  return `${n}-${p.kind}-${slug(p.item.name)}.jpg`;
}
