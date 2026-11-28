import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const json = (p) => JSON.parse(readFileSync(pub(p), 'utf8'));
const FREE = /^(public domain|pd|cc0|cc[- ]by(-sa)?[- ]?\d|cc[- ]by(-sa)?$|no restrictions|ofl-1\.1)/i;
const NOT_FREE = /\b(nc|nd|non-?commercial|no-?deriv)\b/i;
const free = (license) => FREE.test(license) && !NOT_FREE.test(license);

test('every photo has a credit with a free licence, a source and an author', () => {
  const credits = json('img/credits.json');
  const ids = new Set(readdirSync(pub('img')).filter((f) => /-480\.webp$/.test(f)).map((f) => f.replace(/-480\.webp$/, '')));
  assert.ok(ids.size > 60, 'the photo set is there');
  for (const id of ids) {
    const c = credits[id];
    assert.ok(c, `${id} has a credit`);
    assert.ok(free(c.license), `${id}: "${c.license}" is a free licence`);
    assert.match(c.source, /^https:\/\//, `${id} links to its source`);
    assert.ok(c.author && c.author.length > 1, `${id} names an author`);
    for (const w of c.widths) {
      assert.ok(existsSync(pub(`img/${id}-${w}.avif`)) && existsSync(pub(`img/${id}-${w}.webp`)), `${id} has AVIF + WebP at ${w}px`);
    }
  }
});

test('every 3D model and font has a credit with a free licence', () => {
  const models = json('models/credits.json');
  for (const f of readdirSync(pub('models')).filter((x) => x.endsWith('.glb'))) {
    assert.ok(free(models[f.replace('.glb', '')]?.license ?? ''), `${f} is credited`);
  }
  const fonts = json('fonts/credits.json');
  for (const f of readdirSync(pub('fonts')).filter((x) => x.endsWith('.woff2'))) {
    assert.equal(fonts[f]?.license, 'OFL-1.1', `${f} is OFL`);
    assert.ok(existsSync(pub(fonts[f].licenseFile.slice(1))), `${f} ships its licence text`);
  }
});

test('every photo id the pages ask for was built', () => {
  const credits = json('img/credits.json');
  const js = ['js/history.js', 'js/home.js', 'js/store.js', 'js/lab.js'].map((f) => readFileSync(pub(f), 'utf8')).join('\n');
  const html = readFileSync(pub('index.html'), 'utf8');
  const used = new Set([
    ...[...js.matchAll(/'((?:h\d{4}|m|s|l)-[a-z0-9-]+)'/g)].map((m) => m[1])
      .filter((id) => !/^s-(raw|target|tuned|correction|main|sub)$/.test(id)),
    ...[...html.matchAll(/data-photo="([^"]+)"/g)].map((m) => m[1]),
  ]);
  assert.ok(used.size > 60, 'pages reference the photo set');
  for (const id of used) assert.ok(credits[id], `${id} is referenced and built`);
});
