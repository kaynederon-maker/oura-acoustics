// Pure EQ helpers shared by the browser and the Node tests (no DOM, no Web Audio).
// Profiles come from AutoEq: https://github.com/jaakkopasanen/AutoEq (MIT).

export const AUTOEQ_RAW = 'https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/';
export const AUTOEQ_INDEX = `${AUTOEQ_RAW}INDEX.md`;
const SAMPLE_RATE = 48000;

// "- [Apple Airpods Pro 2](./Harpo/in-ear/Apple%20Airpods%20Pro%202) by Harpo on GRAS"
const INDEX_LINE = /^- \[(.*)\]\(\.\/(.+)\) by (.+?)(?: on (.+))?$/;

export function parseIndex(markdown) {
  const entries = [];
  for (const line of markdown.split('\n')) {
    const match = INDEX_LINE.exec(line.trim());
    if (!match) continue;
    const [, name, path, source, rig = ''] = match;
    entries.push({ name, path, source, rig, type: deviceType(path) });
  }
  return entries;
}

function deviceType(path) {
  if (path.includes('in-ear')) return 'In-ear';
  if (path.includes('earbud')) return 'Earbud';
  return 'Over-ear';
}

export function profileUrls(entry) {
  const folder = decodeURIComponent(entry.path.split('/').at(-1));
  const base = `${AUTOEQ_RAW}${entry.path}/${encodeURIComponent(folder)}`;
  return { eq: `${base}%20ParametricEQ.txt`, fr: `${base}.csv` };
}

export function searchIndex(query, entries, limit = 8) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return entries
    .filter((e) => terms.every((t) => e.name.toLowerCase().includes(t)))
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, limit);
}

// Words in OS device names that say nothing about the model.
const DEVICE_STOPWORDS = new Set([
  'headphones', 'headphone', 'headset', 'stereo', 'hands', 'free', 'audio', 'bluetooth', 'speakers', 'speaker',
  'realtek', 'high', 'definition', 'microphone', 'mic', 'default', 'communications', 'device', 'output', 'input', 'usb',
]);

// "AirPods Pro" (OS label) -> AutoEq entries whose names contain most of the label's words.
export function matchDevices(labels, entries, limit = 6) {
  const best = new Map();
  for (const label of labels) {
    const tokens = label.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !DEVICE_STOPWORDS.has(t));
    if (!tokens.length) continue;
    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      const coverage = tokens.filter((t) => name.includes(t)).length / tokens.length;
      if (coverage < 0.6) continue;
      const score = coverage - name.length / 1000; // prefer the closest, shortest name
      if (score > (best.get(entry)?.score ?? -1)) best.set(entry, { score, label });
    }
  }
  return [...best]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([entry, { label }]) => ({ ...entry, matchedFrom: label }));
}

const TYPE_ALIASES ={ PK: 'PK', PEQ: 'PK', LS: 'LSC', LSC: 'LSC', HS: 'HSC', HSC: 'HSC' };

export function parseParametricEq(text) {
  const preamp = Number(/Preamp:\s*(-?[\d.]+)\s*dB/i.exec(text)?.[1] ?? 0);
  const filterLine = /Filter\s+\d+:\s+ON\s+(PK|PEQ|LSC|LS|HSC|HS)\s+Fc\s+([\d.]+)\s+Hz\s+Gain\s+(-?[\d.]+)\s+dB\s+Q\s+([\d.]+)/gi;
  const filters = [...text.matchAll(filterLine)].map((m) => ({
    type: TYPE_ALIASES[m[1].toUpperCase()],
    fc: Number(m[2]),
    gain: Number(m[3]),
    q: Number(m[4]),
  }));
  return { preamp, filters };
}

export function parseFrCsv(csv) {
  const [header, ...rows] = csv.trim().split('\n');
  const cols = header.split(',');
  const pick = (name) => {
    const i = cols.indexOf(name);
    return i < 0 ? null : rows.map((r) => Number(r.split(',')[i]));
  };
  return {
    frequency: pick('frequency'),
    raw: pick('smoothed') ?? pick('raw'),
    target: pick('target'),
    equalized: pick('equalized_smoothed') ?? pick('equalized_raw'),
  };
}

export function logFreqs(count, lo = 20, hi = 20000) {
  const ratio = Math.log10(hi / lo);
  return Array.from({ length: count }, (_, i) => lo * 10 ** ((ratio * i) / (count - 1)));
}

// RBJ Audio EQ Cookbook biquads. Web Audio's BiquadFilterNode uses the same formulas, so the
// graph and the sound match: peaking/notch/allpass take a linear Q, highpass/lowpass take Q in dB
// (converted in audio-engine.js), and native shelves are fixed at Q 0.707 (others use IIRFilterNode).
export function biquadCoefficients({ type, fc, gain = 0, q }, fs = SAMPLE_RATE) {
  const A = 10 ** (gain / 40);
  const w0 = (2 * Math.PI * Math.min(fc, fs * 0.49)) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const k = 2 * Math.sqrt(A) * alpha;
  switch (type) {
    case 'LSC':
      return {
        b: [A * (A + 1 - (A - 1) * cos + k), 2 * A * (A - 1 - (A + 1) * cos), A * (A + 1 - (A - 1) * cos - k)],
        a: [A + 1 + (A - 1) * cos + k, -2 * (A - 1 + (A + 1) * cos), A + 1 + (A - 1) * cos - k],
      };
    case 'HSC':
      return {
        b: [A * (A + 1 + (A - 1) * cos + k), -2 * A * (A - 1 + (A + 1) * cos), A * (A + 1 + (A - 1) * cos - k)],
        a: [A + 1 - (A - 1) * cos + k, 2 * (A - 1 - (A + 1) * cos), A + 1 - (A - 1) * cos - k],
      };
    case 'LPF':
      return { b: [(1 - cos) / 2, 1 - cos, (1 - cos) / 2], a: [1 + alpha, -2 * cos, 1 - alpha] };
    case 'HPF':
      return { b: [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2], a: [1 + alpha, -2 * cos, 1 - alpha] };
    case 'NOTCH':
      return { b: [1, -2 * cos, 1], a: [1 + alpha, -2 * cos, 1 - alpha] };
    case 'AP':
      return { b: [1 - alpha, -2 * cos, 1 + alpha], a: [1 + alpha, -2 * cos, 1 - alpha] };
    default: // PK
      return { b: [1 + alpha * A, -2 * cos, 1 - alpha * A], a: [1 + alpha / A, -2 * cos, 1 - alpha / A] };
  }
}

// H(e^jw) of one coefficient triple: re + j·im (z^-1 = cos w − j sin w).
const evalPoly = ([c0, c1, c2], w) => ({
  re: c0 + c1 * Math.cos(w) + c2 * Math.cos(2 * w),
  im: -(c1 * Math.sin(w) + c2 * Math.sin(2 * w)),
});

// Complex response of a cascade: [{ re, im }] per frequency (multiply each stage).
export function complexResponse(filters, freqs, fs = SAMPLE_RATE) {
  const coeffs = filters.map((f) => biquadCoefficients(f, fs));
  return freqs.map((f) => {
    const w = (2 * Math.PI * f) / fs;
    return coeffs.reduce((acc, { b, a }) => {
      const n = evalPoly(b, w);
      const d = evalPoly(a, w);
      const dd = d.re * d.re + d.im * d.im;
      const h = { re: (n.re * d.re + n.im * d.im) / dd, im: (n.im * d.re - n.re * d.im) / dd };
      return { re: acc.re * h.re - acc.im * h.im, im: acc.re * h.im + acc.im * h.re };
    }, { re: 1, im: 0 });
  });
}

export const toDb = ({ re, im }) => 10 * Math.log10(re * re + im * im + 1e-30);
export const toPhaseDeg = ({ re, im }) => (Math.atan2(im, re) * 180) / Math.PI;

export function responseDb(filters, preamp, freqs, fs = SAMPLE_RATE) {
  return complexResponse(filters, freqs, fs).map((h) => toDb(h) + preamp);
}

// Preamp that keeps the loudest boost at or below 0 dBFS.
export function safePreamp(filters) {
  const peak = Math.max(0, ...responseDb(filters, 0, logFreqs(256)));
  return -Math.ceil(peak * 10) / 10;
}

// Equalizer APO / Peace / AutoEq "ParametricEQ.txt" format.
export function toParametricText({ preamp, filters }) {
  const lines = filters.map(
    (f, i) => `Filter ${i + 1}: ON ${f.type} Fc ${Math.round(f.fc)} Hz Gain ${f.gain.toFixed(1)} dB Q ${f.q.toFixed(2)}`,
  );
  return [`Preamp: ${preamp.toFixed(1)} dB`, ...lines].join('\n') + '\n';
}

// Wavelet (Android) / Equalizer APO GraphicEQ format, sampled on 127 log-spaced points.
export function toGraphicEqText({ preamp, filters }) {
  const freqs = logFreqs(127);
  const gains = responseDb(filters, preamp, freqs);
  return `GraphicEQ: ${freqs.map((f, i) => `${Math.round(f)} ${gains[i].toFixed(1)}`).join('; ')}\n`;
}
