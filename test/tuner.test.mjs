import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeContent, hearingDeviations, recommend, THIRD_OCTAVES } from '../public/js/tuner.js';
import { matchDevices, searchIndex } from '../public/js/eq.js';
import { sanitizeInput, sanitizeOutput, rateLimited } from '../server/advice.mjs';
import { FREQ_TIPS, tipFor } from '../public/js/freq-tips.js';

test('frequency tips cover 20 Hz–20 kHz without gaps', () => {
  assert.equal(tipFor(1000).name, 'Midrange core');
  assert.equal(tipFor(8000).name, 'Sibilance and brilliance');
  assert.equal(tipFor(5).name, 'Deep sub-bass'); // clamped
  assert.equal(tipFor(25000).name, 'Ultra highs');
  FREQ_TIPS.slice(1).forEach((t, i) => assert.equal(t.lo, FREQ_TIPS[i].hi, `gap before ${t.name}`));
});

// Synthetic third-octave spectrum: flat mids at -30 dB, with given bass/treble offsets.
const listening = (bassDb, trebleDb, extra = {}) => ({
  bands: THIRD_OCTAVES.map((f) => ({ f, db: -30 + (f <= 160 ? bassDb : f >= 4000 ? trebleDb : 0) })),
  rmsDb: -18, peakDb: -1, clipFrames: 0, ...extra,
});

test('describeContent labels bass-heavy and bright mixes', () => {
  const c = describeContent(listening(15, -5));
  assert.equal(c.bassLabel, 'bass-heavy');
  assert.equal(c.trebleLabel, 'bright');
  assert.equal(describeContent(listening(0, -25)).trebleLabel, 'dark');
  assert.equal(describeContent({ ...listening(0, 0), rmsDb: -80 }).silent, true);
});

const shelf = { id: 'my-bass', type: 'LSC', fc: 105, gain: 4, q: 0.71, enabled: true };

test('recommend eases the strongest bass boost on bass-heavy music and tames bright music', () => {
  const l = listening(15, -5);
  const recs = recommend({ device: 'HD 600', bands: [shelf], content: describeContent(l), listening: l });
  assert.deepEqual(recs.find((r) => r.id === 'bass-down').apply.band, { ...shelf, gain: 2 });
  assert.equal(recs.find((r) => r.id === 'sibilance').apply.band.fc, 6500);
  assert.equal(recs.some((r) => r.id === 'device'), false);
});

test('recommend does not repeat a band that is already applied', () => {
  const l = listening(5, -5);
  const recs = recommend({ device: 'x', bands: [{ id: 'rec-sibilance', type: 'PK', fc: 6500, gain: -2, q: 2, enabled: true }], content: describeContent(l), listening: l });
  assert.equal(recs.some((r) => r.id === 'sibilance'), false);
});

test('lean music suggests warmth only when no bass boost exists', () => {
  const l = listening(0, -12);
  assert.ok(recommend({ device: 'x', bands: [], content: describeContent(l), listening: l }).some((r) => r.id === 'bass-up'));
  assert.equal(recommend({ device: 'x', bands: [shelf], content: describeContent(l), listening: l }).some((r) => r.id === 'bass-up'), false);
});

test('recommend flags clipping and missing device', () => {
  const l = listening(5, -12, { clipFrames: 3 });
  const recs = recommend({ content: describeContent(l), listening: l });
  assert.ok(recs.some((r) => r.id === 'clipping'));
  assert.ok(recs.some((r) => r.id === 'device'));
});

test('hearing deviations remove the normal ear curve', () => {
  // ISO 226 puts the 8 kHz threshold 10.2 dB above 1 kHz, so hearing it 10.2 dB later is normal.
  const at8k = (thresholds) => hearingDeviations(thresholds).find((d) => d.f === 8000).deviation;
  assert.ok(Math.abs(at8k({ 1000: -60, 8000: -49.8 })) < 0.01);
  assert.ok(at8k({ 1000: -60, 8000: -35 }) > 10);
  assert.deepEqual(hearingDeviations({ 8000: -40 }), []);
});

const ENTRIES = [
  { name: 'Apple AirPods Pro 2' }, { name: 'Apple AirPods Pro' }, { name: 'Apple AirPods Max' },
  { name: 'Sennheiser HD 600' }, { name: 'Sony WH-1000XM5' },
];

test('matchDevices maps OS device labels to profiles', () => {
  assert.equal(matchDevices(['AirPods Pro'], ENTRIES)[0].name, 'Apple AirPods Pro');
  assert.equal(matchDevices(['Speakers (Realtek High Definition Audio)'], ENTRIES).length, 0);
  assert.equal(matchDevices(['WH-1000XM5 Stereo'], ENTRIES)[0].name, 'Sony WH-1000XM5');
});

test('searchIndex needs every word and prefers short names', () => {
  assert.deepEqual(searchIndex('airpods pro', ENTRIES).map((e) => e.name), ['Apple AirPods Pro', 'Apple AirPods Pro 2']);
  assert.deepEqual(searchIndex('  ', ENTRIES), []);
});

test('server sanitizes untrusted input and model output', () => {
  const input = sanitizeInput({
    device: 'x'.repeat(500),
    taste: { bass: 99 },
    correction: { filters: [{ type: 'EVIL', fc: 1 }, { type: 'PK', fc: 5, gain: 50, q: 0 }] },
    junk: 'dropped',
  });
  assert.equal(input.device.length, 120);
  assert.equal(input.taste.bass, 6);
  assert.deepEqual(input.correction, [{ type: 'PK', fc: 20, gain: 20, q: 0.3 }]);
  assert.equal('junk' in input, false);

  const out = sanitizeOutput({ summary: 'ok', adjustments: [{ type: 'PK', fc: 3000, gain: -12, q: 20, reason: 'r' }, { type: 'HPF' }], tips: 'nope' });
  assert.deepEqual(out.adjustments, [{ type: 'PK', fc: 3000, gain: -4, q: 6, reason: 'r' }]);
  assert.deepEqual(out.tips, []);
});

test('rate limiter blocks after the limit within the window', () => {
  const ip = `test-${Math.random()}`;
  const results = Array.from({ length: 4 }, () => rateLimited(ip, 3, 60_000));
  assert.deepEqual(results, [false, false, false, true]);
});
