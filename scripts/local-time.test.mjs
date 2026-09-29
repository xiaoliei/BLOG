import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { localDate, localDateAtMinutes, localDateTime, localWorldTime } from '../src/lib/local-time.js';

test('world lighting follows local wall time at day boundaries', () => {
  for (const [hour, phase] of [[0, 'night'], [6, 'morning'], [12, 'day'], [18, 'evening'], [23, 'night']]) {
    assert.equal(localWorldTime(new Date(2026, 8, 29, hour)).phase, phase);
  }
  assert.ok(localWorldTime(new Date(2026, 8, 29, 12)).sun > localWorldTime(new Date(2026, 8, 29, 0)).sun);
  assert.equal(localWorldTime(new Date(2026, 8, 29, 12)).ink, '#173d3e');
  assert.equal(localWorldTime(new Date(2026, 8, 29, 0)).ink, '#f3f8ff');
  assert.notEqual(localWorldTime(new Date(2026, 8, 29, 19)).ink, '#173d3e');
  assert.notEqual(localWorldTime(new Date(2026, 8, 29, 19)).ink, '#f3f8ff');
  const sunrise=localWorldTime(new Date(2026, 8, 29, 6));
  const noon=localWorldTime(new Date(2026, 8, 29, 12));
  const sunset=localWorldTime(new Date(2026, 8, 29, 18));
  assert.ok(sunrise.sunX > 0 && sunset.sunX < 0);
  assert.ok(Math.abs(noon.sunX) < 0.001 && noon.elevation > sunrise.elevation);
  assert.ok(localWorldTime(new Date(2026, 8, 29, 0)).sunZ < 0);
});

test('the same instant displays as each visitor’s local calendar day', () => {
  const moduleUrl = new URL('../src/lib/local-time.js', import.meta.url).href;
  const script = `import { localDate, localDateTime, localWorldTime } from ${JSON.stringify(moduleUrl)}; const value = '2026-09-29T00:30:00.000Z'; console.log(JSON.stringify([localDate(new Date(value)), localDateTime(value), localWorldTime(new Date(value)).phase]));`;
  const inZone = zone => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8' }));
  assert.deepEqual(inZone('Asia/Shanghai'), ['2026-09-29', '2026-09-29 08:30', 'morning']);
  assert.deepEqual(inZone('America/Los_Angeles'), ['2026-09-28', '2026-09-28 17:30', 'evening']);
  assert.equal(localDateTime('invalid'), '');
  assert.match(localDate(new Date()), /^\d{4}-\d{2}-\d{2}$/);
});

test('preview minutes use the device’s local calendar date', () => {
  const reference = new Date(2026, 8, 29, 12, 34);
  const preview = localDateAtMinutes(23 * 60 + 15, reference);
  assert.equal(localDate(preview), localDate(reference));
  assert.equal(localDateTime(preview), '2026-09-29 23:15');
  assert.equal(localWorldTime(preview).phase, 'night');
});
