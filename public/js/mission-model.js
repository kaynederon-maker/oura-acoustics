// Maths behind the Guide's pro missions (pure, tested in test/missions.test.mjs).
import { complexResponse, toDb } from './eq.js';

const LR4_Q = Math.SQRT1_2; // two Butterworth stages = Linkwitz-Riley 24 dB/oct
const SPEED_OF_SOUND = 343;

// ---------- desk speakers + subwoofer ----------

// The room: small bookshelf speakers roll off naturally around 65 Hz (2nd order), the sub sits
// 75 cm further back than the speakers, and the sub's own response starts falling below 25 Hz.
export const ROOM = { mainsRolloffHz: 65, subExtraDistanceM: 0.75, subLowHz: 25 };

export const XO_START = { fc: 150, subGain: 6, phase: 0, invert: false, highPassMains: false };

const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });

// params: { fc, subGain (dB), phase (deg of lag at fc, 0..180), invert, highPassMains }
export function crossoverResponse(p, freqs) {
  const lr4 = (type) => [{ type, fc: p.fc, gain: 0, q: LR4_Q }, { type, fc: p.fc, gain: 0, q: LR4_Q }];
  const mainsFilters = [{ type: 'HPF', fc: ROOM.mainsRolloffHz, gain: 0, q: LR4_Q }, ...(p.highPassMains ? lr4('HPF') : [])];
  const mains = complexResponse(mainsFilters, freqs);
  const sub = complexResponse([...lr4('LPF'), { type: 'HPF', fc: ROOM.subLowHz, gain: 0, q: LR4_Q }], freqs);
  // Placement delay plus the sub's phase knob, which DSP subs implement as extra delay at fc.
  const delayS = ROOM.subExtraDistanceM / SPEED_OF_SOUND + p.phase / 360 / p.fc;
  const k = 10 ** (p.subGain / 20) * (p.invert ? -1 : 1);
  const sum = freqs.map((f, i) => {
    const w = 2 * Math.PI * f * delayS;
    const s = cmul(sub[i], { re: k * Math.cos(w), im: -k * Math.sin(w) });
    return { re: mains[i].re + s.re, im: mains[i].im + s.im };
  });
  return { sum: sum.map(toDb), mains: mains.map(toDb), sub: sub.map((h) => toDb(h) + p.subGain) };
}

// Worst deviation from flat over the band a sub/sat system should cover.
export function flatness(db, freqs, lo = 35, hi = 200) {
  const band = db.filter((_, i) => freqs[i] >= lo && freqs[i] <= hi);
  return Math.max(...band.map(Math.abs));
}

// ---------- IEM drum monitor mix ----------

export const IEM_BANDS = [
  { id: 'kick', label: 'Kick thump', type: 'LSC', fc: 70, q: 0.71, min: -6, max: 9, target: 5 },
  { id: 'box', label: 'Boxiness', type: 'PK', fc: 380, q: 1.4, min: -9, max: 6, target: -4 },
  { id: 'crack', label: 'Snare crack', type: 'PK', fc: 4000, q: 1.4, min: -6, max: 9, target: 3 },
  { id: 'wash', label: 'Cymbal wash', type: 'PK', fc: 9000, q: 1.2, min: -12, max: 6, target: -6 },
];

export const iemSpecs = (gains) => IEM_BANDS.map((b) => ({ type: b.type, fc: b.fc, gain: gains[b.id] ?? 0, q: b.q }));
export const iemCurve = (gains, freqs) => complexResponse(iemSpecs(gains), freqs).map(toDb);

// 100 = identical curves; loses ~12 points per dB of RMS difference.
export function matchScore(a, b) {
  const rms = Math.sqrt(a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0) / a.length);
  return Math.max(0, Math.round(100 - rms * 12));
}
