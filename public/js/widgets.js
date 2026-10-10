// Hands-on controls for the Guide: a rotary knob and a tiny frequency-response plot.
import { h, haptic, fmtHz } from './ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const ARC_DEG = 270;
const DRAG_PX_FULL_RANGE = 220; // pixels of vertical drag to sweep min..max
const s = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

function arcPath(r, from, to) {
  const p = (deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  };
  return `M ${p(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${p(to)}`;
}

// Rotary knob. Drag up/down (Shift = fine), wheel, arrows/PageUp/Home/End, double-click resets.
// log: true sweeps logarithmically (frequencies). detent: value that gives a stronger haptic tick.
export function knob({ label, min, max, value, step = 1, log = false, format = String, onInput, detent = null }) {
  const initial = value;
  const toT = (v) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromT = (t) => {
    const c = Math.min(1, Math.max(0, t));
    const raw = log ? min * (max / min) ** c : min + c * (max - min);
    return Math.min(max, Math.max(min, Number((Math.round(raw / step) * step).toFixed(4))));
  };
  const start = -ARC_DEG / 2;
  const fill = s('path', { class: 'knob-fill' });
  const pointer = s('line', { class: 'knob-pointer', x1: 50, y1: 50, x2: 50, y2: 24 });
  const svg = s('svg', { viewBox: '0 0 100 100', class: 'knob-svg', 'aria-hidden': 'true' });
  svg.append(s('path', { class: 'knob-track', d: arcPath(42, start, start + ARC_DEG) }), fill, s('circle', { class: 'knob-cap', cx: 50, cy: 50, r: 31 }), pointer);
  const out = h('output', { class: 'knob-value' });
  const el = h('div', {
    class: 'knob', role: 'slider', tabindex: '0', 'aria-label': label, 'data-lenis-prevent': '',
    'aria-valuemin': String(min), 'aria-valuemax': String(max),
  }, svg, out, h('span', { class: 'knob-label' }, label));

  function render() {
    const deg = start + toT(value) * ARC_DEG;
    const z = start + toT(detent ?? min) * ARC_DEG;
    fill.setAttribute('d', arcPath(42, Math.min(z, deg), Math.max(z, deg) + 0.01));
    pointer.setAttribute('transform', `rotate(${deg.toFixed(2)} 50 50)`);
    out.textContent = format(value);
    el.setAttribute('aria-valuenow', String(value));
    el.setAttribute('aria-valuetext', format(value));
  }

  function set(v, { emit = true } = {}) {
    const next = Math.min(max, Math.max(min, v));
    if (next === value) return;
    const crossedDetent = detent !== null && (value - detent) * (next - detent) <= 0;
    value = next;
    render();
    if (emit) {
      haptic(crossedDetent ? 14 : 3);
      onInput?.(value);
    }
  }

  // Vertical drag maps to the knob's travel, independent of where you grab it.
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.focus();
    const y0 = e.clientY;
    const t0 = toT(value);
    el.classList.add('turning');
    const move = (ev) => set(fromT(t0 + ((y0 - ev.clientY) / DRAG_PX_FULL_RANGE) * (ev.shiftKey ? 0.2 : 1)));
    const up = () => {
      el.classList.remove('turning');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    set(fromT(toT(value) - Math.sign(e.deltaY) * 0.02));
  }, { passive: false });
  el.addEventListener('keydown', (e) => {
    const nudge = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
    if (nudge) {
      e.preventDefault();
      set(fromT(toT(value) + nudge * 0.01));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      set(e.key === 'Home' ? min : max);
    }
  });
  el.addEventListener('dblclick', () => set(initial));
  render();
  return { el, get: () => value, set };
}

// Small response plot: log frequency x (20 Hz to 20 kHz), dB y. series: [{ db: number[], cls }].
export function miniPlot(host, freqs, { yMin = -12, yMax = 12 } = {}) {
  const W = 400;
  const H = 160;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mini-plot', role: 'img', preserveAspectRatio: 'none' });
  const lo = freqs[0];
  const span = Math.log10(freqs[freqs.length - 1] / lo);
  const x = (f) => (Math.log10(f / lo) / span) * W;
  const y = (db) => H - ((Math.min(yMax, Math.max(yMin, db)) - yMin) / (yMax - yMin)) * H;
  for (const f of [30, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    if (f <= lo || f >= freqs[freqs.length - 1]) continue;
    svg.append(s('line', { class: 'mp-grid', x1: x(f), x2: x(f), y1: 0, y2: H }));
  }
  svg.append(s('line', { class: 'mp-zero', x1: 0, x2: W, y1: y(0), y2: y(0) }));
  const layer = s('g');
  svg.append(layer);
  const ticks = h('div', { class: 'mp-ticks', 'aria-hidden': 'true' },
    [lo, Math.sqrt(lo * freqs[freqs.length - 1]), freqs[freqs.length - 1]].map((f) => h('span', {}, fmtHz(Math.round(f)))));
  host.append(svg, ticks);
  return {
    draw(series, label) {
      layer.replaceChildren(...series.map(({ db, cls }) => s('path', {
        class: `mp-line ${cls}`, 'vector-effect': 'non-scaling-stroke',
        d: db.map((v, i) => `${i ? 'L' : 'M'}${x(freqs[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(''),
      })));
      if (label) svg.setAttribute('aria-label', label);
    },
  };
}
