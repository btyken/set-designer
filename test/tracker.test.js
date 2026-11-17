import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mondayOf, addDays, weekLabel, streamOf, remaining, weekTotals, shootLines, shootTotals, groupShoots, memberQuotas, checkReport, isDriveFolder } from '../public/shoot-dashboard/tracker.js';

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

test('targets apply to each shoot, stream by stream', () => {
  const [b, a] = groupShoots(ROWS);
  const lines = shootLines(a, TARGETS);
  assert.deepEqual(lines.map((l) => l.name), ['Internal - Massive', 'External', 'Internal - Unassigned']);
  const [massive, external, unassigned] = lines;
  assert.deepEqual([massive.target, massive.captured, massive.need, massive.unplanned], [90, 60, 30, 15]);
  assert.deepEqual([external.target, external.captured, external.need, external.unplanned], [60, 45, 15, 20]);
  assert.deepEqual([unassigned.target, unassigned.planned, unassigned.need], [0, 75, 0]);
  const t = shootTotals(a, TARGETS);
  assert.deepEqual([t.target, t.captured, t.need], [150, 105, 45]);
  assert.equal(shootTotals(b, TARGETS).need, 80);
});

test('the week adds up each shoot target', () => {
  const t = weekTotals(ROWS, TARGETS);
  assert.deepEqual([t.massive.target, t.massive.need, t.massive.shoots], [90, 30, 1]);
  assert.deepEqual([t.cbq.target, t.cbq.need, t.cbq.unplanned], [90, 80, 60]);
  assert.deepEqual([t.external.target, t.external.captured, t.external.need], [60, 45, 15]);
  assert.deepEqual([t.internal.target, t.internal.planned, t.internal.captured, t.internal.need], [180, 180, 70, 110]);
  assert.equal(t.internal.shoots, 2);
  assert.equal(t.unassigned.rows, 1);
  assert.equal(t.unassigned.planned, 75);
});

test('extra clips on one shoot do not cover another shoot', () => {
  const rows = [
    { board: 'x', date: '2026-11-17', product: 'A', stream: 'Internal - Massive', audience: 'Internal', planned: 90, captured: 120 },
    { board: 'y', date: '2026-11-18', product: 'B', stream: 'Internal - Massive', audience: 'Internal', planned: 90, captured: 0 },
  ];
  const t = weekTotals(rows, TARGETS);
  assert.equal(t.massive.target, 180);
  assert.equal(t.massive.captured, 120);
  assert.equal(t.massive.need, 90);
  assert.equal(t.massive.shoots, 2);
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

test('quotas are captured against planned, per person, with carried-over work', () => {
  const rows = [
    { member: 'Maye', planned: 75, captured: 20 },
    { member: 'Maye', planned: 30, captured: null },
    { member: 'Abe', planned: 45, captured: 50 },
  ];
  const open = [{ member: 'Abe', planned: 75, captured: 10 }];
  const q = Object.fromEntries(memberQuotas(rows, open).map((m) => [m.member, m]));
  assert.deepEqual([q.Maye.quota, q.Maye.captured, q.Maye.need, q.Maye.carried], [105, 20, 85, 0]);
  assert.deepEqual([q.Abe.quota, q.Abe.captured, q.Abe.need, q.Abe.carried], [120, 60, 65, 65]);
  assert.deepEqual(memberQuotas(rows, open).map((m) => m.member), ['Maye', 'Abe']);
});
