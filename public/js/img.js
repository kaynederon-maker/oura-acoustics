// Credited, responsive photos from the image pipeline (public/img, credits.json).
import { h } from './ui.js';

let credits = {};

export async function loadCredits() {
  try {
    const res = await fetch('/img/credits.json');
    if (res.ok) credits = await res.json();
  } catch {
    // offline or missing: photos still render, without credits
  }
}

export const credit = (id) => credits[id];

function srcset(id, ext) {
  const widths = credits[id]?.widths ?? [480, 960, 1600];
  return widths.map((w) => `/img/${id}-${w}.${ext} ${w}w`).join(', ');
}

// <figure class="photo"><picture>…</picture><figcaption>Author · Licence</figcaption></figure>
export function photo(id, { sizes = '(max-width: 760px) 100vw, 50vw', className = '', eager = false, alt, caption = true } = {}) {
  const c = credits[id] ?? {};
  const widths = c.widths ?? [480, 960];
  const mid = widths.includes(960) ? 960 : widths.at(-1);
  const img = h('img', {
    src: `/img/${id}-${mid}.webp`, srcset: srcset(id, 'webp'), sizes, alt: alt ?? c.alt ?? '',
    loading: eager ? 'eager' : 'lazy', decoding: 'async', fetchpriority: eager ? 'high' : null,
    width: '960', height: String(Math.round(960 / (c.ratio || 1.5))),
  });
  const pic = h('picture', {}, h('source', { type: 'image/avif', srcset: srcset(id, 'avif'), sizes }), img);
  const cap = caption && c.author ? h('figcaption', {},
    h('a', { href: c.source, target: '_blank', rel: 'noopener', 'aria-label': `Photo credit: ${c.author}, ${c.license} (opens the source)` },
      `${c.author.replace(/\s+/g, ' ').slice(0, 48)} · ${c.license}`)) : null;
  return h('figure', { class: `photo ${className}`.trim(), style: c.ratio ? `--ratio:${c.ratio}` : null }, pic, cap);
}

// Mechanical counter: each digit rolls on its own drum. Text stays readable for screen readers.
export function rollNumber(el, value) {
  const text = String(value);
  el.setAttribute('aria-label', el.dataset.label ? `${el.dataset.label} ${text}` : text);
  const mask = text.replace(/\d/g, '0');
  if (el.dataset.rolled !== mask) {
    el.replaceChildren(...[...text].map((ch) => (/\d/.test(ch)
      ? h('span', { class: 'drum', 'aria-hidden': 'true' }, h('span', { class: 'drum-col' }, ...'0123456789'.split('').map((d) => h('span', {}, d))))
      : h('span', { class: 'drum-fixed', 'aria-hidden': 'true' }, ch))));
    el.dataset.rolled = mask;
  }
  [...text].forEach((ch, i) => {
    const col = el.children[i].querySelector('.drum-col');
    if (col) col.style.transform = `translateY(${-Number(ch) * 10}%)`;
  });
}
