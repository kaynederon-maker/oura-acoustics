// One AudioContext for the whole site.
//
//   file / pink ─► eqIn ─► preamp ═eqChain═► eqTail ═xoChain(HPF)═► splitter ─► delay/polarity L,R ─► merger ─► eqOut ─┐
//                   │                          └─► subIn ═subChain(LPF)═► subGain ─► subDelay ─► merger (mixed)        │
//                   └──────────────────────────────► dry (EQ off, level-matched) ──────────────────────────────────────┴► monitor
//   guide loop ─► guideIn ─► guidePre ═guideChain═► guideWet ─┬► monitor        (A/B for the Tuning Guide)
//                   └──────────────────────────────► guideDry ─┘
//   monitor ─► speakers + bus;  system audio / mic ─► bus;  bus ─► visual + measure analysers
//
// Captured audio is analysed only, never played back, so nothing echoes or doubles.
import { biquadCoefficients } from './eq.js';

let ctx = null;
let nodes = null;
let current = null;
let starts = 0; // bumped by every source start, so slow async starts can tell they were overtaken
export const startCount = () => starts;
let pinkBuffer = null;
let mediaEl = null;
let mediaNode = null;

const listeners = new Set();
const level = { bass: 0, mid: 0, high: 0 };
const EASE = 0.08; // lower = calmer background
const RAMP = 0.012; // seconds: param changes glide instead of clicking
const MAX_DELAY_S = 0.1;
const WEB_TYPES = { PK: 'peaking', LSC: 'lowshelf', HSC: 'highshelf', HPF: 'highpass', LPF: 'lowpass', NOTCH: 'notch', AP: 'allpass' };
const NATIVE_SHELF_Q = Math.SQRT1_2; // Web Audio shelves are fixed at this slope

const EMPTY_EQ = {
  preamp: 0, eq: [], xoMain: [], sub: null,
  align: { delayL: 0, delayR: 0, invertL: false, invertR: false },
};
// owner: which guide feature started a 'guide' loop (coach, journey, history, mission).
export const state = { source: 'none', label: 'Silent', owner: null, eqOn: true, eq: EMPTY_EQ };

export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(state));
const db = (v) => 10 ** (v / 20);
const glide = (param, value) => param.setTargetAtTime(value, ctx.currentTime, RAMP);

// ---------- filter chains that update in place ----------

const usesIir = (s) => (s.type === 'LSC' || s.type === 'HSC') && Math.abs(s.q - NATIVE_SHELF_Q) > 0.02;
const signature = (specs) => specs.map((s) => (usesIir(s) ? 'iir' : s.type)).join();
const sameSpec = (a, b) => a && b && a.fc === b.fc && a.gain === b.gain && a.q === b.q;

function setBiquad(node, s, immediate) {
  // Web Audio lowpass/highpass Q is a resonance in dB; the rest take the cookbook's linear Q.
  const q = s.type === 'HPF' || s.type === 'LPF' ? 20 * Math.log10(s.q) : s.q;
  const set = immediate ? (p, v) => (p.value = v) : glide;
  set(node.frequency, s.fc);
  set(node.gain, s.gain ?? 0);
  set(node.Q, q);
}

function makeNode(s) {
  if (usesIir(s)) {
    // ponytail: IIR coefficients can't be automated, so a shelf with a custom Q is rebuilt on change.
    const { b, a } = biquadCoefficients(s, ctx.sampleRate);
    return new IIRFilterNode(ctx, { feedforward: b, feedback: a });
  }
  const node = new BiquadFilterNode(ctx, { type: WEB_TYPES[s.type] });
  setBiquad(node, s, true);
  return node;
}

class FilterChain {
  constructor(input, output) {
    Object.assign(this, { input, output, nodes: [], specs: [] });
    input.connect(output);
  }

  set(specs) {
    if (signature(specs) === signature(this.specs)) {
      specs.forEach((s, i) => {
        const node = this.nodes[i];
        if (node instanceof BiquadFilterNode) setBiquad(node, s, false);
        else if (!sameSpec(s, this.specs[i])) this.replace(i, makeNode(s));
      });
    } else {
      this.rebuild(specs);
    }
    this.specs = specs.map((s) => ({ ...s }));
  }

  rebuild(specs) {
    [this.input, ...this.nodes].forEach((n) => n.disconnect());
    this.nodes = specs.map(makeNode);
    [this.input, ...this.nodes].reduce((a, b) => (a.connect(b), b)).connect(this.output);
  }

  replace(i, node) {
    const prev = i ? this.nodes[i - 1] : this.input;
    const next = this.nodes[i + 1] ?? this.output;
    prev.disconnect(this.nodes[i]);
    this.nodes[i].disconnect();
    prev.connect(node);
    node.connect(next);
    this.nodes[i] = node;
  }
}

export function context() {
  if (ctx) return ctx;
  ctx = new AudioContext({ latencyHint: 'interactive' });
  const gain = () => ctx.createGain();
  nodes = {
    eqIn: gain(), dry: gain(), preamp: gain(), eqTail: gain(), xoIn: gain(), xoTail: gain(),
    subIn: gain(), subTail: gain(), subGain: gain(), eqOut: gain(), monitor: gain(), bus: gain(),
    guideIn: gain(), guidePre: gain(), guideTail: gain(), guideWet: gain(), guideDry: gain(),
    splitter: ctx.createChannelSplitter(2), merger: ctx.createChannelMerger(2),
    subDelay: new DelayNode(ctx, { maxDelayTime: MAX_DELAY_S }),
    delayL: new DelayNode(ctx, { maxDelayTime: MAX_DELAY_S }), delayR: new DelayNode(ctx, { maxDelayTime: MAX_DELAY_S }),
    polL: gain(), polR: gain(),
  };
  const n = nodes;
  n.visual = Object.assign(ctx.createAnalyser(), { fftSize: 2048, smoothingTimeConstant: 0.85 });
  n.measure = Object.assign(ctx.createAnalyser(), { fftSize: 8192, smoothingTimeConstant: 0 });

  n.eqIn.connect(n.dry).connect(n.monitor);
  n.eqIn.connect(n.preamp);
  n.eqChain = new FilterChain(n.preamp, n.eqTail);
  n.eqTail.connect(n.xoIn);
  n.xoChain = new FilterChain(n.xoIn, n.xoTail);
  n.xoTail.connect(n.splitter);
  n.splitter.connect(n.delayL, 0).connect(n.polL).connect(n.merger, 0, 0);
  n.splitter.connect(n.delayR, 1).connect(n.polR).connect(n.merger, 0, 1);
  n.eqTail.connect(n.subIn);
  n.subChain = new FilterChain(n.subIn, n.subTail);
  n.subTail.connect(n.subGain).connect(n.subDelay);
  n.subDelay.connect(n.merger, 0, 0); // ponytail: sub is previewed mixed into L/R; the APO export routes it to SUB
  n.subDelay.connect(n.merger, 0, 1);
  n.subGain.gain.value = 0;
  n.merger.connect(n.eqOut).connect(n.monitor);

  n.guideIn.connect(n.guideDry).connect(n.monitor);
  n.guideIn.connect(n.guidePre);
  n.guideChain = new FilterChain(n.guidePre, n.guideTail);
  n.guideTail.connect(n.guideWet).connect(n.monitor);
  n.guideDry.gain.value = 0;

  n.monitor.connect(ctx.destination);
  n.monitor.connect(n.bus);
  n.bus.connect(n.visual);
  n.bus.connect(n.measure);
  applyEq();
  return ctx;
}

export const measureAnalyser = () => (context(), nodes.measure);
export const visualAnalyser = () => (context(), nodes.visual);

function applyEq() {
  const { preamp, eq, xoMain, sub, align } = state.eq;
  const n = nodes;
  glide(n.preamp.gain, db(preamp));
  n.eqChain.set(eq);
  n.xoChain.set(xoMain);
  n.subChain.set(sub?.specs ?? []);
  glide(n.subGain.gain, sub ? db(sub.gainDb) * (sub.invert ? -1 : 1) : 0);
  glide(n.subDelay.delayTime, sub ? Math.min(sub.delayMs / 1000, MAX_DELAY_S) : 0);
  glide(n.delayL.delayTime, Math.min(align.delayL / 1000, MAX_DELAY_S));
  glide(n.delayR.delayTime, Math.min(align.delayR / 1000, MAX_DELAY_S));
  glide(n.polL.gain, align.invertL ? -1 : 1);
  glide(n.polR.gain, align.invertR ? -1 : 1);
  applyBypass();
}

function applyBypass() {
  glide(nodes.eqOut.gain, state.eqOn ? 1 : 0);
  glide(nodes.dry.gain, state.eqOn ? 0 : db(state.eq.preamp)); // level-matched A/B
}

// cfg: { preamp, eq: specs, xoMain: specs, sub: { specs, gainDb, delayMs, invert } | null, align }
// (the older { preamp, filters } shape still works). Same filter layout = smooth in-place update.
export function setEq(cfg) {
  state.eq = { ...EMPTY_EQ, ...cfg, eq: cfg.eq ?? cfg.filters ?? [], align: { ...EMPTY_EQ.align, ...cfg.align } };
  if (ctx) applyEq();
  emit();
}

export function setEqOn(on) {
  state.eqOn = on;
  if (ctx) applyBypass();
  emit();
}

// ---------- Tuning Guide A/B path ----------

let guidePreamp = 0;
export function setGuideEq(specs, preamp = 0) {
  context();
  guidePreamp = preamp;
  glide(nodes.guidePre.gain, db(preamp));
  nodes.guideChain.set(specs);
}

// tuned = true plays the EQ'd path, false the untouched one (level-matched to the same preamp).
export function setGuideBypass(tuned) {
  context();
  glide(nodes.guideWet.gain, tuned ? 1 : 0);
  glide(nodes.guideDry.gain, tuned ? 0 : db(guidePreamp));
}

function begin(kind, label, node, target, stop, owner = null) {
  stopSource();
  starts += 1;
  node.connect(target);
  current = { node, stop };
  Object.assign(state, { source: kind, label, owner });
  emit();
  return current;
}

export function stopSource() {
  if (!current) return;
  const { node, stop } = current;
  current = null;
  stop();
  node.disconnect();
  Object.assign(state, { source: 'none', label: 'Silent', owner: null });
  emit();
}

async function ready() {
  context();
  if (ctx.state !== 'running') await ctx.resume();
}

export const canCaptureSystem = () => Boolean(navigator.mediaDevices?.getDisplayMedia);

export async function captureSystem() {
  if (!canCaptureSystem()) {
    throw new Error('System audio capture needs desktop Chrome or Edge. On phones, use the microphone instead.');
  }
  const resumed = ready(); // start resuming inside the click, before awaiting the picker
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true, // Chrome only offers audio alongside a video surface
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: 'include',
    selfBrowserSurface: 'include',
  });
  await resumed;
  stream.getVideoTracks().forEach((t) => t.stop());
  const [track] = stream.getAudioTracks();
  if (!track) {
    throw new Error('No audio was shared. Choose "Entire screen" and switch on "Share system audio", or pick a tab with "Share tab audio".');
  }
  const node = ctx.createMediaStreamSource(new MediaStream([track]));
  const session = begin('system', 'System audio', node, nodes.bus, () => track.stop());
  track.addEventListener('ended', () => current === session && stopSource());
}

export async function captureMic() {
  await ready();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const node = ctx.createMediaStreamSource(stream);
  begin('mic', 'Microphone', node, nodes.bus, () => stream.getTracks().forEach((t) => t.stop()));
}

export async function playFile(file) {
  await ready();
  mediaEl ??= Object.assign(new Audio(), { loop: true });
  mediaNode ??= ctx.createMediaElementSource(mediaEl);
  const url = URL.createObjectURL(file);
  mediaEl.src = url;
  begin('file', file.name, mediaNode, nodes.eqIn, () => {
    mediaEl.pause();
    URL.revokeObjectURL(url);
  });
  await mediaEl.play();
}

function pink() {
  if (pinkBuffer) return pinkBuffer;
  // Paul Kellet's refined pink-noise filter, 4 s loop.
  pinkBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const out = pinkBuffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < out.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.08;
    b6 = w * 0.115926;
  }
  return pinkBuffer;
}

function noiseSource() {
  const src = ctx.createBufferSource();
  src.buffer = pink();
  src.loop = true;
  src.start();
  return src;
}

export async function playPink() {
  await ready();
  const src = noiseSource();
  begin('pink', 'Pink noise', src, nodes.eqIn, () => src.stop());
}

const SWEEP_LEVEL_DB = -24;
// Exponential sine sweep 20 Hz → 20 kHz. Returns frequencyNow() for a live readout.
export async function playSweep(seconds = 14) {
  await ready();
  const t0 = ctx.currentTime;
  const osc = new OscillatorNode(ctx, { frequency: 20 });
  const amp = new GainNode(ctx, { gain: 0 });
  osc.frequency.setValueAtTime(20, t0);
  osc.frequency.exponentialRampToValueAtTime(20000, t0 + seconds);
  amp.gain.linearRampToValueAtTime(db(SWEEP_LEVEL_DB), t0 + 0.05);
  osc.connect(amp);
  osc.start();
  osc.stop(t0 + seconds);
  const session = begin('sweep', 'Frequency sweep', amp, nodes.monitor, () => {
    try { osc.stop(); } catch { /* already stopped */ }
  });
  osc.onended = () => current === session && stopSource();
  return {
    frequencyNow: () => 20 * 1000 ** Math.min(1, (ctx.currentTime - t0) / seconds),
    isPlaying: () => current === session,
  };
}

// A synthesized practice track for the Tuning Guide, through the guide's own A/B chain.
export async function playGuideLoop(buffer, label, owner = 'coach') {
  await ready();
  const src = new AudioBufferSourceNode(ctx, { buffer, loop: true });
  src.start();
  begin('guide', label, src, nodes.guideIn, () => src.stop(), owner);
}

// Third-octave band of pink noise, straight to the monitor (no EQ) for the guide.
export async function playBand(freq, label) {
  await ready();
  const src = noiseSource();
  const band = Object.assign(ctx.createBiquadFilter(), { type: 'bandpass' });
  band.frequency.value = freq;
  band.Q.value = 4.32;
  const boost = ctx.createGain();
  boost.gain.value = 2.5; // a narrow band of pink noise is quiet; bring it to a similar loudness
  src.connect(band).connect(boost);
  begin('band', label, boost, nodes.monitor, () => src.stop());
}

// Output-device names, e.g. "AirPods Pro". Labels only appear after a media permission.
export async function deviceNames() {
  const list = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.label);
  let devices = await list();
  if (!devices.length) {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    devices = await list();
  }
  const clean = (label) => label.replace(/^(Default|Communications) - /, '').replace(/\s*\(.*?\)\s*$/, '').trim();
  return [...new Set(devices.filter((d) => d.kind !== 'videoinput').map((d) => clean(d.label)))];
}

const bins = new Uint8Array(1024);
function band(lo, hi) {
  const hz = ctx.sampleRate / 2 / bins.length;
  const a = Math.max(1, Math.floor(lo / hz));
  const b = Math.min(bins.length - 1, Math.ceil(hi / hz));
  let sum = 0;
  for (let i = a; i <= b; i++) sum += bins[i];
  return sum / ((b - a + 1) * 255);
}

// Last eased levels without advancing them (the background owns the per-frame step).
export const peekLevels = () => level;

// Smoothed 0..1 band energies; call once per frame.
export function levels() {
  if (!ctx || state.source === 'none') {
    for (const k in level) level[k] -= level[k] * EASE;
    return level;
  }
  nodes.visual.getByteFrequencyData(bins);
  const target = { bass: band(20, 250), mid: band(250, 4000), high: band(4000, 16000) };
  for (const k in level) level[k] += (target[k] - level[k]) * EASE;
  return level;
}
