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
  assert.equal(Object.keys(out.boards).length, 2);
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
