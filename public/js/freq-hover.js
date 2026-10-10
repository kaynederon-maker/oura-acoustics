// Frequency tooltip: hover (or tap, or arrow keys) anywhere on the spectrum to learn
// what that range does and what boosting or cutting it changes.
import { tipFor } from './freq-tips.js';
import { h, fmtHz, icon } from './ui.js';

const MARGIN = 12;
const OFFSET = 16;
const KEY_STEP = 2 ** (1 / 6); // arrow keys move a sixth of an octave
const TOUCH_LINGER_MS = 2500;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Two significant figures reads like an EQ knob: 1037 -> 1000, 437 -> 440.
const snap = (f) => {
  const step = 10 ** (Math.floor(Math.log10(f)) - 1);
  return Math.round(f / step) * step;
};

let tip = null;
let hideTimer;

function element() {
  tip ??= document.body.appendChild(h('div', { id: 'freq-tip', class: 'freq-tip', role: 'tooltip', hidden: true }));
  return tip;
}

export function showTip(freq, { x, y }, extra = []) {
  clearTimeout(hideTimer);
  const t = tipFor(freq);
  const el = element();
  el.replaceChildren(
    h('div', { class: 'tip-head' }, h('strong', {}, fmtHz(freq)), h('span', {}, t.name)),
    h('p', {}, t.role),
    h('p', { class: 'up' }, h('b', {}, icon('up'), 'Boost '), t.boost),
    h('p', { class: 'down' }, h('b', {}, icon('down'), 'Cut '), t.cut),
    ...extra.map((line) => h('p', { class: 'readout' }, line)));
  el.hidden = false;
  const { width, height } = el.getBoundingClientRect();
  let left = x + OFFSET;
  if (left + width > innerWidth - MARGIN) left = x - width - OFFSET;
  let top = y - height - OFFSET;
  if (top < MARGIN) top = y + OFFSET;
  el.style.transform = `translate(${clamp(left, MARGIN, innerWidth - width - MARGIN)}px, ${clamp(top, MARGIN, innerHeight - height - MARGIN)}px)`;
}

export function hideTip(delay = 0) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => tip && (tip.hidden = true), delay);
}

// Log-frequency canvas (20 Hz–20 kHz across the plot area between the paddings).
export function attachGraphHover(canvas, { padLeft = 0, padRight = 0, readout = () => [] } = {}) {
  const line = canvas.parentElement.querySelector('.crosshair');
  const area = () => {
    const r = canvas.getBoundingClientRect();
    return { r, left: r.left + padLeft, width: r.width - padLeft - padRight };
  };
  const freqAtX = (clientX) => {
    const { left, width } = area();
    return 20 * 10 ** (3 * clamp((clientX - left) / width, 0, 1));
  };
  const xAtFreq = (f) => {
    const { left, width } = area();
    return left + (Math.log10(f / 20) / 3) * width;
  };
  const show = (f, clientX, clientY) => {
    const freq = snap(f);
    showTip(freq, { x: clientX, y: clientY }, readout(freq));
    if (!line) return;
    line.hidden = false;
    line.style.transform = `translateX(${clientX - canvas.parentElement.getBoundingClientRect().left}px)`;
  };
  const hide = (delay) => {
    hideTip(delay);
    if (line) setTimeout(() => (line.hidden = tip?.hidden ?? true), delay);
  };

  canvas.addEventListener('pointermove', (e) => show(freqAtX(e.clientX), e.clientX, e.clientY));
  canvas.addEventListener('pointerdown', (e) => show(freqAtX(e.clientX), e.clientX, e.clientY));
  canvas.addEventListener('pointerleave', (e) => hide(e.pointerType === 'touch' ? TOUCH_LINGER_MS : 0));

  let keyFreq = 1000;
  const showKey = () => {
    const { r } = area();
    show(keyFreq, xAtFreq(keyFreq), r.top + r.height / 2);
  };
  canvas.addEventListener('focus', showKey);
  canvas.addEventListener('blur', () => hide(0));
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return hide(0);
    const step = { ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: 1 / KEY_STEP, ArrowDown: 1 / KEY_STEP }[e.key];
    if (!step) return;
    e.preventDefault();
    keyFreq = clamp(keyFreq * step, 20, 20000);
    showKey();
  });
}

// Any element with data-freq (EQ rows, sliders) or data-band (guide buttons).
export function attachElementHover(root = document) {
  const target = (e) => e.target.closest?.('[data-freq], [data-band]');
  const show = (e) => {
    const el = target(e);
    if (!el) return;
    const r = el.getBoundingClientRect();
    showTip(Number(el.dataset.freq ?? el.dataset.band), { x: r.left + Math.min(r.width / 2, 120), y: r.top });
  };
  const leave = (e) => {
    const el = target(e);
    if (el && !el.contains(e.relatedTarget)) hideTip(e.pointerType === 'touch' ? TOUCH_LINGER_MS : 0);
  };
  root.addEventListener('pointerover', show);
  root.addEventListener('focusin', show);
  root.addEventListener('pointerout', leave);
  root.addEventListener('focusout', leave);
}
