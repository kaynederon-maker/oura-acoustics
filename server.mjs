// Zero-dependency server: static files from ./public + POST /api/advice (Gemini, key stays here).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { brotliCompressSync, gzipSync, constants as zlib } from 'node:zlib';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAdvice, rateLimited } from './server/advice.mjs';

try {
  process.loadEnvFile();
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url)); // ends with a separator
const MAX_BODY_BYTES = 32 * 1024;
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg)/;
const ASSET_DIRS = /^(img|models|fonts|products|guide|vendor)[/\\]/;
const ASSET_MAX_AGE = 7 * 24 * 3600; // media is never edited in place; the ETag still revalidates
const compressed = new Map(); // file|mtime|encoding -> Buffer

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    // devicePEQ (hardware bridge) styles its injected UI inline; scripts stay 'self'-only.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self' https://raw.githubusercontent.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'microphone=(self), display-capture=(self)',
  // Unhashed module files: always revalidate, or browsers mix old and new modules after an edit.
  'cache-control': 'no-cache',
};

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, ...SECURITY_HEADERS });
  const raw = Buffer.isBuffer(body) || typeof body === 'string';
  res.end(type === 'application/json' && !raw ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

async function handleAdvice(req, res) {
  if (rateLimited(req.socket.remoteAddress)) return send(res, 429, { error: 'Too many requests, wait a minute.' });
  try {
    send(res, 200, await getAdvice(await readJson(req)));
  } catch (err) {
    if (err.detail || !err.status) console.error('[advice]', err.message, err.detail ?? err);
    const status = err.status ?? 500;
    send(res, status, { error: status === 500 ? 'Could not get advice right now.' : err.message });
  }
}

function encode(file, mtime, body, encoding) {
  const key = `${file}|${mtime}|${encoding}`;
  if (!compressed.has(key)) {
    compressed.set(key, encoding === 'br'
      ? brotliCompressSync(body, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9 } })
      : gzipSync(body, { level: 8 }));
  }
  return compressed.get(key);
}

async function serveStatic(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
  const file = join(PUBLIC_DIR, relative || 'index.html');
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
  let info;
  try {
    info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
  } catch {
    return send(res, 404, 'Not found', 'text/plain');
  }
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  const etag = `W/"${info.size.toString(36)}-${info.mtimeMs.toString(36)}"`;
  const headers = {
    'content-type': type, ...SECURITY_HEADERS, etag, vary: 'accept-encoding',
    ...(ASSET_DIRS.test(relative) ? { 'cache-control': `public, max-age=${ASSET_MAX_AGE}` } : {}),
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  let body = await readFile(file);
  const accept = String(req.headers['accept-encoding'] ?? '');
  const encoding = COMPRESSIBLE.test(type) && body.length > 1024 ? (/\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null) : null;
  if (encoding) {
    body = encode(file, info.mtimeMs, body, encoding);
    headers['content-encoding'] = encoding;
  }
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

createServer((req, res) => {
  if (req.url === '/api/advice' && req.method === 'POST') return handleAdvice(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  send(res, 405, { error: 'Method not allowed' });
}).listen(PORT, () => {
  console.log(`Oura Acoustics on http://localhost:${PORT}  (AI advice: ${process.env.GEMINI_API_KEY ? 'on' : 'off, set GEMINI_API_KEY'})`);
});
