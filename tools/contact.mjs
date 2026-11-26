import sharp from 'sharp';
const [out, cols, ...files] = process.argv.slice(2);
const W = 480;
const tiles = await Promise.all(files.map(async (f) => sharp(f).resize(W).toBuffer({ resolveWithObject: true })));
const c = Number(cols);
const rowH = Math.max(...tiles.map((t) => t.info.height));
const rows = Math.ceil(tiles.length / c);
await sharp({ create: { width: W * c, height: rowH * rows, channels: 3, background: '#222' } })
  .composite(tiles.map((t, i) => ({ input: t.data, left: (i % c) * W, top: Math.floor(i / c) * rowH })))
  .jpeg({ quality: 70 }).toFile(out);
