import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIndex, parseParametricEq, parseFrCsv, profileUrls, responseDb, safePreamp,
  toParametricText, toGraphicEqText,
} from '../public/js/eq.js';

// Real lines from AutoEq results/INDEX.md and ParametricEQ.txt.
const INDEX = `# Index
- [Apple AirPods Pro 2 (51dB + ANC)](./crinacle/711%20in-ear/Apple%20AirPods%20Pro%202%20(51dB%20+%20ANC)) by crinacle on 711
- [1MORE ComfoBuds Mini](./DHRME/in-ear/1MORE%20ComfoBuds%20Mini) by DHRME
- [HD 600](./oratory1990/over-ear/Sennheiser%20HD%20600) by oratory1990`;

const PARAMETRIC = `Preamp: -3.1 dB
Filter 1: ON LSC Fc 105 Hz Gain -1.2 dB Q 0.70
Filter 2: ON PK Fc 302 Hz Gain -1.7 dB Q 0.51
Filter 3: ON HSC Fc 10000 Hz Gain -0.2 dB Q 0.70`;

test('parseIndex keeps parentheses in paths and optional rig', () => {
  const [airpods, comfobuds, hd600] = parseIndex(INDEX);
  assert.equal(airpods.name, 'Apple AirPods Pro 2 (51dB + ANC)');
  assert.equal(airpods.path, 'crinacle/711%20in-ear/Apple%20AirPods%20Pro%202%20(51dB%20+%20ANC)');
  assert.equal(airpods.rig, '711');
  assert.equal(airpods.type, 'In-ear');
  assert.equal(comfobuds.rig, '');
  assert.equal(hd600.type, 'Over-ear');
});

test('profileUrls builds raw GitHub file URLs from the folder name', () => {
  const [, comfobuds] = parseIndex(INDEX);
  assert.equal(
    profileUrls(comfobuds).eq,
    'https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/DHRME/in-ear/1MORE%20ComfoBuds%20Mini/1MORE%20ComfoBuds%20Mini%20ParametricEQ.txt',
  );
});

test('parseParametricEq reads preamp and every filter', () => {
  const eq = parseParametricEq(PARAMETRIC);
  assert.equal(eq.preamp, -3.1);
  assert.deepEqual(eq.filters[1], { type: 'PK', fc: 302, gain: -1.7, q: 0.51 });
  assert.equal(eq.filters.length, 3);
});

test('parametric text round-trips', () => {
  const eq = parseParametricEq(PARAMETRIC);
  assert.deepEqual(parseParametricEq(toParametricText(eq)), eq);
});

test('peaking filter hits its gain at Fc and is flat far away', () => {
  const [atFc, far] = responseDb([{ type: 'PK', fc: 1000, gain: 6, q: 1.41 }], 0, [1000, 20]);
  assert.ok(Math.abs(atFc - 6) < 0.01);
  assert.ok(Math.abs(far) < 0.1);
});

test('shelves reach full gain on their side', () => {
  const [low] = responseDb([{ type: 'LSC', fc: 105, gain: 4, q: 0.7 }], 0, [20]);
  const [high] = responseDb([{ type: 'HSC', fc: 10000, gain: -3, q: 0.7 }], 0, [19000]);
  assert.ok(Math.abs(low - 4) < 0.3);
  assert.ok(Math.abs(high + 3) < 0.4);
});

test('safePreamp cancels the largest boost and never goes positive', () => {
  assert.ok(Math.abs(safePreamp([{ type: 'PK', fc: 3000, gain: 5, q: 2 }]) + 5) < 0.15);
  assert.ok(safePreamp([{ type: 'PK', fc: 3000, gain: -5, q: 2 }]) === 0);
});

test('graphic EQ export has 127 points', () => {
  const text = toGraphicEqText({ preamp: 0, filters: [] });
  assert.match(text, /^GraphicEQ: 20 0\.0; /);
  assert.equal(text.split(';').length, 127);
});

test('parseFrCsv prefers smoothed columns', () => {
  const fr = parseFrCsv('frequency,raw,smoothed,equalized_smoothed,target\n20,7.2,7.1,6.4,6.5\n21,7.3,7.2,6.5,6.5');
  assert.deepEqual(fr.raw, [7.1, 7.2]);
  assert.deepEqual(fr.equalized, [6.4, 6.5]);
});
