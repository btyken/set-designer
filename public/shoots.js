// Shoots: this week's B-roll shoots from the tracker sheet, how many clips are still needed,
// a place to report shots after the shoot, and a moodboard of pegs for each shoot.
import { $, h, openSheet } from './dom.js';
import {
  STATUSES, tracker, tokenFor, call, mondayOf, addDays, weekLabel, dayLabel, streamOf, remaining,
  weekTotals, groupShoots, checkReport,
} from './tracker.js';

const S = {
  week: mondayOf(),
  cache: new Map(), // weekStart → tracker response
  loading: false,
  message: null, // { text, error }
  lightbox: null,
};
const images = new Map(); // Drive file id → data URL, when the public thumbnail cannot load

const thumbUrl = (id, w = 800) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = (v) => (Number.isFinite(v) ? v : null);

export function initShoots({ openLightbox }) {
  S.lightbox = openLightbox;
  $('wkPrev').addEventListener('click', () => setWeek(addDays(S.week, -7)));
  $('wkNext').addEventListener('click', () => setWeek(addDays(S.week, 7)));
  $('wkNow').addEventListener('click', () => setWeek(mondayOf()));
  $('wkRefresh').addEventListener('click', () => load(true));
}

/** Can a picture be pinned to a shoot from here? Only when the tracker is set up. */
export const canPin = () => tracker.ready;

export function showShoots() {
  if (!tracker.ready) return renderConnect();
  $('shootConnect').hidden = true;
  document.querySelector('.wk-nav').hidden = false;
  render();
  load(false);
}

function setWeek(week) {
  S.week = week;
  S.message = null;
  render();
  load(false);
}

async function load(force) {
  if (!tracker.ready) return renderConnect();
  if (!force && S.cache.has(S.week)) return render();
  const week = S.week;
  S.loading = true;
  S.message = { text: 'Loading shoots from the tracker…' };
  render();
  try {
    const data = await call('week', { weekStart: week });
    S.cache.set(week, data);
    if (week === S.week) S.message = null;
  } catch (err) {
    if (err.auth) {
      tracker.setToken('');
      return renderConnect('That passcode did not work. Ask Sir Ken for the current one.');
    }
    if (week === S.week) S.message = { text: err.message, error: true };
  } finally {
    S.loading = false;
  }
  if (week === S.week) render();
}

// ---------- Connect ----------

function renderConnect(error = '') {
  for (const id of ['shootTargets', 'shootList']) $(id).replaceChildren();
  $('shootUnassigned').hidden = true;
  $('shootMsg').textContent = '';
  $('wkLabel').textContent = weekLabel(S.week);
  const url = h('input', { type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', value: tracker.url, autocomplete: 'off' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password' });
  const name = h('input', { type: 'text', value: tracker.name, placeholder: 'e.g. Maye', autocomplete: 'given-name' });
  const msg = h('p', { class: 'error', role: 'alert' }, error);
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Connect');
  const form = h('form', { class: 'connect' },
    h('h2', {}, 'Connect to the B-roll tracker'),
    h('p', { class: 'help' }, 'Shoots are read from the tracker sheet, and the shots you report are written back to it. You only do this once on each phone or computer.'),
    !tracker.urlFromConfig && h('label', {}, 'Tracker link', url),
    h('label', {}, 'Team passcode', pass),
    h('label', {}, 'Your name', name),
    msg, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const link = tracker.urlFromConfig ? tracker.url : url.value.trim();
    if (!tracker.urlFromConfig && !/^https:\/\/script\.google(usercontent)?\.com\//.test(link)) {
      msg.textContent = 'Paste the tracker link that starts with https://script.google.com/';
      return;
    }
    if (!pass.value.trim()) {
      msg.textContent = 'Enter the team passcode.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    msg.textContent = '';
    try {
      const token = await tokenFor(pass.value);
      await call('ping', {}, { url: link, token });
      if (!tracker.urlFromConfig) tracker.setUrl(link);
      tracker.setToken(token);
      tracker.setName(name.value.trim());
      showShoots();
    } catch (err) {
      msg.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  });
  $('shootConnect').replaceChildren(form);
  $('shootConnect').hidden = false;
  document.querySelector('.wk-nav').hidden = true;
}

// ---------- Main view ----------

function render() {
  const data = S.cache.get(S.week);
  const now = mondayOf();
  $('wkLabel').textContent = weekLabel(S.week);
  $('wkTitle').textContent = S.week === now ? "This week's shoots." : S.week === addDays(now, 7) ? "Next week's shoots." : S.week === addDays(now, -7) ? "Last week's shoots." : `Shoots, ${weekLabel(S.week)}.`;
  $('wkNow').setAttribute('aria-pressed', String(S.week === now));
  $('wkRefresh').disabled = S.loading;
  $('wkSheet').hidden = !data?.sheetUrl;
  if (data?.sheetUrl) $('wkSheet').href = data.sheetUrl;
  $('shootMsg').textContent = S.message?.text || '';
  $('shootMsg').className = 'shoot-msg' + (S.message?.error ? ' error' : '');
  if (!data) {
    $('shootTargets').replaceChildren();
    $('shootList').replaceChildren();
    $('shootUnassigned').hidden = true;
    return;
  }
  renderTargets(data);
  renderList(data);
}

function renderTargets(data) {
  const t = weekTotals(data.rows, data.targets);
  const card = (line, main) => {
    const pct = (v) => (line.target ? Math.min(100, (v / line.target) * 100) : 0);
    const met = line.target > 0 && line.need === 0;
    return h('div', { class: 'target' + (main ? ' main' : '') + (met ? ' met' : '') },
      h('small', {}, line.name),
      h('strong', {}, String(line.captured), h('span', {}, line.target ? ` / ${line.target}` : ' captured')),
      line.target > 0 && h('div', { class: 'bar-track', role: 'img', 'aria-label': `${line.captured} of ${line.target} captured, ${line.planned} planned` },
        h('i', { class: 'planned', style: `width:${pct(line.planned)}%` }),
        h('i', { class: 'done', style: `width:${pct(line.captured)}%` })),
      h('p', { class: 'need' }, !line.target ? 'No weekly target on the tracker.' : met ? 'Target reached.' : `${plural(line.need, 'more clip')} needed this week.`),
      h('p', { class: 'muted' }, `Planned ${line.planned} · QC passed ${line.qcPassed}`),
      line.target > 0 && line.unplanned > 0 && h('p', { class: 'warn' }, `Only ${line.planned} planned. Plan ${line.unplanned} more to reach the target.`));
  };
  $('shootTargets').replaceChildren(card(t.internal, true), card(t.massive), card(t.cbq), card(t.external, true));
  const un = t.unassigned;
  $('shootUnassigned').hidden = un.rows === 0;
  $('shootUnassigned').textContent = un.rows
    ? `${plural(un.rows, 'internal assignment')} (${un.planned} planned clips) ${un.rows === 1 ? 'has' : 'have'} no Video Stream yet, so ${un.rows === 1 ? 'it counts' : 'they count'} toward the internal total but not toward Massive or CBQ. Set Video Stream in SHOOT PLAN.`
    : '';
}

function renderList(data) {
  const shoots = groupShoots(data.rows);
  if (!shoots.length) {
    $('shootList').replaceChildren(h('div', { class: 'empty' },
      h('strong', {}, 'No shoots this week'),
      h('span', {}, 'Shoots appear here once they are added to SHOOT PLAN with a date in this week.'),
      data.sheetUrl && h('a', { class: 'btn', href: data.sheetUrl, target: '_blank', rel: 'noopener' }, 'Open the tracker')));
    return;
  }
  $('shootList').replaceChildren(...shoots.map((s) => shootCard(s, data)));
}

function shootCard(s, data) {
  const board = data.boards?.[s.key] || { pins: [], folderUrl: '' };
  const planned = s.rows.reduce((a, r) => a + (num(r.planned) || 0), 0);
  const captured = s.rows.reduce((a, r) => a + (num(r.captured) || 0), 0);
  const left = s.rows.reduce((a, r) => a + remaining(r), 0);
  const uniq = (key) => [...new Set(s.rows.map((r) => r[key]).filter(Boolean))];
  const refs = uniq('moodLink').filter((u) => u !== board.folderUrl); // links someone pasted, not the app's own folder
  const raws = uniq('rawFolder');
  const setNotes = uniq('setNotes');
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

  return h('article', { class: 'shoot' },
    h('header', { class: 'shoot-head' },
      h('div', {},
        h('p', { class: 'kicker' }, [dayLabel(s.date), s.timeBlock].filter(Boolean).join(' · ')),
        h('h2', { class: 'shoot-title' }, s.product || 'Untitled shoot'),
        h('div', { class: 'chips' },
          uniq('contentType').map((c) => h('span', { class: 'chip' }, c)),
          uniq('approval').map((a) => h('span', { class: 'chip' + (a === 'Approved' ? ' ok' : a === 'Rejected' ? ' bad' : '') }, `Pre-shoot: ${a}`)),
          !uniq('approval').length && h('span', { class: 'chip' }, 'Pre-shoot: not reviewed'))),
      h('div', { class: 'shoot-sum' + (planned && !left ? ' met' : '') },
        h('strong', {}, `${captured}`, h('span', {}, ` / ${planned}`)),
        h('span', {}, planned ? (left ? `clips captured · ${left} to go` : 'clips captured · all planned clips done') : 'no clips planned yet'))),
    setNotes.length > 0 && h('p', { class: 'set-notes' }, h('b', {}, 'Set, lighting, props, angles: '), setNotes.join(' / ')),
    h('div', { class: 'crew' }, s.rows.map((r) => crewRow(r))),
    h('section', { class: 'board' },
      h('div', { class: 'board-head' },
        h('h3', {}, 'Moodboard'),
        h('span', { class: 'muted' }, board.pins.length ? plural(board.pins.length, 'peg') : 'No pegs yet'),
        h('span', { class: 'board-links' },
          refs.map((u, i) => link(u, refs.length > 1 ? `Reference ${i + 1}` : 'Reference link')),
          board.folderUrl && link(board.folderUrl, 'Drive folder'),
          raws.map((u, i) => link(u, raws.length > 1 ? `RAW folder ${i + 1}` : 'RAW folder'))),
        h('label', { class: 'btn small' }, '+ Add pegs',
          h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) addPegs(s, files); } }))),
      board.pins.length
        ? h('div', { class: 'pegs' }, board.pins.map((p) => pegFigure(p, s)))
        : h('p', { class: 'help peg-empty' }, 'Add photos of the look to copy on set: angles, lighting, styling, hand poses. Everyone on this shoot sees the same board.')));
}

function crewRow(r) {
  const stream = streamOf(r);
  const left = remaining(r);
  const planned = num(r.planned);
  return h('div', { class: 'crew-row' },
    h('div', { class: 'who' }, h('strong', {}, r.member || 'Unassigned'),
      h('span', { class: stream === 'Internal - Unassigned' ? 'warn' : 'muted' }, stream === 'Internal - Unassigned' ? 'Internal, no stream set' : stream),
      r.task && h('span', { class: 'muted task' }, r.task)),
    h('dl', { class: 'nums' },
      h('div', {}, h('dt', {}, 'Planned'), h('dd', {}, planned == null ? '–' : String(planned))),
      h('div', {}, h('dt', {}, 'Captured'), h('dd', {}, r.captured == null ? '–' : String(r.captured))),
      h('div', {}, h('dt', {}, 'QC passed'), h('dd', {}, r.qcPassed == null ? '–' : String(r.qcPassed)))),
    h('div', { class: 'row-end' },
      h('span', { class: 'left' + (planned && !left ? ' met' : '') }, planned ? (left ? `${left} to go` : 'Done') : 'No plan'),
      r.status && h('span', { class: 'chip' }, r.status),
      h('button', { class: 'btn small', type: 'button', onclick: () => reportShots(r) }, r.captured == null ? 'Report shots' : 'Update')));
}

// ---------- Report shots ----------

function reportShots(r) {
  const captured = h('input', { type: 'number', min: 0, step: 1, inputMode: 'numeric', value: r.captured ?? '' });
  const qc = h('input', { type: 'number', min: 0, step: 1, inputMode: 'numeric', value: r.qcPassed ?? '', placeholder: 'Leave blank if not reviewed yet' });
  const status = h('select', {},
    h('option', { value: '' }, r.status ? `Keep "${r.status}"` : 'Leave blank'),
    STATUSES.filter((s) => s !== r.status).map((s) => h('option', { value: s }, s)));
  const live = h('p', { class: 'help' });
  const msg = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { class: 'btn primary', type: 'submit' }, 'Save to tracker');
  const update = () => {
    const c = Number(captured.value);
    const planned = num(r.planned) || 0;
    live.textContent = captured.value === '' ? `Planned: ${planned} clips.`
      : planned ? (c >= planned ? `That covers all ${planned} planned clips.` : `That leaves ${planned - c} of ${planned} planned clips to capture.`) : 'No planned clips on this row.';
  };
  captured.addEventListener('input', update);
  update();
  const form = h('form', { class: 'report' },
    h('h2', {}, `Report shots · ${r.member || 'Unassigned'}`),
    h('p', { class: 'help' }, `${r.product}, ${dayLabel(r.date)}${r.timeBlock ? `, ${r.timeBlock}` : ''}. Saved straight to SHOOT PLAN.`),
    h('label', {}, 'Clips captured', captured),
    live,
    h('label', {}, 'Clips that passed QC', qc),
    h('label', {}, 'Shoot status', status),
    msg,
    h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), save));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const problem = checkReport({ captured: captured.value, qcPassed: qc.value });
    if (problem) { msg.textContent = problem; return; }
    save.disabled = true;
    save.textContent = 'Saving…';
    msg.textContent = '';
    try {
      const out = await call('report', {
        row: r.row,
        expect: { date: r.date, product: r.product, member: r.member },
        captured: Number(captured.value),
        qcPassed: qc.value === '' ? null : Number(qc.value),
        status: status.value,
      });
      Object.assign(r, out.row);
      close();
      S.message = { text: `Saved: ${r.member} captured ${r.captured} clips.` };
      render();
    } catch (err) {
      msg.textContent = err.message;
      save.disabled = false;
      save.textContent = 'Save to tracker';
    }
  });
  const close = openSheet('Report shots', form);
  captured.focus();
}

// ---------- Moodboard ----------

function pegImg(p, w) {
  const img = h('img', { alt: p.note || p.name, loading: 'lazy', src: images.get(p.id) || thumbUrl(p.id, w) });
  img.addEventListener('error', async () => {
    if (img.dataset.fallback) return;
    img.dataset.fallback = '1';
    try {
      if (!images.has(p.id)) images.set(p.id, (await call('image', { fileId: p.id })).image);
      img.src = images.get(p.id);
    } catch { img.alt = 'Photo could not load'; }
  });
  return img;
}

function pegFigure(p, s) {
  return h('figure', { class: 'peg' },
    h('button', { type: 'button', class: 'peg-img', 'aria-label': `Open peg${p.note ? `: ${p.note}` : ''}`, onclick: () => openPeg(p, s) }, pegImg(p, 600)),
    (p.note || p.by) && h('figcaption', {}, p.note, p.by && h('span', { class: 'muted' }, p.note ? ` · ${p.by}` : p.by)));
}

function openPeg(p, s) {
  const url = images.get(p.id) || thumbUrl(p.id, 2000);
  S.lightbox({ name: p.note || s.product, url }, `peg-${p.id}`, {
    pin: false,
    onDelete: async () => {
      if (!confirm('Remove this peg from the moodboard? It moves to the Drive trash.')) return false;
      try {
        await call('remove', { fileId: p.id });
        const board = S.cache.get(S.week)?.boards?.[s.key];
        if (board) board.pins = board.pins.filter((x) => x.id !== p.id);
        render();
        return true;
      } catch (err) {
        alert(err.message);
        return false;
      }
    },
  });
}

/** A photo as a JPEG data URL, no larger than `max` pixels on its long side. */
async function toJpeg(src, max = 1600) {
  const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
  const img = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

function addPegs(s, files, presetNote = '') {
  const previews = h('div', { class: 'peg-previews' }, files.map((f) => h('img', { src: typeof f === 'string' ? f : URL.createObjectURL(f), alt: '' })));
  const note = h('textarea', { rows: 2, placeholder: 'What to copy: the angle, the light, the hand pose…', value: presetNote });
  const name = h('input', { type: 'text', value: tracker.name, placeholder: 'e.g. Maye' });
  const msg = h('p', { class: 'help', role: 'status' });
  const go = h('button', { class: 'btn primary', type: 'submit' }, `Add ${plural(files.length, 'peg')}`);
  const form = h('form', { class: 'report' },
    h('h2', {}, 'Add to moodboard'),
    h('p', { class: 'help' }, `${s.product}, ${dayLabel(s.date)}${s.timeBlock ? `, ${s.timeBlock}` : ''}.`),
    previews,
    h('label', {}, 'Note for the team (optional)', note),
    h('label', {}, 'Your name', name),
    msg,
    h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), go));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    go.disabled = true;
    tracker.setName(name.value.trim());
    let done = 0;
    try {
      for (const f of files) {
        msg.textContent = `Uploading ${done + 1} of ${files.length}…`;
        const out = await call('upload', {
          board: s.key,
          title: [s.date, s.product, s.timeBlock].filter(Boolean).join(' · '),
          name: (typeof f === 'string' ? 'set-design' : f.name.replace(/\.[^.]+$/, '')) || 'peg',
          note: note.value.trim(),
          by: name.value.trim(),
          image: await toJpeg(f),
        });
        done += 1;
        for (const data of S.cache.values()) {
          const b = data.boards?.[s.key];
          if (!b) continue;
          b.pins.push(out.pin);
          b.folderUrl = out.folderUrl;
          for (const r of data.rows) if (r.board === s.key && !r.moodLink) r.moodLink = out.folderUrl;
        }
      }
      close();
      S.message = { text: `Added ${plural(done, 'peg')} to the ${s.product} moodboard.` };
      render();
    } catch (err) {
      msg.textContent = `${done ? `${done} added, then: ` : ''}${err.message}`;
      msg.className = 'error';
      go.disabled = false;
      if (done) render();
    }
  });
  const close = openSheet('Add to moodboard', form);
}

/** Pin a picture made in the app (a sample frame) to one of this or next week's shoots. */
export async function pinImage(url, note) {
  const list = h('div', { class: 'dup-list' }, h('p', { class: 'muted' }, 'Loading shoots…'));
  const close = openSheet('Pin to a shoot',
    h('h2', {}, 'Pin to which shoot?'),
    h('p', { class: 'help' }, 'The picture goes on that shoot\'s moodboard so the crew can copy the set.'),
    list,
    h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
  const now = mondayOf();
  try {
    const weeks = [now, addDays(now, 7)];
    for (const w of weeks) if (!S.cache.has(w)) S.cache.set(w, await call('week', { weekStart: w }));
    const shoots = weeks.flatMap((w) => groupShoots(S.cache.get(w).rows).map((s) => ({ s, w })));
    list.replaceChildren(...(shoots.length
      ? shoots.map(({ s, w }) => h('button', {
        class: 'choice', type: 'button',
        onclick: () => { close(); S.week = w; addPegs(s, [url], note); },
      }, h('strong', {}, s.product || 'Untitled shoot'), h('span', {}, [dayLabel(s.date), s.timeBlock, plural(s.rows.length, 'person', 'people')].filter(Boolean).join(' · '))))
      : [h('p', { class: 'muted' }, 'No shoots on the tracker this week or next. Add the shoot to SHOOT PLAN first.')]));
  } catch (err) {
    list.replaceChildren(h('p', { class: 'error' }, err.message));
  }
}
