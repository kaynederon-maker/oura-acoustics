// Practice tracks for the Tuning Guide, synthesized offline in the browser (no samples, no
// downloads, no copyright): a 140 BPM trap beat built on 808s, and a 180 BPM atmospheric
// black-metal blast beat with tremolo-picked guitars drowned in reverb.

import * as engine from './audio-engine.js';

const SR = 44100;
const BARS = 4;

const noise = (ctx, seconds) => {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
};

function reverbIR(ctx, seconds, decay) {
  const ir = ctx.createBuffer(2, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** decay;
  }
  return ir;
}

function drive(ctx, amount) {
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return new WaveShaperNode(ctx, { curve, oversample: '4x' });
}

function bus(ctx) {
  const comp = new DynamicsCompressorNode(ctx, { threshold: -14, ratio: 4, attack: 0.004, release: 0.12 });
  const out = new GainNode(ctx, { gain: 0.85 });
  comp.connect(out).connect(ctx.destination);
  return comp;
}

function noiseHit(ctx, dest, t, { type, freq, q = 1, decay, level, noiseBuf }) {
  const src = new AudioBufferSourceNode(ctx, { buffer: noiseBuf });
  const filter = new BiquadFilterNode(ctx, { type, frequency: freq, Q: q });
  const g = new GainNode(ctx, { gain: 0 });
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(filter).connect(g).connect(dest);
  src.start(t, Math.random() * 0.3, decay + 0.05);
}

function tone(ctx, dest, t, { from, to, glide, decay, level, type = 'sine' }) {
  const osc = new OscillatorNode(ctx, { type, frequency: from });
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + glide);
  const g = new GainNode(ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + decay + 0.05);
}

// ---------- 808 hip-hop ----------

async function renderHipHop() {
  const beat = 60 / 140;
  const s16 = beat / 4;
  const length = beat * 4 * BARS;
  const ctx = new OfflineAudioContext(2, Math.ceil(length * SR), SR);
  const out = bus(ctx);
  const nb = noise(ctx, 1);
  const sat = drive(ctx, 2.2);
  const subBus = new GainNode(ctx, { gain: 0.9 });
  subBus.connect(sat).connect(out);
  const E1 = 41.2;
  const G1 = 49;
  const pattern = [[0, E1], [6, E1], [10, G1], [14, E1]]; // 16th-note positions
  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * beat * 4;
    for (const [step, f] of pattern) {
      const t = t0 + step * s16;
      tone(ctx, subBus, t, { from: f * 2.4, to: f, glide: 0.05, decay: 1.1, level: 0.9 }); // 808
      tone(ctx, out, t, { from: 160, to: 55, glide: 0.03, decay: 0.12, level: 0.5 }); // kick click
    }
    for (const step of [4, 12]) { // claps on 2 and 4: three quick bursts
      for (const k of [0, 0.012, 0.024]) {
        noiseHit(ctx, out, t0 + step * s16 + k, { type: 'bandpass', freq: 1400, q: 0.8, decay: k ? 0.05 : 0.2, level: 0.55, noiseBuf: nb });
      }
    }
    const rolls = bar === BARS - 1;
    for (let step = 0; step < 16; step++) {
      const hits = rolls && step >= 12 ? [0, 0.5] : [0];
      for (const off of hits) {
        noiseHit(ctx, out, t0 + (step + off) * s16, { type: 'highpass', freq: 8000, decay: 0.045, level: step % 2 ? 0.16 : 0.26, noiseBuf: nb });
      }
    }
    // Soft pad (A minor 7) so the mids have something to show.
    const padLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1800 });
    const padG = new GainNode(ctx, { gain: 0 });
    padG.gain.setValueAtTime(0, t0);
    padG.gain.linearRampToValueAtTime(0.05, t0 + 0.4);
    padG.gain.linearRampToValueAtTime(0, t0 + beat * 4);
    padLp.connect(padG).connect(out);
    for (const f of [220, 261.6, 329.6, 392]) {
      for (const detune of [-8, 8]) {
        const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune });
        osc.connect(padLp);
        osc.start(t0);
        osc.stop(t0 + beat * 4);
      }
    }
  }
  return ctx.startRendering();
}

// ---------- atmospheric black metal ----------

async function renderMetal() {
  const s16 = 60 / 180 / 4;
  const barLen = s16 * 16;
  const length = barLen * BARS;
  const ctx = new OfflineAudioContext(2, Math.ceil(length * SR), SR);
  const out = bus(ctx);
  const nb = noise(ctx, 2);
  const verb = new ConvolverNode(ctx, { buffer: reverbIR(ctx, 3.2, 3) });
  const verbGain = new GainNode(ctx, { gain: 0.55 });
  verb.connect(verbGain).connect(out);

  // Guitars: detuned saws -> heavy drive -> cab-ish filtering, tremolo-picked on 16ths.
  const chords = [[82.4, 123.5, 185, 246.9], [65.4, 98, 164.8, 246.9], [98, 146.8, 196, 293.7], [73.4, 110, 185, 220]];
  const gtrDrive = drive(ctx, 9);
  const cab = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 5200, Q: 0.7 });
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 90 });
  const trem = new GainNode(ctx, { gain: 0 });
  const gtrLevel = new GainNode(ctx, { gain: 0.32 });
  trem.connect(gtrDrive).connect(hp).connect(cab).connect(gtrLevel);
  gtrLevel.connect(out);
  gtrLevel.connect(verb);
  const bass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 500 });
  const bassG = new GainNode(ctx, { gain: 0.18 });
  bass.connect(bassG).connect(out);

  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * barLen;
    for (const f of chords[bar]) {
      for (const detune of [-7, 7]) {
        const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f * 2, detune });
        osc.connect(trem);
        osc.start(t0);
        osc.stop(t0 + barLen);
      }
    }
    const root = new OscillatorNode(ctx, { type: 'sawtooth', frequency: chords[bar][0] });
    root.connect(bass);
    root.start(t0);
    root.stop(t0 + barLen);

    noiseHit(ctx, verb, t0, { type: 'highpass', freq: 5000, decay: 1.6, level: 0.4, noiseBuf: nb }); // crash wash
    for (let step = 0; step < 16; step++) {
      const t = t0 + step * s16;
      trem.gain.setValueAtTime(0.9, t);
      trem.gain.exponentialRampToValueAtTime(0.35, t + s16 * 0.9);
      if (step % 2 === 0) {
        tone(ctx, out, t, { from: 110, to: 48, glide: 0.04, decay: 0.09, level: 0.85 }); // blast kick
        noiseHit(ctx, out, t, { type: 'bandpass', freq: 7200, q: 3, decay: 0.22, level: 0.12, noiseBuf: nb }); // ride
      } else {
        noiseHit(ctx, out, t, { type: 'bandpass', freq: 1900, q: 0.7, decay: 0.11, level: 0.45, noiseBuf: nb }); // blast snare
        tone(ctx, out, t, { from: 220, to: 180, glide: 0.02, decay: 0.07, level: 0.2, type: 'triangle' });
      }
    }
  }
  return ctx.startRendering();
}

export const TRACKS = {
  hiphop: { label: '808 hip-hop', render: renderHipHop },
  metal: { label: 'Atmospheric black metal', render: renderMetal },
};

const cache = new Map();
export function getTrack(id) {
  if (!cache.has(id)) cache.set(id, TRACKS[id].render().catch((err) => { cache.delete(id); throw err; }));
  return cache.get(id);
}

// Builds (or reuses) a track and loops it on the guide path. Returns false, without playing,
// when the user started something else while the track was still rendering.
let latest = 0;
export async function playTrack(id, owner = 'coach') {
  const request = ++latest;
  const before = engine.startCount();
  const buffer = await getTrack(id);
  if (request !== latest || engine.startCount() !== before) return false;
  await engine.playGuideLoop(buffer, TRACKS[id].label, owner);
  return true;
}
