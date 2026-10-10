// Tuning Lab: AutoEq correction + a full parametric EQ (D3 graph, crossover, time & phase)
// + listening analysis + hearing check + advice + exports + hardware push.
import * as engine from './audio-engine.js';
import {
  AUTOEQ_INDEX, parseIndex, profileUrls, parseParametricEq, parseFrCsv, responseDb, searchIndex, matchDevices,
  toParametricText, toGraphicEqText,
} from './eq.js';
import { systemResponse, toApoConfig, targetUrl, GAIN_TYPES, TYPES } from './peq.js';
import {
  peq, subscribe, update, setBand, addBand, removeBand, commit, upsertBand, setCorrection, eqSpecs, preamp,
  init as initPeqState,
} from './peq-state.js';
import { createListener, describeContent, hearingDeviations, HEARING_BANDS, recommend } from './tuner.js';
import { drawSpectrum } from './graph.js';
import { createPeqGraph } from './peq-graph.js';
import { initPeqPanel } from './peq-panel.js';
import { initHardware } from './hardware.js';
import { attachGraphHover } from './freq-hover.js';
import { $, $$, h, toast, download, fmtHz, fmtDb, store } from './ui.js';

const ANALYZE_MS = 20000;
const STEP_MS = 100;
const TONE = { startDb: -75, stepDb: 2, stepMs: 350, maxDb: -15 };
const DISPLAY_FS = 48000;
const AUTOEQ_TREE = 'https://github.com/jaakkopasanen/AutoEq/tree/master/results/';

const lab = { index: null, entry: null, fr: null, listening: null, content: null, hearing: [], targets: new Map(), showPhase: false };
let graph = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Value at 1 kHz → 0 dB, so a headphone and a target line up on the graph.
function normalize(freqs, values) {
  let i = 0;
  while (i < freqs.length - 1 && freqs[i + 1] <= 1000) i++;
  return values.map((v) => v - values[i]);
}

// ---------- step 1: headphones ----------

async function loadIndex() {
  lab.index ??= fetchText(AUTOEQ_INDEX).then(parseIndex);
  try {
    return await lab.index;
  } catch (err) {
    lab.index = null;
    throw new Error(`Could not reach the AutoEq database (${err.message}).`);
  }
}

function renderResults(entries, caption) {
  const items = entries.map((e) =>
    h('li', {}, h('button', { type: 'button', class: 'result', onclick: () => selectEntry(e) },
      h('strong', {}, e.name),
      h('span', {}, `${e.type} · measured by ${e.source}${e.rig ? ` on ${e.rig}` : ''}`))));
  $('#hp-results').replaceChildren(...(caption ? [h('li', { class: 'caption' }, caption)] : []), ...items);
  $('#hp-search').setAttribute('aria-expanded', String(items.length > 0));
}

async function onSearch() {
  const query = $('#hp-search').value;
  if (!query.trim()) return renderResults([]);
  try {
    const found = searchIndex(query, await loadIndex());
    renderResults(found, found.length ? null : 'No match. Try fewer words, e.g. "hd 600".');
  } catch (err) {
    renderResults([], err.message);
  }
}

async function detect() {
  try {
    const [labels, entries] = await Promise.all([engine.deviceNames(), loadIndex()]);
    if (!labels.length) return toast('The browser did not report any audio devices.', 'error');
    const matches = matchDevices(labels, entries);
    renderResults(matches, matches.length
      ? `Detected: ${labels.slice(0, 3).join(', ')}. Pick your exact model:`
      : `Detected ${labels[0]}, but no measured profile matches. Try searching by model name.`);
  } catch (err) {
    toast(err.name === 'NotAllowedError' ? 'Device names need microphone permission. You can search instead.' : err.message, 'error');
  }
}

async function selectEntry(entry) {
  lab.entry = entry;
  renderResults([]);
  $('#hp-search').value = '';
  const selected = $('#hp-selected');
  selected.replaceChildren(`Loading ${entry.name}…`);
  try {
    const urls = profileUrls(entry);
    const [eqText, frText] = await Promise.all([fetchText(urls.eq), fetchText(urls.fr).catch(() => null)]);
    const correction = parseParametricEq(eqText);
    if (!correction.filters.length) throw new Error('this profile has no parametric EQ');
    lab.fr = frText ? parseFrCsv(frText) : null;
    setCorrection(correction, entry.name);
    if (!peq.target) update({ target: entry.type === 'Over-ear' ? 'harman-oe-2018' : 'harman-ie-2019' });
    selected.replaceChildren(
      h('strong', {}, entry.name),
      h('span', { class: 'chips' },
        h('span', { class: 'chip' }, entry.type),
        h('span', { class: 'chip' }, `${correction.filters.length}-band correction`),
        h('a', { class: 'chip link', href: AUTOEQ_TREE + entry.path, target: '_blank', rel: 'noopener' }, `AutoEq · ${entry.source}`)),
      h('button', { type: 'button', class: 'btn ghost small', onclick: clearEntry }, 'Remove'));
    store.set('aura.lab', { entry });
  } catch (err) {
    clearEntry();
    selected.replaceChildren(`Could not load that profile: ${err.message}.`);
  }
}

function clearEntry() {
  Object.assign(lab, { entry: null, fr: null });
  setCorrection(null);
  store.set('aura.lab', {});
  $('#hp-selected').replaceChildren('No profile loaded. The EQ only has your own bands.');
}

// ---------- graph model (D3) ----------

async function ensureTarget(id) {
  if (!id || lab.targets.has(id)) return;
  lab.targets.set(id, null); // in flight
  try {
    const fr = parseFrCsv(await fetchText(targetUrl(id)));
    lab.targets.set(id, { freqs: fr.frequency, values: normalize(fr.frequency, fr.raw) });
    graph?.render();
  } catch (err) {
    lab.targets.delete(id);
    toast(`Could not load the target curve (${err.message}).`, 'error');
  }
}

function layers(freqs) {
  const crossover = peq.crossover;
  const sys = systemResponse({ eqSpecs: eqSpecs(), preamp: 0, crossover }, freqs, DISPLAY_FS);
  const series = [];
  const target = lab.targets.get(peq.target);
  if (target) series.push({ cls: 's-target', freqs: target.freqs, values: target.values });
  if (lab.fr?.raw) {
    const f = lab.fr.frequency;
    const raw = normalize(f, lab.fr.raw);
    const applied = systemResponse({ eqSpecs: eqSpecs(), preamp: 0, crossover }, f, DISPLAY_FS).sum;
    series.push({ cls: 's-raw', freqs: f, values: raw });
    series.push({ cls: 's-tuned', freqs: f, values: raw.map((v, i) => v + applied[i]) });
  }
  if (peq.correctionOn && peq.correction.filters.length) {
    series.push({ cls: 's-correction', freqs, values: responseDb(peq.correction.filters, 0, freqs, DISPLAY_FS) });
  }
  if (crossover.enabled) {
    series.push({ cls: 's-main', freqs, values: sys.main });
    series.push({ cls: 's-sub', freqs, values: sys.sub });
  }
  return { curve: sys.sum, series, phase: sys.phase };
}

function readout(f) {
  const lines = [`Your EQ here: ${fmtDb(systemResponse({ eqSpecs: eqSpecs(), preamp: 0, crossover: peq.crossover }, [f], DISPLAY_FS).sum[0])}`];
  const target = lab.targets.get(peq.target);
  if (lab.fr?.raw && target) {
    const at = (freqs, values) => { let i = 0; while (i < freqs.length - 1 && freqs[i + 1] <= f) i++; return values[i]; };
    lines.push(`Headphones vs target: ${fmtDb(at(lab.fr.frequency, normalize(lab.fr.frequency, lab.fr.raw)) - at(target.freqs, target.values))}`);
  }
  return lines;
}

const graphModel = {
  bands: () => peq.bands,
  selected: () => peq.selected,
  select: (id) => { if (peq.selected !== id) update({ selected: id }, { live: true }); },
  change: (id, changes, opts) => setBand(id, changes, opts),
  commit: () => { commit(); renderSummary(); },
  add: (band) => addBand(band),
  remove: (id) => removeBand(id),
  layers,
  readout,
};

function renderSummary() {
  const n = peq.bands.filter((b) => b.enabled).length;
  const parts = [`${n} band${n === 1 ? '' : 's'}`, `preamp ${fmtDb(preamp())}`];
  if (peq.correctionOn && peq.correctionName) parts.unshift(`AutoEq ${peq.correctionName}`);
  if (peq.crossover.enabled) parts.push(`crossover ${peq.crossover.fc} Hz LR${peq.crossover.slope / 6}`);
  const a = peq.alignment;
  if (a.delayL || a.delayR || a.invertL || a.invertR) parts.push('time & phase aligned');
  $('#eq-summary').textContent = parts.join(' · ');
}

// ---------- exports ----------

const fileName = (suffix) => `${(lab.entry?.name ?? 'Oura').replace(/[\\/:*?"<>|]/g, '')} ${suffix}.txt`;

function exportEq(kind) {
  const specs = eqSpecs();
  if (!specs.length && !peq.crossover.enabled) return toast('Nothing to export yet. Load a model or add a band.', 'error');
  if (kind === 'apo') {
    download(fileName('Oura APO config'), toApoConfig({ preamp: preamp(), specs, crossover: peq.crossover, alignment: peq.alignment }));
    return;
  }
  if (kind === 'graphic') {
    download(fileName('GraphicEQ'), toGraphicEqText({ preamp: preamp(), filters: specs }));
    return;
  }
  const portable = specs.filter((s) => GAIN_TYPES.has(s.type));
  if (portable.length < specs.length) toast('The AutoEq format only holds peak and shelf filters; pass, notch and all-pass bands were left out. Use the APO config for everything.');
  download(fileName('ParametricEQ'), toParametricText({ preamp: preamp(), filters: portable }));
}

// ---------- step 2: listen & analyze ----------

let analyzing = false;
async function analyze() {
  if (analyzing) return;
  if (engine.state.source === 'none') {
    return toast('Start a sound source in the dock first. "System audio" listens to everything playing on your computer.', 'error');
  }
  analyzing = true;
  const btn = $('#analyze');
  const bar = $('#analyze-progress');
  btn.disabled = true;
  bar.hidden = false;
  const listener = createListener(engine.measureAnalyser(), engine.context().sampleRate);
  const started = performance.now();
  try {
    // Time-based, so throttled background timers only mean fewer frames, not a longer wait.
    for (let elapsed = 0; elapsed < ANALYZE_MS; elapsed = performance.now() - started) {
      if (engine.state.source === 'none') throw new Error('The sound source stopped before the analysis finished.');
      listener.step();
      bar.value = elapsed / ANALYZE_MS;
      btn.textContent = `Listening… ${Math.ceil((ANALYZE_MS - elapsed) / 1000)} s`;
      await sleep(STEP_MS);
    }
    lab.listening = listener.result();
    lab.content = describeContent(lab.listening);
    if (lab.content.silent) toast('That was nearly silent. Turn the music up and analyze again.', 'error');
    renderStats();
    renderRecs();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    analyzing = false;
    btn.disabled = false;
    bar.hidden = true;
    btn.textContent = 'Analyze 20 s';
  }
}

function renderStats() {
  const { listening: l, content: c } = lab;
  const stat = (term, value) => [h('dt', {}, term), h('dd', {}, value)];
  $('#content-stats').replaceChildren(
    ...stat('Bass vs mids', `${fmtDb(c.bass)} · ${c.bassLabel}`),
    ...stat('Treble vs mids', `${fmtDb(c.treble)} · ${c.trebleLabel}`),
    ...stat('Loudness', `${l.rmsDb.toFixed(1)} dBFS RMS`),
    ...stat('Peak', `${l.peakDb.toFixed(1)} dBFS${l.clipFrames ? ` · ${l.clipFrames} clipped moments` : ''}`));
}

let spectrum = null;
function spectrumLoop() {
  requestAnimationFrame(spectrumLoop);
  if (document.hidden || $('#view-lab').hidden || engine.state.source === 'none') return;
  const analyser = engine.visualAnalyser();
  spectrum ??= new Float32Array(analyser.frequencyBinCount);
  drawSpectrum($('#spectrum'), analyser, spectrum, engine.context().sampleRate);
}

// ---------- step 3: hearing check ----------

function toneRamp(ctx, freq, button) {
  return new Promise((resolve) => {
    const osc = new OscillatorNode(ctx, { frequency: freq });
    const gain = new GainNode(ctx, { gain: 0 });
    osc.connect(gain).connect(ctx.destination); // ponytail: bypasses the EQ; route via eqIn to test "as tuned"
    osc.start();
    let db = TONE.startDb;
    const set = () => gain.gain.setTargetAtTime(10 ** (db / 20), ctx.currentTime, 0.03);
    const timer = setInterval(() => {
      db += TONE.stepDb;
      if (db > TONE.maxDb) finish(TONE.maxDb + TONE.stepDb * 3); // never heard: flag it
      else set();
    }, TONE.stepMs);
    const heard = () => finish(db);
    function finish(result) {
      clearInterval(timer);
      button.removeEventListener('click', heard);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      osc.stop(ctx.currentTime + 0.2);
      resolve(result);
    }
    set();
    button.addEventListener('click', heard);
  });
}

async function hearingCheck() {
  engine.stopSource();
  const ctx = engine.context();
  await ctx.resume();
  const [start, tap, status] = [$('#hearing-start'), $('#hearing-tap'), $('#hearing-status')];
  start.hidden = true;
  tap.hidden = false;
  tap.focus();
  const thresholds = {};
  try {
    for (const [i, f] of HEARING_BANDS.entries()) {
      status.textContent = `Tone ${i + 1} of ${HEARING_BANDS.length} · ${fmtHz(f)}. Press the button (or Space) as soon as you hear it.`;
      await sleep(600);
      thresholds[f] = await toneRamp(ctx, f, tap);
    }
    lab.hearing = hearingDeviations(thresholds);
    const flagged = lab.hearing.filter((x) => x.deviation >= 10).map((x) => fmtHz(x.f));
    status.textContent = flagged.length
      ? `Done. You heard ${flagged.join(', ')} later than expected. See the recommendations below.`
      : 'Done. Every band was within the expected range for this quick check.';
    renderRecs();
  } finally {
    start.hidden = false;
    start.textContent = 'Run again';
    tap.hidden = true;
  }
}

// ---------- recommendations + AI ----------

function applyBand(band, message) {
  upsertBand(band);
  update({ selected: band.id }, { live: true });
  toast(message ?? 'Added to your EQ. Drag its node on the graph to fine-tune, or flip EQ in the dock to compare.');
}

function renderRecs() {
  const recs = recommend({ device: lab.entry?.name, bands: peq.bands, content: lab.content, listening: lab.listening, hearing: lab.hearing });
  const items = recs.map((r) => h('li', { class: 'rec' },
    h('div', {}, h('strong', {}, r.title), h('p', {}, r.detail)),
    r.apply ? h('button', { type: 'button', class: 'btn small', onclick: () => applyBand(r.apply.band) }, 'Apply') : null));
  const empty = lab.content
    ? 'Your setup looks balanced for what you play. Nothing to change.'
    : 'Analyze some music in step 2 to get personal recommendations.';
  $('#recs').replaceChildren(...(items.length ? items : [h('li', { class: 'rec empty' }, empty)]));
}

async function askAi() {
  const btn = $('#ai-advice');
  const out = $('#ai-out');
  btn.disabled = true;
  btn.textContent = 'Thinking…';
  try {
    const res = await fetch('/api/advice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device: lab.entry?.name,
        correction: peq.correction,
        taste: { bass: 0, treble: 0 },
        content: lab.content && { ...lab.content, rmsDb: lab.listening.rmsDb, clipFrames: lab.listening.clipFrames, bands: lab.listening.bands },
        hearing: lab.hearing,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    const toBand = (a) => ({ id: `ai-${a.type}-${a.fc}`, type: a.type, fc: a.fc, gain: a.gain, q: a.q });
    out.replaceChildren(
      h('p', { class: 'ai-summary' }, data.summary),
      h('ul', { class: 'recs' }, data.adjustments.map((a) => h('li', { class: 'rec' },
        h('div', {}, h('strong', {}, `${TYPES[a.type]} · ${fmtHz(a.fc)} · ${fmtDb(a.gain)}`), h('p', {}, a.reason)),
        h('button', { type: 'button', class: 'btn small', onclick: () => applyBand(toBand(a)) }, 'Apply')))),
      data.tips.length ? h('ul', { class: 'tips' }, data.tips.map((t) => h('li', {}, t))) : null);
  } catch (err) {
    out.replaceChildren(h('p', { class: 'muted' }, `AI Sommelier unavailable: ${err.message} The built-in recommendations still work.`));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ask the AI Sommelier';
  }
}

// ---------- wiring ----------

export function initLab() {
  let debounce;
  const search = $('#hp-search');
  search.addEventListener('focus', () => loadIndex().catch((err) => toast(err.message, 'error')), { once: true });
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(onSearch, 120);
  });
  search.addEventListener('keydown', (e) => e.key === 'Escape' && renderResults([]));
  $('#hp-detect').addEventListener('click', detect);
  $('#analyze').addEventListener('click', analyze);
  $('#hearing-start').addEventListener('click', hearingCheck);
  $('#ai-advice').addEventListener('click', askAi);
  $('#copy-eq').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(toApoConfig({ preamp: preamp(), specs: eqSpecs(), crossover: peq.crossover, alignment: peq.alignment }));
      toast('Copied as an Equalizer APO config.');
    } catch {
      toast('Clipboard is blocked here. Use the download buttons instead.', 'error');
    }
  });
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => exportEq(b.dataset.export)));
  $('#peq-phase').addEventListener('change', (e) => { lab.showPhase = e.target.checked; graph?.relayout(); });

  initPeqPanel();
  initHardware();
  graph = createPeqGraph($('#peq-graph'), graphModel, { phase: () => lab.showPhase });
  subscribe(({ live }) => {
    ensureTarget(peq.target);
    graph.render();
    if (!live) { renderRecs(); renderSummary(); }
  });
  addEventListener('themechange', () => graph.relayout());
  attachGraphHover($('#spectrum'));
  initPeqState();

  const entry = store.get('aura.lab', {}).entry; // the last model (older Lab versions saved it here too)
  if (entry?.path) selectEntry(entry);
  renderRecs();
  renderSummary();
  requestAnimationFrame(spectrumLoop);
}

export const redrawLab = () => graph?.relayout(); // the graph has no size while its view is hidden

// Store → Lab hand-off: search the AutoEq index for a model and let the user pick the measurement.
export function tuneFor(model) {
  const search = $('#hp-search');
  search.value = model;
  search.focus({ preventScroll: true });
  onSearch();
}
