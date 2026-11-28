import { h } from './ui.js';

let credits = {};

export async function loadCredits() {
  try {
    const res = await fetch('img/credits.json');
    if (res.ok) credits = await res.json();
  } catch {
  }
}

export const credit = (id) => credits[id];

function srcset(id, ext) {
  const widths = credits[id]?.widths ?? [480, 960, 1600];
  return widths.map((w) => `img/${id}-${w}.${ext} ${w}w`).join(', ');
}

export function photo(id, { sizes = '(max-width: 760px) 100vw, 50vw', className = '', eager = false, alt, caption = true } = {}) {
  const c = credits[id] ?? {};
  const widths = c.widths ?? [480, 960];
  const mid = widths.includes(960) ? 960 : widths.at(-1);
  const img = h('img', {
    src: `img/${id}-${mid}.webp`, srcset: srcset(id, 'webp'), sizes, alt: alt ?? c.alt ?? '',
    loading: eager ? 'eager' : 'lazy', decoding: 'async', fetchpriority: eager ? 'high' : null,
    width: '960', height: String(Math.round(960 / (c.ratio || 1.5))),
  });
  const pic = h('picture', {}, h('source', { type: 'image/avif', srcset: srcset(id, 'avif'), sizes }), img);
  const cap = caption && c.author ? h('figcaption', {},
    h('a', { href: c.source, target: '_blank', rel: 'noopener', title: `${c.title} · ${c.author} · ${c.license}` },
      h('span', { class: 'sr-only' }, 'Photo credit: '), `${c.author.slice(0, 48)} · ${c.license}`, h('span', { class: 'sr-only' }, ' (opens the source)'))) : null;
  return h('figure', { class: `photo ${className}`.trim(), style: c.ratio ? `--ratio:${c.ratio}` : null }, pic, cap);
}

export function hydratePhotos(root = document) {
  for (const el of root.querySelectorAll('[data-photo]')) {
    el.replaceWith(photo(el.dataset.photo, { className: el.className, sizes: el.dataset.sizes ?? '(max-width: 760px) 100vw, 50vw' }));
  }
}

export function rollNumber(el, value) {
  const text = String(value);
  const mask = text.replace(/\d/g, '0');
  if (el.dataset.rolled !== mask) {
    const drums = [...text].map((ch) => (/\d/.test(ch)
      ? h('span', { class: 'drum' }, h('span', { class: 'drum-col' }, ...'0123456789'.split('').map((d) => h('span', {}, d))))
      : h('span', { class: 'drum-fixed' }, ch)));
    el.replaceChildren(h('span', { class: 'sr-only' }), h('span', { class: 'drums', 'aria-hidden': 'true' }, ...drums));
    el.dataset.rolled = mask;
  }
  el.firstChild.textContent = el.dataset.label ? `${el.dataset.label} ${text}` : text;
  [...text].forEach((ch, i) => {
    const col = el.lastChild.children[i].querySelector('.drum-col');
    if (col) col.style.transform = `translateY(${-Number(ch) * 10}%)`;
  });
}
