// Runs apps-script/Code.gs against an in-memory copy of the tracker, Drive and script properties.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world } from './helpers/gas-world.js';

test('refuses calls until the passcode is set, then checks it', () => {
  const w = world();
  assert.match(w.post({ action: 'ping', token: w.token }).error, /no team passcode/);
  w.setToken();
  const bad = w.post({ action: 'ping', token: 'nope' });
  assert.equal(bad.ok, false);
  assert.equal(bad.auth, true);
  assert.equal(w.post({ action: 'ping', token: w.token }).ok, true);
});

test('the token matches what the browser computes', () => {
  const w = world();
  assert.equal(w.ctx.sdHash_('sd-api:team-pass'), w.token);
});

test('week returns only that week, grouped boards and the targets', () => {
  const w = world();
  w.setToken();
  const out = w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.weekEnd, '2026-11-22');
  assert.deepEqual(out.rows.map((r) => r.member), ['Maye', 'Maegan', 'Luiz']);
  assert.deepEqual(out.rows.map((r) => r.row), [2, 3, 4]);
  assert.equal(out.rows[0].date, '2026-11-18');
  assert.equal(out.rows[0].planned, 75);
  assert.equal(out.rows[0].captured, null);
  assert.equal(out.rows[0].board, out.rows[1].board);
  assert.notEqual(out.rows[0].board, out.rows[2].board);
  assert.equal(Object.keys(out.boards).length, 4); // two shoots this week, one open shoot, General
  assert.ok(out.boards.GENERAL);
  assert.deepEqual(out.targets, { 'Internal - Massive': 90, 'Internal - CBQ': 90, External: 60 });
  assert.match(out.sheetUrl, /#gid=9005$/);
});

test('report writes captured, QC and status to the right row only', () => {
  const w = world();
  w.setToken();
  const expect = { date: '2026-11-18', product: '4EVER GLOW SET', member: 'Maye' };
  const out = w.post({ action: 'report', token: w.token, row: 2, expect, captured: 70, qcPassed: 64, status: 'QC' });
  assert.equal(out.ok, true, out.error);
  assert.equal(w.plan[1][7], 70);
  assert.equal(w.plan[1][8], 64);
  assert.equal(w.plan[1][11], 'QC');
  assert.equal(w.plan[2][7], '');
  assert.equal(out.row.captured, 70);
  // Leaving QC blank keeps what is there.
  w.post({ action: 'report', token: w.token, row: 2, expect, captured: 72, qcPassed: null });
  assert.equal(w.plan[1][8], 64);
  assert.equal(w.plan[1][11], 'QC');
});

test('report refuses bad numbers, unknown statuses and a moved row', () => {
  const w = world();
  w.setToken();
  const expect = { date: '2026-11-18', product: '4EVER GLOW SET', member: 'Maye' };
  assert.match(w.post({ action: 'report', token: w.token, row: 2, expect, captured: 5, qcPassed: 9 }).error, /more than captured/);
  assert.match(w.post({ action: 'report', token: w.token, row: 2, expect, captured: -1 }).error, /whole number/);
  assert.match(w.post({ action: 'report', token: w.token, row: 2, expect, captured: 1, status: 'Done' }).error, /status/);
  assert.match(w.post({ action: 'report', token: w.token, row: 3, expect, captured: 1 }).error, /changed/);
  assert.match(w.post({ action: 'report', token: w.token, row: 99, expect, captured: 1 }).error, /no longer exists/);
  assert.equal(w.plan[1][7], '');
});

test('upload makes one folder per shoot and links it only where the cell is empty', () => {
  const w = world();
  w.setToken();
  const week = w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' });
  const board = week.rows[0].board;
  const image = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg').toString('base64');
  const a = w.post({ action: 'upload', token: w.token, board, title: '2026-11-18 · 4EVER GLOW SET · 2-5PM', name: 'peg one', note: 'Low angle, warm rim', by: 'Maye', image });
  assert.equal(a.ok, true, a.error);
  const b = w.post({ action: 'upload', token: w.token, board, name: 'peg two', image });
  assert.equal(b.folderUrl, a.folderUrl);
  assert.equal(a.pin.note, 'Low angle, warm rim');
  assert.equal(a.pin.by, 'Maye');
  assert.equal(w.plan[1][9], a.folderUrl); // Maye's empty cell gets the folder
  assert.equal(w.plan[2][9], 'https://pinterest.com/pin/1'); // Maegan's own reference stays
  assert.equal(w.plan[3][9], ''); // a different shoot is untouched
  const again = w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' });
  assert.equal(again.boards[board].pins.length, 2);
  assert.equal(again.boards[board].folderUrl, a.folderUrl);
});

test('photos can be fetched and removed only from board folders', () => {
  const w = world();
  w.setToken();
  const week = w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' });
  const image = 'data:image/png;base64,' + Buffer.from('png').toString('base64');
  const up = w.post({ action: 'upload', token: w.token, board: week.rows[0].board, image });
  const got = w.post({ action: 'image', token: w.token, fileId: up.pin.id });
  assert.equal(got.image, image);
  // The spreadsheet itself is a Drive file outside the boards: refused.
  const sheetId = w.ctx.SpreadsheetApp.getActive().getId();
  assert.match(w.post({ action: 'image', token: w.token, fileId: sheetId }).error, /not found/);
  assert.match(w.post({ action: 'remove', token: w.token, fileId: sheetId }).error, /not found/);
  assert.equal(w.post({ action: 'remove', token: w.token, fileId: up.pin.id }).ok, true);
  const after = w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' });
  assert.equal(after.boards[week.rows[0].board].pins.length, 0);
});

test('upload refuses non-images and unknown shoots', () => {
  const w = world();
  w.setToken();
  assert.match(w.post({ action: 'upload', token: w.token, board: '2026-11-18|X|Y', image: 'data:text/plain;base64,aGk=' }).error, /JPEG/);
  assert.match(w.post({ action: 'upload', token: w.token, board: 'nonsense', image: 'data:image/png;base64,aGk=' }).error, /Unknown shoot/);
});

test('earlier shoots still short of plan are carried over; closed or done ones are not', () => {
  const w = world();
  w.setToken();
  const out = w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' });
  assert.deepEqual(out.openRows.map((r) => [r.member, r.date]), [['Abe', '2026-10-17']]);
  assert.ok(out.boards[out.openRows[0].board]);
  // Mark it Completed: no longer carried.
  w.plan[4][11] = 'Completed';
  assert.equal(w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' }).openRows.length, 0);
  // Captured all planned clips: not carried either.
  w.plan[4][11] = '';
  w.plan[4][7] = 75;
  assert.equal(w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' }).openRows.length, 0);
  // Too long ago: not carried.
  const old = w.post({ action: 'week', token: w.token, weekStart: '2027-06-07' });
  assert.equal(old.openRows.length, 0);
});

test('the General board takes uploads without touching the sheet', () => {
  const w = world();
  w.setToken();
  const image = 'data:image/jpeg;base64,' + Buffer.from('jpeg').toString('base64');
  const up = w.post({ action: 'upload', token: w.token, board: 'GENERAL', name: 'mood', note: 'Warm skin tones', image });
  assert.equal(up.ok, true, up.error);
  assert.deepEqual(w.plan.slice(1).map((r) => r[9]), ['', 'https://pinterest.com/pin/1', '', '']);
  const week = w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' });
  assert.equal(week.boards.GENERAL.pins.length, 1);
  assert.equal(week.boards.GENERAL.folderUrl, up.folderUrl);
});

test('stream sets Video Stream on the right row only', () => {
  const w = world();
  w.setToken();
  const expect = { date: '2026-11-19', product: 'SPF', member: 'Luiz' };
  const out = w.post({ action: 'stream', token: w.token, row: 4, expect, stream: 'Internal - CBQ' });
  assert.equal(out.ok, true, out.error);
  assert.equal(w.plan[3][18], 'Internal - CBQ');
  assert.equal(out.row.stream, 'Internal - CBQ');
  assert.equal(w.plan[2][18], '');
  assert.match(w.post({ action: 'stream', token: w.token, row: 4, expect, stream: 'Massive' }).error, /Pick/);
  assert.match(w.post({ action: 'stream', token: w.token, row: 2, expect, stream: 'External' }).error, /changed/);
});

test('later uploads skip the sheet unless the app asks, and files lean on the folder sharing', () => {
  const w = world();
  w.setToken();
  const week = w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' });
  const board = week.rows[0].board;
  const image = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg').toString('base64');
  const a = w.post({ action: 'upload', token: w.token, board, image });
  assert.equal(w.plan[1][9], a.folderUrl); // new folder: linked
  const file = w.items.get(a.pin.id);
  assert.equal(file.sharing, undefined); // folder is link-shared, so the file is not shared on its own

  w.plan[1][9] = ''; // someone clears the cell
  w.post({ action: 'upload', token: w.token, board, image });
  assert.equal(w.plan[1][9], ''); // not asked: sheet left alone
  w.post({ action: 'upload', token: w.token, board, image, link: true });
  assert.equal(w.plan[1][9], a.folderUrl); // asked: filled again
});

test('a file is shared on its own when its folder could not be shared', () => {
  const w = world();
  w.setToken();
  const week = w.post({ action: 'week', token: w.token, weekStart: '2026-11-16' });
  const image = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg').toString('base64');
  const a = w.post({ action: 'upload', token: w.token, board: week.rows[0].board, image });
  const folder = w.items.get(a.pin.id).parent;
  folder.sharing = null; // as if domain policy blocked folder sharing
  const b = w.post({ action: 'upload', token: w.token, board: week.rows[0].board, image });
  assert.deepEqual(w.items.get(b.pin.id).sharing, ['anyone', 'view']);
});
