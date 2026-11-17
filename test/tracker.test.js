import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mondayOf, addDays, weekLabel, streamOf, remaining, weekTotals, groupShoots, checkReport, isDriveFolder } from '../public/tracker.js';

test('weeks run Monday to Sunday', () => {
  assert.equal(mondayOf(new Date(2026, 10, 17)), '2026-11-16'); // Tuesday
  assert.equal(mondayOf(new Date(2026, 10, 16)), '2026-11-16'); // Monday
  assert.equal(mondayOf(new Date(2026, 10, 22)), '2026-11-16'); // Sunday
  assert.equal(addDays('2026-11-16', 7), '2026-11-23');
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
  assert.equal(weekLabel('2026-11-16'), 'Nov 16–22');
  assert.equal(weekLabel('2026-11-30'), 'Nov 30 – Dec 6');
});

test('streams follow the tracker rules', () => {
  assert.equal(streamOf({ audience: 'Internal', stream: 'Internal - CBQ' }), 'Internal - CBQ');
  assert.equal(streamOf({ audience: 'External', stream: '' }), 'External');
  assert.equal(streamOf({ audience: 'Internal', stream: '' }), 'Internal - Unassigned');
  assert.equal(streamOf({ audience: 'Both', stream: 'External' }), 'External');
});

test('remaining clips never go below zero', () => {
  assert.equal(remaining({ planned: 75, captured: 20 }), 55);
  assert.equal(remaining({ planned: 75, captured: 90 }), 0);
  assert.equal(remaining({ planned: 75, captured: null }), 75);
  assert.equal(remaining({ planned: null, captured: null }), 0);
});

const ROWS = [
  { board: 'a', date: '2026-11-18', timeBlock: '2-5PM', product: 'GLOW', audience: 'Internal', stream: 'Internal - Massive', planned: 75, captured: 60, qcPassed: 50 },
  { board: 'a', date: '2026-11-18', timeBlock: '2-5PM', product: 'GLOW', audience: 'Internal', stream: '', planned: 75, captured: null, qcPassed: null },
  { board: 'a', date: '2026-11-18', timeBlock: '2-5PM', product: 'GLOW', audience: 'External', stream: '', planned: 40, captured: 45, qcPassed: 40 },
  { board: 'b', date: '2026-11-17', timeBlock: '9-12NN', product: 'SPF', audience: 'Internal', stream: 'Internal - CBQ', planned: 30, captured: 10, qcPassed: null },
];
const TARGETS = { 'Internal - Massive': 90, 'Internal - CBQ': 90, External: 60 };

test('weekly totals match the tracker overview', () => {
  const t = weekTotals(ROWS, TARGETS);
  assert.equal(t.internal.target, 180);
  assert.equal(t.internal.planned, 180);
  assert.equal(t.internal.captured, 70);
  assert.equal(t.internal.need, 110);
  assert.equal(t.internal.unplanned, 0);
  assert.equal(t.massive.captured, 60);
  assert.equal(t.massive.need, 30);
  assert.equal(t.massive.unplanned, 15);
  assert.equal(t.cbq.unplanned, 60);
  assert.equal(t.external.captured, 45);
  assert.equal(t.external.need, 15);
  assert.equal(t.external.unplanned, 20);
  assert.equal(t.unassigned.rows, 1);
  assert.equal(t.unassigned.planned, 75);
});

test('a stream with no target needs nothing', () => {
  const t = weekTotals(ROWS, {});
  assert.equal(t.external.target, 0);
  assert.equal(t.external.need, 0);
});

test('rows group into shoots in date order', () => {
  const g = groupShoots(ROWS);
  assert.deepEqual(g.map((s) => s.key), ['b', 'a']);
  assert.equal(g[1].rows.length, 3);
});

test('shot reports are checked before sending', () => {
  assert.equal(checkReport({ captured: '20', qcPassed: '' }), '');
  assert.equal(checkReport({ captured: '20', qcPassed: '20' }), '');
  assert.match(checkReport({ captured: '', qcPassed: '' }), /captured/);
  assert.match(checkReport({ captured: '2.5', qcPassed: '' }), /captured/);
  assert.match(checkReport({ captured: '-1', qcPassed: '' }), /captured/);
  assert.match(checkReport({ captured: '10', qcPassed: '12' }), /more than captured/);
});

test('app folders are told apart from pasted reference links', () => {
  assert.ok(isDriveFolder('https://drive.google.com/drive/folders/abc123'));
  assert.ok(isDriveFolder('https://drive.google.com/drive/u/0/folders/abc123'));
  assert.ok(!isDriveFolder('https://www.pinterest.com/pin/123'));
});
