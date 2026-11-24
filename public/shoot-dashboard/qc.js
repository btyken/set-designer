// Quality Check, the third view of the Shoot Dashboard. The funnel:
// pre-shoot (moodboard, set design) → shoot → Quality Check → Reel Builder.
// Clips come from the B-Roll Tracker's RAW REVIEW tab (every video in each shoot's RAW folder) and
// from the Reel Builder's QC folder. This page talks to the Reel Builder's web app, which lists
// them, sends them for playback, and hands a passed clip to INBOX.
import { $, h } from '../shared/dom.js';

const API = () => window.SD_CONFIG?.api || '';
const CODE_KEY = 'sd-qc-code';
export const FAIL_REASONS = ['Out of focus', 'Too dark or too bright', 'Shaky', 'Label not readable', 'Wrong product', 'Bad framing', 'Sound problem'];
/** Product codes from the Reel Builder's PRODUCTS tab (November 2026). The tab is the source of truth. */
export const PRODUCT_CODES = ['IG', 'OM', 'SS', 'DR', 'BL', 'AIOG', 'PD', 'BT', 'DGD', 'SCT', 'SCS', 'BSS', 'ECS', '4EGS', 'TIG', 'TOM', 'BLANK'];
export const PARTS = ['HOOK', 'BODY', 'CTA'];

/** The file name the Reel Builder expects: TYPE_SHOOTER_PRODUCT_PART_DATE_VERSION. */
export function clipName({ type = 'BRS', shooter = '', product = '', part = '', date = new Date(), version = 1 }) {
  const letters = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const d = date instanceof Date ? date : new Date(date);
  const mmddyy = [d.getMonth() + 1, d.getDate(), d.getFullYear() % 100].map((n) => String(n).padStart(2, '0')).join('');
  return [letters(type) || 'BRS', letters(shooter) || 'NAME', letters(product), letters(part), mmddyy, `V${Math.max(1, Number(version) || 1)}`].join('_');
}
export const sizeText = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

const state = { code: '', name: '', clips: [], done: [], thumbs: {}, failedFolderSet: true, trackerUrl: '', trackerLinked: true, more: false, loading: false, error: '', open: null };
/** Called with the tracker sheet's link once it is known, so the dashboard can show Open tracker. */
let onTracker = () => {};
export const setTrackerListener = (fn) => { onTracker = fn; };

async function call(action, body = {}) {
  if (!API()) throw new Error('Quality Check is not connected on this copy of the site yet.');
  // text/plain keeps the browser from sending a preflight the web app cannot answer
  const res = await fetch(API(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, code: state.code, ...body }) });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

// ---------- Clip name maker ----------

function nameMaker() {
  let shooter = '';
  try { shooter = localStorage.getItem('sd-shooter') || ''; } catch { /* typed again */ }
  const form = { shooter, product: 'IG', part: 'HOOK', version: 1 };
  const out = h('code', { class: 'namebox' });
  const update = () => { out.textContent = `${clipName(form)}.mp4`; };
  const pick = (label, key, options) => h('label', {}, label, h('select', { onchange: (e) => { form[key] = e.target.value; update(); } },
    options.map((o) => h('option', { value: o, selected: form[key] === o }, o))));
  update();
  return h('details', { class: 'how qc-how' },
    h('summary', {}, 'How to name and hand over clips'),
    h('p', { class: 'help' }, 'Put the clips in the shoot’s RAW folder (the RAW Folder Link in SHOOT PLAN). The tracker picks them up within about an hour and they appear here. Name each clip like this so it can be given out without renaming:'),
    h('div', { class: 'namer' },
      h('label', {}, 'Your name', h('input', { type: 'text', value: form.shooter, placeholder: 'MAYE', autocapitalize: 'characters', oninput: (e) => { form.shooter = e.target.value; try { localStorage.setItem('sd-shooter', form.shooter); } catch { /* not remembered */ } update(); } })),
      pick('Product', 'product', PRODUCT_CODES),
      pick('Part of the reel', 'part', PARTS),
      h('label', {}, 'Version', h('input', { type: 'number', min: 1, value: 1, inputMode: 'numeric', oninput: (e) => { form.version = e.target.value; update(); } }))),
    out,
    h('button', { class: 'btn small', type: 'button', onclick: async (e) => {
      try { await navigator.clipboard.writeText(out.textContent); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Press and hold the name to copy'; }
      setTimeout(() => { e.target.textContent = 'Copy name'; }, 1800);
    } }, 'Copy name'));
}

// ---------- Quality Check stage ----------

export async function renderQc() {
  const root = $('qcView');
  const head = [h('h2', { class: 'sub-head' }, 'Quality check ', h('small', {}, 'watch each clip, then pass or fail it'))];
  if (!state.code) {
    let saved = '';
    try { saved = localStorage.getItem(CODE_KEY) || ''; } catch { /* ask */ }
    if (saved && !state.error) { state.code = saved; return signIn(); }
    root.replaceChildren(...head,
      h('p', { class: 'help' }, 'Play back each clip from the shoot. Passed clips go to the Reel Builder to be given out. Failed clips are kept away from the participants.'),
      h('form', { class: 'qc-sign', onsubmit: (e) => { e.preventDefault(); state.code = e.target.elements.code.value.trim(); state.error = ''; signIn(); } },
        h('label', {}, 'Your Reel Builder code', h('input', { name: 'code', type: 'text', required: true, autocapitalize: 'characters', autocomplete: 'off', placeholder: 'NAME-XXXX' })),
        state.error && h('p', { class: 'error', role: 'alert' }, state.error),
        h('button', { class: 'btn primary' }, 'Open Quality Check'),
        h('p', { class: 'help' }, 'Only codes with Quality Check switched on can open this. Ask Ken to switch yours on.')));
    return;
  }
  const waiting = state.clips.length;
  root.replaceChildren(...[...head,
    h('div', { class: 'qc-top' },
      h('p', { class: 'qc-count' }, state.loading ? 'Loading clips…' : waiting ? `${waiting}${state.more ? '+' : ''} clip${waiting === 1 ? '' : 's'} waiting.` : 'Nothing is waiting. Every uploaded clip has been checked.'),
      h('button', { class: 'btn small', type: 'button', onclick: load }, 'Refresh'),
      state.trackerUrl && h('a', { class: 'btn small', href: state.trackerUrl, target: '_blank', rel: 'noopener' }, 'Open tracker'),
      h('button', { class: 'btn small', type: 'button', onclick: signOut }, `Not ${state.name}?`)),
    state.error && h('p', { class: 'error', role: 'alert' }, state.error),
    !state.trackerLinked && !state.loading && h('p', { class: 'note warn' }, 'The B-Roll Tracker could not be read, so only clips in the QC folder are listed. The Reel Builder’s account needs view access to the tracker sheet.'),
    !state.failedFolderSet && h('p', { class: 'note warn' }, 'The Drive folder for failed clips has not been set yet. Until it is, failed clips wait in ASSET DISTRIBUTION › QC FAILED on the main Drive.'),
    h('div', { class: 'qc-list' }, state.clips.map((c) => h('button', { class: 'qc-clip', type: 'button', onclick: () => openClip(c) },
      h('span', { class: 'qc-thumb' }, state.thumbs[c.id] ? h('img', { src: state.thumbs[c.id], alt: '' }) : h('i', {}, '▶')),
      h('strong', {}, c.name),
      h('span', {}, [c.shoot, c.member || c.shotBy, c.product || c.productName, c.part, c.shotOn, c.needsPart ? 'pick the part when passing' : c.nameProblem ? 'name needs fixing' : '', c.size ? sizeText(c.size) : ''].filter(Boolean).join(' · '))))),
    nameMaker(),
    state.done.length > 0 && h('h3', {}, 'Just checked'),
    h('ul', { class: 'list qc-done' }, state.done.map((d) => h('li', {},
      h('span', { class: 'num ' + (d.decision === 'PASSED' ? 'pass' : 'fail') }, d.decision === 'PASSED' ? '✓' : '✕'),
      h('strong', {}, d.name),
      h('div', { class: 'spec' }, `${d.decision}${d.reason ? ` · ${d.reason}` : ''} · ${d.by}`)))),
  ].filter(Boolean));
}

async function signIn() {
  try {
    const hi = await call('hello');
    if (!hi.qc) throw new Error('Quality Check isn’t switched on for your code. Ask Ken to switch it on.');
    state.name = hi.name;
    try { localStorage.setItem(CODE_KEY, state.code); } catch { /* asked again next time */ }
    await load();
  } catch (err) {
    state.code = '';
    state.error = err.message;
    try { localStorage.removeItem(CODE_KEY); } catch { /* nothing saved */ }
    renderQc();
  }
}
function signOut() {
  try { localStorage.removeItem(CODE_KEY); } catch { /* nothing saved */ }
  Object.assign(state, { code: '', name: '', clips: [], done: [], error: '' });
  renderQc();
}

async function load() {
  state.loading = true;
  state.error = '';
  renderQc();
  try {
    const res = await call('qcList');
    Object.assign(state, { clips: res.clips, done: res.done || [], more: !!res.more, failedFolderSet: res.failedFolderSet !== false, trackerUrl: res.trackerUrl || '', trackerLinked: res.trackerLinked !== false });
    if (state.trackerUrl) onTracker(state.trackerUrl);
  } catch (err) {
    state.error = err.message;
  }
  state.loading = false;
  renderQc();
  loadThumbs();
}
async function loadThumbs() {
  const todo = state.clips.map((c) => c.id).filter((id) => !(id in state.thumbs));
  for (let i = 0; i < todo.length; i += 12) {
    try {
      Object.assign(state.thumbs, (await call('qcThumbs', { ids: todo.slice(i, i + 12) })).thumbs);
      if (!state.open) renderQc();
    } catch { return; }
  }
}

/** Fetches a clip in pieces, three at a time, and reports progress from 0 to 1. */
async function fetchClip(clip, onProgress, signal) {
  const first = await call('qcClip', { id: clip.id, start: 0 });
  const bytes = (b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const parts = new Map([[0, bytes(first.data)]]);
  const step = parts.get(0).length;
  let got = step;
  onProgress(got / first.size);
  const starts = [];
  for (let at = step; step > 0 && at < first.size; at += step) starts.push(at);
  let next = 0;
  const worker = async () => {
    while (next < starts.length) {
      if (signal.aborted) throw new Error('stopped');
      const at = starts[next++];
      const piece = bytes((await call('qcClip', { id: clip.id, start: at })).data);
      parts.set(at, piece);
      got += piece.length;
      onProgress(got / first.size);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  // Chrome will not play a blob labelled QuickTime, though it plays the same video labelled MP4.
  const type = /quicktime/.test(first.type || '') || !first.type ? 'video/mp4' : first.type;
  return new Blob([...parts.keys()].sort((a, b) => a - b).map((k) => parts.get(k)), { type });
}

function openClip(clip) {
  const stop = new AbortController();
  let url = '';
  let reason = '';
  let busy = false;
  const stage = h('div', { class: 'qc-stage' }, h('p', { class: 'qc-wait' }, 'Getting the clip… 0%'));
  const msg = h('p', { class: 'error', role: 'alert' });
  const reasons = h('div', { class: 'qc-reasons', hidden: true });
  const other = h('input', { type: 'text', placeholder: 'Or say what is wrong', maxLength: 200, oninput: (e) => { reason = e.target.value.trim(); paint(); } });
  const failGo = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => decide('FAILED') }, 'Mark FAILED');
  const paint = () => {
    for (const b of reasons.querySelectorAll('.chipbtn')) b.setAttribute('aria-pressed', String(b.textContent === reason));
    failGo.disabled = !reason || busy;
  };
  reasons.append(h('p', { class: 'help' }, 'Why did it fail? The shooter sees this.'),
    h('div', { class: 'chiprow' }, FAIL_REASONS.map((r) => h('button', { class: 'chipbtn', type: 'button', 'aria-pressed': 'false', onclick: () => { reason = r; other.value = ''; paint(); } }, r))),
    other, failGo);
  // A tracker clip's name has no reel part, so the checker picks one when passing it.
  let part = '';
  const parts = h('div', { class: 'qc-reasons', hidden: true },
    h('p', { class: 'help' }, 'Where in a reel does this clip go?'),
    h('div', { class: 'chiprow' }, PARTS.map((p) => h('button', { class: 'chipbtn', type: 'button', onclick: () => { part = p; decide('PASSED'); } }, p))));
  const passBtn = h('button', { class: 'btn pass', type: 'button', onclick: () => {
    if (!clip.needsPart) return decide('PASSED');
    reasons.hidden = true;
    parts.hidden = false;
    parts.scrollIntoView({ block: 'nearest' });
  } }, '✓ PASSED');
  const failBtn = h('button', { class: 'btn fail', type: 'button', onclick: () => { parts.hidden = true; reasons.hidden = false; reasons.scrollIntoView({ block: 'nearest' }); } }, '✕ FAILED');
  const close = () => {
    stop.abort();
    if (url) URL.revokeObjectURL(url);
    box.remove();
    document.documentElement.classList.remove('locked');
    state.open = null;
    renderQc();
  };
  async function decide(decision) {
    if (busy) return;
    busy = true;
    passBtn.disabled = failBtn.disabled = failGo.disabled = true;
    msg.textContent = '';
    try {
      await call('qcDecide', { id: clip.id, decision, reason: decision === 'FAILED' ? reason : '', part });
      const i = state.clips.indexOf(clip);
      state.clips = state.clips.filter((c) => c !== clip);
      state.done.unshift({ name: clip.name, decision, reason: decision === 'FAILED' ? reason : '', by: state.name });
      const following = state.clips[Math.min(i, state.clips.length - 1)];
      close();
      if (following) openClip(following); // straight on to the next clip
    } catch (err) {
      msg.textContent = err.message;
      busy = false;
      passBtn.disabled = failBtn.disabled = false;
      paint();
    }
  }
  const box = h('div', { class: 'overlay qc-player', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Check ${clip.name}` },
    h('div', { class: 'measure-top' },
      h('button', { class: 'btn small', type: 'button', onclick: close }, 'Back'),
      h('span', { class: 'qc-name' }, clip.name),
      h('a', { class: 'btn small', href: `https://drive.google.com/file/d/${encodeURIComponent(clip.id)}/view`, target: '_blank', rel: 'noopener' }, 'Open in Drive')),
    stage,
    h('div', { class: 'qc-actions' },
      clip.nameProblem && !clip.needsPart && h('p', { class: 'note warn' }, `Name needs fixing: ${clip.nameProblem} If it passes, it waits in NEEDS RENAME until renamed.`),
      h('p', { class: 'spec' }, [clip.shoot, clip.product || clip.productName, clip.part, (clip.member || clip.shotBy) && `shot by ${clip.member || clip.shotBy}`, clip.shotOn, clip.size ? sizeText(clip.size) : ''].filter(Boolean).join(' · ')),
      msg,
      h('div', { class: 'qc-buttons' }, failBtn, passBtn),
      parts,
      reasons));
  document.body.append(box);
  document.documentElement.classList.add('locked');
  state.open = clip;

  fetchClip(clip, (p) => { stage.firstChild.textContent = `Getting the clip… ${Math.round(p * 100)}%`; }, stop.signal).then((blob) => {
    if (stop.signal.aborted) return;
    url = URL.createObjectURL(blob);
    const video = h('video', { src: url, controls: true, playsInline: true, autoplay: true, loop: true, muted: false });
    video.addEventListener('error', () => {
      stage.replaceChildren(h('p', { class: 'qc-wait' }, 'This browser cannot play this file here. Tap Open in Drive to watch it, then come back to mark it.'));
    });
    stage.replaceChildren(video);
    video.play().catch(() => { /* autoplay blocked: the controls are there */ });
  }).catch((err) => {
    if (!stop.signal.aborted) stage.replaceChildren(h('p', { class: 'qc-wait' }, `${err.message} Tap Open in Drive to watch it there.`));
  });
}
