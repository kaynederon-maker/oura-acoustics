// Guide, hands-on: the boost-and-sweep hero and two pro missions (IEM drum monitoring,
// desk speakers + subwoofer crossover). Every control is a knob or switch with live A/B audio.
import * as engine from './audio-engine.js';
import { playTrack } from './synth.js';
import { safePreamp, logFreqs, complexResponse, toDb } from './eq.js';
import { knob, miniPlot } from './widgets.js';
import { crossoverResponse, flatness, XO_START, IEM_BANDS, iemSpecs, iemCurve, matchScore } from './mission-model.js';
import { motionReady, reducedMotion } from './motion.js';
import { $, $$, h, icon, toast, haptic, fmtHz } from './ui.js';

const PASS_SCORE = 90;
const FLAT_ENOUGH_DB = 1.5;
const SWEEP_GAIN_DB = 10;
const SWEEP_Q = 4;
const fmtDb = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

// ---------- shared audio: each widget owns the guide path while it plays ----------

const tuned = {};
const owner = (id) => `mission:${id}`;
const mine = (id) => engine.state.source === 'guide' && engine.state.owner === owner(id);
const specsFor = {};

function apply(id) {
  if (!mine(id)) return;
  const specs = specsFor[id]();
  engine.setGuideEq(specs, safePreamp(specs));
  engine.setGuideBypass(tuned[id] ?? true);
}

function transport(id, { track, labels = ['Flat', 'Yours'] }) {
  tuned[id] = true;
  let loading = false;
  const play = h('button', { type: 'button', class: 'btn primary m-play' });
  const a = h('button', { type: 'button', onclick: () => setAB(false) }, labels[0]);
  const b = h('button', { type: 'button', onclick: () => setAB(true) }, labels[1]);
  function setAB(on) {
    tuned[id] = on;
    haptic(6);
    if (mine(id)) engine.setGuideBypass(on);
    sync();
  }
  function sync() {
    const on = mine(id);
    play.classList.toggle('on', on);
    play.setAttribute('aria-disabled', String(loading));
    play.replaceChildren(icon(on ? 'stop' : 'play'), on ? 'Stop' : loading ? 'Loading…' : 'Listen');
    a.setAttribute('aria-pressed', String(!tuned[id]));
    b.setAttribute('aria-pressed', String(tuned[id]));
  }
  play.addEventListener('click', async () => {
    if (loading) return;
    if (mine(id)) return engine.stopSource();
    loading = true;
    sync();
    try {
      const t = typeof track === 'function' ? track() : track;
      if (await playTrack(t, owner(id))) apply(id);
    } catch (err) {
      toast(`Could not start the track: ${err.message}`, 'error');
    } finally {
      loading = false;
      sync();
    }
  });
  engine.onChange(sync);
  sync();
  return h('div', { class: 'm-transport', role: 'group', 'aria-label': 'Listen and compare' },
    play, h('div', { class: 'seg', role: 'group', 'aria-label': 'Compare A and B' }, a, b));
}

// ---------- boost & sweep hero ----------

const REGIONS = [
  [20, 'Sub-bass', 'Rumble you feel in your chest'],
  [60, 'Bass', 'Punch, warmth, the body of the kick'],
  [250, 'Low mids', 'Fullness. Too much is mud'],
  [500, 'Mids', 'Honk and nasal tone live here'],
  [2000, 'Upper mids', 'Bite and attack of guitars'],
  [4000, 'Presence', 'Clarity. Too much is fatiguing'],
  [6000, 'Brilliance', 'Sibilance and cymbal sizzle'],
  [12000, 'Air', 'Space and sparkle'],
];
const regionOf = (f) => REGIONS.filter(([lo]) => f >= lo).pop();

function initSweep(host) {
  const freqs = logFreqs(160);
  const state = { fc: 1000, gain: SWEEP_GAIN_DB, track: 'metal' };
  specsFor.sweep = () => [{ type: 'PK', fc: state.fc, gain: state.gain, q: SWEEP_Q }];
  const readHz = h('p', { class: 'sw-hz', 'aria-live': 'off' });
  const readName = h('p', { class: 'sw-region' });
  const readHint = h('p', { class: 'sw-hint' });
  const plotHost = h('div', { class: 'sw-plot' });
  const plot = miniPlot(plotHost, freqs, { yMin: -12, yMax: 12 });
  const render = () => {
    const [, name, hint] = regionOf(state.fc);
    readHz.textContent = fmtHz(state.fc);
    readName.textContent = name;
    readHint.textContent = hint;
    plot.draw([{ db: complexResponse(specsFor.sweep(), freqs).map(toDb), cls: 'mine' }], `${state.gain > 0 ? 'Boost' : 'Cut'} at ${fmtHz(state.fc)}`);
    apply('sweep');
  };
  const dial = knob({
    label: 'Sweep frequency', min: 20, max: 20000, value: state.fc, step: 1, log: true, format: fmtHz, detent: 1000,
    onInput: (v) => { state.fc = v; render(); },
  });
  const mode = h('div', { class: 'seg', role: 'group', 'aria-label': 'Boost or cut' },
    ...[['Boost', SWEEP_GAIN_DB], ['Cut', -SWEEP_GAIN_DB]].map(([label, g]) => h('button', {
      type: 'button', 'aria-pressed': String(g === state.gain),
      onclick: (e) => {
        state.gain = g;
        for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        render();
      },
    }, `${label} ${g > 0 ? '+' : '−'}${Math.abs(g)} dB`)));
  const trackSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Practice track' },
    ...Object.entries({ metal: 'Blackgaze', hiphop: '808 trap' }).map(([id, label]) => h('button', {
      type: 'button', 'aria-pressed': String(id === state.track),
      onclick: async (e) => {
        state.track = id;
        for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        if (!mine('sweep')) return;
        try {
          if (await playTrack(id, owner('sweep'))) apply('sweep');
        } catch (err) {
          toast(`Could not start the track: ${err.message}`, 'error');
        }
      },
    }, label)));
  host.replaceChildren(
    h('div', { class: 'sw-dial' }, dial.el, h('div', { class: 'sw-read' }, readHz, readName, readHint)),
    h('div', { class: 'sw-side' },
      h('p', { class: 'sw-step' }, h('strong', {}, 'The pro trick: '), 'boost a narrow band, sweep it slowly, and listen for the spot that suddenly sounds ugly. That is a resonance. Then flip to Cut and remove it.'),
      plotHost,
      h('div', { class: 'row' }, trackSeg, mode),
      transport('sweep', { track: () => state.track, labels: ['Flat', 'Swept'] })));
  render();
}

// ---------- mission 1: IEM drum monitoring ----------

function initIem(host) {
  const freqs = logFreqs(120);
  const gains = Object.fromEntries(IEM_BANDS.map((b) => [b.id, 0]));
  const target = Object.fromEntries(IEM_BANDS.map((b) => [b.id, b.target]));
  const targetDb = iemCurve(target, freqs);
  specsFor.iem = () => iemSpecs(gains);
  const plotHost = h('div', { class: 'm-plot' });
  const plot = miniPlot(plotHost, freqs, { yMin: -12, yMax: 12 });
  const score = h('output', { class: 'm-score-num' }, '0');
  const verdict = h('p', { class: 'm-verdict', 'aria-live': 'polite' });
  const card = host.closest('.mission');
  let passed = false;
  const render = () => {
    const mineDb = iemCurve(gains, freqs);
    const s = matchScore(mineDb, targetDb);
    score.textContent = String(s);
    card.style.setProperty('--score', String(s / 100));
    plot.draw([{ db: targetDb, cls: 'target' }, { db: mineDb, cls: 'mine' }], `Your monitor EQ matches the engineer's mix by ${s}%`);
    const ok = s >= PASS_SCORE;
    verdict.textContent = ok ? 'Soundcheck passed. The drummer can hear the click and the kit without the cymbals burying it.' : 'Match the dashed curve by ear and by eye.';
    card.classList.toggle('passed', ok);
    if (ok && !passed) haptic([20, 40, 20]);
    passed = ok;
    apply('iem');
  };
  const knobs = IEM_BANDS.map((b) => knob({
    label: `${b.label} · ${fmtHz(b.fc)}`, min: b.min, max: b.max, value: 0, step: 0.5, detent: 0, format: fmtDb,
    onInput: (v) => { gains[b.id] = v; render(); },
  }));
  const reveal = h('button', {
    type: 'button', class: 'text-link',
    onclick: () => IEM_BANDS.forEach((b, i) => {
      const k = knobs[i];
      if (!globalThis.gsap || reducedMotion) return k.set(b.target);
      const o = { v: k.get() };
      globalThis.gsap.to(o, { v: b.target, duration: 0.9, delay: i * 0.08, ease: 'power3.inOut', onUpdate: () => k.set(Math.round(o.v * 2) / 2) });
    }),
  }, "Show the engineer's settings");
  host.replaceChildren(
    h('div', { class: 'm-knobs' }, knobs.map((k) => k.el)),
    h('div', { class: 'm-readout' },
      h('div', { class: 'm-score' }, h('span', { class: 'm-score-ring', 'aria-hidden': 'true' }), score, h('small', {}, 'match')),
      plotHost, verdict),
    h('div', { class: 'm-actions' }, transport('iem', { track: 'metal', labels: ['Flat', 'Your mix'] }), reveal));
  render();
}

// ---------- mission 2: desk speakers + subwoofer ----------

// ponytail: the audition fakes the in-room sum with a 6-band graphic EQ; exact enough to hear
// boom and cancellation, swap for a real crossover graph in the audio engine if needed.
const XO_AUDITION_HZ = [32, 45, 63, 90, 125, 180];

function initXo(host) {
  const freqs = logFreqs(140, 20, 400);
  const p = { ...XO_START };
  specsFor.xo = () => {
    const { sum } = crossoverResponse(p, XO_AUDITION_HZ);
    return XO_AUDITION_HZ.map((fc, i) => ({ type: 'PK', fc, gain: Math.max(-15, Math.min(12, sum[i])), q: 1.4 }));
  };
  const plotHost = h('div', { class: 'm-plot' });
  const plot = miniPlot(plotHost, freqs, { yMin: -18, yMax: 12 });
  const dev = h('output', { class: 'm-score-num' });
  const verdict = h('p', { class: 'm-verdict', 'aria-live': 'polite' });
  const card = host.closest('.mission');
  let passed = false;
  const render = () => {
    const r = crossoverResponse(p, freqs);
    const d = flatness(r.sum, freqs);
    dev.textContent = `±${d.toFixed(1)}`;
    card.style.setProperty('--score', String(Math.max(0, 1 - d / 8)));
    plot.draw([{ db: r.mains, cls: 'mains' }, { db: r.sub, cls: 'sub' }, { db: r.sum, cls: 'mine' }], `Bass response varies by ${d.toFixed(1)} dB between 35 and 200 Hz`);
    const ok = d <= FLAT_ENOUGH_DB;
    verdict.textContent = ok
      ? 'Calibrated. Speakers and sub now sound like one big speaker.'
      : d > 4 ? 'A deep notch or a big hump: the sub and speakers are fighting.' : 'Getting closer. Watch the solid line between 35 and 200 Hz.';
    card.classList.toggle('passed', ok);
    if (ok && !passed) haptic([20, 40, 20]);
    passed = ok;
    apply('xo');
  };
  const set = (key) => (v) => { p[key] = v; render(); };
  const k = [
    knob({ label: 'Crossover', min: 40, max: 160, value: p.fc, step: 1, log: true, format: (v) => `${v} Hz`, onInput: set('fc'), detent: 80 }),
    knob({ label: 'Sub level', min: -10, max: 10, value: p.subGain, step: 0.5, format: fmtDb, onInput: set('subGain'), detent: 0 }),
    knob({ label: 'Sub phase', min: 0, max: 180, value: p.phase, step: 5, format: (v) => `${v}°`, onInput: set('phase'), detent: 0 }),
  ];
  const toggle = (key, label) => h('label', { class: 'pro-switch' },
    h('input', { type: 'checkbox', checked: p[key], onchange: (e) => { p[key] = e.target.checked; haptic(10); render(); } }), label);
  host.replaceChildren(
    h('div', { class: 'm-knobs' }, k.map((x) => x.el)),
    h('div', { class: 'm-switches' }, toggle('highPassMains', 'High-pass the speakers'), toggle('invert', 'Flip sub polarity')),
    h('div', { class: 'm-readout' },
      h('div', { class: 'm-score' }, h('span', { class: 'm-score-ring', 'aria-hidden': 'true' }), dev, h('small', {}, 'dB')),
      plotHost,
      h('p', { class: 'm-legend' }, h('span', { class: 'k mine' }), 'In-room sum ', h('span', { class: 'k mains' }), 'Speakers ', h('span', { class: 'k sub' }), 'Sub'),
      verdict),
    h('div', { class: 'm-actions' }, transport('xo', { track: 'hiphop', labels: ['Speakers only', 'With sub'] })));
  render();
}

// ---------- exploded hardware (CSS 3D, scrubbed by scroll) ----------

const EXPLODED = {
  iem: [
    ['Ear tip', 'Seals the canal. A bad seal loses more bass than any EQ can add.'],
    ['Nozzle + filter', 'A mesh damper tames the 6 to 9 kHz peak.'],
    ['Balanced armature', 'Tiny, fast driver for the treble: hi-hats and snare crack.'],
    ['Dynamic driver', 'A 10 mm diaphragm moves the air for the kick.'],
    ['Shell', 'Molded to your ear. Its vents shape the bass.'],
    ['Faceplate', 'Closed for stage: blocks up to 26 dB of drum bleed.'],
  ],
  speaker: [
    ['Cabinet + port', 'The port tunes the box to about 55 Hz. Below that, it gives up.'],
    ['Amplifier', 'Class D power plus the DSP that sets the bass and treble.'],
    ['Woofer', 'Four inches of paper cone: plenty for mids, too small for 30 Hz.'],
    ['Tweeter', 'A 13 mm silk dome for everything above about 2 kHz.'],
    ['Grille', 'Acoustically transparent fabric. Take it off for the cleanest treble.'],
  ],
};

const LAYER_ART = {
  iem: [
    '<ellipse cx="150" cy="150" rx="46" ry="40" class="ex-a"/><ellipse cx="150" cy="150" rx="18" ry="16" class="ex-hole"/>',
    '<rect x="132" y="118" width="36" height="64" rx="12" class="ex-b"/><circle cx="150" cy="150" r="12" class="ex-mesh"/>',
    '<rect x="112" y="128" width="76" height="44" rx="8" class="ex-c"/><rect x="122" y="138" width="56" height="8" rx="3" class="ex-line"/>',
    '<circle cx="150" cy="150" r="64" class="ex-b"/><circle cx="150" cy="150" r="44" class="ex-ring"/><circle cx="150" cy="150" r="16" class="ex-c"/>',
    '<path d="M70 120 C70 70 130 40 180 52 C240 66 250 130 226 180 C206 222 150 250 108 226 C80 210 70 170 70 120Z" class="ex-shell"/>',
    '<path d="M84 124 C84 82 134 58 176 68 C226 80 234 132 214 174 C196 210 150 232 116 212 C92 198 84 164 84 124Z" class="ex-face"/><text x="150" y="156" class="ex-logo">AURA</text>',
  ],
  speaker: [
    '<rect x="70" y="60" width="160" height="200" rx="10" class="ex-shell"/><ellipse cx="150" cy="236" rx="22" ry="10" class="ex-hole"/>',
    '<rect x="96" y="96" width="108" height="128" rx="6" class="ex-c"/><rect x="108" y="110" width="40" height="22" class="ex-line"/><rect x="156" y="150" width="34" height="34" class="ex-line"/>',
    '<circle cx="150" cy="180" r="56" class="ex-b"/><circle cx="150" cy="180" r="40" class="ex-ring"/><circle cx="150" cy="180" r="14" class="ex-c"/>',
    '<circle cx="150" cy="100" r="26" class="ex-b"/><circle cx="150" cy="100" r="12" class="ex-face"/>',
    '<rect x="70" y="60" width="160" height="200" rx="10" class="ex-grille"/>',
  ],
};

function exploded(kind) {
  const layers = LAYER_ART[kind];
  const model = h('div', { class: 'ex-model' });
  model.style.setProperty('--layers', String(layers.length));
  model.innerHTML = layers.map((art, i) => `<div class="ex-layer" style="--i:${i}"><svg viewBox="0 0 300 300" aria-hidden="true">${art}</svg></div>`).join('');
  return h('figure', { class: 'ex', 'data-ex': kind },
    h('div', { class: 'ex-stage', 'aria-hidden': 'true' }, model),
    h('figcaption', {}, h('ol', { class: 'ex-legend' }, EXPLODED[kind].map(([name, note]) => h('li', {}, h('strong', {}, name), h('span', {}, note))))));
}

function initExplodedScroll() {
  const { gsap } = globalThis;
  if (!motionReady || reducedMotion) {
    for (const m of $$('.ex-model')) m.style.setProperty('--gap', '46px');
    return;
  }
  for (const ex of $$('.ex')) {
    gsap.fromTo(ex.querySelector('.ex-model'), { '--gap': '4px', '--rz': '-28deg' }, {
      '--gap': '38px', '--rz': '-42deg', ease: 'none',
      scrollTrigger: { trigger: ex, start: 'top 85%', end: 'center 45%', scrub: 0.8 },
    });
    gsap.from(ex.querySelectorAll('.ex-legend li'), {
      x: 30, opacity: 0, stagger: 0.08, duration: 0.7, ease: 'power3.out',
      scrollTrigger: { trigger: ex, start: 'top 70%', toggleActions: 'play none none reverse' },
    });
  }
}

export function initMissions() {
  initSweep($('#mission-sweep'));
  $('#ex-iem').replaceWith(exploded('iem'));
  $('#ex-speaker').replaceWith(exploded('speaker'));
  initIem($('#mission-iem'));
  initXo($('#mission-xo'));
  initExplodedScroll();
}
