// Builds the "Oura Prototype Builder" Figma plugin: gathers real site data (catalog, Guide
// chapters, History eras), computes EQ curves with the site's own maths, embeds the photos as
// JPEG, and writes code.js + manifest.json next to this file.
//   node figma-plugin/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PRODUCTS, CATEGORIES } from '../public/js/catalog.js';
import { responseDb, logFreqs } from '../public/js/eq.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pub = (...p) => join(root, 'public', ...p);

// ---------- site data ----------

// Pull a top-level array literal (CHAPTERS / ERAS) out of a browser module without running it.
function arrayLiteral(file, name) {
  const src = readFileSync(pub('js', file), 'utf8');
  const start = src.indexOf(`const ${name} = [`);
  const end = src.indexOf('\n];', start);
  const body = src.slice(start + `const ${name} = `.length, end + 2);
  const B = (type, fc, gain, q) => ({ type, fc, gain, q }); // stand-in for makeBand
  return Function('B', `return ${body}`)(B);
}
const chapters = arrayLiteral('journey.js', 'CHAPTERS');
const eras = arrayLiteral('history.js', 'ERAS');

const pick = (p) => ({ id: p.id, brand: p.brand, name: p.name, category: p.category, price: p.price, compareAt: p.compareAt ?? null, rating: p.rating, reviews: p.reviews, badge: p.badge ?? null, blurb: p.blurb, highlights: p.highlights, specs: p.specs, fit: p.fit });
const byCat = (c) => PRODUCTS.filter((p) => p.category === c);
const store = {
  all1: PRODUCTS.slice(0, 8).map(pick),
  all2: PRODUCTS.slice(8, 16).map(pick),
  monitors: byCat('monitors').map(pick),
  iems: byCat('iems').map(pick),
};
const total = PRODUCTS.length;

// ---------- curves (same RBJ maths as the site) ----------

const FREQS = logFreqs(140);
function curvePath(specs, { w, h, min, max }) {
  const db = specs ? responseDb(specs, 0, FREQS) : FREQS.map(() => 0);
  const x = (f) => (Math.log10(f / 20) / 3) * w;
  const y = (v) => h - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * h;
  return FREQS.map((f, i) => `${i ? 'L' : 'M'} ${x(f).toFixed(1)} ${y(db[i]).toFixed(1)}`).join(' ');
}
const sum = (...lists) => lists.flat();

// Tuning Lab: a measured headphone, a target, and five user bands (node 3 is the one you drag).
const LAB = { w: 860, h: 400, min: -15, max: 15 };
const target = [{ type: 'LSC', fc: 105, gain: 5, q: 0.71 }, { type: 'PK', fc: 2800, gain: 6, q: 0.9 }, { type: 'HSC', fc: 10000, gain: -3, q: 0.71 }];
const deviation = [{ type: 'LSC', fc: 90, gain: -6, q: 0.71 }, { type: 'PK', fc: 1000, gain: -4, q: 1.6 }, { type: 'PK', fc: 4500, gain: 4, q: 2.5 }, { type: 'PK', fc: 7500, gain: -5, q: 3 }];
const bandsDefault = [
  { n: 1, type: 'LSC', fc: 105, gain: 4, q: 0.71 },
  { n: 2, type: 'PK', fc: 250, gain: -2, q: 1.2 },
  { n: 3, type: 'PK', fc: 1000, gain: 2, q: 2 },
  { n: 4, type: 'PK', fc: 3500, gain: -3, q: 2 },
  { n: 5, type: 'HSC', fc: 10000, gain: 2, q: 0.71 },
];
const bandsActive = bandsDefault.map((b) => (b.n === 3 ? { ...b, fc: 1060, gain: 8.5 } : b));
const raw = sum(target, deviation);
const lab = {
  size: LAB,
  target: curvePath(target, LAB),
  raw: curvePath(raw, LAB),
  states: Object.fromEntries([['default', bandsDefault], ['active', bandsActive]].map(([k, bands]) => [k, {
    bands,
    eq: curvePath(bands, LAB),
    tuned: curvePath(sum(raw, bands), LAB),
    nodes: bands.map((b) => ({ n: b.n, x: (Math.log10(b.fc / 20) / 3) * LAB.w, y: LAB.h - ((b.gain - LAB.min) / (LAB.max - LAB.min)) * LAB.h })),
  }])),
};

// Guide: one curve per chapter, plus a flat intro.
const GUIDE = { w: 620, h: 300, min: -12, max: 12 };
const guide = {
  size: GUIDE,
  chapters: chapters.map((c) => ({
    id: c.id, kicker: c.kicker, title: c.title, lo: c.lo, hi: c.hi, img: c.img, lede: c.lede, tip: c.tip, ab: c.ab,
    curve: curvePath(c.bands, GUIDE),
    x0: (Math.log10(c.lo / 20) / 3) * GUIDE.w, x1: (Math.log10(c.hi / 20) / 3) * GUIDE.w,
  })),
  flat: curvePath(null, GUIDE),
};

// History: a decorative waveform per era (same point count, so Smart Animate morphs them).
const WAVE_W = 1440;
const WAVE_N = 240;
const noise = (i) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
const waveFns = [
  (x, k) => 0.35 * Math.sin(x * 22 + k) + 0.18 * noise(x * 900 + k), // acoustic horn: scratchy
  (x, k) => 0.55 * Math.sin(x * 14 + k) + 0.12 * Math.sin(x * 40 - k), // electrical: warm
  (x, k) => 0.5 * Math.sin(x * 16 + k) * (0.8 + 0.2 * Math.sin(x * 140)), // vinyl ripple
  (x, k) => 0.6 * Math.sin(x * 11 + k + 1.5 * Math.sin(x * 5 + k)), // tape: swirling phase
  (x, k) => Math.round(0.55 * Math.sin(x * 18 + k) * 7) / 7, // CD: stepped
  (x, k) => 0.75 * Math.sin(x * 7 + k) + 0.2 * Math.sin(x * 3.1 + k * 2), // shoegaze: slow haze
  (x, k) => Math.max(-0.38, Math.min(0.38, 1.4 * Math.sin(x * 20 + k))), // loudness war: clipped
  (x, k) => 0.5 * Math.sin(x * 9 + k) + 0.12 * Math.sin(x * 260 + k), // blackgaze: tremolo
  (x, k) => 0.85 * Math.sin(x * 5 - k) * Math.exp(-((x * 3) % 1) * 3), // trap: 808 pulses
  (x, k) => 0.45 * Math.sin(x * 15 + k) * (0.7 + 0.3 * Math.sin(x * 3 + k)), // now: clean
];
const wavePath = (fn, k, amp) => Array.from({ length: WAVE_N }, (_, i) => {
  const x = i / (WAVE_N - 1);
  return `${i ? 'L' : 'M'} ${(x * WAVE_W).toFixed(1)} ${(100 + fn(x, k) * amp).toFixed(1)}`;
}).join(' ');
const history = eras.map((e, i) => ({
  year: e.year, place: e.place, title: e.title, text: e.text, facts: e.facts, img: e.img, credit: e.credit, personal: !!e.personal,
  waves: [0, 1, 2].map((k) => wavePath(waveFns[i % waveFns.length], k * 1.7, 70 - k * 14)),
}));

// ---------- images ----------

const imageJobs = [
  ...[...new Set(Object.values(store).flat().map((p) => p.id))].map((id) => [`product:${id}`, pub('products', `${id}.webp`), 640]),
  ...history.map((e) => [`era:${e.img}`, pub('history', `${e.img}.webp`), 960]),
  ...guide.chapters.map((c) => [`guide:${c.img}`, pub('guide', `${c.img}.webp`), 820]),
];
const py = `
import base64, io, json, sys
from PIL import Image
out = {}
for key, path, side in json.loads(sys.argv[1]):
    im = Image.open(path).convert('RGB'); im.thumbnail((side, side), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=78, optimize=True)
    out[key] = base64.b64encode(buf.getvalue()).decode()
print(json.dumps(out))
`;
const images = JSON.parse(execFileSync('python', ['-I', '-c', py, JSON.stringify(imageJobs)], { maxBuffer: 64 * 1024 * 1024 }).toString());

// ---------- write plugin ----------

const data = { store, total, categories: CATEGORIES, lab, guide, history };
const builder = readFileSync(join(here, 'src', 'builder.js'), 'utf8');
const code = `// Generated by figma-plugin/build.mjs. Edit src/builder.js, then rebuild.\nconst DATA = ${JSON.stringify(data)};\nconst IMAGES = ${JSON.stringify(images)};\n${builder}`;
writeFileSync(join(here, 'code.js'), code);
writeFileSync(join(here, 'manifest.json'), `${JSON.stringify({
  name: 'Oura Prototype Builder',
  id: 'oura-prototype-builder',
  api: '1.0.0',
  main: 'code.js',
  editorType: ['figma'],
  documentAccess: 'dynamic-page',
  networkAccess: { allowedDomains: ['none'] },
}, null, 2)}\n`);
const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`code.js ${kb(code.length)} · ${Object.keys(images).length} images · ${Object.values(store).flat().length} store cards · ${history.length} eras · ${guide.chapters.length} chapters`);
