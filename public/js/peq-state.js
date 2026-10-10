// Single source of truth for the Lab's tuning: user bands + AutoEq correction + crossover + alignment.
// Live edits (dragging) reach the audio immediately; commits add an undo step and persist.
import { makeBand, expandBands, crossoverStages, DEFAULT_CROSSOVER, DEFAULT_ALIGNMENT } from './peq.js';
import { safePreamp } from './eq.js';
import * as engine from './audio-engine.js';
import { store } from './ui.js';

const STORE_KEY = 'aura.peq';
const HISTORY_LIMIT = 60;

// Old Lab versions stored bass/treble sliders and "extras"; turn them into bands once.
function migrateLegacy() {
  const old = store.get('aura.lab', {});
  const bands = [];
  if (old.taste?.bass) bands.push(makeBand({ type: 'LSC', fc: 105, gain: old.taste.bass, q: 0.71 }));
  if (old.taste?.treble) bands.push(makeBand({ type: 'HSC', fc: 10000, gain: old.taste.treble, q: 0.71 }));
  for (const e of old.extras ?? []) bands.push(makeBand({ id: e.id, type: e.type, fc: e.fc, gain: e.gain, q: e.q }));
  return bands;
}

const saved = store.get(STORE_KEY, null);
export const peq = {
  bands: (saved?.bands ?? migrateLegacy()).map((b) => makeBand(b)),
  crossover: { ...DEFAULT_CROSSOVER, ...saved?.crossover },
  alignment: { ...DEFAULT_ALIGNMENT, ...saved?.alignment },
  correction: { preamp: 0, filters: [] },
  correctionName: null,
  correctionOn: saved?.correctionOn ?? true,
  target: saved?.target ?? null,
  selected: null,
};

const snapshot = () => structuredClone({ bands: peq.bands, crossover: peq.crossover, alignment: peq.alignment, target: peq.target });
let committed = snapshot();
const undoStack = [];
const redoStack = [];
const listeners = new Set();

export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const notify = (live) => listeners.forEach((fn) => fn({ live }));

export const correctionSpecs = () => (peq.correctionOn ? peq.correction.filters : []);
export const userSpecs = () => expandBands(peq.bands);
export const eqSpecs = () => [...correctionSpecs(), ...userSpecs()];
export const preamp = () => safePreamp(eqSpecs());

function pushToEngine() {
  const c = peq.crossover;
  engine.setEq({
    preamp: preamp(),
    eq: eqSpecs(),
    xoMain: c.enabled ? crossoverStages(c, 'HPF') : [],
    sub: c.enabled ? { specs: crossoverStages(c, 'LPF'), gainDb: c.subGain, delayMs: c.subDelay, invert: c.subInvert } : null,
    align: peq.alignment,
  });
}

function persist() {
  store.set(STORE_KEY, { bands: peq.bands, crossover: peq.crossover, alignment: peq.alignment, correctionOn: peq.correctionOn, target: peq.target });
}

// patch: any of { bands, crossover, alignment, target, selected, correctionOn }. live = mid-gesture.
export function update(patch, { live = false } = {}) {
  Object.assign(peq, patch);
  pushToEngine();
  if (!live) record();
  notify(live);
}

// End of a live gesture (drag, scroll): one undo step, then refresh listeners (undo button etc.).
export function commit() {
  record();
  notify(false);
}

function record() {
  const next = snapshot();
  if (JSON.stringify(next) !== JSON.stringify(committed)) {
    undoStack.push(committed);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    committed = next;
  }
  persist();
}

function restore(state) {
  Object.assign(peq, structuredClone(state));
  committed = snapshot();
  pushToEngine();
  persist();
  notify(false);
}

export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  return true;
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

export function setBand(id, changes, opts) {
  update({ bands: peq.bands.map((b) => (b.id === id ? makeBand({ ...b, ...changes }) : b)) }, opts);
}
export function addBand(band) {
  const b = makeBand(band);
  update({ bands: [...peq.bands, b], selected: b.id });
  return b;
}
export function removeBand(id) {
  update({ bands: peq.bands.filter((b) => b.id !== id), selected: peq.selected === id ? null : peq.selected });
}
// Insert or replace by id (used by recommendations, AI and the guide).
export function upsertBand(band) {
  const exists = peq.bands.some((b) => b.id === band.id);
  update({ bands: exists ? peq.bands.map((b) => (b.id === band.id ? makeBand(band) : b)) : [...peq.bands, makeBand(band)] });
}

export function setCorrection(correction, name) {
  peq.correction = correction ?? { preamp: 0, filters: [] };
  peq.correctionName = name ?? null;
  pushToEngine();
  notify(false);
}

export function init() {
  pushToEngine();
  notify(false);
}
