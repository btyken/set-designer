// Colour helpers plus the built-in rule-based designer used when no API key is set.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return rgbToHex(f(0), f(8), f(4));
}

// Approximate colour of a white light at a given temperature.
export function kelvinToHex(k) {
  const t = clamp(k, 1000, 12000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return rgbToHex(r, g, b);
}

export function textOn(hex) {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#14110f' : '#ffffff';
}


// ---------- Built-in room-set designer ----------
// Origin is the centre of the set floor. x: left(-) to right(+) from the camera.
// z: back wall (-) to camera (+). y: height above the floor. All in centimetres.

export const FURNITURE = {
  table: { label: 'Table', say: '120 × 60 cm, 75 high', w: 120, d: 60, h: 75 },
  shelf: { label: 'Shelf unit', say: '80 wide, 160 high', w: 80, d: 30, h: 160, levels: [42, 82, 122, 160] },
  plinths: { label: 'Plinths or boxes', say: 'Three, 35 to 90 high' },
  side_table: { label: 'Side table', say: 'Round, 45 across', w: 45, d: 45, h: 55 },
};

const MOODS = {
  // Matches the 2026 BTY Advance product shoot: white paper sweep, white blocks, a glow on the backdrop.
  'BTY studio': {
    sat: 0, wallL: 60, floor: ['#dddcd9', 'paper'], furn: '#f6f5f3', key: 5200, keyPct: 66, rimPct: 22, ambient: 18,
    studio: true, accent: '#e0626b',
    wallSay: 'White seamless paper, curved down onto the floor so there is no corner line.',
    floorSay: 'The same white paper carried under the whole set.',
  },
  'Clean minimal': { sat: 0.3, wallL: 86, floor: ['#bdb8af', 'concrete'], furn: '#f4f2ee', key: 5600, keyPct: 80, rimPct: 30, ambient: 55 },
  'Warm cozy': { sat: 0.7, wallL: 80, floor: ['#a9794c', 'wood'], furn: '#b98b5a', key: 3400, keyPct: 70, rimPct: 45, ambient: 38, shift: 25 },
  'Moody dark': { sat: 0.8, wallL: 16, floor: ['#2a2826', 'concrete'], furn: '#2c2c30', key: 4300, keyPct: 60, rimPct: 75, ambient: 12 },
  'Bold colorful': { sat: 1.15, wallL: 58, floor: ['#d9d5cd', 'concrete'], furn: null, key: 5600, keyPct: 75, rimPct: 80, ambient: 45 },
  Luxe: { sat: 0.55, wallL: 13, floor: ['#1c1a18', 'wood'], furn: '#19191b', key: 4000, keyPct: 62, rimPct: 65, ambient: 14, gold: true },
  'Fresh natural': { sat: 0.5, wallL: 86, floor: ['#c8a777', 'wood'], furn: '#d8be98', key: 5200, keyPct: 80, rimPct: 28, ambient: 55 },
};

// Positions are fractions of the room width (x) and depth (z). Plinths: [x, z, height].
const LAYOUTS = [
  {
    name: 'Centred table',
    concept: 'The table sits in the middle as the main stage, with the shelf behind on the left and plinths stepping up on the right. Balanced and easy to frame.',
    tip: 'Keep the tallest pieces at the back and outer edges so the middle of the frame stays open.',
    table: [0, -0.04], shelfX: -0.33, side: [-0.3, 0.14],
    plinths: [[0.24, -0.2, 90], [0.33, -0.02, 60], [0.21, 0.12, 35]],
    floor: [[0.46, -0.3], [-0.46, 0.1]], hero: ['table', 'plinth', 'side', 'floor'], side_sign: -1,
  },
  {
    name: 'Off-centre stage',
    concept: 'The table moves right of centre and the plinths gather on the left, leaving a gap between the two groups. The gap gives the eye a rest and leaves room for text.',
    tip: 'Let the left group overlap slightly from the camera so it reads as one cluster.',
    table: [0.17, 0], shelfX: -0.35, side: [0.42, 0.16],
    plinths: [[-0.2, -0.1, 90], [-0.31, 0.06, 60], [-0.12, 0.13, 35]],
    floor: [[0.46, -0.34], [-0.03, -0.36]], hero: ['table', 'plinth', 'side', 'floor'], side_sign: 1,
  },
  {
    name: 'Layered plinths',
    concept: 'Plinths at three heights carry the main pieces in the middle of the set, with the table pushed back as a second layer. More depth than a single surface.',
    tip: 'Stagger the plinths front to back so no two tops line up from the camera.',
    table: [0.3, -0.27], shelfX: -0.36, side: [0.37, 0.1],
    plinths: [[-0.04, -0.08, 90], [0.11, 0.05, 60], [-0.17, 0.13, 35]],
    plinthsWithPerson: [[-0.22, 0, 90], [0.21, -0.04, 60], [0.29, 0.11, 35]],
    floor: [[-0.16, -0.36], [0.46, 0.14]], hero: ['plinth', 'table', 'side', 'floor'], side_sign: -1,
  },
];

function baseHue(items, brief) {
  if (brief.brand?.length) return hexToHsl(brief.brand[0])[0];
  let x = 0;
  let y = 0;
  for (const it of items) {
    const c = it.colors?.[0];
    if (!c) continue;
    const [h, s] = hexToHsl(c);
    x += Math.cos((h * Math.PI) / 180) * s;
    y += Math.sin((h * Math.PI) / 180) * s;
  }
  return x || y ? ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 : 28;
}

function buildSet(L, brief, colors) {
  const W = brief.roomW;
  const D = brief.roomD;
  const has = brief.furniture || {};
  const withPerson = brief.person && brief.person !== 'none';
  const furniture = [];
  const surfaces = [];
  const inX = (x, w) => clamp(x, -W / 2 + w / 2 + 5, W / 2 - w / 2 - 5);
  const inZ = (z, d) => clamp(z, -D / 2 + d / 2 + 4, D / 2 - d / 2 - 5);
  let table = null;

  if (has.table) {
    const t = FURNITURE.table;
    table = { id: 'table', type: 'table', label: 'Table', x_cm: inX(L.table[0] * W, t.w), z_cm: inZ(L.table[1] * D, t.d), rotation_deg: 0, w_cm: t.w, d_cm: t.d, h_cm: t.h, color_hex: colors.furn, note: 'Main surface. Clear everything off it first.' };
    furniture.push(table);
    surfaces.push({ key: 'table', on: 'Table', x: table.x_cm, z: table.z_cm, y: t.h, w: t.w - 14, d: t.d, maxH: Infinity, items: [] });
  }
  if (has.shelf) {
    const s = FURNITURE.shelf;
    const f = { id: 'shelf', type: 'shelf', label: 'Shelf unit', x_cm: inX(L.shelfX * W, s.w), z_cm: -D / 2 + s.d / 2 + 4, rotation_deg: 0, w_cm: s.w, d_cm: s.d, h_cm: s.h, levels_cm: s.levels, color_hex: colors.furn, note: 'Against the back wall.' };
    furniture.push(f);
    s.levels.forEach((y, i) => {
      const top = i === s.levels.length - 1;
      surfaces.push({ key: 'shelf', on: top ? 'Shelf, top' : `Shelf, level ${i + 1}`, x: f.x_cm, z: f.z_cm, y, w: s.w - 12, d: s.d, maxH: top ? Infinity : s.levels[i + 1] - y - 6, items: [] });
    });
  }
  if (has.plinths) {
    const list = (withPerson && L.plinthsWithPerson) || L.plinths;
    list.forEach(([x, z, h], i) => {
      const w = h < 50 ? 40 : 35;
      const f = { id: `plinth${i + 1}`, type: 'plinth', label: `Plinth ${h} cm`, x_cm: inX(x * W, w), z_cm: inZ(z * D, w), rotation_deg: i === 1 ? 12 : 0, w_cm: w, d_cm: w, h_cm: h, color_hex: colors.plinth, note: i === 0 ? 'Tallest plinth, furthest back.' : i === 2 ? 'Lowest plinth, nearest the camera.' : 'Middle height.' };
      furniture.push(f);
      surfaces.push({ key: 'plinth', on: f.label, x: f.x_cm, z: f.z_cm, y: h, w: w + 6, d: w, maxH: Infinity, items: [] });
    });
  }
  if (has.side_table) {
    const s = FURNITURE.side_table;
    const f = { id: 'side', type: 'side_table', label: 'Side table', x_cm: inX(L.side[0] * W, s.w), z_cm: inZ(L.side[1] * D, s.d), rotation_deg: 0, w_cm: s.w, d_cm: s.d, h_cm: s.h, color_hex: colors.furn, note: 'Lower second surface.' };
    furniture.push(f);
    surfaces.push({ key: 'side', on: 'Side table', x: f.x_cm, z: f.z_cm, y: s.h, w: s.w - 4, d: s.d, maxH: Infinity, items: [] });
  }
  L.floor.forEach(([x, z], i) => {
    surfaces.push({ key: 'floor', on: 'Floor', x: inX(x * W, 40), z: inZ(z * D, 40), y: 0, w: 70, d: 40, maxH: Infinity, items: [], slot: i });
  });

  let person = { present: false, pose: 'standing', x_cm: 0, z_cm: 0, note: '' };
  if (withPerson) {
    const seated = brief.person === 'seated';
    const px = table ? table.x_cm : (L.plinthsWithPerson ? 0 : L.side_sign * -0.05 * W);
    const pz = table ? inZ(table.z_cm - table.d_cm / 2 - (seated ? 38 : 30), 40) : inZ(-0.12 * D, 40);
    person = { present: true, pose: seated ? 'seated' : 'standing', x_cm: px, z_cm: pz, note: table ? `${seated ? 'Seated' : 'Standing'} behind the table, facing the camera.` : `${seated ? 'Seated' : 'Standing'} at this mark, facing the camera.` };
    if (seated) {
      furniture.push({ id: 'chair', type: 'chair', label: 'Chair', x_cm: px, z_cm: pz, rotation_deg: 0, w_cm: 45, d_cm: 45, h_cm: 90, color_hex: colors.furn, note: 'For the person on camera.' });
    }
  }
  return { furniture, surfaces, person, table };
}

function dress(items, set, L, person) {
  const { surfaces } = set;
  const GAP = 4;
  const used = (s) => s.items.reduce((sum, it) => sum + it.w + GAP, 0);
  const fits = (s, it) => it.h <= s.maxH && used(s) + it.w <= s.w + (s.items.length ? 0 : 12);
  const onlyFloor = surfaces.every((s) => s.key === 'floor');
  const hero = items.find((it) => it.hero);
  const rest = items.filter((it) => it !== hero).sort((a, b) => b.h - a.h);
  let heroSurface = null;
  const left = [];

  if (hero) {
    for (const key of L.hero) {
      const options = surfaces.filter((s) => s.key === key && fits(s, hero)).sort((a, b) => b.y - a.y);
      const pick = key === 'plinth' && person.present ? options[options.length > 1 ? 1 : 0] : options[0];
      if (pick) {
        pick.items.push(hero);
        heroSurface = pick;
        break;
      }
    }
    if (!heroSurface) left.push({ item_id: hero.id, reason: 'No surface is wide enough for it.' });
  }

  for (const it of rest) {
    const tall = it.h >= 50;
    const bookish = (it.shape === 'box' || it.shape === 'flat') && it.h < 16;
    const rank = tall
      ? { floor: 0, table: 4, side: 6, plinth: 7, shelf: 9 }
      : bookish
        ? { shelf: 0, table: 2, side: 3, plinth: 5, floor: 20 }
        : { plinth: 0, shelf: 1, table: 2, side: 2, floor: it.h >= 30 || onlyFloor ? 6 : 20 };
    const options = surfaces
      .filter((s) => fits(s, it) && rank[s.key] < 20 && !(s.key === 'plinth' && s.items.length))
      .map((s) => ({ s, score: rank[s.key] + s.items.length * 4 + (s === heroSurface ? 3 : 0) + (s.key === 'shelf' ? Math.abs(s.y - 100) / 60 : 0) }))
      .sort((a, b) => a.score - b.score);
    if (options.length) options[0].s.items.push(it);
    else left.push({ item_id: it.id, reason: 'The set is full. Swap it in for a similar-sized piece if you prefer it.' });
  }

  const placements = [];
  for (const s of surfaces) {
    const list = [...s.items];
    const hi = list.findIndex((it) => it.hero);
    if (hi >= 0 && list.length > 1) {
      const [h] = list.splice(hi, 1);
      list.splice(Math.floor(list.length / 2), 0, h);
    }
    const total = list.reduce((sum, it) => sum + it.w, 0);
    const gap = Math.max(GAP, (s.w - total) / (list.length + 1));
    let cursor = s.x - (total + gap * (list.length - 1)) / 2;
    list.forEach((it, i) => {
      const x = list.length === 1 ? s.x : cursor + it.w / 2;
      cursor += it.w + gap;
      const depthShift = s.key === 'table' ? (it.hero ? s.d * 0.18 : (i % 2 ? -1 : 1) * s.d * 0.08) : 0;
      placements.push({
        item_id: it.id,
        x_cm: Math.round(x * 10) / 10,
        y_cm: s.y,
        z_cm: Math.round((s.z + depthShift) * 10) / 10,
        rotation_deg: it.hero ? 0 : Math.round(-x / 20),
        on: s.on,
        note: it.hero ? 'Focal point. Label square to the camera.' : s.key === 'floor' ? 'On the floor, to anchor the edge of the frame.' : s.key === 'shelf' ? 'Background layer.' : 'Supporting piece.',
      });
    });
  }
  placements.sort((a, b) => (items.find((i) => i.id === b.item_id)?.hero ? 1 : 0) - (items.find((i) => i.id === a.item_id)?.hero ? 1 : 0));
  return { placements, left_out: left };
}

export function localDesigns(items, brief) {
  const mood = MOODS[brief.mood] || MOODS['Clean minimal'];
  const hue = baseHue(items, brief) + (mood.shift || 0);
  const W = brief.roomW;
  const D = brief.roomD;
  const schemes = [
    { label: 'Complementary', accent: hue + 180, second: hue + 150 },
    { label: 'Analogous', accent: hue + 35, second: hue - 35 },
    { label: 'Split complementary', accent: hue + 150, second: hue + 210 },
  ];

  return LAYOUTS.map((L, i) => {
    const sc = schemes[i];
    const s = (v) => v * mood.sat;
    const wall = hslToHex(hue + (i === 1 ? 18 : 0), s(20), mood.wallL);
    const main = hslToHex(hue, s(60), 50);
    const accent = mood.gold ? '#c9a24a' : mood.studio ? (brief.brand?.[0] || mood.accent) : hslToHex(sc.accent, s(75), 55);
    const second = hslToHex(sc.second, s(70), 52);
    const furn = mood.furn || '#f3f1ec';
    const plinth = mood.furn ? furn : main;
    const set = buildSet(L, brief, { furn, plinth });
    const { placements, left_out } = dress(items, set, L, set.person);
    const keyK = mood.key + (i === 1 ? -500 : i === 2 ? 400 : 0);
    const side = L.side_sign;
    const hasHero = placements.some((p) => items.find((it) => it.id === p.item_id)?.hero);

    const lights = [
      {
        name: 'Key light', role: 'key', fixture: 'white', kelvin: keyK, color_hex: kelvinToHex(keyK), intensity_pct: mood.keyPct,
        x_cm: side * W * 0.55, y_cm: 210, z_cm: D / 2 + 70,
        aim: set.person.present ? 'person' : hasHero ? 'hero' : 'set', modifier: 'Large softbox',
        note: 'About 45 degrees to the side and above head height.',
      },
      {
        name: 'Fill', role: 'fill', fixture: 'white', kelvin: keyK, color_hex: kelvinToHex(keyK), intensity_pct: Math.round(mood.keyPct * 0.35),
        x_cm: -side * W * 0.6, y_cm: 140, z_cm: D / 2 + 50,
        aim: 'set', modifier: 'Bounced off a white card or wall', note: 'Opposite the key. Lower it for more contrast.',
      },
      mood.studio ? {
        name: 'Edge light', role: 'rim', fixture: 'white', kelvin: keyK, color_hex: kelvinToHex(keyK), intensity_pct: mood.rimPct,
        x_cm: -side * W * 0.5, y_cm: 190, z_cm: -D / 2 + 45,
        aim: set.person.present ? 'person' : 'set', modifier: 'Small panel, out of frame',
        note: 'From behind, just enough to lift white packaging off the white backdrop.',
      } : {
        name: 'Rim colour', role: 'rim', fixture: 'rgb', kelvin: 0, color_hex: accent, intensity_pct: mood.rimPct,
        x_cm: -side * W * 0.5, y_cm: 190, z_cm: -D / 2 + 45,
        aim: set.person.present ? 'person' : 'set', modifier: 'Bare tube, out of frame',
        note: 'From behind, to outline edges and separate the subject from the wall.',
      },
      mood.studio ? {
        name: 'Backdrop glow', role: 'background', fixture: 'white', kelvin: 4800, color_hex: kelvinToHex(4800), intensity_pct: 100,
        x_cm: [0, 0.12, -0.1][i] * W, y_cm: 40, z_cm: -D / 2 + 55,
        aim: 'backdrop', modifier: 'Spot with a snoot or barn doors, hidden behind the blocks',
        note: 'Makes the soft circle of light on the paper behind the product. Leave the edges of the backdrop darker.',
      } : {
        name: 'Wall wash', role: 'background', fixture: 'rgb', kelvin: 0, color_hex: i === 0 ? main : second, intensity_pct: Math.round(mood.rimPct * 0.8),
        x_cm: side * W * 0.25, y_cm: 25, z_cm: -D / 2 + 40,
        aim: 'backdrop', modifier: 'Bare, on the floor behind the furniture', note: 'Washes colour up the back wall.',
      },
    ];
    const washHex = mood.studio ? kelvinToHex(4800) : i === 0 ? main : second;

    return {
      name: `${L.name} · ${sc.label.toLowerCase()}`,
      concept: L.concept,
      wall_color: wall,
      floor_color: mood.floor[0],
      floor_finish: mood.floor[1],
      wall_suggestion: mood.wallSay ? mood.wallSay : mood.wallL < 30 ? 'Dark matte wall or black paper backdrop.' : 'Plain matte wall or seamless paper backdrop.',
      floor_suggestion: mood.floorSay ? mood.floorSay : mood.floor[1] === 'wood' ? 'Wood floor or wood-look vinyl.' : 'Plain floor, or a grey paper sweep.',
      ambient_pct: mood.ambient,
      palette: [
        { hex: wall, role: 'Wall' },
        { hex: mood.floor[0], role: 'Floor' },
        { hex: plinth, role: 'Furniture' },
        { hex: accent, role: mood.studio ? 'Packaging accent' : 'Accent light' },
        { hex: washHex, role: mood.studio ? 'Backdrop glow' : 'Wall wash' },
      ],
      furniture: set.furniture,
      person: set.person,
      placements,
      left_out,
      lights,
      color_combinations: [
        ...(mood.studio ? [{ name: 'White and coral', colors: ['#ffffff', accent], why: 'The look of the 2026 product shoot: an all-white set where the only colour comes from the packaging.' }] : []),
        { name: sc.label, colors: [accent, second], why: `Uses the ${sc.label.toLowerCase()} relationship to the main colour of your items.` },
        { name: 'Warm and cool', colors: ['#ff9a3c', '#2f7bff'], why: 'Orange against blue separates the subject from the wall on any set.' },
        { name: 'Tone on tone', colors: [hslToHex(hue, s(70), 50), hslToHex(hue + 18, s(60), 38)], why: 'Two shades of the main hue for a calm, single-colour look.' },
      ],
      styling_tips: [
        ...(mood.studio ? ['Keep every prop white or clear so the coral on the packaging is the only colour in frame.'] : []),
        L.tip,
        'Group pieces in odd numbers and vary their heights.',
        set.person.present ? 'Keep props below chest height in front of the person so nothing covers them.' : 'Leave clear space around the focal piece so it does not merge with its neighbours.',
      ],
      camera_note: brief.camera === 'high' ? 'Camera high, tilted down about 25 degrees.' : brief.camera === 'angle' ? 'Camera off to one side for a three-quarter view.' : 'Camera straight on, lens at about chest height.',
    };
  });
}
