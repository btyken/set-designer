// An in-memory copy of the tracker sheet, Drive and script properties, with apps-script/Code.gs loaded.
// Used by the tests and by scripts/mock-tracker.mjs for trying the Shoots screen without Google.
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const HEAD = ['Shoot Date', 'BTY Product(s)', 'Audience', 'Content Type', 'Set / Lighting / Props / Angles', 'Time Block', 'Planned Clips', 'Captured Clips', 'QC Passed Clips', 'Moodboard / Reference Link', 'Pre-Shoot Approval', 'Shoot Status', 'RAW Folder Link', 'Remaining (Auto)', 'Shoot ID (Auto)', 'Video Files Logged (Auto)', 'Assigned Member', 'Member Shoot Task', 'Video Stream'];
export const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d, -8 + 24) - 24 * 3600e3); // midnight in Manila
export const planRow = (date, product, audience, planned, member, extra = {}) => {
  const r = Array(HEAD.length).fill('');
  r[0] = date; r[1] = product; r[2] = audience; r[5] = '2-5PM'; r[6] = planned; r[16] = member;
  for (const [k, v] of Object.entries(extra)) r[HEAD.indexOf(k)] = v;
  return r;
};

export function world({ rows } = {}) {
  let nextId = 1;
  const ids = () => `id${nextId++}`;
  const props = new Map();
  const items = new Map(); // id → file or folder

  class Folder {
    constructor(name, parent) { this.id = ids(); this.name = name; this.parent = parent; this.trashed = false; this.desc = ''; this.sharing = null; items.set(this.id, this); }
    getId() { return this.id; }
    getUrl() { return `https://drive.google.com/drive/folders/${this.id}`; }
    getParents() { return iter(this.parent ? [this.parent] : []); }
    isTrashed() { return this.trashed; }
    setDescription(d) { this.desc = d; }
    setSharing(a, p) { this.sharing = [a, p]; }
    createFolder(name) { return new Folder(name, this); }
    createFile(blob) { return new File(blob, this); }
    getFiles() { return iter([...items.values()].filter((f) => f instanceof File && f.parent === this && !f.trashed)); }
  }
  class File {
    constructor(blob, parent) { this.id = ids(); this.blob = blob; this.parent = parent; this.trashed = false; this.desc = ''; this.created = new Date(Date.now() + nextId); items.set(this.id, this); }
    getId() { return this.id; }
    getName() { return this.blob.name; }
    getMimeType() { return this.blob.type; }
    getParents() { return iter([this.parent]); }
    getDescription() { return this.desc; }
    setDescription(d) { this.desc = d; }
    setSharing() {}
    setTrashed(v) { this.trashed = v; }
    getDateCreated() { return this.created; }
    getBlob() { return { getContentType: () => this.blob.type, getBytes: () => this.blob.bytes }; }
    getThumbnail() { return this.getBlob(); }
  }
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };

  const driveRoot = new Folder('My Drive', null);
  const sheetFolder = new Folder('B-roll', driveRoot);
  const sheetFile = new File({ name: 'tracker', type: 'application/vnd.google-apps.spreadsheet', bytes: [] }, sheetFolder);

  const plan = rows ? [HEAD, ...rows] : [HEAD,
    planRow(day(2026, 11, 18), '4EVER GLOW SET', 'Internal', 75, 'Maye', { 'Video Stream': 'Internal - Massive' }),
    planRow(day(2026, 11, 18), '4EVER GLOW SET', 'External', 60, 'Maegan', { 'Moodboard / Reference Link': 'https://pinterest.com/pin/1' }),
    planRow(day(2026, 11, 19), 'SPF', 'Internal', 30, 'Luiz'),
    planRow(day(2026, 10, 17), 'OLD SHOOT', 'Internal', 75, 'Abe'),
  ];
  const overview = Array.from({ length: 12 }, () => Array(11).fill(''));
  overview[3].splice(3, 2, 'Stream', 'Weekly target');
  overview[4].splice(3, 2, 'Internal - Massive', '90');
  overview[5].splice(3, 2, 'Internal - CBQ', '90');
  overview[6].splice(3, 2, 'External', '60');

  const sheet = (data, id) => ({
    data,
    getSheetId: () => id,
    getLastRow: () => data.length,
    getLastColumn: () => data[0].length,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => data.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
      getDisplayValues: () => data.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc).map(String)),
      setValue: (v) => { data[r - 1][c - 1] = v; },
    }),
  });
  const sheets = { 'SHOOT PLAN': sheet(plan, 9005), OVERVIEW: sheet(overview, 9001) };
  const ss = {
    getName: () => 'BTY B-Roll Tracker', getUrl: () => 'https://docs.google.com/spreadsheets/d/X/edit', getId: () => sheetFile.id,
    getSpreadsheetTimeZone: () => 'Asia/Manila', getSheetByName: (n) => sheets[n] || null,
  };

  const ctx = {
    SpreadsheetApp: { getActive: () => ss, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }) },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'anyone' }, Permission: { VIEW: 'view' },
      getRootFolder: () => driveRoot,
      getFileById: (id) => { const f = items.get(id); if (!(f instanceof File)) throw new Error('nf'); return f; },
      getFolderById: (id) => { const f = items.get(id); if (!(f instanceof Folder)) throw new Error('nf'); return f; },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_a, text) => [...createHash('sha256').update(text, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
      base64Decode: (s) => [...Buffer.from(s, 'base64')],
      base64Encode: (b) => Buffer.from(b).toString('base64'),
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const token = createHash('sha256').update('sd-api:team-pass').digest('hex');
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body);
  return { ctx, props, plan, items, post, token, setToken: () => props.set('API_TOKEN', token) };
}

