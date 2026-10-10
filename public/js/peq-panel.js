// PEQ controls beside the graph: band table, toolbar, crossover, time & phase.
import {
  peq, subscribe, update, setBand, addBand, removeBand, undo, redo, canUndo, canRedo, preamp,
} from './peq-state.js';
import {
  TYPES, GAIN_TYPES, PASS_TYPES, TEMPLATES, TARGETS, applyTemplate, distanceToMs, DEFAULT_ALIGNMENT, DEFAULT_CROSSOVER,
} from './peq.js';
import { $, $$, h, icon, fmtDb, toast, haptic, store } from './ui.js';

const MAX_BANDS = 16;
const num = (v) => Number.parseFloat(v);

// ---------- band table ----------

function bandRow(b, i) {
  const field = (name, attrs) => h('input', {
    type: 'number', class: `peq-in peq-${name}`, 'data-field': name, 'aria-label': `Band ${i + 1} ${name}`, inputmode: 'decimal', ...attrs,
  });
  return h('tr', { 'data-id': b.id, class: b.id === peq.selected ? 'is-selected' : '', onclick: () => peq.selected !== b.id && update({ selected: b.id }, { live: true }) },
    h('td', {}, h('span', { class: 'band-no' }, String(i + 1))),
    h('td', {}, h('input', { type: 'checkbox', 'data-field': 'enabled', checked: b.enabled, 'aria-label': `Band ${i + 1} on` })),
    h('td', { class: 'pro-only' }, h('select', { 'data-field': 'type', 'aria-label': `Band ${i + 1} type` },
      Object.entries(TYPES).map(([v, label]) => h('option', { value: v, selected: v === b.type }, label)))),
    h('td', {}, field('fc', { min: 20, max: 20000, step: 1, value: b.fc })),
    h('td', {}, field('gain', { min: -18, max: 18, step: 0.1, value: b.gain, disabled: !GAIN_TYPES.has(b.type) })),
    h('td', { class: 'pro-only' }, field('q', { min: 0.1, max: 12, step: 0.01, value: b.q, disabled: PASS_TYPES.has(b.type) && b.slope === 24 })),
    h('td', { class: 'pro-only' }, PASS_TYPES.has(b.type)
      ? h('select', { 'data-field': 'slope', 'aria-label': `Band ${i + 1} slope` },
        h('option', { value: '12', selected: b.slope === 12 }, '12 dB/oct'), h('option', { value: '24', selected: b.slope === 24 }, '24 dB/oct'))
      : h('span', { class: 'muted' }, '—')),
    h('td', {}, h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove band ${i + 1}`, onclick: (e) => { e.stopPropagation(); removeBand(b.id); } }, icon('x'))));
}

let structureKey = '';
function renderBands() {
  const key = peq.bands.map((b) => `${b.id}:${b.type}:${b.slope}`).join();
  const body = $('#peq-bands');
  if (key !== structureKey) {
    structureKey = key;
    body.replaceChildren(...peq.bands.map(bandRow));
  } else {
    // Same rows: sync values without stealing focus from whatever the user is typing in.
    for (const b of peq.bands) {
      const row = body.querySelector(`tr[data-id="${b.id}"]`);
      if (!row) continue;
      row.classList.toggle('is-selected', b.id === peq.selected);
      for (const input of row.querySelectorAll('[data-field]')) {
        if (input === document.activeElement) continue;
        if (input.type === 'checkbox') input.checked = b.enabled;
        else input.value = b[input.dataset.field];
      }
    }
  }
  $('#peq-empty').hidden = peq.bands.length > 0;
  $('#peq-add').disabled = peq.bands.length >= MAX_BANDS;
  $('#peq-preamp').textContent = `Preamp ${fmtDb(preamp())}`;
  $('#peq-undo').disabled = !canUndo();
  $('#peq-redo').disabled = !canRedo();
}

function onBandInput(e, live) {
  const input = e.target.closest('[data-field]');
  const row = e.target.closest('tr[data-id]');
  if (!input || !row) return;
  const field = input.dataset.field;
  const value = input.type === 'checkbox' ? input.checked
    : field === 'type' ? input.value
      : field === 'slope' ? Number(input.value) : num(input.value);
  if (typeof value === 'number' && !Number.isFinite(value)) return;
  setBand(row.dataset.id, { [field]: value }, { live });
}

// ---------- crossover + time & phase ----------

function syncAdvanced() {
  const c = peq.crossover;
  const a = peq.alignment;
  const set = (sel, v) => { const el = $(sel); if (el !== document.activeElement) el[el.type === 'checkbox' ? 'checked' : 'value'] = v; };
  set('#xo-enabled', c.enabled); set('#xo-fc', c.fc); set('#xo-slope', c.slope);
  set('#xo-subgain', c.subGain); set('#xo-subdelay', c.subDelay); set('#xo-invert', c.subInvert);
  set('#al-delayL', a.delayL); set('#al-delayR', a.delayR); set('#al-invertL', a.invertL); set('#al-invertR', a.invertR);
  $('#xo-fields').disabled = !c.enabled;
  $('#peq-correction').checked = peq.correctionOn;
  $('#peq-correction-label').textContent = peq.correctionName ? `AutoEq: ${peq.correctionName}` : 'AutoEq correction (load a model)';
  $('#peq-correction').disabled = !peq.correctionName;
  $('#peq-target').value = peq.target ?? '';
}

function readCrossover() {
  return {
    ...DEFAULT_CROSSOVER,
    enabled: $('#xo-enabled').checked,
    fc: Math.min(250, Math.max(40, num($('#xo-fc').value) || 80)),
    slope: Number($('#xo-slope').value),
    subGain: Math.min(12, Math.max(-12, num($('#xo-subgain').value) || 0)),
    subDelay: Math.min(20, Math.max(0, num($('#xo-subdelay').value) || 0)),
    subInvert: $('#xo-invert').checked,
  };
}

function readAlignment() {
  const ms = (sel) => Math.min(20, Math.max(0, num($(sel).value) || 0));
  return { ...DEFAULT_ALIGNMENT, delayL: ms('#al-delayL'), delayR: ms('#al-delayR'), invertL: $('#al-invertL').checked, invertR: $('#al-invertR').checked };
}

// Delay the nearer speaker so both arrive together.
function computeDistanceDelays() {
  const dl = num($('#al-distL').value);
  const dr = num($('#al-distR').value);
  if (!(dl > 0 && dr > 0)) return toast('Enter both distances in centimetres first.', 'error');
  const diff = distanceToMs(Math.abs(dl - dr));
  const alignment = { ...peq.alignment, delayL: dl < dr ? +diff.toFixed(2) : 0, delayR: dr < dl ? +diff.toFixed(2) : 0 };
  update({ alignment });
  haptic(10);
  toast(diff ? `Delayed the ${dl < dr ? 'left' : 'right'} speaker by ${diff.toFixed(2)} ms.` : 'Both speakers are the same distance away; no delay needed.');
}

// ---------- templates ----------

export function loadTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  update({ ...applyTemplate(t), selected: null });
  toast(`${t.name}: ${t.note}`);
}

// ---------- wiring ----------

// Simple mode (default): frequency, gain and dragging. Advanced settings reveal type, Q, slope,
// phase, crossover and time alignment.
function initProToggle() {
  const toggle = $('#peq-pro');
  const apply = (pro) => {
    $('#step-graph').classList.toggle('pro', pro);
    toggle.checked = pro;
    store.set('aura.labPro', pro);
  };
  toggle.addEventListener('change', () => apply(toggle.checked));
  apply(store.get('aura.labPro', false));
}

export function initPeqPanel() {
  initProToggle();
  $('#peq-template').replaceChildren(
    h('option', { value: '' }, 'Start from a template…'),
    ...TEMPLATES.map((t) => h('option', { value: t.id }, `${t.name}`)));
  $('#peq-target').replaceChildren(
    h('option', { value: '' }, 'No target curve'),
    ...Object.entries(TARGETS).map(([id, t]) => h('option', { value: id }, t.name)));

  $('#peq-template').addEventListener('change', (e) => { loadTemplate(e.target.value); e.target.value = ''; });
  $('#peq-target').addEventListener('change', (e) => update({ target: e.target.value || null }));
  $('#peq-add').addEventListener('click', () => addBand({ type: 'PK', fc: 1000, gain: 0, q: 1.41 }));
  $('#peq-undo').addEventListener('click', undo);
  $('#peq-redo').addEventListener('click', redo);
  $('#peq-reset').addEventListener('click', () => update({ bands: [], selected: null, crossover: { ...DEFAULT_CROSSOVER }, alignment: { ...DEFAULT_ALIGNMENT } }));
  $('#peq-correction').addEventListener('change', (e) => update({ correctionOn: e.target.checked }));
  $('#peq-bands').addEventListener('input', (e) => onBandInput(e, true));
  $('#peq-bands').addEventListener('change', (e) => onBandInput(e, false));
  for (const el of $$('#xo-panel input, #xo-panel select')) {
    el.addEventListener('input', () => update({ crossover: readCrossover() }, { live: true }));
    el.addEventListener('change', () => update({ crossover: readCrossover() }));
  }
  for (const el of $$('#al-panel [data-align]')) {
    el.addEventListener('input', () => update({ alignment: readAlignment() }, { live: true }));
    el.addEventListener('change', () => update({ alignment: readAlignment() }));
  }
  $('#al-compute').addEventListener('click', computeDistanceDelays);
  $('#al-allpass').addEventListener('click', () => {
    addBand({ type: 'AP', fc: 80, q: 0.71 });
    toast('All-pass added: it shifts phase around its frequency without changing level. Drag it to line up a sub or a second speaker.');
  });
  // Undo/redo shortcuts while the Lab is open (not while typing in a field).
  addEventListener('keydown', (e) => {
    if ($('#view-lab').hidden || !(e.ctrlKey || e.metaKey) || e.target.matches('input, select, textarea')) return;
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
    if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  });
  subscribe(() => { renderBands(); syncAdvanced(); });
  renderBands();
  syncAdvanced();
}
