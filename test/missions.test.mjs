import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossoverResponse, flatness, XO_START, IEM_BANDS, iemCurve, matchScore } from '../public/js/mission-model.js';
import { logFreqs } from '../public/js/eq.js';

const F = logFreqs(140, 20, 400);
const dev = (p) => flatness(crossoverResponse(p, F).sum, F);

test('crossover mission starts badly and has both real-world fixes', () => {
  assert.ok(dev(XO_START) > 4, 'the starting setup should be audibly wrong');
  // Fix 1: speakers full range, sub extends below their natural roll-off.
  assert.ok(dev({ fc: 45, subGain: 4.5, phase: 0, invert: false, highPassMains: false }) < 1.5);
  // Fix 2: high-pass the speakers, flip the late-arriving sub's polarity.
  assert.ok(dev({ fc: 95, subGain: 1, phase: 35, invert: true, highPassMains: true }) < 1.5);
  // Polarity matters: the same setup without the flip cancels around the crossover.
  assert.ok(dev({ fc: 95, subGain: 1, phase: 35, invert: false, highPassMains: true }) > 4);
});

test('IEM mission scores 100 at the engineer settings and less elsewhere', () => {
  const target = Object.fromEntries(IEM_BANDS.map((b) => [b.id, b.target]));
  const flat = Object.fromEntries(IEM_BANDS.map((b) => [b.id, 0]));
  const freqs = logFreqs(120);
  assert.equal(matchScore(iemCurve(target, freqs), iemCurve(target, freqs)), 100);
  const fromFlat = matchScore(iemCurve(flat, freqs), iemCurve(target, freqs));
  assert.ok(fromFlat < 70, `flat should score low, got ${fromFlat}`);
  const close = matchScore(iemCurve({ ...target, kick: target.kick - 1 }, freqs), iemCurve(target, freqs));
  assert.ok(close >= 90, `1 dB off should still pass, got ${close}`);
});
