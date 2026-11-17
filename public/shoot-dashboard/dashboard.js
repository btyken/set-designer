// Shoot Dashboard: the week's B-roll shoots from the tracker sheet, each person's quota
// (captured / planned), each shoot's target, shot reports after the shoot, and a
// Pinterest-style moodboard of inspiration photos. Started by main.js with initDashboard().
import { $, h, openSheet } from '../shared/dom.js';
import {
  STREAMS, STATUSES, tracker, tokenFor, call, mondayOf, addDays, weekLabel, dayLabel, streamOf, remaining,
  weekTotals, shootTotals, groupShoots, memberQuotas, checkReport,
} from './tracker.js';

const GENERAL = 'GENERAL'; // the moodboard that is not tied to one shoot

const S = {
  week: mondayOf(),
  cache: new Map(), // weekStart → tracker response
  loading: false,
  message: null, // { text, error }
  lightbox: null,
  view: 'shoots', // 'shoots' or 'board'
  filter: 'all', // moodboard filter: 'all' or a board key
};
const images = new Map(); // Drive file id → data URL, when the public thumbnail cannot load

const thumbUrl = (id, w = 800) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = (v) => (Number.isFinite(v) ? v : null);

export function initDashboard({ openLightbox }) {
  S.lightbox = openLightbox;
  $('wkPrev').addEventListener('click', () => setWeek(addDays(S.week, -7)));
  $('wkNext').addEventListener('click', () => setWeek(addDays(S.week, 7)));
  $('wkNow').addEventListener('click', () => setWeek(mondayOf()));
  $('wkRefresh').addEventListener('click', () => load(true));
  for (const b of document.querySelectorAll('#viewSwitch [data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
}

function setView(view, filter) {
  S.view = view;
  if (filter) S.filter = filter;
  render();
  if (view === 'board') window.scrollTo(0, 0);
}

/** Can a picture be pinned to a shoot from here? Only when the tracker is set up. */
export const canPin = () => tracker.ready;

export function showDashboard() {
  if (!tracker.ready) return renderConnect();
  $('shootConnect').hidden = true;
  document.querySelector('.wk-nav').hidden = false;
  $('viewSwitch').hidden = false;
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
  for (const id of ['shootTargets', 'shootQuotas', 'shootList', 'boardView']) $(id).replaceChildren();
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
      showDashboard();
    } catch (err) {
      msg.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  });
  $('shootConnect').replaceChildren(form);
  $('shootConnect').hidden = false;
  document.querySelector('.wk-nav').hidden = true;
  $('viewSwitch').hidden = true;
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
  for (const b of document.querySelectorAll('#viewSwitch [data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === S.view));
  $('shootsView').hidden = S.view !== 'shoots';
  $('boardView').hidden = S.view !== 'board';
  if (!data) {
    for (const id of ['shootTargets', 'shootQuotas', 'shootList', 'boardView']) $(id).replaceChildren();
    $('shootUnassigned').hidden = true;
    return;
  }
  if (S.view === 'board') return renderBoard(data);
  renderTargets(data);
  renderQuotas(data);
  renderList(data);
}

/** Every moodboard for this week: General, this week's shoots, then earlier shoots still open. */
function boardTargets(data) {
  const list = [{ key: GENERAL, label: 'General inspo', sub: 'Not tied to one shoot', title: 'General inspo' }];
  for (const [rows, carried] of [[data.rows, false], [data.openRows || [], true]]) {
    for (const s of groupShoots(rows)) {
      if (list.some((t) => t.key === s.key)) continue;
      list.push({
        key: s.key,
        label: s.product || 'Untitled shoot',
        sub: [dayLabel(s.date), s.timeBlock, carried && 'carried over'].filter(Boolean).join(' · '),
        title: [s.date, s.product, s.timeBlock].filter(Boolean).join(' · '),
      });
    }
  }
  return list;
}

function renderTargets(data) {
  const t = weekTotals(data.rows, data.targets);
  const card = (line, main) => {
    const pct = (v) => (line.target ? Math.min(100, (v / line.target) * 100) : 0);
    const met = line.target > 0 && line.need === 0;
    return h('div', { class: 'target' + (main ? ' main' : '') + (met ? ' met' : '') },
      h('small', {}, line.name),
      h('strong', {}, String(line.captured), h('span', {}, line.target ? ` / ${line.target}` : line.planned ? ` / ${line.planned} planned` : ' captured')),
      line.target > 0 && h('div', { class: 'bar-track', role: 'img', 'aria-label': `${line.captured} of ${line.target} captured, ${line.planned} planned` },
        h('i', { class: 'planned', style: `width:${pct(line.planned)}%` }),
        h('i', { class: 'done', style: `width:${pct(line.captured)}%` })),
      h('p', { class: 'need' }, !line.shoots ? 'No shoots this week.'
        : !line.target ? `${Math.max(0, line.planned - line.captured)} to go on the plan. No stream target.`
          : met ? 'Every shoot hit its target.' : `${plural(line.need, 'more clip')} needed.`),
      h('p', { class: 'muted' }, line.shoots ? `${plural(line.shoots, 'shoot')} · planned ${line.planned} · QC passed ${line.qcPassed}` : ''),
      line.target > 0 && line.unplanned > 0 && h('p', { class: 'warn' }, `${line.unplanned} short of target in the plan.`));
  };
  $('shootTargets').replaceChildren(card(t.internal, true), card(t.massive), card(t.cbq), card(t.external, true));
  const un = t.unassigned;
  $('shootUnassigned').hidden = un.rows === 0;
  $('shootUnassigned').textContent = un.rows
    ? `${plural(un.rows, 'internal assignment')} (${un.planned} planned clips) ${un.rows === 1 ? 'has' : 'have'} no Video Stream yet, so ${un.rows === 1 ? 'it has' : 'they have'} no target. Pick Massive or CBQ under the person's name below.`
    : '';
}

/** Each person's quota: clips captured against Planned Clips, including work carried over. */
function renderQuotas(data) {
  const quotas = memberQuotas(data.rows, data.openRows || []);
  $('shootQuotas').hidden = !quotas.length;
  if (!quotas.length) return $('shootQuotas').replaceChildren();
  $('shootQuotas').replaceChildren(
    h('h2', { class: 'sub-head' }, 'Team quotas', h('small', {}, 'clips captured against Planned Clips')),
    h('div', { class: 'quotas' }, quotas.map((m) => {
      const pct = (v) => (m.quota ? Math.min(100, (v / m.quota) * 100) : 0);
      return h('div', { class: 'quota' + (m.quota && !m.need ? ' met' : '') },
        h('small', {}, m.member),
        h('strong', {}, String(m.captured), h('span', {}, ` / ${m.quota}`)),
        h('div', { class: 'bar-track' }, h('i', { class: 'done', style: `width:${pct(m.captured)}%` })),
        h('p', { class: 'need' }, m.quota ? (m.need ? `${plural(m.need, 'clip')} to go` : 'Quota done') : 'No clips planned'),
        m.carried > 0 && h('p', { class: 'warn' }, `${m.carried} from earlier shoots`),
        h('p', { class: 'muted' }, `${plural(m.rows, 'assignment')} · QC passed ${m.qcPassed}`));
    })));
}

function renderList(data) {
  const shoots = groupShoots(data.rows);
  const open = groupShoots(data.openRows || []);
  const out = [];
  if (shoots.length) out.push(...shoots.map((s) => shootCard(s, data)));
  else {
    out.push(h('div', { class: 'empty' + (open.length ? ' slim' : '') },
      h('strong', {}, 'No shoots this week'),
      h('span', {}, 'Shoots appear here once they are added to SHOOT PLAN with a date in this week.'),
      !open.length && data.sheetUrl && h('a', { class: 'btn', href: data.sheetUrl, target: '_blank', rel: 'noopener' }, 'Open the tracker')));
  }
  if (open.length) {
    out.push(h('h2', { class: 'sub-head' }, 'Still open from earlier weeks', h('small', {}, 'short of their planned clips')),
      h('p', { class: 'help open-help' }, 'These drop off once every planned clip is captured, or when the Shoot Status is Completed or Paused.'),
      ...open.map((s) => shootCard(s, data, true)));
  }
  $('shootList').replaceChildren(...out);
}

function shootCard(s, data, carried = false) {
  const board = data.boards?.[s.key] || { pins: [], folderUrl: '' };
  const tot = shootTotals(s, data.targets);
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
        h('div', { class: 'shoot-chips' },
          carried && h('span', { class: 'chip bad' }, 'Carried over'),
          uniq('contentType').map((c) => h('span', { class: 'chip' }, c)),
          uniq('approval').map((a) => h('span', { class: 'chip' + (a === 'Approved' ? ' ok' : a === 'Rejected' ? ' bad' : '') }, `Pre-shoot: ${a}`)),
          !uniq('approval').length && h('span', { class: 'chip' }, 'Pre-shoot: not reviewed'))),
      h('div', { class: 'shoot-sum' + (tot.target && !tot.need ? ' met' : '') },
        h('strong', {}, `${tot.captured}`, h('span', {}, tot.target ? ` / ${tot.target}` : '')),
        h('span', {}, tot.target ? (tot.need ? `clips vs target · ${tot.need} more needed` : 'clips vs target · target hit') : 'clips captured · no target yet'))),
    h('div', { class: 'stream-lines' }, tot.lines.map((l) => streamLine(l))),
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
        board.pins.length > 0 && h('button', { class: 'btn small board-open', type: 'button', onclick: () => setView('board', s.key) }, 'Open board'),
        h('label', { class: 'btn small' }, '+ Add pegs',
          h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) addPegs(targetOf(data, s.key), files); } }))),
      board.pins.length
        ? h('div', { class: 'pegs' }, board.pins.slice(-8).reverse().map((p) => pegFigure(p, targetOf(data, s.key))))
        : h('p', { class: 'help peg-empty' }, 'Add photos of the look to copy on set: angles, lighting, styling, hand poses. Everyone on this shoot sees the same board.')));
}

const targetOf = (data, key) => boardTargets(data).find((t) => t.key === key) || { key, label: 'Moodboard', sub: '', title: '' };

/** One stream's target on this shoot. */
function streamLine(l) {
  const pct = (v) => (l.target ? Math.min(100, (v / l.target) * 100) : 0);
  if (!l.target) {
    return h('div', { class: 'sline none' },
      h('small', {}, l.name === 'Internal - Unassigned' ? 'Internal, no stream' : l.name),
      h('strong', {}, `${l.captured}`, h('span', {}, ` captured · ${l.planned} planned`)),
      h('p', { class: 'warn' }, l.name === 'Internal - Unassigned' ? 'No target until Video Stream is set.' : 'No target on the tracker.'));
  }
  return h('div', { class: 'sline' + (l.need ? '' : ' met') },
    h('small', {}, l.name),
    h('strong', {}, `${l.captured}`, h('span', {}, ` / ${l.target}`)),
    h('div', { class: 'bar-track' }, h('i', { class: 'planned', style: `width:${pct(l.planned)}%` }), h('i', { class: 'done', style: `width:${pct(l.captured)}%` })),
    h('p', { class: l.need ? 'need' : 'need ok' }, l.need ? `${l.need} more needed` : 'Target hit'),
    l.unplanned > 0 && h('p', { class: 'warn' }, `Plan has ${l.planned}, ${l.unplanned} short`));
}

/** Video Stream for one row, changed right here. Saved to column S of SHOOT PLAN. */
function streamPicker(r, stream) {
  const unset = stream === 'Internal - Unassigned';
  const sel = h('select', { class: 'stream-pick' + (unset ? ' unset' : ''), 'aria-label': `Video Stream for ${r.member || 'this row'}` },
    !STREAMS.includes(r.stream) && h('option', { value: '' }, unset ? 'Pick a stream…' : `${stream} (from Audience)`),
    STREAMS.map((x) => h('option', { value: x, selected: x === r.stream }, x)));
  sel.addEventListener('change', async () => {
    if (!sel.value) return;
    sel.disabled = true;
    try {
      const out = await call('stream', { row: r.row, expect: { date: r.date, product: r.product, member: r.member }, stream: sel.value });
      Object.assign(r, out.row);
      S.message = { text: `Saved: ${r.member} is on ${r.stream}.` };
    } catch (err) {
      S.message = { text: err.message, error: true };
    }
    render();
  });
  return sel;
}

function crewRow(r) {
  const stream = streamOf(r);
  const left = remaining(r);
  const planned = num(r.planned);
  return h('div', { class: 'crew-row' },
    h('div', { class: 'who' }, h('strong', {}, r.member || 'Unassigned'),
      streamPicker(r, stream),
      r.task && h('span', { class: 'muted task' }, r.task)),
    h('dl', { class: 'nums' },
      h('div', { class: 'q' }, h('dt', {}, 'Captured / quota'), h('dd', {}, `${r.captured ?? 0}`, h('span', {}, ` / ${planned ?? '–'}`))),
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

function pegFigure(p, t) {
  return h('figure', { class: 'peg' },
    h('button', { type: 'button', class: 'peg-img', 'aria-label': `Open peg${p.note ? `: ${p.note}` : ''}`, onclick: () => openPeg(p, t) }, pegImg(p, 600)),
    (p.note || p.by) && h('figcaption', {}, p.note, p.by && h('span', { class: 'muted' }, p.note ? ` · ${p.by}` : p.by)));
}

function openPeg(p, t) {
  const url = images.get(p.id) || thumbUrl(p.id, 2000);
  S.lightbox({ name: p.note || t.label, url }, `peg-${p.id}`, {
    onDelete: async () => {
      if (!confirm('Remove this photo from the moodboard? It moves to the Drive trash.')) return false;
      try {
        await call('remove', { fileId: p.id });
        for (const data of S.cache.values()) {
          const board = data.boards?.[t.key];
          if (board) board.pins = board.pins.filter((x) => x.id !== p.id);
        }
        render();
        return true;
      } catch (err) {
        alert(err.message);
        return false;
      }
    },
  });
}

// ---------- Moodboard page ----------

/** All the week's inspiration photos in one Pinterest-style board, filterable by shoot. */
function renderBoard(data) {
  const targets = boardTargets(data);
  if (S.filter !== 'all' && !targets.some((t) => t.key === S.filter)) S.filter = 'all';
  const pinsOf = (t) => (data.boards?.[t.key]?.pins || []).map((p) => ({ p, t }));
  const shown = (S.filter === 'all' ? targets : targets.filter((t) => t.key === S.filter)).flatMap(pinsOf)
    .sort((a, b) => (a.p.created < b.p.created ? 1 : -1));
  const total = targets.reduce((n, t) => n + pinsOf(t).length, 0);
  const current = targets.find((t) => t.key === S.filter);
  const pick = (files) => {
    files = files.filter((f) => f.type.startsWith('image/'));
    if (files.length) addPegs(current || targets[0], files, '', targets);
  };

  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => { const files = [...e.target.files]; e.target.value = ''; pick(files); } });
  const drop = h('label', { class: 'dropzone' }, input,
    h('strong', {}, '+ Add photos'),
    h('span', {}, `Drop inspo photos here or tap to choose. They go on ${current ? `the ${current.label} board` : 'a board you pick next'}.`));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); pick([...e.dataTransfer.files]); });

  const folder = current && data.boards?.[current.key]?.folderUrl;
  $('boardView').replaceChildren(...[
    h('div', { class: 'filters', role: 'group', 'aria-label': 'Which board' },
      h('button', { type: 'button', class: 'fchip', 'aria-pressed': String(S.filter === 'all'), onclick: () => setView('board', 'all') }, 'All', h('b', {}, String(total))),
      targets.map((t) => h('button', { type: 'button', class: 'fchip', 'aria-pressed': String(S.filter === t.key), title: t.sub, onclick: () => setView('board', t.key) },
        t.label, t.key !== GENERAL && h('em', {}, t.sub.split(' · ')[0]), h('b', {}, String(pinsOf(t).length))))),
    current && h('p', { class: 'help board-sub' }, current.sub, folder && ' · ', folder && h('a', { href: folder, target: '_blank', rel: 'noopener' }, 'Drive folder')),
    drop,
    shown.length
      ? h('div', { class: 'masonry' }, shown.map(({ p, t }) => h('figure', { class: 'pin' },
        h('button', { type: 'button', class: 'pin-img', 'aria-label': `Open photo${p.note ? `: ${p.note}` : ''}`, onclick: () => openPeg(p, t) }, pegImg(p, 700)),
        h('figcaption', {}, p.note && h('span', { class: 'pin-note' }, p.note),
          h('span', { class: 'pin-meta' }, [p.by, S.filter === 'all' ? t.label : ''].filter(Boolean).join(' · '))))))
      : h('div', { class: 'empty' }, h('strong', {}, 'No photos yet'), h('span', {}, 'Add the pegs the team wants to copy: angles, lighting, styling, hand poses.')),
  ].filter(Boolean));
}

/**
 * A photo as a JPEG data URL, no larger than `max` pixels on its long side.
 * 1280 px is sharp on a phone and on the board (pins show at 700 px) and keeps each upload ~200–300 KB.
 */
async function toJpeg(src, max = 1280) {
  const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
  const img = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  return c.toDataURL('image/jpeg', 0.8);
}

/** Photos sent to the tracker at the same time. Each upload waits mostly on Google, not on the phone. */
const UPLOADS_AT_ONCE = 3;

/** True when some tracker row on this board still has an empty Moodboard / Reference Link. */
function boardNeedsLink(key) {
  if (key === GENERAL) return false;
  for (const data of S.cache.values()) {
    for (const r of [...(data.rows || []), ...(data.openRows || [])]) if (r.board === key && !r.moodLink) return true;
  }
  return false;
}

/**
 * Upload photos to a moodboard. `t` is the board ({ key, label, sub, title }); with `choices`
 * the person can switch to another board first.
 */
function addPegs(t, files, presetNote = '', choices = null) {
  let target = t;
  const previews = h('div', { class: 'peg-previews' }, files.map((f) => h('img', { src: typeof f === 'string' ? f : URL.createObjectURL(f), alt: '' })));
  const where = h('p', { class: 'help' }, [t.label, t.sub].filter(Boolean).join(', ') + '.');
  const board = choices && h('select', { onchange: (e) => { target = choices.find((c) => c.key === e.target.value); } },
    choices.map((c) => h('option', { value: c.key, selected: c.key === t.key }, [c.label, c.sub].filter(Boolean).join(' · '))));
  const note = h('textarea', { rows: 2, placeholder: 'What to copy: the angle, the light, the hand pose…', value: presetNote });
  const name = h('input', { type: 'text', value: tracker.name, placeholder: 'e.g. Maye' });
  const msg = h('p', { class: 'help', role: 'status' });
  const go = h('button', { class: 'btn primary', type: 'submit' }, `Add ${plural(files.length, 'photo')}`);
  const pending = new Set(files); // photos not uploaded yet; a retry sends only these
  const form = h('form', { class: 'report' },
    h('h2', {}, 'Add to moodboard'),
    board ? h('label', {}, 'Board', board) : where,
    previews,
    h('label', {}, 'Note for the team (optional)', note),
    h('label', {}, 'Your name', name),
    msg,
    h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), go));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    go.disabled = true;
    if (board) board.disabled = true;
    tracker.setName(name.value.trim());
    msg.className = 'help';
    let done = 0;
    const total = pending.size;
    const failed = [];
    const progress = () => { msg.textContent = `Uploading… ${done} of ${total} done`; };
    progress();

    const send = async (f, first) => {
      const out = await call('upload', {
        board: target.key,
        title: target.title,
        name: (typeof f === 'string' ? 'set-design' : f.name.replace(/\.[^.]+$/, '')) || 'peg',
        note: note.value.trim(),
        by: name.value.trim(),
        // Only one upload per batch asks the tracker to fill empty Moodboard links, and only when some are empty.
        link: first && boardNeedsLink(target.key),
        image: await toJpeg(f),
      });
      done += 1;
      progress();
      for (const data of S.cache.values()) {
        const b = data.boards?.[target.key];
        if (!b) continue;
        b.pins.push(out.pin);
        b.folderUrl = out.folderUrl;
        if (target.key === GENERAL) continue;
        for (const r of [...data.rows, ...(data.openRows || [])]) if (r.board === target.key && !r.moodLink) r.moodLink = out.folderUrl;
      }
    };

    const queue = [...pending];
    const run = async (f, first) => {
      try {
        await send(f, first);
      } catch (err) {
        if (err.auth) { failed.push(err); return; }
        try { await send(f, first); } catch (err2) { failed.push(err2); return; } // one retry: Google is sometimes briefly busy
      }
      pending.delete(f);
    };
    const lead = queue[0];
    const worker = async () => { for (let f = queue.shift(); f; f = queue.shift()) await run(f, f === lead); };
    // On a board with no Drive folder yet, the first photo goes alone so the folder exists before the rest arrive.
    const hasFolder = [...S.cache.values()].some((d) => d.boards?.[target.key]?.folderUrl);
    if (queue.length && !hasFolder) await run(queue.shift(), true);
    await Promise.all(Array.from({ length: Math.min(UPLOADS_AT_ONCE, queue.length) }, worker));

    if (!failed.length) {
      close();
      S.message = { text: `Added ${plural(done, 'photo')} to the ${target.label} board.` };
      render();
      return;
    }
    msg.textContent = `${done ? `${plural(done, 'photo')} added. ` : ''}${plural(failed.length, 'photo')} did not upload: ${failed[0].message}`;
    msg.className = 'error';
    go.textContent = `Try the ${plural(pending.size, 'photo')} again`;
    go.disabled = false;
    if (done) render();
  });
  const close = openSheet('Add to moodboard', form);
}

/** Pin a picture made in the app (a sample frame) to a moodboard: this week, earlier open shoots, next week. */
export async function pinImage(url, note) {
  const list = h('div', { class: 'dup-list' }, h('p', { class: 'muted' }, 'Loading shoots…'));
  const close = openSheet('Pin to a shoot',
    h('h2', {}, 'Pin to which board?'),
    h('p', { class: 'help' }, 'The picture goes on that moodboard so the crew can copy the set.'),
    list,
    h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
  const now = mondayOf();
  try {
    for (const w of [now, addDays(now, 7)]) if (!S.cache.has(w)) S.cache.set(w, await call('week', { weekStart: w }));
    const targets = boardTargets(S.cache.get(now));
    for (const t of boardTargets(S.cache.get(addDays(now, 7)))) if (!targets.some((x) => x.key === t.key)) targets.push(t);
    list.replaceChildren(...targets.map((t) => h('button', {
      class: 'choice', type: 'button',
      onclick: () => { close(); S.week = now; addPegs(t, [url], note); },
    }, h('strong', {}, t.label), h('span', {}, t.sub))));
  } catch (err) {
    list.replaceChildren(h('p', { class: 'error' }, err.message));
  }
}
