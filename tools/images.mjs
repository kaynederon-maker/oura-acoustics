// Image pipeline.
//   node tools/images.mjs search "<commons query>"   numbered contact sheet of candidates
//   node tools/images.mjs ov "<openverse query>"      same, from Openverse (Flickr and other CC sources)
//   node tools/images.mjs build [id ...]              download, grade, encode everything in images.json
// Only freely licensed files pass: public domain, CC0, CC BY, CC BY-SA. Credits go to public/img/credits.json.
import sharp from 'sharp';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = `${ROOT}tools/.cache/`;
const OUT = `${ROOT}public/img/`;
const MANIFEST = `${ROOT}tools/images.json`;
const UA = 'OuraAcousticsPrototype/1.0 (image credits pipeline)';
const WIDTHS = [480, 960, 1600];
const FREE = /^(public domain|pd|cc0|cc[- ]by(-sa)?[- ]?\d|cc[- ]by(-sa)?$|no restrictions|attribution|by(-sa)?$)/i;
const NOT_FREE = /\b(nc|nd|non-?commercial|no-?deriv|fair use|copyrighted)\b/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e]);
const strip = (html = '') => decode(decode(html.replace(/<[^>]+>/g, ''))).replace(/\s+/g, ' ').trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
    throw new Error(`${res.status} for ${url}`);
  }
  throw new Error(`gave up on ${url}`);
}

async function getBuffer(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 || res.status >= 500) { await sleep(Number(res.headers.get('retry-after') ?? 0) * 1000 + 8000 * (attempt + 1)); continue; }
    throw new Error(`${res.status} for ${url}`);
  }
  throw new Error(`gave up on ${url}`);
}

export function isFree(license) {
  return Boolean(license) && FREE.test(license.trim()) && !NOT_FREE.test(license);
}

function commonsInfo(page) {
  const ii = page.imageinfo?.[0];
  if (!ii) return null;
  const m = ii.extmetadata ?? {};
  return {
    title: page.title,
    license: strip(m.LicenseShortName?.value),
    licenseUrl: m.LicenseUrl?.value ?? '',
    author: strip(m.Artist?.value) || 'Unknown',
    source: ii.descriptionurl,
    url: ii.url,
    thumb: ii.thumburl,
    size: [ii.width, ii.height],
  };
}

async function commonsSearch(query, limit = 24) {
  const q = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6',
    gsrlimit: String(limit), prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '360', origin: '*',
  });
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`);
  return Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index).map(commonsInfo).filter(Boolean);
}

async function commonsFile(title, width = 1920) {
  const q = new URLSearchParams({
    action: 'query', format: 'json', titles: title, prop: 'imageinfo', iiprop: 'url|size|extmetadata',
    iiurlwidth: String(width), origin: '*',
  });
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`);
  const page = Object.values(data.query.pages)[0];
  if (page.missing !== undefined) throw new Error(`missing on Commons: ${title}`);
  return commonsInfo(page);
}

function ovInfo(r) {
  return {
    title: r.title || r.id,
    license: `${r.license === 'cc0' || r.license === 'pdm' ? r.license.toUpperCase() : `CC ${r.license.toUpperCase()}`} ${r.license_version ?? ''}`.trim(),
    licenseUrl: r.license_url,
    author: r.creator || 'Unknown',
    source: r.foreign_landing_url,
    url: r.url,
    thumb: r.thumbnail,
    size: [r.width, r.height],
    ovId: r.id,
  };
}

async function ovSearch(query, limit = 20) {
  const q = new URLSearchParams({ q: query, page_size: String(limit), license: 'by,by-sa,cc0,pdm', mature: 'false' });
  const data = await getJson(`https://api.openverse.org/v1/images/?${q}`);
  return data.results.map(ovInfo);
}

async function ovFile(id) {
  return ovInfo(await getJson(`https://api.openverse.org/v1/images/${id}/`));
}

async function contactSheet(items, name) {
  const W = 300;
  const H = 220;
  const cols = 6;
  const tiles = [];
  for (const [i, it] of items.entries()) {
    try {
      const buf = await getBuffer(it.thumb);
      const img = await sharp(buf).resize(W, H, { fit: 'cover' }).toBuffer();
      const label = Buffer.from(`<svg width="${W}" height="${H}"><rect width="34" height="22" fill="#000"/><text x="5" y="16" fill="#fff" font-size="15" font-family="Arial">${i}</text><rect y="${H - 18}" width="${W}" height="18" fill="#000" opacity="0.7"/><text x="4" y="${H - 5}" fill="#fff" font-size="11" font-family="Arial">${it.size.join('x')} ${it.license.replace(/[<&>]/g, '')}</text></svg>`);
      tiles.push({ input: await sharp(img).composite([{ input: label }]).toBuffer(), i });
    } catch (err) {
      console.warn('thumb failed', i, err.message);
    }
  }
  const rows = Math.ceil(items.length / cols);
  const file = `${CACHE}${name}.jpg`;
  await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: '#111' } })
    .composite(tiles.map((t) => ({ input: t.input, left: (t.i % cols) * W, top: Math.floor(t.i / cols) * H })))
    .jpeg({ quality: 72 }).toFile(file);
  return file;
}

async function search(kind, query) {
  await mkdir(CACHE, { recursive: true });
  const items = (kind === 'ov' ? await ovSearch(query) : await commonsSearch(query)).filter((i) => isFree(i.license));
  if (!items.length) return console.log('no free results');
  for (const [i, it] of items.entries()) {
    console.log(`${String(i).padStart(2)} ${it.size.join('x').padEnd(10)} ${it.license.padEnd(14)} ${kind === 'ov' ? `ov:${it.ovId}` : it.title}  — ${it.author.slice(0, 40)}`);
  }
  console.log('sheet:', await contactSheet(items, `${kind}-${slug(query)}`));
}

// Shared grade: a touch less saturation, lifted blacks, a warm cast. Per-theme tint is CSS.
function grade(pipeline, { mono = false } = {}) {
  let p = pipeline.modulate({ saturation: mono ? 0 : 0.84 }).linear(0.93, 10);
  if (!mono) p = p.recomb([[1.04, 0.02, 0], [0.01, 1.0, 0], [0, 0.02, 0.93]]);
  return p;
}

async function build(only) {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  await mkdir(OUT, { recursive: true });
  await mkdir(`${CACHE}orig/`, { recursive: true });
  let credits = {};
  try {
    credits = JSON.parse(await readFile(`${OUT}credits.json`, 'utf8'));
  } catch {
    // first build
  }
  const ids = only.length ? only : Object.keys(manifest);
  for (const id of ids) {
    const entry = manifest[id];
    if (!entry) throw new Error(`no manifest entry: ${id}`);
    const done = await access(`${OUT}${id}-480.webp`).then(() => true, () => false);
    if (done && credits[id] && !only.length) continue;
    const info = entry.ov ? await ovFile(entry.ov) : await commonsFile(entry.commons);
    if (!isFree(info.license)) throw new Error(`${id}: licence not free (${info.license})`);
    const origPath = `${CACHE}orig/${id}`;
    const orig = await access(origPath).then(() => readFile(origPath), async () => {
      const buf = await getBuffer(info.thumb && !entry.ov ? info.thumb : info.url);
      await writeFile(origPath, buf);
      return buf;
    });
    const meta = await sharp(orig).metadata();
    const ratio = entry.ratio ?? null;
    for (const w of WIDTHS) {
      if (w > meta.width && w !== WIDTHS[0]) continue;
      const h = ratio ? Math.round(w / ratio) : null;
      const base = () => grade(sharp(orig).rotate().resize(w, h, { fit: 'cover', position: entry.focus ?? 'attention', withoutEnlargement: !h }), entry);
      await base().avif({ quality: 52, effort: 5 }).toFile(`${OUT}${id}-${w}.avif`);
      await base().webp({ quality: 76, effort: 5 }).toFile(`${OUT}${id}-${w}.webp`);
    }
    const out = await sharp(`${OUT}${id}-480.webp`).metadata();
    credits[id] = {
      title: info.title.replace(/^File:/, '').replace(/\.\w+$/, ''),
      author: info.author.slice(0, 120),
      license: info.license,
      licenseUrl: info.licenseUrl,
      source: info.source,
      ratio: +(out.width / out.height).toFixed(4),
      widths: WIDTHS.filter((w) => w <= Math.max(meta.width, WIDTHS[0])),
      alt: entry.alt ?? '',
    };
    console.log(`ok ${id}  ${info.license}  ${info.author.slice(0, 40)}`);
    await writeFile(`${OUT}credits.json`, `${JSON.stringify(credits, null, 2)}\n`);
    await sleep(2500);
  }
}

// pick: node tools/images.mjs pick picks.txt   lines: id | commons|ov | query | index | alt
async function pick(file) {
  const manifest = await readFile(MANIFEST, 'utf8').then(JSON.parse, () => ({}));
  const cache = new Map();
  for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [id, kind, query, index, alt, focus] = line.split('|').map((x) => x.trim());
    const key = `${kind}:${query}`;
    if (!cache.has(key)) cache.set(key, (kind === 'ov' ? await ovSearch(query) : await commonsSearch(query)).filter((i) => isFree(i.license)));
    const it = cache.get(key)[Number(index)];
    if (!it) throw new Error(`${id}: no result ${index} for ${query}`);
    manifest[id] = { ...(kind === 'ov' ? { ov: it.ovId } : { commons: it.title }), alt, ...(focus ? { focus } : {}) };
    console.log(`${id} <- ${it.title.slice(0, 70)} (${it.license})`);
  }
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'pick') await pick(args[0]);
else if (cmd === 'search' || cmd === 'ov') await search(cmd, args.join(' '));
else if (cmd === 'build') await build(args);
else console.log('usage: images.mjs search|ov "<query>" | build [id ...]');
