// Tuning Guide: an interactive coach. Each lesson is heard (A/B on synthesized tracks), seen
// (spectrogram + oscilloscope) and touched (drag a real EQ band, with haptic snaps on phones).
import * as engine from './audio-engine.js';
import { playTrack } from './synth.js';
import { startVisualizers } from './viz.js';
import { createPeqGraph } from './peq-graph.js';
import { makeBand, expandBands, TEMPLATES, applyTemplate } from './peq.js';
import { safePreamp, responseDb } from './eq.js';
import { loadTemplate } from './peq-panel.js';
import { $, $$, h, icon, toast, haptic, fmtHz } from './ui.js';

const SWEEP_SECONDS = 14;
const SWEEP_READOUT_MS = 100;
const MAX_MINI_BANDS = 6;
const B = (type, fc, gain, q) => makeBand({ type, fc, gain, q });

const LESSONS = [
  {
    id: 'start', title: 'Press play and watch the sound',
    body: 'Two practice tracks are built right here in your browser: a trap beat on heavy 808s, and an atmospheric black-metal blast beat. On the spectrogram, deep notes glow at the bottom and cymbals near the top.',
    track: 'hiphop', bands: [], ab: false,
  },
  {
    id: 'range', title: 'How high can you hear?',
    body: 'A pure tone glides from 20 Hz to 20 kHz. Keep the volume moderate and press the button the moment it disappears.',
    control: 'sweep', ab: false,
  },
  {
    id: 'sub', title: 'Sub-bass: where 808s live',
    body: 'B adds 6 dB below 60 Hz. Flip between A and B a few times, then answer.',
    track: 'hiphop', bands: [B('LSC', 60, 6, 0.71)], ab: true,
    quiz: { q: 'Which one hits harder in your chest?', a: 'B', why: 'Sub-bass is felt more than heard: that extra slam is everything under 60 Hz. Too much of it just eats headroom.' },
  },
  {
    id: 'mud', title: 'Mud: 200 to 400 Hz',
    body: 'Dense, distorted guitars pile up in the low mids and bury the drums. B cuts 6 dB at 300 Hz.',
    track: 'metal', bands: [B('PK', 300, -6, 1)], ab: true,
    quiz: { q: 'In which one can you follow the blast beat through the guitars?', a: 'B', why: 'Cutting low-mid build-up separates instruments without touching the bass. It is the most useful cut in heavy music.' },
  },
  {
    id: 'presence', title: 'Presence: 2 to 5 kHz',
    body: 'Your ear canal resonates here, so it is the most sensitive range you have. B boosts 7 dB at 3.5 kHz.',
    track: 'metal', bands: [B('PK', 3500, 7, 1.2)], ab: true,
    quiz: { q: 'Which one would tire you out first?', a: 'B', why: 'A touch of presence adds bite. Too much turns a blast beat into a wall of harshness within minutes.' },
  },
  {
    id: 'air', title: 'Sibilance and air: 6 to 16 kHz',
    body: 'B tames the cymbal wash at 7.5 kHz with a narrow cut, then adds a gentle shelf above 12 kHz.',
    track: 'metal', bands: [B('PK', 7500, -6, 2), B('HSC', 12000, 3, 0.71)], ab: true,
    quiz: { q: 'Where do the cymbals sound smoother but still open?', a: 'B', why: 'A narrow cut removes the harsh part; a broad shelf brings the sparkle back. Two moves that would fight each other as one wide band.' },
  },
  {
    id: 'shape', title: 'Now you drive',
    body: 'Drag the band: up boosts, down cuts, left and right move the frequency, scrolling changes the width (Q). Double-click to add more. On a phone you feel a tick each time it snaps to a standard frequency or to 0 dB.',
    control: 'mini', bands: [B('PK', 1000, 0, 1.41)], ab: true, startTuned: true,
  },
  {
    id: 'hardware', title: 'Start from gear you know',
    body: 'Pick a starting curve for real hardware, hear it with B, then open it in the Lab to refine it against a target curve and export it.',
    control: 'templates', ab: true, startTuned: true,
  },
];

const coach = { step: 0, track: 'hiphop', tuned: false, bands: [], selected: null, flipped: false, done: new Set() };
let mini = null;
let sweep = null;
let sweepTimer = 0;

const lesson = () => LESSONS[coach.step];
const playing = () => engine.state.source === 'guide' && engine.state.owner === 'coach';

function applyGuideEq() {
  const specs = expandBands(coach.bands);
  engine.setGuideEq(specs, safePreamp(specs));
  engine.setGuideBypass(coach.tuned);
}

// ---------- transport ----------

async function play(track = coach.track) {
  coach.track = track;
  syncTransport();
  const button = $('#coach-play');
  button.disabled = true;
  button.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Building the track…');
  try {
    if (await playTrack(track, 'coach')) applyGuideEq();
  } catch (err) {
    toast(`Could not start the practice track: ${err.message}`, 'error');
  } finally {
    button.disabled = false;
    syncTransport();
  }
}

function setTuned(tuned) {
  coach.tuned = tuned;
  coach.flipped = true;
  engine.setGuideBypass(tuned);
  haptic(6);
  syncTransport();
  $$('.quiz button').forEach((b) => (b.disabled = false));
}

function syncTransport() {
  $('#coach-play').replaceChildren(icon(playing() ? 'stop' : 'play'), playing() ? 'Stop' : 'Play');
  for (const b of $$('[data-track]')) b.setAttribute('aria-pressed', String(b.dataset.track === coach.track));
  $('#ab-a').setAttribute('aria-pressed', String(!coach.tuned));
  $('#ab-b').setAttribute('aria-pressed', String(coach.tuned));
  $('#coach-ab').hidden = !lesson().ab;
}

// ---------- lesson controls ----------

function quizControl(quiz) {
  const result = h('p', { class: 'quiz-result', 'aria-live': 'polite' });
  const answer = (choice) => {
    const right = choice === quiz.a;
    haptic(right ? 20 : [10, 40, 10]);
    result.replaceChildren(h('strong', {}, right ? 'Yes. ' : `It was ${quiz.a}. `), quiz.why);
    result.className = `quiz-result ${right ? 'right' : 'wrong'}`;
    coach.done.add(lesson().id);
    renderSteps();
  };
  return h('div', { class: 'quiz' },
    h('p', { class: 'quiz-q' }, quiz.q),
    h('div', { class: 'row' },
      ['A', 'B'].map((c) => h('button', { type: 'button', class: 'btn', disabled: !coach.flipped, onclick: () => answer(c) }, `${c} · ${c === 'A' ? 'original' : 'tuned'}`))),
    h('p', { class: 'muted small' }, 'Flip A and B at least once to unlock the answer.'),
    result);
}

function sweepControl() {
  const readout = h('p', { class: 'sweep-readout', 'aria-live': 'off' }, '20 Hz');
  const result = h('p', { class: 'quiz-result', 'aria-live': 'polite' });
  const stopBtn = h('button', { type: 'button', class: 'btn primary big', hidden: true }, "I can't hear it any more");
  const startBtn = h('button', { type: 'button', class: 'btn' }, 'Start the sweep');
  const finish = (heardTo) => {
    clearInterval(sweepTimer);
    engine.stopSource();
    stopBtn.hidden = true;
    startBtn.hidden = false;
    startBtn.textContent = 'Sweep again';
    haptic(20);
    result.replaceChildren(heardTo >= 19500
      ? 'You heard it all the way to 20 kHz. Rare and lucky ears.'
      : `Your top is about ${fmtHz(Math.round(heardTo / 100) * 100)}. Most adults hear up to 15 to 17 kHz; everything above your limit is safe to leave alone when you tune.`);
    coach.done.add('range');
    renderSteps();
  };
  startBtn.addEventListener('click', async () => {
    sweep = await engine.playSweep(SWEEP_SECONDS);
    startBtn.hidden = true;
    stopBtn.hidden = false;
    stopBtn.focus();
    result.replaceChildren();
    sweepTimer = setInterval(() => {
      if (!sweep.isPlaying()) return finish(20000);
      readout.textContent = fmtHz(Math.round(sweep.frequencyNow()));
    }, SWEEP_READOUT_MS);
  });
  stopBtn.addEventListener('click', () => finish(sweep.frequencyNow()));
  return h('div', { class: 'sweep' }, readout, h('div', { class: 'row' }, startBtn, stopBtn), result);
}

function templatesControl() {
  const note = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const open = h('button', {
    type: 'button', class: 'btn primary', disabled: true,
    onclick: () => { loadTemplate(open.dataset.template); location.hash = '#/lab'; },
  }, 'Open in the Lab', icon('arrow'));
  const pick = (t, button) => {
    coach.bands = applyTemplate(t).bands;
    applyGuideEq();
    mini?.render();
    $$('.template-grid button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    note.replaceChildren(t.note, t.crossover ? ' The crossover part is set up in the Lab.' : '');
    open.disabled = false;
    open.dataset.template = t.id;
    haptic(10);
  };
  const grid = h('div', { class: 'template-grid' }, TEMPLATES.filter((t) => t.id !== 'flat').map((t) => {
    const b = h('button', { type: 'button', 'aria-pressed': 'false' }, h('strong', {}, t.name.split(' · ')[1] ?? t.name), h('small', {}, t.kind));
    b.addEventListener('click', () => pick(t, b));
    return b;
  }));
  return h('div', {}, grid, note, h('div', { class: 'row' }, open));
}

// ---------- rendering ----------

function renderSteps() {
  $('#coach-steps').replaceChildren(...LESSONS.map((l, i) => h('li', {},
    h('button', {
      type: 'button', class: `step-dot${coach.done.has(l.id) ? ' done' : ''}`, 'aria-current': i === coach.step ? 'step' : null,
      'aria-label': `Lesson ${i + 1}: ${l.title}${coach.done.has(l.id) ? ' (done)' : ''}`, onclick: () => goTo(i),
    }, coach.done.has(l.id) ? icon('check') : String(i + 1)))));
}

function renderLesson() {
  const l = lesson();
  const controls = l.quiz ? quizControl(l.quiz) : l.control === 'sweep' ? sweepControl() : l.control === 'templates' ? templatesControl() : null;
  $('#coach-text').replaceChildren(
    h('p', { class: 'coach-count' }, `Lesson ${coach.step + 1} of ${LESSONS.length}`),
    h('h2', {}, l.title),
    h('p', { class: 'lede' }, l.body),
    controls);
  const showMini = l.control === 'mini' || l.control === 'templates';
  $('#coach-mini').hidden = !showMini;
  if (showMini) {
    mini ??= createPeqGraph($('#coach-mini'), miniModel, { compact: true, yDomain: [-15, 15] });
    requestAnimationFrame(() => mini.relayout());
  }
  $('#coach-prev').disabled = coach.step === 0;
  $('#coach-next').replaceChildren(coach.step === LESSONS.length - 1 ? 'Go to the Lab' : 'Next', icon('arrow'));
}

function goTo(i) {
  clearInterval(sweepTimer);
  if (engine.state.source === 'sweep') engine.stopSource();
  coach.step = Math.max(0, Math.min(LESSONS.length - 1, i));
  const l = lesson();
  coach.bands = (l.bands ?? []).map((b) => ({ ...b }));
  coach.selected = null;
  coach.flipped = false;
  coach.tuned = Boolean(l.startTuned);
  applyGuideEq();
  if (l.track && l.track !== coach.track && playing()) play(l.track);
  else if (l.track) coach.track = l.track;
  renderSteps();
  renderLesson();
  syncTransport();
}

const miniModel = {
  bands: () => coach.bands,
  selected: () => coach.selected,
  select: (id) => { coach.selected = id; mini?.render(); },
  change: (id, changes) => {
    coach.bands = coach.bands.map((b) => (b.id === id ? makeBand({ ...b, ...changes }) : b));
    applyGuideEq();
    mini.render();
  },
  commit: () => coach.done.add(lesson().id),
  add: (band) => {
    if (coach.bands.length >= MAX_MINI_BANDS) return toast(`The practice EQ holds ${MAX_MINI_BANDS} bands; the Lab holds more.`);
    const b = makeBand(band);
    coach.bands = [...coach.bands, b];
    coach.selected = b.id;
    applyGuideEq();
    mini.render();
  },
  remove: (id) => {
    coach.bands = coach.bands.filter((b) => b.id !== id);
    applyGuideEq();
    mini.render();
  },
  layers: (freqs) => ({ curve: responseDb(expandBands(coach.bands), 0, freqs), series: [] }),
};

// ---------- handbook (reference) ----------

const labelOf = (btn) => btn.dataset.label ?? `${btn.textContent.trim()} band`;
function initHandbook() {
  const buttons = $$('[data-band]');
  for (const btn of buttons) {
    btn.addEventListener('click', async () => {
      const label = labelOf(btn);
      if (engine.state.source === 'band' && engine.state.label === label) return engine.stopSource();
      try {
        await engine.playBand(Number(btn.dataset.band), label);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
  engine.onChange((state) => {
    for (const btn of buttons) btn.setAttribute('aria-pressed', String(state.source === 'band' && state.label === labelOf(btn)));
  });
}

// ---------- wiring ----------

export function initGuide() {
  $('#coach-play').addEventListener('click', () => (playing() ? engine.stopSource() : play()));
  for (const b of $$('[data-track]')) b.addEventListener('click', () => play(b.dataset.track));
  $('#ab-a').addEventListener('click', () => setTuned(false));
  $('#ab-b').addEventListener('click', () => setTuned(true));
  $('#coach-prev').addEventListener('click', () => goTo(coach.step - 1));
  $('#coach-next').addEventListener('click', () => (coach.step === LESSONS.length - 1 ? (location.hash = '#/lab') : goTo(coach.step + 1)));
  addEventListener('keydown', (e) => {
    if ($('#view-guide').hidden || (engine.state.source === 'guide' && engine.state.owner !== 'coach') || e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'a' && lesson().ab) setTuned(false);
    if (e.key === 'b' && lesson().ab) setTuned(true);
  });
  engine.onChange(syncTransport);
  startVisualizers({ spectrogram: $('#viz-spectrogram'), scope: $('#viz-scope'), isVisible: () => !$('#view-guide').hidden });
  initHandbook();
  goTo(0);
}
