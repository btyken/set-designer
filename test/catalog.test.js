// RAW REVIEW → RAW CATALOG link (apps-script/Catalog.gs), against in-memory sheets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, planRow, reviewRow, catalogRow, day } from './helpers/gas-world.js';

const F1 = 'https://drive.google.com/drive/folders/1AAAAAAAAAAAAAAAAAAAAAAAAA';
const F2 = 'https://drive.google.com/drive/folders/1BBBBBBBBBBBBBBBBBBBBBBBBB';
const OLD = 'https://drive.google.com/drive/folders/1DlY5TGkPo71HE1GZfb-NHHED8VLL5rYa?usp=sharing';

const shoots = () => [
  planRow(day(2026, 11, 17), '4EVER GLOW SET', 'Internal', 75, 'Maye', { 'Shoot ID (Auto)': 'SHOOT-0002', 'RAW Folder Link': F1, 'Content Type': 'Product Showcase' }),
  planRow(day(2026, 11, 17), '4EVER GLOW SET', 'External', 75, 'Maegan', { 'Shoot ID (Auto)': 'SHOOT-0003', 'RAW Folder Link': F2, 'Content Type': 'Faceless with Model' }),
  planRow(day(2026, 11, 18), 'SPF', 'Internal', 30, 'Luiz', { 'Shoot ID (Auto)': 'SHOOT-0004' }),
];
const plain = (v) => JSON.parse(JSON.stringify(v)); // arrays made inside the script's sandbox
const file = (n) => `https://drive.google.com/file/d/clip${n}/view`;

test('adds one Needs Review row per approved folder, filled from SHOOT PLAN', () => {
  const w = world({
    rows: shoots(),
    review: [
      reviewRow('SHOOT-0002', file(1), 'Pass', 'Approved'),
      reviewRow('SHOOT-0002', file(2), 'Pass', 'Approved'),
      reviewRow('SHOOT-0002', file(3), 'Retake', 'Pending'),
      reviewRow('SHOOT-0003', file(4), 'Pass', 'Approved'),
    ],
  });
  const out = w.ctx.catSync_(true);
  assert.deepEqual(plain(out.added.map((a) => [a.id, a.row])), [['RAW-048', 3], ['RAW-049', 4]]);
  assert.deepEqual(w.opened, ['1INTgPB4dDqawEvFr3EPg3r1Aal4_C6eWakxillOFs1w']);

  const a = w.catalog[2];
  assert.equal(a[0], 'RAW-048');
  assert.equal(a[1], 'BTY B-ROLLS (VIDEO)');
  assert.equal(a[2], 'PRODUCT SHOWCASE');
  assert.equal(a[3].getDate(), 17);
  assert.equal(a[3].getMonth(), 10);
  assert.equal(a[4], F1);
  assert.equal(a[5], '4EVER GLOW SET · 2 approved clips');
  assert.equal(a[7], 'Needs Review');
  assert.equal(a[8], 'Starter / rotation');
  assert.match(a[11], /SHOOT-0002/);
  assert.equal(a[12], '4EVER GLOW SET');
  // Columns N–R (formulas in the real sheet) are left alone.
  assert.deepEqual(a.slice(13), ['', '', '', '', '']);

  const b = w.catalog[3];
  assert.equal(b[2], 'FACELESS WITH MODEL');
  assert.equal(b[5], '4EVER GLOW SET · 1 approved clip');
  assert.equal(b[8], 'Restricted / review rights');
});

test('never adds the same folder twice, including folders already typed in by hand', () => {
  const w = world({
    rows: shoots(),
    review: [reviewRow('SHOOT-0002', file(1), 'Pass', 'Approved', { 'RAW Folder Link (Auto)': OLD })],
  });
  assert.equal(w.ctx.catSync_(true).added.length, 0);
  assert.equal(w.ctx.catSync_(true).already, 1);

  const w2 = world({ rows: shoots(), review: [reviewRow('SHOOT-0002', file(1), 'Pass', 'Approved')] });
  assert.equal(w2.ctx.catSync_(true).added.length, 1);
  const again = w2.ctx.catSync_(true);
  assert.equal(again.added.length, 0);
  assert.equal(again.already, 1);
  assert.equal(w2.catalog.filter((r) => r[4] === F1).length, 1);
});

test('only Pass + Approved counts; nothing is written for pending, retake or rejected clips', () => {
  const w = world({
    rows: shoots(),
    review: [
      reviewRow('SHOOT-0002', file(1), 'Pass', 'Pending'),
      reviewRow('SHOOT-0002', file(2), 'Pass', 'Rejected'),
      reviewRow('SHOOT-0003', file(3), 'Reject', 'Approved'),
    ],
  });
  const before = JSON.stringify(w.catalog);
  const out = w.ctx.catSync_(true);
  assert.equal(out.added.length, 0);
  assert.equal(JSON.stringify(w.catalog), before);
});

test('preview writes nothing', () => {
  const w = world({ rows: shoots(), review: [reviewRow('SHOOT-0002', file(1), 'Pass', 'Approved')] });
  const before = JSON.stringify(w.catalog);
  const out = w.ctx.catSync_(false);
  assert.equal(out.added.length, 1);
  assert.equal(JSON.stringify(w.catalog), before);
});

test('approved clips without a RAW folder link are reported and skipped', () => {
  const w = world({ rows: shoots(), review: [reviewRow('SHOOT-0004', file(1), 'Pass', 'Approved')] });
  const out = w.ctx.catSync_(true);
  assert.equal(out.added.length, 0);
  assert.deepEqual(plain(out.noFolder), ['SHOOT-0004']);
  assert.match(w.ctx.catSummary_(out, true), /no RAW folder link, skipped: SHOOT-0004/);
});

test('RAW REVIEW values win over SHOOT PLAN, and rows go after the last filled row', () => {
  const w = world({
    rows: shoots(),
    review: [reviewRow('SHOOT-0004', file(1), 'Pass', 'Approved', { 'RAW Folder Link (Auto)': F2, 'BTY Product(s) (Auto)': 'SPF 50', 'Content Format (Auto)': 'Get Ready With Me' })],
    catalog: [catalogRow('RAW-010', OLD), catalogRow('', ''), catalogRow('RAW-046', 'https://drive.google.com/drive/folders/1ZmDWvrqsUuLavV5nS4TTjzGypIPMdDlL')],
  });
  // Blank out the middle row completely: a gap someone left.
  w.catalog[2] = Array(18).fill('');
  const out = w.ctx.catSync_(true);
  assert.deepEqual(plain(out.added.map((a) => [a.id, a.row])), [['RAW-047', 5]]);
  assert.equal(w.catalog[4][2], 'GRWM');
  assert.equal(w.catalog[4][12], 'SPF 50');
  assert.equal(w.catalog[2][0], '');
});

test('adds rows to the sheet when it runs out of room', () => {
  const w = world({
    rows: shoots(),
    review: [reviewRow('SHOOT-0002', file(1), 'Pass', 'Approved'), reviewRow('SHOOT-0003', file(2), 'Pass', 'Approved')],
    catalogBlank: 0,
  });
  const out = w.ctx.catSync_(true);
  assert.equal(out.added.length, 2);
  assert.equal(w.catalog.length, 4);
  assert.equal(w.catalog[3][4], F2);
});

test('refuses to write if the RAW CATALOG columns have moved', () => {
  const w = world({ rows: shoots(), review: [reviewRow('SHOOT-0002', file(1), 'Pass', 'Approved')] });
  w.catalog[0][4] = 'Folder';
  const before = JSON.stringify(w.catalog);
  assert.throws(() => w.ctx.catSync_(true), /column E should be "Drive Folder Link"/);
  assert.equal(JSON.stringify(w.catalog), before);
});

test('folder IDs are read from every common Drive link shape', () => {
  const w = world();
  assert.equal(w.ctx.catFolderId_('https://drive.google.com/drive/folders/1AbC-def_ghiJKLmnop?usp=sharing'), '1AbC-def_ghiJKLmnop');
  assert.equal(w.ctx.catFolderId_('https://drive.google.com/drive/u/1/folders/1AbC-def_ghiJKLmnop'), '1AbC-def_ghiJKLmnop');
  assert.equal(w.ctx.catFolderId_('https://drive.google.com/open?id=1AbC-def_ghiJKLmnop'), '1AbC-def_ghiJKLmnop');
  assert.equal(w.ctx.catFolderId_('not a link'), '');
});

test('the hourly switch adds one trigger and removes it', () => {
  const w = world();
  w.ctx.SpreadsheetApp.getUi = () => ({ alert() {}, ButtonSet: { OK: 'ok' } });
  w.ctx.catTurnOnHourly();
  w.ctx.catTurnOnHourly();
  assert.equal(w.triggers.length, 1);
  assert.equal(w.triggers[0].fn, 'catHourly');
  assert.equal(w.triggers[0].h, 1);
  w.ctx.catTurnOffHourly();
  assert.equal(w.triggers.length, 0);
});
