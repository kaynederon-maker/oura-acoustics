// Detail shots for the store: two close crops of every product photo (where the eye goes first,
// and the busiest texture), so cards can swap to a detail on hover and product pages get a gallery.
//   node tools/product-details.mjs
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../public/products/', import.meta.url));
const OUT = `${DIR}detail/`;
const W = 800;
const H = 600;
const ZOOM = 2.2;

// Sharp only reports a focal crop when the aspect changes, so probe a square (for x) and a
// letterbox (for y), then cut a 1/ZOOM window around that point.
async function focus(src, width, height, strategy) {
  const sq = await sharp(src).resize(height, height, { fit: 'cover', position: strategy }).toBuffer({ resolveWithObject: true });
  const wide = await sharp(src).resize(width, Math.round(height / 2.2), { fit: 'cover', position: strategy }).toBuffer({ resolveWithObject: true });
  return { x: -(sq.info.cropOffsetLeft ?? 0) + height / 2, y: -(wide.info.cropOffsetTop ?? 0) + height / 4.4 };
}

await mkdir(OUT, { recursive: true });
for (const file of (await readdir(DIR)).filter((f) => f.endsWith('.webp'))) {
  const id = file.replace(/\.webp$/, '');
  const src = `${DIR}${file}`;
  const { width, height } = await sharp(src).metadata();
  const cw = Math.round(width / ZOOM);
  const ch = Math.round(height / ZOOM);
  for (const [suffix, strategy] of [['a', sharp.strategy.attention], ['b', sharp.strategy.entropy]]) {
    const f = await focus(src, width, height, strategy);
    const left = Math.round(Math.min(width - cw, Math.max(0, f.x - cw / 2)));
    const top = Math.round(Math.min(height - ch, Math.max(0, f.y - ch / 2)));
    await sharp(src).extract({ left, top, width: cw, height: ch }).resize(W, H, { kernel: 'lanczos3' })
      .sharpen({ sigma: 0.6 }).webp({ quality: 80 }).toFile(`${OUT}${id}-${suffix}.webp`);
  }
  console.log('ok', id);
}
