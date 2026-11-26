// Hands-on controls for the Guide: a rotary knob and a tiny frequency-response plot.
import { h, haptic, fmtHz } from './ui.js';
import { rollNumber } from './img.js';
import { play } from './sound.js';

const SVG = 'http://www.w3.org/2000/svg';
const ARC_DEG = 270;
const DRAG_PX_FULL_RANGE = 220; // pixels of vertical drag to sweep min..max
const SCALE_TICKS = 24;
const DETENTS = 48; // clicks per full turn
const FLICK_FRICTION = 0.9;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
// It feels weighted: the pointer trails the value slightly, a flick keeps it turning, and it clicks
// through engraved detents (sound + haptics). log: true sweeps logarithmically (frequencies).
// detent: value that gives a stronger tick.
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
  const pointer = s('g', { class: 'knob-pointer' });
  pointer.append(s('line', { x1: 50, y1: 50, x2: 50, y2: 26 }), s('circle', { class: 'knob-dot', cx: 50, cy: 30, r: 2.2 }));
  const ticks = s('g', { class: 'knob-ticks' });
  for (let i = 0; i <= SCALE_TICKS; i++) {
    const a = ((start + (i / SCALE_TICKS) * ARC_DEG - 90) * Math.PI) / 180;
    const long = i % 4 === 0;
    ticks.append(s('line', {
      class: long ? 'major' : '', x1: (50 + 46 * Math.cos(a)).toFixed(2), y1: (50 + 46 * Math.sin(a)).toFixed(2),
      x2: (50 + (long ? 50 : 48.5) * Math.cos(a)).toFixed(2), y2: (50 + (long ? 50 : 48.5) * Math.sin(a)).toFixed(2),
    }));
  }
  const svg = s('svg', { viewBox: '-4 -4 108 108', class: 'knob-svg', 'aria-hidden': 'true' });
  svg.append(ticks, s('path', { class: 'knob-track', d: arcPath(41, start, start + ARC_DEG) }), fill,
    s('circle', { class: 'knob-skirt', cx: 50, cy: 50, r: 34 }), s('circle', { class: 'knob-cap', cx: 50, cy: 50, r: 29 }), pointer);
  const out = h('output', { class: 'knob-value' });
  const el = h('div', {
    class: 'knob', role: 'slider', tabindex: '0', 'aria-label': label, 'data-lenis-prevent': '', 'data-cursor': 'drag',
    'aria-valuemin': String(min), 'aria-valuemax': String(max),
  }, svg, out, h('span', { class: 'knob-label' }, label));

  let tick = Math.round(toT(value) * DETENTS);
  function render() {
    const deg = start + toT(value) * ARC_DEG;
    const z = start + toT(detent ?? min) * ARC_DEG;
    fill.setAttribute('d', arcPath(41, Math.min(z, deg), Math.max(z, deg) + 0.01));
    pointer.style.transform = `rotate(${deg.toFixed(2)}deg)`;
    rollNumber(out, format(value));
    el.setAttribute('aria-valuenow', String(value));
    el.setAttribute('aria-valuetext', format(value));
  }

  function set(v, { emit = true } = {}) {
    const next = Math.min(max, Math.max(min, v));
    if (next === value) return;
    const crossedDetent = detent !== null && (value - detent) * (next - detent) <= 0;
    value = next;
    render();
    if (!emit) return;
    const t = Math.round(toT(value) * DETENTS);
    if (t !== tick || crossedDetent) {
      tick = t;
      play('detent');
      haptic(crossedDetent ? 14 : 3);
    }
    onInput?.(value);
  }

  // Vertical drag maps to the knob's travel, independent of where you grab it.
  let spin = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    cancelAnimationFrame(spin);
    el.setPointerCapture(e.pointerId);
    el.focus();
    let lastY = e.clientY;
    let lastT = performance.now();
    let vel = 0;
    let pos = toT(value);
    el.classList.add('turning');
    const move = (ev) => {
      const now = performance.now();
      const dt = (lastY - ev.clientY) / DRAG_PX_FULL_RANGE * (ev.shiftKey ? 0.2 : 1);
      pos = Math.min(1, Math.max(0, pos + dt));
      vel = dt / Math.max(1, now - lastT) * 16;
      lastY = ev.clientY;
      lastT = now;
      set(fromT(pos));
    };
    const up = () => {
      el.classList.remove('turning');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (REDUCED || performance.now() - lastT > 60) return;
      // A flick keeps turning and slows down, like a weighted knob.
      const coast = () => {
        vel *= FLICK_FRICTION;
        pos = Math.min(1, Math.max(0, pos + vel));
        set(fromT(pos));
        if (Math.abs(vel) > 0.0008 && pos > 0 && pos < 1) spin = requestAnimationFrame(coast);
      };
      spin = requestAnimationFrame(coast);
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
