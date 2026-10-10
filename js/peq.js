// Parametric EQ model (pure): bands, crossover, time/phase alignment, templates, exports.
import { complexResponse, toDb, toPhaseDeg, AUTOEQ_RAW } from './eq.js';

export const TYPES = {
  PK: 'Peak',
  LSC: 'Low shelf',
  HSC: 'High shelf',
  HPF: 'High-pass',
  LPF: 'Low-pass',
  NOTCH: 'Notch',
  AP: 'All-pass',
};
export const GAIN_TYPES = new Set(['PK', 'LSC', 'HSC']);
export const PASS_TYPES = new Set(['HPF', 'LPF']);
export const DEFAULT_Q = { PK: 1.41, LSC: 0.71, HSC: 0.71, HPF: 0.71, LPF: 0.71, NOTCH: 4, AP: 0.71 };
export const LIMITS = { fc: [20, 20000], gain: [-18, 18], q: [0.1, 12], delayMs: [0, 50] };
export const SPEED_OF_SOUND = 343; // m/s at ~20 °C
const BUTTERWORTH_Q = Math.SQRT1_2;
// Linkwitz-Riley = two cascaded Butterworth filters of half the order.
const LR_STAGES = { 12: [0.5], 24: [BUTTERWORTH_Q, BUTTERWORTH_Q], 48: [0.5412, 1.3066, 0.5412, 1.3066] };

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, Number(v) || 0));
const round = (v, step) => Number((Math.round(v / step) * step).toFixed(4)); // no 1.4000000001
let seq = 0;
export const newId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export function makeBand({ id = newId(), type = 'PK', fc = 1000, gain = 0, q, slope = 12, enabled = true } = {}) {
  return {
    id,
    type: TYPES[type] ? type : 'PK',
    fc: Math.round(clamp(fc, LIMITS.fc)),
    gain: GAIN_TYPES.has(type) ? round(clamp(gain, LIMITS.gain), 0.1) : 0,
    q: round(clamp(q ?? DEFAULT_Q[type] ?? 1, LIMITS.q), 0.01),
    slope: slope === 24 ? 24 : 12,
    enabled: enabled !== false,
  };
}

// Bands -> engine/graph biquad specs. A 24 dB/oct pass filter is two Butterworth stages.
export function expandBands(bands) {
  return bands.filter((b) => b.enabled).flatMap((b) => {
    if (PASS_TYPES.has(b.type) && b.slope === 24) {
      return [0, 1].map(() => ({ type: b.type, fc: b.fc, gain: 0, q: BUTTERWORTH_Q, band: b.id }));
    }
    return [{ type: b.type, fc: b.fc, gain: GAIN_TYPES.has(b.type) ? b.gain : 0, q: b.q, band: b.id }];
  });
}

export const DEFAULT_CROSSOVER = { enabled: false, fc: 80, slope: 24, subGain: 0, subDelay: 0, subInvert: false };
export const DEFAULT_ALIGNMENT = { delayL: 0, delayR: 0, invertL: false, invertR: false };

export function crossoverStages({ fc, slope }, type) {
  return (LR_STAGES[slope] ?? LR_STAGES[24]).map((q) => ({ type, fc, gain: 0, q }));
}

export const distanceToMs = (cm) => (Math.max(0, cm) / 100 / SPEED_OF_SOUND) * 1000;

const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cscale = (a, k) => ({ re: a.re * k, im: a.im * k });

// What leaves the system: EQ (+ preamp), and with a crossover the main (HPF) and sub (LPF,
// gain, delay, polarity) branches plus their acoustic sum. Phase is the sum's phase.
export function systemResponse({ eqSpecs, preamp, crossover }, freqs, fs) {
  const pre = 10 ** (preamp / 20);
  const eq = complexResponse(eqSpecs, freqs, fs).map((h) => cscale(h, pre));
  if (!crossover?.enabled) {
    return { eq: eq.map(toDb), main: null, sub: null, sum: eq.map(toDb), phase: eq.map(toPhaseDeg) };
  }
  const hp = complexResponse(crossoverStages(crossover, 'HPF'), freqs, fs);
  const lp = complexResponse(crossoverStages(crossover, 'LPF'), freqs, fs);
  const subK = 10 ** (crossover.subGain / 20) * (crossover.subInvert ? -1 : 1);
  const tau = crossover.subDelay / 1000;
  const main = eq.map((h, i) => cmul(h, hp[i]));
  const sub = eq.map((h, i) => {
    const w = 2 * Math.PI * freqs[i] * tau;
    return cmul(cscale(cmul(h, lp[i]), subK), { re: Math.cos(w), im: -Math.sin(w) });
  });
  const sum = main.map((m, i) => ({ re: m.re + sub[i].re, im: m.im + sub[i].im }));
  return { eq: eq.map(toDb), main: main.map(toDb), sub: sub.map(toDb), sum: sum.map(toDb), phase: sum.map(toPhaseDeg) };
}

// ---------- reference targets (AutoEq) and starter templates ----------

export const TARGETS = {
  'harman-ie-2019': { name: 'Harman in-ear 2019', file: 'Harman in-ear 2019.csv' },
  'harman-oe-2018': { name: 'Harman over-ear 2018', file: 'Harman over-ear 2018.csv' },
  'harman-room-2013': { name: 'Harman loudspeaker in-room flat 2013', file: 'Harman loudspeaker in-room flat 2013.csv' },
};
export const targetUrl = (id) => `${AUTOEQ_RAW.replace(/results\/$/, 'targets/')}${encodeURIComponent(TARGETS[id].file)}`;

const B = (type, fc, gain, q, extra = {}) => ({ type, fc, gain, q, ...extra });
export const TEMPLATES = [
  {
    id: 'flat', name: 'Flat', kind: 'Any device', target: null,
    note: 'Every band off. A clean slate to build on.',
    bands: [],
  },
  {
    id: 'iem-harman', name: 'IEM · Harman in-ear 2019 starter', kind: 'In-ear monitors', target: 'harman-ie-2019',
    note: 'A typical move for neutral-leaning IEMs toward the Harman in-ear target: a sub-bass shelf, a little ear gain, and a tamed 6 kHz peak.',
    bands: [B('LSC', 105, 5, 0.71), B('PK', 2700, 1.5, 1.4), B('PK', 6000, -2, 3), B('HSC', 10000, -1, 0.71)],
  },
  {
    id: 'overear-harman', name: 'Over-ear · Harman 2018 starter', kind: 'Headphones', target: 'harman-oe-2018',
    note: 'Fills in the sub-bass most open-backs roll off and softens an upper-mid glare.',
    bands: [B('LSC', 105, 4, 0.71), B('PK', 3000, -1.5, 1.41), B('HSC', 10000, -1, 0.71)],
  },
  {
    id: 'r1700bt-desk', name: 'Desk · Edifier R1700BT near-field', kind: 'Desktop speakers', target: 'harman-room-2013',
    note: 'For 4-inch bookshelves on a desk: cuts the desk-bounce hump near 120 Hz, clears low-mid mud, softens forward upper mids, adds a touch of air. A starting point, not a measurement of your room.',
    bands: [B('PK', 120, -3, 1.4), B('PK', 250, -1.5, 1.2), B('PK', 2500, -1.5, 2), B('HSC', 10000, 1, 0.71)],
  },
  {
    id: 'mr4-sub', name: 'Studio · Edifier MR4 + subwoofer (2.1)', kind: 'Monitors + sub', target: 'harman-room-2013',
    note: 'An 80 Hz Linkwitz-Riley 24 dB/oct crossover: the monitors stop fighting the sub, the sub stays below the voice range. Fine-tune sub delay and polarity in Time & phase.',
    bands: [B('PK', 180, -2, 1.4)],
    crossover: { enabled: true, fc: 80, slope: 24, subGain: 0, subDelay: 0, subInvert: false },
  },
  {
    id: 'hiphop', name: 'Genre · Hip-hop 808 weight', kind: 'Any device', target: null,
    note: 'Sub-bass weight for 808s, a mud cut so the low end stays tight, and a small presence lift for vocals.',
    bands: [B('LSC', 60, 4, 0.71), B('PK', 45, 2, 1.2), B('PK', 300, -2, 1.2), B('PK', 3500, 1, 1.4)],
  },
  {
    id: 'metal', name: 'Genre · Atmospheric metal clarity', kind: 'Any device', target: null,
    note: 'Separation for dense, fast music: less low-mid wash, more pick attack, calmer cymbals, more air.',
    bands: [B('PK', 250, -2.5, 1), B('PK', 3500, 1.5, 1.4), B('PK', 7000, -2, 3), B('HSC', 12000, 1.5, 0.71)],
  },
];

export function applyTemplate(template) {
  return {
    bands: template.bands.map((b) => makeBand(b)),
    crossover: { ...DEFAULT_CROSSOVER, ...template.crossover },
    target: template.target,
  };
}

// ---------- exports ----------

const fmt = (v, d = 1) => Number(v).toFixed(d);
function apoFilter(s) {
  switch (s.type) {
    case 'PK': case 'LSC': case 'HSC':
      return `${s.type} Fc ${Math.round(s.fc)} Hz Gain ${fmt(s.gain)} dB Q ${fmt(s.q, 2)}`;
    case 'HPF': return `HPQ Fc ${Math.round(s.fc)} Hz Q ${fmt(s.q, 2)}`;
    case 'LPF': return `LPQ Fc ${Math.round(s.fc)} Hz Q ${fmt(s.q, 2)}`;
    case 'NOTCH': return `NO Fc ${Math.round(s.fc)} Hz Q ${fmt(s.q, 2)}`;
    case 'AP': return `AP Fc ${Math.round(s.fc)} Hz Q ${fmt(s.q, 2)}`;
    default: return '';
  }
}

// Full Equalizer APO config: EQ, a 2.1 crossover routed to the SUB channel, per-channel delay/polarity.
export function toApoConfig({ preamp, specs, crossover = DEFAULT_CROSSOVER, alignment = DEFAULT_ALIGNMENT }) {
  const lines = [`Preamp: ${fmt(preamp)} dB`];
  let n = 1;
  const filter = (s) => lines.push(`Filter ${n++}: ON ${apoFilter(s)}`);
  specs.forEach(filter);
  if (crossover.enabled) {
    lines.push('Copy: SUB=0.5*L+0.5*R', 'Channel: L R');
    crossoverStages(crossover, 'HPF').forEach(filter);
    lines.push('Channel: SUB');
    if (crossover.subGain) lines.push(`Preamp: ${fmt(crossover.subGain)} dB`);
    crossoverStages(crossover, 'LPF').forEach(filter);
    if (crossover.subDelay) lines.push(`Delay: ${fmt(crossover.subDelay, 2)} ms`);
    if (crossover.subInvert) lines.push('Copy: SUB=-1*SUB');
  }
  for (const ch of ['L', 'R']) {
    const delay = alignment[`delay${ch}`];
    const invert = alignment[`invert${ch}`];
    if (!delay && !invert) continue;
    lines.push(`Channel: ${ch}`);
    if (delay) lines.push(`Delay: ${fmt(delay, 2)} ms`);
    if (invert) lines.push(`Copy: ${ch}=-1*${ch}`);
  }
  if (lines.some((l) => l.startsWith('Channel:'))) lines.push('Channel: all');
  return lines.join('\n') + '\n';
}

// devicePEQ (hardware push) uses its own type codes; 24 dB pass filters go as one 12 dB stage.
const TO_DEVICE = { PK: 'PK', LSC: 'LSQ', HSC: 'HSQ', HPF: 'HP', LPF: 'LP', NOTCH: 'NOTCH', AP: 'AP' };
const FROM_DEVICE = Object.fromEntries(Object.entries(TO_DEVICE).map(([k, v]) => [v, k]));
export const toDeviceFilters = (bands) => bands.filter((b) => b.enabled).map((b) => ({
  type: TO_DEVICE[b.type], freq: b.fc, gain: GAIN_TYPES.has(b.type) ? b.gain : 0, q: b.q, disabled: false,
}));
export const fromDeviceFilters = (filters) => filters
  .filter((f) => FROM_DEVICE[f.type] && Number(f.freq) > 0)
  .map((f) => makeBand({ type: FROM_DEVICE[f.type], fc: f.freq, gain: f.gain, q: f.q, enabled: !f.disabled }));
