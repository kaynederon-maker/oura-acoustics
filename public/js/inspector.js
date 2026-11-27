import { h, icon } from './ui.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const HOVER_TILT = { x: 7, y: 11 };
const MAX_TILT = 24;
const ZOOM = 2.4;
const MAX_ZOOM = 3;
const WHEEL_STEP = 1.15;
const PAN_STEP = 48;
const EASE = 0.16;
const TAP_SLOP = 5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function inspector({ src, alt, fit = 'cover', onExpand = null }) {
  const img = h('img', { src, alt, decoding: 'async', draggable: 'false', width: '1200', height: '900' });
  const sheen = h('span', { class: 'insp-sheen', 'aria-hidden': 'true' });
  const plinth = h('span', { class: 'plinth', 'aria-hidden': 'true' });
  const level = h('span', { class: 'insp-level', 'aria-hidden': 'true' });
  const hint = h('span', { class: 'insp-hint', 'aria-hidden': 'true' }, FINE ? 'Move to tilt · click to zoom' : 'Drag to tilt · tap to zoom');
  const el = h('div', {
    class: `inspector fit-${fit}`, tabindex: '0', role: 'group', 'aria-roledescription': 'zoomable image', 'data-cursor': 'view', 'data-lenis-prevent': '',
    'aria-label': `${alt}. Enter zooms in and out, arrow keys tilt or pan, plus and minus change the zoom.`,
  }, plinth, img, sheen, level, hint);
  const root = onExpand
    ? h('div', { class: 'insp-wrap' }, el, h('button', { type: 'button', class: 'icon-btn insp-expand', 'aria-label': `Open ${alt} full screen`, onclick: onExpand }, icon('expand')))
    : el;

  const cur = { rx: 0, ry: 0, z: 1, x: 0, y: 0, lx: 50, ly: 35 };
  const tgt = { ...cur };
  const pointers = new Map();
  let raf = 0;
  let drag = null;
  let pinch = null;

  const rect = () => el.getBoundingClientRect();
  const zoomed = () => tgt.z > 1.01;

  function local(e) {
    const r = rect();
    return { px: e.clientX - r.left - r.width / 2, py: e.clientY - r.top - r.height / 2, nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height };
  }

  function clampPan() {
    const r = rect();
    const mx = ((tgt.z - 1) * r.width) / 2;
    const my = ((tgt.z - 1) * r.height) / 2;
    tgt.x = clamp(tgt.x, -mx, mx);
    tgt.y = clamp(tgt.y, -my, my);
  }

  function render() {
    img.style.transform = `perspective(1100px) rotateX(${cur.rx}deg) rotateY(${cur.ry}deg) translate3d(${cur.x}px, ${cur.y}px, 0) scale(${cur.z})`;
    sheen.style.setProperty('--lx', `${cur.lx}%`);
    sheen.style.setProperty('--ly', `${cur.ly}%`);
    plinth.style.transform = `translateX(${-cur.ry * 0.9}px) scaleX(${1 - Math.abs(cur.ry) / 110})`;
  }

  function tick() {
    let moving = false;
    for (const k of Object.keys(cur)) {
      const d = tgt[k] - cur[k];
      if (!REDUCED && Math.abs(d) > 0.01) {
        cur[k] += d * EASE;
        moving = true;
      } else cur[k] = tgt[k];
    }
    render();
    raf = moving ? requestAnimationFrame(tick) : 0;
  }

  function kick() {
    el.classList.toggle('zoomed', zoomed());
    level.textContent = zoomed() ? `${tgt.z.toFixed(1)}×` : '';
    el.style.touchAction = zoomed() ? 'none' : 'pan-y';
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function zoomAt(z, px = 0, py = 0) {
    const z1 = clamp(z, 1, MAX_ZOOM);
    tgt.x = z1 === 1 ? 0 : px - ((px - tgt.x) * z1) / tgt.z;
    tgt.y = z1 === 1 ? 0 : py - ((py - tgt.y) * z1) / tgt.z;
    tgt.z = z1;
    tgt.rx = 0;
    tgt.ry = 0;
    clampPan();
    el.classList.add('used');
    kick();
  }

  function hover(e) {
    const { nx, ny } = local(e);
    tgt.lx = nx * 100;
    tgt.ly = ny * 100;
    if (zoomed()) {
      const r = rect();
      tgt.x = -(nx - 0.5) * (tgt.z - 1) * r.width;
      tgt.y = -(ny - 0.5) * (tgt.z - 1) * r.height;
      clampPan();
    } else {
      tgt.ry = (nx - 0.5) * 2 * HOVER_TILT.y;
      tgt.rx = -(ny - 0.5) * 2 * HOVER_TILT.x;
    }
    kick();
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: tgt.z };
      drag = null;
      return;
    }
    drag = { x: e.clientX, y: e.clientY, rx: tgt.rx, ry: tgt.ry, ox: tgt.x, oy: tgt.y, moved: false, fine: e.pointerType === 'mouse' };
    el.classList.add('dragging');
  });

  el.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const r = rect();
      zoomAt(pinch.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0), (a.x + b.x) / 2 - r.left - r.width / 2, (a.y + b.y) / 2 - r.top - r.height / 2);
      return;
    }
    if (!drag) {
      if (FINE) hover(e);
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) drag.moved = true;
    if (!drag.moved) return;
    if (zoomed()) {
      if (drag.fine) return hover(e);
      tgt.x = drag.ox + dx;
      tgt.y = drag.oy + dy;
      clampPan();
    } else {
      tgt.ry = clamp(drag.ry + dx * 0.25, -MAX_TILT, MAX_TILT);
      tgt.rx = clamp(drag.rx - dy * 0.15, -MAX_TILT / 2, MAX_TILT / 2);
      el.classList.add('used');
    }
    kick();
  });

  function release(e) {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      return;
    }
    if (!drag) return;
    const tap = !drag.moved && e.type === 'pointerup';
    drag = null;
    el.classList.remove('dragging');
    if (tap) {
      const { px, py } = local(e);
      zoomAt(zoomed() ? 1 : ZOOM, px, py);
      if (zoomed() && FINE) hover(e);
    } else if (!FINE && !zoomed()) {
      tgt.rx = 0;
      tgt.ry = 0;
      kick();
    }
  }
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  el.addEventListener('pointerleave', () => {
    if (drag || zoomed()) return;
    tgt.rx = 0;
    tgt.ry = 0;
    kick();
  });

  el.addEventListener('wheel', (e) => {
    if (!zoomed()) return;
    e.preventDefault();
    const { px, py } = local(e);
    zoomAt(e.deltaY < 0 ? tgt.z * WHEEL_STEP : tgt.z / WHEEL_STEP, px, py);
  }, { passive: false });

  el.addEventListener('keydown', (e) => {
    const pan = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (e.key === 'Enter' || e.key === ' ') zoomAt(zoomed() ? 1 : ZOOM);
    else if (e.key === '+' || e.key === '=') zoomAt(tgt.z * WHEEL_STEP);
    else if (e.key === '-') zoomAt(tgt.z / WHEEL_STEP);
    else if ((e.key === 'Escape' || e.key === '0') && zoomed()) zoomAt(1);
    else if (pan && zoomed()) {
      tgt.x += pan[0] * PAN_STEP;
      tgt.y += pan[1] * PAN_STEP;
      clampPan();
      kick();
    } else if (pan) {
      tgt.ry = clamp(tgt.ry - pan[0] * 6, -MAX_TILT, MAX_TILT);
      tgt.rx = clamp(tgt.rx + pan[1] * 4, -MAX_TILT / 2, MAX_TILT / 2);
      kick();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });

  render();
  return { el: root, reset: () => zoomAt(1), dispose: () => cancelAnimationFrame(raf) };
}

let box = null;

function lightbox() {
  const stage = h('div', { class: 'lb-stage' });
  const count = h('p', { class: 'lb-count caps', 'aria-live': 'polite' });
  const thumbs = h('div', { class: 'lb-thumbs', role: 'group', 'aria-label': 'Images' });
  const prev = h('button', { type: 'button', class: 'icon-btn lb-nav lb-prev', 'aria-label': 'Previous image' }, icon('down'));
  const next = h('button', { type: 'button', class: 'icon-btn lb-nav lb-next', 'aria-label': 'Next image' }, icon('down'));
  const dialog = h('dialog', { class: 'lightbox', 'aria-label': 'Image viewer' },
    h('header', { class: 'lb-head' }, count, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close image viewer', onclick: () => dialog.close() }, icon('x'))),
    h('div', { class: 'lb-body' }, prev, stage, next),
    thumbs);
  document.body.append(dialog);
  const state = { shots: [], index: 0, view: null };
  function show(i) {
    state.index = (i + state.shots.length) % state.shots.length;
    const s = state.shots[state.index];
    state.view?.dispose();
    state.view = inspector(s);
    stage.replaceChildren(state.view.el);
    count.textContent = `${s.label ?? 'Image'} · ${state.index + 1} / ${state.shots.length}`;
    for (const [n, b] of [...thumbs.children].entries()) b.setAttribute('aria-pressed', String(n === state.index));
    const multi = state.shots.length > 1;
    prev.hidden = !multi;
    next.hidden = !multi;
  }
  prev.addEventListener('click', () => show(state.index - 1));
  next.addEventListener('click', () => show(state.index + 1));
  dialog.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || state.shots.length < 2) return;
    if (e.key === 'ArrowLeft' && !stage.contains(e.target)) show(state.index - 1);
    if (e.key === 'ArrowRight' && !stage.contains(e.target)) show(state.index + 1);
  });
  dialog.addEventListener('close', () => state.view?.dispose());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  return {
    open(shots, index) {
      state.shots = shots;
      thumbs.replaceChildren(...shots.map((s, i) => h('button', { type: 'button', class: 'viewer-thumb', 'aria-label': `Show ${String(s.label ?? 'image').toLowerCase()}`, onclick: () => show(i) },
        h('img', { src: s.src, alt: '', width: '120', height: '90', loading: 'lazy' }))));
      show(index);
      dialog.showModal();
      stage.querySelector('.inspector')?.focus();
    },
  };
}

export function openLightbox(shots, index = 0) {
  box ??= lightbox();
  box.open(shots, index);
}
