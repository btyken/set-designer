/**
 * RAW REVIEW → RAW CATALOG link.
 *
 * Paste this into the same Apps Script project as Code.gs (a second file, e.g. "Catalog").
 *
 * Once an hour (or from the B-roll Tools menu) it looks at RAW REVIEW in this tracker for clips
 * with QC Result = Pass and Brand Approval = Approved, groups them by RAW folder, and adds one row
 * per new folder to RAW CATALOG in the External Affiliate RAW Content Distribution System:
 * asset ID, category, folder label, shoot date, folder link, description, product tag and a note
 * with the Shoot IDs.
 *
 * It only adds rows. It never edits or deletes a catalog row, never writes the (Auto) columns,
 * and sets Share Status to "Needs Review" so a coordinator still decides what is Ready.
 * A folder already in RAW CATALOG (same Drive folder ID) is never added twice.
 */

const CAT = {
  REVIEW: 'RAW REVIEW',
  // External Affiliate RAW Content Distribution System. A script property CATALOG_SHEET_ID overrides it.
  SHEET_ID: '1INTgPB4dDqawEvFr3EPg3r1Aal4_C6eWakxillOFs1w',
  TAB: 'RAW CATALOG',
  CATEGORY: 'BTY B-ROLLS (VIDEO)',
  STATUS: 'Needs Review',
  TRIGGER_FN: 'catHourly',
  REVIEW_HEADERS: {
    'Video File Link': 'file',
    'BTY Product(s) (Auto)': 'product',
    'Content Format (Auto)': 'format',
    'QC Result': 'qc',
    'Brand Approval': 'approval',
    'RAW Folder Link (Auto)': 'folder',
    'Shoot ID (Select)': 'shootId',
    'Shoot Date': 'date',
  },
  // RAW CATALOG columns A–M, in order. The script refuses to write if these headers have moved.
  CATALOG_HEADERS: ['RAW Asset ID', 'Category', 'Folder Label', 'RAW Content Date', 'Drive Folder Link', 'Description', 'Sample Video', 'Share Status', 'Recommended Use', 'Source Row', 'Verified Date', 'Notes', 'BTY Product Tag (Manual)'],
  LABELS: {
    'PRODUCT SHOWCASE': 'PRODUCT SHOWCASE',
    'AESTHETIC EDIT': 'AESTHETIC EDITS',
    'SKINCARE ROUTINE': 'SKINCARE/LIFESTYLE ROUTINE',
    'GET READY WITH ME': 'GRWM',
    'FACELESS WITH MODEL': 'FACELESS WITH MODEL',
  },
};

// ---------- Menu actions ----------

function catPreview() {
  const out = catSync_(false);
  SpreadsheetApp.getUi().alert('RAW CATALOG preview (nothing written)', catSummary_(out, false), SpreadsheetApp.getUi().ButtonSet.OK);
}

function catRunNow() {
  const out = catSync_(true);
  SpreadsheetApp.getUi().alert('RAW CATALOG', catSummary_(out, true), SpreadsheetApp.getUi().ButtonSet.OK);
}

function catTurnOnHourly() {
  const has = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === CAT.TRIGGER_FN);
  if (!has) ScriptApp.newTrigger(CAT.TRIGGER_FN).timeBased().everyHours(1).create();
  SpreadsheetApp.getUi().alert(has ? 'The hourly RAW CATALOG link was already on.' : 'Done. Approved RAW folders now go to RAW CATALOG every hour.');
}

function catTurnOffHourly() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === CAT.TRIGGER_FN) { ScriptApp.deleteTrigger(t); n++; }
  });
  SpreadsheetApp.getUi().alert(n ? 'The hourly RAW CATALOG link is off.' : 'The hourly RAW CATALOG link was not on.');
}

/** Time-driven trigger target. */
function catHourly() {
  catSync_(true);
}

// ---------- Core ----------

/**
 * Finds approved RAW folders not yet in RAW CATALOG and, when write is true, adds them.
 * Returns { added: [...rows], noFolder: [shootIds], already: n }.
 */
function catSync_(write) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const groups = catApprovedFolders_();
    const sh = catSheet_();
    const width = CAT.CATALOG_HEADERS.length;
    const head = sh.getRange(1, 1, 1, width).getDisplayValues()[0].map((t) => String(t).trim());
    CAT.CATALOG_HEADERS.forEach((h, i) => {
      if (head[i] !== h) throw new Error('RAW CATALOG column ' + String.fromCharCode(65 + i) + ' should be "' + h + '" but is "' + head[i] + '". Nothing was written.');
    });

    const maxRows = sh.getMaxRows();
    const body = maxRows >= 2 ? sh.getRange(2, 1, maxRows - 1, width).getDisplayValues() : [];
    const known = {};
    let lastUsed = 1;
    let maxId = 0;
    body.forEach((r, i) => {
      const id = String(r[0]).trim();
      const link = String(r[4]).trim();
      if (id || link) lastUsed = i + 2;
      const fid = catFolderId_(link);
      if (fid) known[fid] = true;
      const m = /^RAW-(\d+)$/i.exec(id);
      if (m) maxId = Math.max(maxId, Number(m[1]));
    });

    const fresh = groups.folders.filter((g) => !known[g.folderId]);
    const rows = fresh.map((g, i) => catRow_(g, maxId + 1 + i));

    if (write && rows.length) {
      const need = lastUsed + rows.length;
      if (need > maxRows) sh.insertRowsAfter(maxRows, need - maxRows);
      sh.getRange(lastUsed + 1, 1, rows.length, width).setValues(rows);
      SpreadsheetApp.flush();
    }
    return {
      added: rows.map((r, i) => ({ id: r[0], label: r[2], product: r[12], link: r[4], row: lastUsed + 1 + i })),
      noFolder: groups.noFolder,
      already: groups.folders.length - fresh.length,
    };
  } finally {
    lock.releaseLock();
  }
}

/** Approved RAW REVIEW clips grouped by Drive folder, with shoot details filled from SHOOT PLAN. */
function catApprovedFolders_() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(CAT.REVIEW);
  if (!sh) throw new Error('No sheet named ' + CAT.REVIEW + '.');
  const lastCol = sh.getLastColumn();
  const cols = {};
  sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].forEach((t, i) => {
    const f = CAT.REVIEW_HEADERS[String(t).trim()];
    if (f) cols[f] = i + 1;
  });
  ['qc', 'approval', 'shootId'].forEach((f) => {
    if (!cols[f]) throw new Error('RAW REVIEW is missing a column the RAW CATALOG link needs (' + f + ').');
  });

  // Shoot ID → SHOOT PLAN row, for the folder link, product, format and date when RAW REVIEW lacks them.
  const plan = sdPlan_();
  const byShoot = {};
  if (plan.cols.shootId) {
    const ids = plan.sheet.getRange(2, plan.cols.shootId, Math.max(plan.values.length, 1), 1).getDisplayValues();
    plan.values.forEach((vals, i) => {
      const id = String((ids[i] || [''])[0]).trim();
      if (id) byShoot[id] = sdRowObject_(plan.cols, vals, tz);
    });
  }

  const last = sh.getLastRow();
  const vals = last >= 2 ? sh.getRange(2, 1, last - 1, lastCol).getValues() : [];
  const shown = last >= 2 ? sh.getRange(2, 1, last - 1, lastCol).getDisplayValues() : [];
  const get = (i, f) => (cols[f] ? String(shown[i][cols[f] - 1]).trim() : '');

  const groups = {};
  const order = [];
  const noFolder = [];
  vals.forEach((row, i) => {
    if (get(i, 'qc') !== 'Pass' || get(i, 'approval') !== 'Approved') return;
    const shootId = get(i, 'shootId');
    const p = byShoot[shootId] || {};
    const folderUrl = get(i, 'folder') || p.rawFolder || '';
    const folderId = catFolderId_(folderUrl);
    if (!folderId) {
      if (noFolder.indexOf(shootId || '(no Shoot ID)') < 0) noFolder.push(shootId || '(no Shoot ID)');
      return;
    }
    let date = '';
    if (cols.date) {
      const d = row[cols.date - 1];
      date = Object.prototype.toString.call(d) === '[object Date]' ? sdDay_(d, tz) : sdNormaliseDayText_(d);
    }
    date = date || p.date || '';
    if (!groups[folderId]) {
      groups[folderId] = { folderId: folderId, folderUrl: folderUrl, shootIds: [], products: [], formats: [], dates: [], clips: 0 };
      order.push(folderId);
    }
    const g = groups[folderId];
    g.clips++;
    const add = (list, v) => { v = String(v || '').trim(); if (v && list.indexOf(v) < 0) list.push(v); };
    add(g.shootIds, shootId);
    add(g.products, get(i, 'product') || p.product);
    add(g.formats, get(i, 'format') || p.contentType);
    add(g.dates, date);
  });
  return { folders: order.map((k) => groups[k]), noFolder: noFolder };
}

/** One RAW CATALOG row (columns A–M) for a folder. */
function catRow_(g, n) {
  const label = catLabel_(g.formats[0]);
  const dates = g.dates.slice().sort();
  const product = g.products.join(' / ');
  const restricted = /influenc|model|old file|testimon|feedback/.test((CAT.CATEGORY + ' ' + label).toLowerCase());
  return [
    'RAW-' + String(n).padStart(3, '0'),
    CAT.CATEGORY,
    label,
    dates[0] ? catDate_(dates[0]) : '',
    g.folderUrl,
    (product ? product + ' · ' : '') + g.clips + ' approved clip' + (g.clips === 1 ? '' : 's'),
    '',
    CAT.STATUS,
    restricted ? 'Restricted / review rights' : 'Starter / rotation',
    '',
    '',
    'Added from BTY B-Roll Tracker (' + (g.shootIds.join(', ') || 'no Shoot ID') + '). Check links, claims and permissions before marking Ready.',
    product,
  ];
}

// ---------- Helpers ----------

function catSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('CATALOG_SHEET_ID') || CAT.SHEET_ID;
  const sh = SpreadsheetApp.openById(id).getSheetByName(CAT.TAB);
  if (!sh) throw new Error('The distribution sheet has no tab named ' + CAT.TAB + '.');
  return sh;
}

/** The Drive folder ID inside a folder link, or ''. */
function catFolderId_(url) {
  const s = String(url || '');
  const m = /\/folders\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s);
  return m ? m[1] : '';
}

function catLabel_(format) {
  const key = String(format || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!key) return 'B-ROLL SHOOT';
  return CAT.LABELS[key] || key;
}

/** YYYY-MM-DD → a Date at noon, so the sheet shows the same day in any time zone near Manila. */
function catDate_(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : '';
}

function catSummary_(out, wrote) {
  const lines = [];
  if (out.added.length) {
    lines.push((wrote ? 'Added ' : 'Would add ') + out.added.length + ' folder' + (out.added.length === 1 ? '' : 's') + ':');
    out.added.forEach((a) => lines.push('• ' + a.id + ' — ' + a.label + (a.product ? ' — ' + a.product : '') + ' (row ' + a.row + ')'));
  } else {
    lines.push('No new approved RAW folders.');
  }
  if (out.already) lines.push(out.already + ' approved folder' + (out.already === 1 ? ' is' : 's are') + ' already in RAW CATALOG.');
  if (out.noFolder.length) lines.push('Approved clips with no RAW folder link, skipped: ' + out.noFolder.join(', ') + '.');
  if (out.added.length) lines.push('New rows are set to Needs Review. A coordinator marks them Ready.');
  return lines.join('\n');
}
