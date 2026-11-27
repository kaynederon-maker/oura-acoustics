import { $, store } from './ui.js';

const KEY = 'aura.sound';
let on = store.get(KEY, false);
let ctx = null;
let noise = null;
let lastTick = 0;
const TICK_GAP_MS = 28;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function burst({ at = 0, dur = 0.02, gain = 0.2, type = 'bandpass', freq = 3000, q = 1 }) {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime + at;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.02);
}

function thump({ at = 0, freq = 70, dur = 0.18, gain = 0.25 }) {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + at;
  o.frequency.setValueAtTime(freq * 1.8, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SOUNDS = {
  needle() {
    thump({ freq: 58, gain: 0.22 });
    burst({ dur: 0.05, gain: 0.12, freq: 1800, q: 0.6 });
    for (let i = 0; i < 7; i++) burst({ at: 0.06 + i * 0.07 + Math.random() * 0.03, dur: 0.012, gain: 0.05, freq: 4500, q: 2 });
  },
  detent() { burst({ dur: 0.012, gain: 0.16, freq: 5200, q: 3 }); },
  click() {
    burst({ dur: 0.014, gain: 0.2, freq: 2600, q: 2 });
    burst({ at: 0.035, dur: 0.01, gain: 0.1, freq: 3800, q: 2 });
  },
  lift() { burst({ dur: 0.08, gain: 0.05, freq: 1200, q: 0.8, type: 'lowpass' }); },
};

export function play(name) {
  if (!on || !SOUNDS[name]) return;
  if (name === 'detent') {
    const now = performance.now();
    if (now - lastTick < TICK_GAP_MS) return;
    lastTick = now;
  }
  try {
    SOUNDS[name]();
  } catch {
  }
}

export const soundOn = () => on;

export function initSound() {
  const btn = $('#sound-toggle');
  const sync = () => btn.setAttribute('aria-pressed', String(on));
  btn.addEventListener('click', () => {
    on = !on;
    store.set(KEY, on);
    sync();
    play('click');
  });
  sync();
}
