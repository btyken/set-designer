/**
 * B-roll Production Tools ⇄ BTY B-Roll Tracker bridge.
 *
 * Paste this into the tracker sheet (Extensions → Apps Script) as a new file,
 * then deploy it as a web app. Setup steps are in the app's README.
 *
 * What it does for the app's Shoot Dashboard:
 *  - reads one week of SHOOT PLAN rows and the weekly targets on OVERVIEW
 *  - writes Captured Clips, QC Passed Clips and Shoot Status for one row
 *  - sets Video Stream for one row
 *  - keeps one Drive folder of inspiration photos ("pegs") per shoot and puts
 *    that folder's link in Moodboard / Reference Link when the cell is empty,
 *    plus a General inspo folder that is not tied to a shoot
 *  - lists earlier shoots that are still short of their planned clips
 *
 * It never writes the (Auto) columns, the RAW folder link or RAW REVIEW.
 * Catalog.gs (same project) adds approved RAW REVIEW folders to the affiliate RAW CATALOG.
 */

const SD = {
  PLAN: 'SHOOT PLAN',
  OVERVIEW: 'OVERVIEW',
  ROOT_NAME: 'BTY B-Roll Moodboards',
  // Header text in SHOOT PLAN row 1 → field name. Columns are found by header, not position.
  HEADERS: {
    'Shoot Date': 'date',
    'BTY Product(s)': 'product',
    'Audience': 'audience',
    'Content Type': 'contentType',
    'Set / Lighting / Props / Angles': 'setNotes',
    'Time Block': 'timeBlock',
    'Planned Clips': 'planned',
    'Captured Clips': 'captured',
    'QC Passed Clips': 'qcPassed',
    'Moodboard / Reference Link': 'moodLink',
    'Pre-Shoot Approval': 'approval',
    'Shoot Status': 'status',
    'RAW Folder Link': 'rawFolder',
    'Shoot ID (Auto)': 'shootId',
    'Video Files Logged (Auto)': 'logged',
    'Assigned Member': 'member',
    'Member Shoot Task': 'task',
    'Video Stream': 'stream',
  },
  // Columns the page uses but can live without. A missing one is reported, not fatal.
  EXPECTED: ['planned', 'captured', 'qcPassed', 'status', 'moodLink', 'stream', 'rawFolder', 'shootId', 'logged'],
  STATUSES: ['Planned', 'Ready to Shoot', 'Shooting', 'QC', 'Completed', 'Paused'],
  STREAMS: ['Internal - Massive', 'Internal - CBQ', 'External'],
  MAX_UPLOAD_BYTES: 8 * 1024 * 1024,
  // Earlier shoots still short of their planned clips are carried into the current week,
  // looking back this many days. Completed or Paused rows are not carried.
  OPEN_DAYS: 120,
  CLOSED: ['Completed', 'Paused'],
  // A moodboard that is not tied to one shoot.
  GENERAL: 'GENERAL',
};

// ---------- Sheet menu (for the owner) ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('B-roll Tools')
    .addItem('Set team passcode…', 'sdSetPasscode')
    .addItem('Open moodboards folder', 'sdShowRoot')
    .addSeparator()
    .addItem('Preview RAW CATALOG additions', 'catPreview')
    .addItem('Send approved RAW to RAW CATALOG now', 'catRunNow')
    .addItem('Turn on hourly RAW CATALOG link', 'catTurnOnHourly')
    .addItem('Turn off hourly RAW CATALOG link', 'catTurnOffHourly')
    .addToUi();
}

function sdSetPasscode() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Team passcode', 'Use the same passcode the team types to open B-roll Production Tools.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const pass = res.getResponseText().trim();
  if (pass.length < 6) {
    ui.alert('Use at least 6 characters.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', sdHash_('sd-api:' + pass));
  ui.alert('Saved. B-roll Production Tools can now read and update this tracker.');
}

function sdShowRoot() {
  const url = sdRoot_().getUrl();
  SpreadsheetApp.getUi().alert('Moodboards folder:\n' + url);
}

// ---------- Web app entry ----------

function doGet() {
  return sdJson_({ ok: true, app: 'broll-tools-tracker' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return sdJson_({ ok: false, error: 'Bad request.' });
  }
  const want = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!want) return sdJson_({ ok: false, error: 'The tracker has no team passcode yet. Set it from the B-roll Tools menu in the sheet.' });
  if (body.token !== want) return sdJson_({ ok: false, auth: true, error: 'Wrong team passcode.' });

  const routes = { ping: sdPing_, week: sdWeek_, report: sdReport_, stream: sdStream_, upload: sdUpload_, remove: sdRemove_, image: sdImage_ };
  const fn = routes[body.action];
  if (!fn) return sdJson_({ ok: false, error: 'Unknown action.' });
  try {
    return sdJson_(Object.assign({ ok: true }, fn(body)));
  } catch (err) {
    return sdJson_({ ok: false, error: String((err && err.message) || err) });
  }
}

// ---------- Actions ----------

function sdPing_() {
  return { sheetName: SpreadsheetApp.getActive().getName() };
}

/** All SHOOT PLAN rows dated inside one Monday–Sunday week, the targets, and each shoot's pegs. */
function sdWeek_(body) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const start = sdParseDay_(body.weekStart);
  if (!start) throw new Error('weekStart must be YYYY-MM-DD.');
  const startKey = sdDay_(start, tz);
  const endKey = sdDay_(new Date(start.getTime() + 6 * 864e5), tz);

  const openFrom = sdDay_(new Date(start.getTime() - SD.OPEN_DAYS * 864e5), tz);
  const plan = sdPlan_();
  const rows = [];
  const openRows = [];
  plan.values.forEach((vals, i) => {
    const r = sdRowObject_(plan.cols, vals, tz);
    if (!r.date) return;
    r.row = i + 2;
    if (r.date >= startKey && r.date <= endKey) rows.push(r);
    else if (r.date < startKey && r.date >= openFrom && sdIsOpen_(r)) openRows.push(r);
  });

  const boards = {};
  boards[SD.GENERAL] = { key: SD.GENERAL, folderUrl: '', pins: [] };
  rows.concat(openRows).forEach((r) => {
    const key = sdBoardKey_(r);
    r.board = key;
    if (!boards[key]) boards[key] = { key: key, folderUrl: '', pins: [] };
  });
  Object.keys(boards).forEach((key) => {
    const folder = sdFindBoard_(key);
    if (!folder) return;
    boards[key].folderUrl = folder.getUrl();
    boards[key].pins = sdListPins_(folder);
  });

  return {
    weekStart: startKey,
    weekEnd: endKey,
    sheetUrl: ss.getUrl() + '#gid=' + plan.sheet.getSheetId(),
    missing: plan.missing,
    targets: sdTargets_(),
    rows: rows,
    openRows: openRows,
    boards: boards,
  };
}

/** Still owes clips: something planned, fewer captured, and not closed. */
function sdIsOpen_(r) {
  const planned = Number(r.planned) || 0;
  const captured = Number(r.captured) || 0;
  return planned > 0 && captured < planned && SD.CLOSED.indexOf(r.status) < 0;
}

/** Writes the shot counts (and optionally the status) for one SHOOT PLAN row. */
function sdReport_(body) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const plan = sdPlan_();
    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    const rowNum = sdCheckRow_(plan, tz, body);
    const captured = sdCount_(body.captured, 'Captured clips');
    const qc = body.qcPassed === null || body.qcPassed === '' || body.qcPassed === undefined ? null : sdCount_(body.qcPassed, 'QC-passed clips');
    if (qc !== null && qc > captured) throw new Error('QC-passed clips cannot be more than captured clips.');
    if (body.status && SD.STATUSES.indexOf(body.status) < 0) throw new Error('Unknown shoot status.');

    const sh = plan.sheet;
    if (!plan.cols.captured) throw new Error('SHOOT PLAN has no Captured Clips column to save to.');
    if (body.status && !plan.cols.status) throw new Error('SHOOT PLAN has no Shoot Status column to save to.');
    sh.getRange(rowNum, plan.cols.captured).setValue(captured);
    if (qc !== null && plan.cols.qcPassed) sh.getRange(rowNum, plan.cols.qcPassed).setValue(qc);
    if (body.status) sh.getRange(rowNum, plan.cols.status).setValue(body.status);
    SpreadsheetApp.flush();
    const after = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0];
    const r = sdRowObject_(plan.cols, after, tz);
    r.row = rowNum;
    r.board = sdBoardKey_(r);
    return { row: r };
  } finally {
    lock.releaseLock();
  }
}

/** Sets Video Stream (Internal - Massive, Internal - CBQ or External) for one SHOOT PLAN row. */
function sdStream_(body) {
  if (SD.STREAMS.indexOf(body.stream) < 0) throw new Error('Pick Internal - Massive, Internal - CBQ or External.');
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const plan = sdPlan_();
    if (!plan.cols.stream) throw new Error('SHOOT PLAN has no Video Stream column.');
    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    const rowNum = sdCheckRow_(plan, tz, body);
    plan.sheet.getRange(rowNum, plan.cols.stream).setValue(body.stream);
    SpreadsheetApp.flush();
    const r = sdRowObject_(plan.cols, plan.sheet.getRange(rowNum, 1, 1, plan.sheet.getLastColumn()).getValues()[0], tz);
    r.row = rowNum;
    r.board = sdBoardKey_(r);
    return { row: r };
  } finally {
    lock.releaseLock();
  }
}

/** The row number in the request, after checking it still holds the same shoot and person. */
function sdCheckRow_(plan, tz, body) {
  const rowNum = Number(body.row);
  if (!(rowNum >= 2 && rowNum <= plan.values.length + 1)) throw new Error('That shoot row no longer exists. Refresh and try again.');
  const current = sdRowObject_(plan.cols, plan.values[rowNum - 2], tz);
  const ex = body.expect || {};
  if (current.date !== ex.date || current.product !== ex.product || current.member !== ex.member) {
    throw new Error('The tracker changed since you opened it. Refresh and try again.');
  }
  return rowNum;
}

/** Saves one inspiration photo into the shoot's folder and links the folder in the sheet. */
function sdUpload_(body) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(body.image || '');
  if (!m) throw new Error('The photo must be a JPEG, PNG or WebP.');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > SD.MAX_UPLOAD_BYTES) throw new Error('That photo is too large.');
  const key = String(body.board || '');
  if (key !== SD.GENERAL && !/^\d{4}-\d{2}-\d{2}\|/.test(key)) throw new Error('Unknown shoot.');

  // Only finding or creating the folder needs the lock; several photos can then upload at once.
  let folder = sdFindBoard_(key);
  let created = false;
  if (!folder) {
    const lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try {
      folder = sdFindBoard_(key);
      if (!folder) {
        folder = sdCreateBoard_(key, body.title);
        created = true;
      }
    } finally {
      lock.releaseLock();
    }
  }
  const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
  const base = String(body.name || 'peg').replace(/[^\w .-]+/g, '').slice(0, 60) || 'peg';
  const file = folder.createFile(Utilities.newBlob(bytes, m[1], base + '.' + ext));
  const note = String(body.note || '').slice(0, 400);
  const by = String(body.by || '').slice(0, 40);
  file.setDescription(JSON.stringify({ note: note, by: by }));
  // Files inherit the folder's link sharing. Share the file itself only if the folder could not be shared.
  if (!sdIsLinkShared_(folder)) {
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) { /* domain policy: the app falls back to sdImage_ */ }
  }

  // Filling empty Moodboard links reads the whole SHOOT PLAN, so it runs only for a new folder
  // or when the app says some row on this board is still empty.
  if (key !== SD.GENERAL && (created || body.link === true)) sdLinkBoardInSheet_(key, folder.getUrl());
  return { pin: sdPin_(file), folderUrl: folder.getUrl() };
}

function sdIsLinkShared_(folder) {
  try {
    return folder.getSharingAccess() === DriveApp.Access.ANYONE_WITH_LINK;
  } catch (err) {
    return false;
  }
}

function sdRemove_(body) {
  const file = sdBoardFile_(body.fileId);
  file.setTrashed(true);
  return {};
}

/** The photo itself, for browsers that cannot load the public Drive thumbnail. */
function sdImage_(body) {
  const file = sdBoardFile_(body.fileId);
  const blob = body.small ? file.getThumbnail() : file.getBlob();
  return { image: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

// ---------- Sheet helpers ----------

function sdPlan_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SD.PLAN);
  if (!sh) throw new Error('No sheet named ' + SD.PLAN + '.');
  const lastCol = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const cols = {};
  head.forEach((t, i) => {
    const field = SD.HEADERS[String(t).trim()];
    if (field) cols[field] = i + 1;
  });
  // Only the columns that say what a shoot is are required. The tracker's owner changes its columns
  // (QC Passed Clips was removed once, on 24 Nov 2026, and every shoot stopped loading), so the rest
  // are optional: the week still loads, the page says which ones are missing, and only the action
  // that needs a missing column is refused.
  ['date', 'product', 'member'].forEach((f) => {
    if (!cols[f]) throw new Error('SHOOT PLAN has no "' + sdHeaderOf_(f) + '" column. The app cannot tell the shoots apart without it.');
  });
  const missing = SD.EXPECTED.filter((f) => !cols[f]).map(sdHeaderOf_);
  const last = sh.getLastRow();
  const values = last >= 2 ? sh.getRange(2, 1, last - 1, lastCol).getValues() : [];
  return { sheet: sh, cols: cols, values: values, missing: missing };
}

/** The SHOOT PLAN header text for a field name. */
function sdHeaderOf_(field) {
  const names = Object.keys(SD.HEADERS).filter((h) => SD.HEADERS[h] === field);
  return names[0] || field;
}

function sdRowObject_(cols, vals, tz) {
  const out = {};
  Object.keys(cols).forEach((f) => {
    let v = vals[cols[f] - 1];
    if (f === 'date') v = Object.prototype.toString.call(v) === '[object Date]' ? sdDay_(v, tz) : sdNormaliseDayText_(v);
    else if (['planned', 'captured', 'qcPassed', 'logged'].indexOf(f) >= 0) v = v === '' || v === null ? null : Number(v);
    else v = v === null || v === undefined ? '' : String(v).trim();
    out[f] = v;
  });
  return out;
}

/** Targets per stream from the OVERVIEW table ("Stream | Weekly target"). */
function sdTargets_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SD.OVERVIEW);
  const out = {};
  if (!sh) return out;
  const vals = sh.getRange(1, 1, Math.min(40, sh.getLastRow()), Math.min(12, sh.getLastColumn())).getDisplayValues();
  vals.forEach((row) => {
    for (let c = 0; c < row.length - 1; c++) {
      const label = String(row[c]).trim();
      if (SD.STREAMS.indexOf(label) >= 0 && out[label] === undefined) {
        const n = Number(String(row[c + 1]).replace(/[^\d.]/g, ''));
        if (n > 0) out[label] = n;
      }
    }
  });
  return out;
}

function sdLinkBoardInSheet_(key, url) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const plan = sdPlan_();
    if (!plan.cols.moodLink) return; // no Moodboard / Reference Link column: the pegs still save in Drive
    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    plan.values.forEach((vals, i) => {
      const r = sdRowObject_(plan.cols, vals, tz);
      if (r.date && sdBoardKey_(r) === key && !r.moodLink) {
        plan.sheet.getRange(i + 2, plan.cols.moodLink).setValue(url);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Drive helpers ----------

/** One board per shoot session: same date, product and time block. */
function sdBoardKey_(r) {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
  return [r.date, norm(r.product), norm(r.timeBlock)].join('|');
}

function sdRoot_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('BOARD_ROOT_ID');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (err) { /* recreate below */ }
  }
  const sheetFile = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  const parents = sheetFile.getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const root = parent.createFolder(SD.ROOT_NAME);
  props.setProperty('BOARD_ROOT_ID', root.getId());
  return root;
}

function sdBoardProp_(key) {
  return 'board:' + sdHash_(key).slice(0, 32);
}

function sdFindBoard_(key) {
  const id = PropertiesService.getScriptProperties().getProperty(sdBoardProp_(key));
  if (!id) return null;
  try {
    const f = DriveApp.getFolderById(id);
    return f.isTrashed() ? null : f;
  } catch (err) {
    return null;
  }
}

function sdCreateBoard_(key, title) {
  const parts = key.split('|');
  const name = key === SD.GENERAL ? 'General inspo' : String(title || '').trim() || [parts[0], parts[1], parts[2]].filter(Boolean).join(' · ');
  const folder = sdRoot_().createFolder(name.slice(0, 120));
  folder.setDescription(key);
  try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) { /* domain policy */ }
  PropertiesService.getScriptProperties().setProperty(sdBoardProp_(key), folder.getId());
  return folder;
}

function sdListPins_(folder) {
  const out = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (!/^image\//.test(f.getMimeType())) continue;
    out.push(sdPin_(f));
  }
  out.sort((a, b) => (a.created < b.created ? -1 : 1));
  return out;
}

function sdPin_(f) {
  let meta = {};
  try { meta = JSON.parse(f.getDescription() || '{}'); } catch (err) { meta = { note: f.getDescription() || '' }; }
  return { id: f.getId(), name: f.getName(), note: meta.note || '', by: meta.by || '', created: f.getDateCreated().toISOString() };
}

/** A file inside one of the board folders. Anything else in Drive is refused. */
function sdBoardFile_(fileId) {
  const rootId = sdRoot_().getId();
  let file;
  try {
    file = DriveApp.getFileById(String(fileId || ''));
  } catch (err) {
    throw new Error('Photo not found.');
  }
  const parents = file.getParents();
  while (parents.hasNext()) {
    const p = parents.next();
    const up = p.getParents();
    while (up.hasNext()) if (up.next().getId() === rootId) return file;
  }
  throw new Error('Photo not found.');
}

// ---------- Small helpers ----------

function sdJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sdHash_(text) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return raw.map((b) => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}

function sdDay_(d, tz) {
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function sdParseDay_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
}

function sdNormaliseDayText_(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function sdCount_(v, label) {
  const n = Number(v);
  if (!(n >= 0) || Math.floor(n) !== n || n > 100000) throw new Error(label + ' must be a whole number, 0 or more.');
  return n;
}
