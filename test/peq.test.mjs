import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complexResponse, responseDb, toPhaseDeg, logFreqs } from '../public/js/eq.js';
import {
  makeBand, expandBands, systemResponse, distanceToMs, toApoConfig, toDeviceFilters, fromDeviceFilters,
  applyTemplate, TEMPLATES, DEFAULT_CROSSOVER,
} from '../public/js/peq.js';

const FS = 48000;
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('Butterworth high-pass is -3 dB at Fc; 24 dB/oct expands to two stages', () => {
  near(responseDb([{ type: 'HPF', fc: 100, q: Math.SQRT1_2 }], 0, [100], FS)[0], -3.01, 0.05);
  const two = expandBands([makeBand({ type: 'HPF', fc: 100, slope: 24 })]);
  assert.equal(two.length, 2);
  near(responseDb(two, 0, [100], FS)[0], -6.02, 0.05);
  near(responseDb(two, 0, [25], FS)[0], -48, 1.5); // two octaves down at 24 dB/oct
});

test('notch is deep at Fc, all-pass keeps magnitude and turns phase', () => {
  assert.ok(responseDb([{ type: 'NOTCH', fc: 1000, q: 4 }], 0, [1000], FS)[0] < -60);
  const ap = { type: 'AP', fc: 1000, q: 0.71 };
  for (const db of responseDb([ap], 0, [50, 1000, 15000], FS)) near(db, 0, 1e-6);
  near(Math.abs(toPhaseDeg(complexResponse([ap], [1000], FS)[0])), 180, 0.5);
});

test('LR4 crossover sums flat; an inverted sub cancels at Fc', () => {
  const freqs = logFreqs(60, 20, 2000);
  const flat = systemResponse({ eqSpecs: [], preamp: 0, crossover: { ...DEFAULT_CROSSOVER, enabled: true } }, freqs, FS);
  for (const db of flat.sum) near(db, 0, 0.05);
  const inverted = systemResponse({ eqSpecs: [], preamp: 0, crossover: { ...DEFAULT_CROSSOVER, enabled: true, subInvert: true } }, [80], FS);
  assert.ok(inverted.sum[0] < -40);
});

test('LR2 crossover needs the sub inverted to sum flat (the phase-alignment lesson)', () => {
  const xo = { ...DEFAULT_CROSSOVER, enabled: true, slope: 12 };
  const inPhase = systemResponse({ eqSpecs: [], preamp: 0, crossover: xo }, [80], FS);
  const flipped = systemResponse({ eqSpecs: [], preamp: 0, crossover: { ...xo, subInvert: true } }, [80], FS);
  assert.ok(inPhase.sum[0] < -20);
  near(flipped.sum[0], 0, 0.1);
});

test('distance to delay uses 343 m/s', () => {
  near(distanceToMs(34.3), 1, 1e-9);
  assert.equal(distanceToMs(-5), 0);
});

test('makeBand clamps and drops gain on non-gain types', () => {
  const b = makeBand({ type: 'NOTCH', fc: 5, gain: 6, q: 99 });
  assert.deepEqual([b.fc, b.gain, b.q], [20, 0, 12]);
  assert.equal(makeBand({ type: 'PK', gain: 40 }).gain, 18);
  assert.equal(expandBands([{ ...makeBand(), enabled: false }]).length, 0);
});

test('Equalizer APO export carries EQ, crossover routing and alignment', () => {
  const specs = expandBands([makeBand({ type: 'PK', fc: 120, gain: -3, q: 1.4 }), makeBand({ type: 'HPF', fc: 30 })]);
  const text = toApoConfig({
    preamp: -2.5, specs,
    crossover: { ...DEFAULT_CROSSOVER, enabled: true, subDelay: 1.5, subInvert: true },
    alignment: { delayL: 0.3, delayR: 0, invertL: false, invertR: true },
  });
  for (const line of [
    'Preamp: -2.5 dB', 'Filter 1: ON PK Fc 120 Hz Gain -3.0 dB Q 1.40', 'Filter 2: ON HPQ Fc 30 Hz Q 0.71',
    'Copy: SUB=0.5*L+0.5*R', 'Channel: SUB', 'Delay: 1.50 ms', 'Copy: SUB=-1*SUB',
    'Channel: L', 'Delay: 0.30 ms', 'Copy: R=-1*R', 'Channel: all',
  ]) assert.ok(text.includes(line), `missing "${line}"`);
});

test('hardware filter mapping round-trips', () => {
  const bands = [makeBand({ type: 'LSC', fc: 105, gain: 4 }), makeBand({ type: 'HPF', fc: 40 }), makeBand({ type: 'PK', enabled: false })];
  const device = toDeviceFilters(bands);
  assert.deepEqual(device.map((f) => f.type), ['LSQ', 'HP']);
  const back = fromDeviceFilters(device);
  assert.deepEqual(back.map((b) => [b.type, b.fc, b.gain]), [['LSC', 105, 4], ['HPF', 40, 0]]);
});

test('every template builds valid bands', () => {
  for (const t of TEMPLATES) {
    const { bands } = applyTemplate(t);
    assert.equal(bands.length, t.bands.length, t.id);
    for (const b of bands) assert.ok(b.fc >= 20 && b.fc <= 20000 && b.q > 0, `${t.id} band`);
  }
});
