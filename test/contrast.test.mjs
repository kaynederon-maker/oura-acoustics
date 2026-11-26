import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const THEMES = ['dark', 'light', 'burgundy', 'earth', 'soft'];

function tokens(theme) {
  const block = css.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`))[1];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map((v) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT_PAIRS = [
  ['text-hi', 'bg'], ['text-hi', 'surface'], ['text-hi', 'surface-2'],
  ['text-lo', 'bg'], ['text-lo', 'surface'], ['text-lo', 'surface-2'],
  ['accent', 'bg'], ['accent', 'surface'], ['accent-ink', 'accent'],
];

for (const theme of THEMES) {
  test(`${theme}: text pairs pass WCAG AA (4.5:1)`, () => {
    const t = tokens(theme);
    for (const [fg, bg] of TEXT_PAIRS) {
      assert.ok(t[fg] && t[bg], `${theme} defines --${fg} and --${bg}`);
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${theme}: --${fg} on --${bg} is ${r.toFixed(2)}:1`);
    }
  });

  test(`${theme}: graph lines pass 3:1 on the surface`, () => {
    const t = tokens(theme);
    for (const fg of ['plot-1', 'plot-2', 'accent']) {
      const r = ratio(t[fg], t.surface);
      assert.ok(r >= 3, `${theme}: --${fg} on --surface is ${r.toFixed(2)}:1`);
    }
  });
}
