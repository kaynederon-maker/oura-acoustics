// Tuning Guide "journey": a long scroll through the spectrum. A sticky stage holds a live
// spectrum analyzer and an EQ curve that morphs as you scroll; every chapter has its own
// photo, explanation and inline A/B player. GSAP ScrollTrigger drives the scroll-linked motion.
import * as engine from './audio-engine.js';
import { playTrack } from './synth.js';
import { makeBand, expandBands } from './peq.js';
import { responseDb, safePreamp, logFreqs } from './eq.js';
import { $, $$, h, icon, toast, haptic, fmtHz } from './ui.js';

const FMIN = 20;
const FMAX = 20000;
const DB_RANGE = 12;
const FREQS = logFreqs(200);
const SPECTRUM_FLOOR_DB = -100;
const SPECTRUM_CEIL_DB = -12;
const B = (type, fc, gain, q) => makeBand({ type, fc, gain, q });

const CHAPTERS = [
  {
    id: 'sub', kicker: '20 – 60 Hz', title: 'Sub-bass', lo: 20, hi: 60, img: 'tr808', track: 'hiphop',
    alt: 'A Roland TR-808 drum machine, the source of the classic 808 bass drum',
    lede: 'The rumble you feel more than hear. The Roland TR-808 made this range the engine of hip-hop: its kick is a long sine wave sliding down to about 45 Hz.',
    tip: 'Most small speakers cannot play below 60 Hz at all. Boosting it on them only adds distortion, so check your gear first.',
    bands: [B('LSC', 60, 6, 0.71)], ab: 'B adds a 6 dB shelf below 60 Hz.',
  },
  {
    id: 'bass', kicker: '60 – 250 Hz', title: 'Bass', lo: 60, hi: 250, img: 'bass', track: 'hiphop',
    alt: 'A Fender Precision Bass guitar',
    lede: 'Punch and warmth. The open E string of a bass guitar sits at 41 Hz, but the note you recognise lives in its harmonics, from 80 to 250 Hz.',
    tip: 'Too much here sounds bloated and slow. Too little sounds thin and cold, like a phone speaker.',
    bands: [B('PK', 120, 5, 1)], ab: 'B boosts 5 dB at 120 Hz.',
  },
  {
    id: 'mids', kicker: '250 Hz – 2 kHz', title: 'Mid-range', lo: 250, hi: 2000, img: 'mic', track: 'metal',
    alt: 'A condenser microphone with a pop filter in a home studio',
    lede: 'Voices, guitars and snares all fight for this space, and it decides whether music sounds natural. Build-up around 300 Hz is mud; a bump near 1 kHz sounds nasal, like a telephone.',
    tip: 'Cut before you boost. A 3 to 6 dB cut at 250 to 400 Hz clears up dense mixes better than adding treble.',
    bands: [B('PK', 300, -6, 1), B('PK', 1000, 2, 1.2)], ab: 'B cuts 6 dB of mud at 300 Hz and lifts 1 kHz slightly.',
  },
  {
    id: 'presence', kicker: '2 – 6 kHz', title: 'Presence', lo: 2000, hi: 6000, img: 'ear', track: 'metal',
    alt: 'Diagram of the outer, middle and inner ear',
    lede: 'Your ear canal is a small tube that resonates near 3 kHz, so this is where your hearing is most sensitive. A few dB here changes everything.',
    tip: 'Presence adds bite and clarity. Too much makes music tiring within minutes. If you get fatigued, look here first.',
    bands: [B('PK', 3500, 7, 1.2)], ab: 'B boosts 7 dB at 3.5 kHz. Notice how quickly it gets tiring.',
  },
  {
    id: 'air', kicker: '6 – 20 kHz', title: 'Brilliance and air', lo: 6000, hi: 20000, img: 'cymbal', track: 'metal',
    alt: 'A ride cymbal on a drum kit',
    lede: 'Cymbal shimmer, breath and space. Sibilance ("s" sounds) sits at 6 to 9 kHz; above 10 kHz is air, the sense of openness.',
    tip: 'A broad, gentle shelf adds sparkle; a narrow cut tames harshness. Most adults stop hearing around 15 to 17 kHz.',
    bands: [B('PK', 7500, -5, 2), B('HSC', 10000, 5, 0.71)], ab: 'B tames 7.5 kHz and adds a shelf above 10 kHz.',
  },
  {
    id: 'loudness', kicker: 'All together', title: 'Your ears are not flat', lo: 20, hi: 20000, img: 'loudness', track: 'hiphop',
    alt: 'Equal-loudness contours: the quieter the sound, the more bass and treble it needs to seem equally loud',
    lede: 'These equal-loudness curves show that at low volume we hear far less bass and treble. That is why late-night listening sounds flat, and why a "smile" EQ feels exciting.',
    tip: 'Tune at the volume you actually listen at, and level-match A and B: louder always sounds "better" for a moment.',
    bands: [B('LSC', 100, 6, 0.71), B('HSC', 10000, 4, 0.71)], ab: 'B adds loudness compensation for quiet listening.',
  },
];

const IMG_CREDITS = {
  tr808: 'Photo: fr4dd, CC BY 2.0', bass: 'Photo: Niranjan Arminius, CC BY-SA 4.0', mic: 'Photo: Tim Sheerman-Chase, CC BY 2.0',
  ear: 'Diagram: Lars Chittka and Axel Brockmann, CC BY 2.5', cymbal: 'Photo: Dave Kobrehel, CC BY 2.0', loudness: 'Graph: Lindosland, public domain',
};

const J = { chapter: -1, morph: 0, tuned: true, loading: false };
let graph = null;

const chapter = () => CHAPTERS[J.chapter];
const playing = () => engine.state.source === 'guide' && engine.state.owner === 'journey';

// ---------- audio ----------

function applyEq() {
  const specs = expandBands(chapter().bands);
  engine.setGuideEq(specs, safePreamp(specs));
  engine.setGuideBypass(J.tuned);
}

async function startTrack() {
  const { track } = chapter();
  if (await playTrack(track, 'journey')) applyEq();
  syncPlayers();
}

async function togglePlay(index) {
  if (J.loading) return;
  if (playing() && index === J.chapter) return engine.stopSource();
  const wasPlaying = playing();
  setChapter(index); // already carries running playback into the new chapter
  if (wasPlaying) return;
  J.loading = true;
  syncPlayers();
  try {
    await startTrack();
  } catch (err) {
    toast(`Could not start the practice track: ${err.message}`, 'error');
  } finally {
    J.loading = false;
    syncPlayers();
  }
}

function setTuned(tuned) {
  J.tuned = tuned;
  haptic(6);
  if (playing()) engine.setGuideBypass(tuned);
  syncPlayers();
}

function syncPlayers() {
  for (const p of $$('.j-player')) {
    const mine = Number(p.dataset.index) === J.chapter;
    const on = mine && playing();
    const btn = p.querySelector('.j-play');
    btn.setAttribute('aria-disabled', String(J.loading)); // not disabled: keeps keyboard focus
    btn.classList.toggle('on', on);
    btn.replaceChildren(icon(on ? 'stop' : 'play'), on ? 'Stop' : J.loading && mine ? 'Building…' : 'Listen');
    p.querySelector('[data-ab="a"]').setAttribute('aria-pressed', String(!J.tuned));
    p.querySelector('[data-ab="b"]').setAttribute('aria-pressed', String(J.tuned));
  }
  $('#j-stage').dataset.live = String(playing());
}

// ---------- stage graph (D3 curve over a canvas spectrum) ----------

function createGraph(host) {
  const { d3 } = globalThis;
  const canvas = host.querySelector('canvas');
  const svg = d3.select(host).append('svg').attr('class', 'j-svg').attr('role', 'img');
  const regions = svg.append('g');
  const grid = svg.append('g').attr('class', 'peq-grid');
  const curve = svg.append('path').attr('class', 'j-curve');
  const label = svg.append('text').attr('class', 'j-region-label');
  const x = d3.scaleLog().domain([FMIN, FMAX]);
  const y = d3.scaleLinear().domain([-DB_RANGE, DB_RANGE]);
  let size = { w: 0, h: 0 };

  function draw() {
    const c = chapter();
    if (!c || !size.w) return;
    const scaled = expandBands(c.bands).map((s) => ({ ...s, gain: s.gain * J.morph }));
    const db = responseDb(scaled, 0, FREQS);
    const clampDb = (v) => Math.max(-DB_RANGE, Math.min(DB_RANGE, v));
    curve.attr('d', d3.line().x((_, i) => x(FREQS[i])).y((v) => y(clampDb(v))).curve(d3.curveMonotoneX)(db));
    regions.selectAll('rect').classed('on', (r) => r.id === c.id || c.id === 'loudness');
    label.attr('x', Math.min(size.w - 80, Math.max(80, x(Math.sqrt(c.lo * c.hi))))).attr('y', 30).text(c.title);
    svg.attr('aria-label', `${c.title}, ${c.kicker}. ${c.ab}`);
  }

  function layout() {
    const w = host.clientWidth;
    const hgt = host.clientHeight;
    if (!w || !hgt || (w === size.w && hgt === size.h)) return;
    size = { w, h: hgt };
    svg.attr('viewBox', `0 0 ${w} ${hgt}`).attr('width', w).attr('height', hgt);
    x.range([8, w - 8]);
    y.range([hgt - 22, 10]);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    Object.assign(canvas, { width: Math.round(w * dpr), height: Math.round(hgt * dpr) });
    grid.selectAll('*').remove();
    for (const f of w < 560 ? [100, 1000, 10000] : [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      grid.append('line').attr('x1', x(f)).attr('x2', x(f)).attr('y1', y.range()[1]).attr('y2', y.range()[0]);
      grid.append('text').attr('x', x(f)).attr('y', hgt - 6).text(fmtHz(f));
    }
    grid.append('line').attr('class', 'zero').attr('x1', x.range()[0]).attr('x2', x.range()[1]).attr('y1', y(0)).attr('y2', y(0));
    regions.selectAll('rect').data(CHAPTERS.slice(0, 5)).join('rect')
      .attr('class', 'j-region').attr('x', (c) => x(c.lo)).attr('width', (c) => x(c.hi) - x(c.lo))
      .attr('y', y.range()[1]).attr('height', y.range()[0] - y.range()[1]);
    draw();
  }

  // Live spectrum under the curve: log-spaced bins, filled up from the floor.
  const ctx = canvas.getContext('2d');
  let bins = null;
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden || $('#view-guide').hidden || !size.w) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (engine.state.source === 'none') return;
    const dpr = canvas.width / size.w;
    const analyser = engine.visualAnalyser();
    bins ??= new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(bins);
    const nyquist = analyser.context.sampleRate / 2;
    const [top, bottom] = [y.range()[1], y.range()[0]];
    const grad = ctx.createLinearGradient(0, top * dpr, 0, bottom * dpr);
    grad.addColorStop(0, getComputedStyle(host).getPropertyValue('--plot-1').trim() || '#888');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x.range()[0] * dpr, bottom * dpr);
    for (let px = x.range()[0]; px <= x.range()[1]; px += 3) {
      const bin = Math.min(bins.length - 1, Math.round((x.invert(px) / nyquist) * bins.length));
      const t = (bins[bin] - SPECTRUM_FLOOR_DB) / (SPECTRUM_CEIL_DB - SPECTRUM_FLOOR_DB);
      ctx.lineTo(px * dpr, (bottom - Math.max(0, Math.min(1, t)) * (bottom - top)) * dpr);
    }
    ctx.lineTo(x.range()[1] * dpr, bottom * dpr);
    ctx.fill();
  }
  requestAnimationFrame(frame);
  new ResizeObserver(layout).observe(host);
  layout();
  return { draw };
}

function setChapter(index) {
  if (index === J.chapter) return;
  const previousTrack = chapter()?.track;
  J.chapter = index;
  const c = chapter();
  $('#j-kicker').textContent = c.kicker;
  $('#j-title').textContent = c.title;
  $('#j-ab-note').textContent = c.ab;
  for (const [i, dot] of $$('#j-dots li').entries()) dot.classList.toggle('on', i === index);
  // Scrolling while listening carries the music into the next chapter.
  if (playing()) (c.track === previousTrack ? Promise.resolve(applyEq()) : startTrack()).catch((err) => toast(err.message, 'error'));
  graph?.draw();
  syncPlayers();
}

// ---------- markup ----------

function chapterEl(c, i) {
  return h('article', { class: 'j-step', 'data-index': String(i), id: `j-${c.id}` },
    h('figure', { class: 'j-figure' },
      h('img', { src: `/guide/${c.img}.webp`, alt: c.alt, loading: 'lazy', decoding: 'async' }),
      h('figcaption', {}, IMG_CREDITS[c.img])),
    h('p', { class: 'j-kicker' }, c.kicker),
    h('h3', { class: 'j-step-title' }, c.title),
    h('p', { class: 'j-lede' }, c.lede),
    h('p', { class: 'j-tip' }, h('strong', {}, 'Tip. '), c.tip),
    h('div', { class: 'j-player', 'data-index': String(i), role: 'group', 'aria-label': `Listen to ${c.title}` },
      h('button', { type: 'button', class: 'btn primary j-play', onclick: () => togglePlay(i) }, icon('play'), 'Listen'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Compare A and B' },
        h('button', { type: 'button', 'data-ab': 'a', onclick: () => setTuned(false) }, 'A · original'),
        h('button', { type: 'button', 'data-ab': 'b', onclick: () => setTuned(true) }, 'B · tuned')),
      h('p', { class: 'muted small j-ab-text' }, c.ab)));
}

// ---------- scroll choreography ----------

function initScroll() {
  const { gsap, ScrollTrigger } = globalThis;
  if (!gsap || !ScrollTrigger) { // content still reads fine without motion
    J.morph = 1;
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  for (const step of $$('.j-step')) {
    const index = Number(step.dataset.index);
    ScrollTrigger.create({
      trigger: step, start: 'top 55%', end: 'bottom 45%',
      onToggle: (self) => self.isActive && setChapter(index),
      onUpdate: (self) => {
        if (J.chapter !== index) return;
        J.morph = Math.min(1, self.progress * 2.2); // the curve draws itself in over the first half
        graph?.draw();
      },
    });
  }
  gsap.fromTo('#j-progress', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '#j-steps', start: 'top 55%', end: 'bottom 45%', scrub: 0.4 } });

  gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
    for (const step of $$('.j-step')) {
      gsap.from(step.querySelectorAll('.j-kicker, .j-step-title, .j-lede, .j-tip, .j-player'), {
        y: 36, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08,
        scrollTrigger: { trigger: step, start: 'top 75%', toggleActions: 'play none none reverse' },
      });
      gsap.fromTo(step.querySelector('.j-figure img'), { scale: 1.15, yPercent: -5 }, {
        scale: 1.02, yPercent: 5, ease: 'none', scrollTrigger: { trigger: step, start: 'top bottom', end: 'bottom top', scrub: true },
      });
      gsap.from(step.querySelector('.j-figure'), {
        clipPath: 'inset(14% 14% 14% 14% round 28px)', duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: step, start: 'top 80%', toggleActions: 'play none none reverse' },
      });
    }
  });
}

export function initJourney() {
  $('#j-steps').replaceChildren(...CHAPTERS.map(chapterEl));
  $('#j-dots').replaceChildren(...CHAPTERS.map((c) => h('li', { title: c.title })));
  setChapter(0);
  try {
    graph = createGraph($('#j-graph'));
  } catch (err) {
    console.error('[journey graph]', err);
  }
  engine.onChange(syncPlayers);
  initScroll();
  graph?.draw();
}
