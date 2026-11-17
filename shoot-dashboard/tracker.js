// Link to the BTY B-Roll Tracker sheet: week maths, stream counting, and the API call.
// Everything above `call` is pure, so it can be tested with `npm test`.

export const STREAMS = ['Internal - Massive', 'Internal - CBQ', 'External'];
export const STATUSES = ['Planned', 'Ready to Shoot', 'Shooting', 'QC', 'Completed', 'Paused'];

const pad = (n) => String(n).padStart(2, '0');
/** A local date as YYYY-MM-DD. */
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
}
export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
/** The Monday of the week a date falls in (weeks run Monday to Sunday, like the tracker). */
export function mondayOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function weekLabel(start) {
  const a = parseDay(start);
  const b = parseDay(addDays(start, 6));
  return a.getMonth() === b.getMonth()
    ? `${MONTHS[a.getMonth()]} ${a.getDate()}–${b.getDate()}`
    : `${MONTHS[a.getMonth()]} ${a.getDate()} – ${MONTHS[b.getMonth()]} ${b.getDate()}`;
}
export function dayLabel(key) {
  const d = parseDay(key);
  return d ? `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}` : key;
}

/**
 * Which stream a row counts toward, following the tracker's rule: the Video Stream column
 * when set, External audience counts as External, and other internal shoots stay Unassigned.
 */
export function streamOf(r) {
  if (STREAMS.includes(r.stream)) return r.stream;
  if (r.audience === 'External') return 'External';
  return 'Internal - Unassigned';
}
export const isInternal = (stream) => stream.startsWith('Internal');
const n0 = (v) => (Number.isFinite(v) ? v : 0);
/** Clips still to capture on one row. */
export const remaining = (r) => Math.max(0, n0(r.planned) - n0(r.captured));

const STREAM_ORDER = [...STREAMS, 'Internal - Unassigned'];

/**
 * One shoot, line by line for each stream it has people in. The OVERVIEW targets apply to
 * each shoot: a shoot with Massive rows owes the Massive target, and so on. Rows with no
 * Video Stream have no target until one is set.
 */
export function shootLines(shoot, targets = {}) {
  const lines = new Map();
  for (const r of shoot.rows) {
    const name = streamOf(r);
    if (!lines.has(name)) {
      const target = name === 'Internal - Unassigned' ? 0 : n0(targets[name]);
      lines.set(name, { name, target, planned: 0, captured: 0, qcPassed: 0, rows: 0 });
    }
    const l = lines.get(name);
    l.planned += n0(r.planned);
    l.captured += n0(r.captured);
    l.qcPassed += n0(r.qcPassed);
    l.rows += 1;
  }
  return [...lines.values()]
    .sort((a, b) => STREAM_ORDER.indexOf(a.name) - STREAM_ORDER.indexOf(b.name))
    .map((l) => ({ ...l, need: Math.max(0, l.target - l.captured), unplanned: Math.max(0, l.target - l.planned) }));
}

/** A shoot's lines added up. */
export function shootTotals(shoot, targets = {}) {
  const lines = shootLines(shoot, targets);
  const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
  return { lines, target: sum('target'), planned: sum('planned'), captured: sum('captured'), qcPassed: sum('qcPassed'), need: sum('need'), unplanned: sum('unplanned') };
}

/**
 * The week, stream by stream: each shoot's target added up across the shoots that have that
 * stream. "Need" is added shoot by shoot, so extra clips on one shoot do not cover another.
 */
export function weekTotals(rows, targets = {}) {
  const blank = (name) => ({ name, target: 0, planned: 0, captured: 0, qcPassed: 0, need: 0, unplanned: 0, rows: 0, shoots: 0 });
  const by = Object.fromEntries(STREAM_ORDER.map((s) => [s, blank(s)]));
  for (const shoot of groupShoots(rows)) {
    for (const l of shootLines(shoot, targets)) {
      const t = by[l.name];
      for (const k of ['target', 'planned', 'captured', 'qcPassed', 'need', 'unplanned', 'rows']) t[k] += l[k];
      t.shoots += 1;
    }
  }
  const internal = blank('Internal (Massive + CBQ)');
  for (const s of ['Internal - Massive', 'Internal - CBQ', 'Internal - Unassigned']) {
    for (const k of Object.keys(internal)) if (k !== 'name' && k !== 'shoots') internal[k] += by[s][k];
  }
  internal.shoots = new Set(rows.filter((r) => isInternal(streamOf(r))).map((r) => r.board)).size;
  return {
    internal,
    massive: by['Internal - Massive'],
    cbq: by['Internal - CBQ'],
    external: by.External,
    unassigned: by['Internal - Unassigned'],
  };
}

/**
 * Each person's quota: the clips planned for them (Planned Clips) against what they have
 * captured. `openRows` are earlier assignments still short of plan, carried into this week.
 */
export function memberQuotas(rows, openRows = []) {
  const map = new Map();
  const add = (r, carried) => {
    const name = r.member || 'Unassigned';
    if (!map.has(name)) map.set(name, { member: name, quota: 0, captured: 0, qcPassed: 0, need: 0, rows: 0, carried: 0 });
    const m = map.get(name);
    m.quota += n0(r.planned);
    m.captured += n0(r.captured);
    m.qcPassed += n0(r.qcPassed);
    m.need += remaining(r);
    m.rows += 1;
    if (carried) m.carried += remaining(r);
  };
  rows.forEach((r) => add(r, false));
  openRows.forEach((r) => add(r, true));
  return [...map.values()].sort((a, b) => b.need - a.need || a.member.localeCompare(b.member));
}

/** Rows grouped into shoots (same date, product and time block), in date order. */
export function groupShoots(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.board)) map.set(r.board, { key: r.board, date: r.date, product: r.product, timeBlock: r.timeBlock, rows: [] });
    map.get(r.board).rows.push(r);
  }
  return [...map.values()].sort((a, b) => (a.date + a.timeBlock).localeCompare(b.date + b.timeBlock));
}

/** Simple checks on a shot report before it is sent. Returns an error message or ''. */
export function checkReport({ captured, qcPassed }) {
  const whole = (v) => v !== '' && v != null && Number.isInteger(Number(v)) && Number(v) >= 0;
  if (!whole(captured)) return 'Enter the number of clips captured (0 or more).';
  if (qcPassed !== '' && qcPassed != null) {
    if (!whole(qcPassed)) return 'QC-passed clips must be a whole number.';
    if (Number(qcPassed) > Number(captured)) return 'QC-passed clips cannot be more than captured clips.';
  }
  return '';
}

/** Is a moodboard link one the app made (a Drive folder), rather than a reference someone pasted? */
export const isDriveFolder = (url) => /drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(url || '');

// ---------- Connection ----------

const KEYS = { url: 'sd-tracker-url', token: 'sd-tracker-token', name: 'sd-tracker-name' };
const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* not remembered */ } };

export const tracker = {
  get url() { return window.SD_CONFIG?.trackerUrl || read(KEYS.url); },
  get urlFromConfig() { return Boolean(window.SD_CONFIG?.trackerUrl); },
  get token() { return read(KEYS.token); },
  get name() { return read(KEYS.name); },
  get ready() { return Boolean(this.url && this.token); },
  setUrl(v) { write(KEYS.url, v); },
  setToken(v) { write(KEYS.token, v); },
  setName(v) { write(KEYS.name, v); },
};

export async function tokenFor(passcode) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sd-api:' + passcode.trim()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One call to the tracker web app. Sent as text/plain so the browser skips the CORS preflight. */
export async function call(action, payload = {}, opts = {}) {
  const url = opts.url || tracker.url;
  const token = opts.token || tracker.token;
  if (!url) throw new Error('The tracker link is not set.');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, token }),
    });
  } catch {
    throw new Error('Could not reach the tracker. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!data) throw new Error('The tracker sent back something unexpected. Check the tracker link.');
  if (!data.ok) throw Object.assign(new Error(data.error || 'The tracker refused the request.'), { auth: Boolean(data.auth) });
  return data;
}
