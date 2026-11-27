import * as acorn from 'acorn';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = /(^|[\\/])(node_modules|\.git|vendor|Figma|figma-plugin|generated-images|\.cache|screenshots)([\\/]|$)/;
const KEEP_FILES = new Set(['public/fonts/fonts.css']);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (SKIP.test(relative(ROOT, path))) continue;
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function widen(text, start, end) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  const lineEnd = nl < 0 ? text.length : nl;
  const alone = !text.slice(lineStart, start).trim() && !text.slice(end, lineEnd).trim();
  return alone ? [lineStart, nl < 0 ? text.length : nl + 1] : [start, end];
}

function cut(text, ranges) {
  let out = '';
  let at = 0;
  for (const [s, e] of ranges.map(([s, e]) => widen(text, s, e)).sort((a, b) => a[0] - b[0])) {
    if (s < at) continue;
    out += text.slice(at, s);
    at = e;
  }
  return out + text.slice(at);
}

const tidy = (text) => text.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n')
  .replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n');

function jsRanges(text) {
  const ranges = [];
  acorn.parse(text, {
    ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowAwaitOutsideFunction: true,
    onComment: (block, value, start, end) => ranges.push([start, end]),
  });
  return ranges;
}

function cssRanges(text) {
  const ranges = [];
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      ranges.push([i, stop]);
      i = stop - 1;
    }
  }
  return ranges;
}

const htmlRanges = (text) => [...text.matchAll(/<!--[\s\S]*?-->/g)].map((m) => [m.index, m.index + m[0].length]);

const HANDLERS = { '.js': jsRanges, '.mjs': jsRanges, '.css': cssRanges, '.html': htmlRanges };

let changed = 0;
for await (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const ranges = HANDLERS[extname(file)];
  if (!ranges || KEEP_FILES.has(rel)) continue;
  const text = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  const result = tidy(cut(text, ranges(text)));
  if (result !== text) {
    await writeFile(file, result);
    changed++;
    console.log('stripped', rel);
  }
}
console.log(`${changed} files`);
