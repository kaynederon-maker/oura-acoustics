// History of recorded sound: a pinned, horizontally scrolling timeline (1877 to now).
// Vertical scroll drives the track sideways; a WebGL backdrop morphs its waveform per era,
// and every stop can play the practice track "through" that era's fidelity, A/B against today.
import * as engine from './audio-engine.js';
import { playTrack } from './synth.js';
import { makeBand, expandBands } from './peq.js';
import { safePreamp } from './eq.js';
import { eqSpecs } from './peq-state.js';
import { createEraGL } from './era-gl.js';
import { motionReady, reducedMotion, scrollToY } from './motion.js';
import { $, $$, h, icon, toast, haptic } from './ui.js';

const B = (type, fc, gain, q, slope) => makeBand({ type, fc, gain, q, slope });

// filters: what "Then" sounds like. Bandwidth figures are typical for the medium, not lab specs.
const ERAS = [
  {
    year: 1877, place: 'Menlo Park · Acoustic', title: 'The phonograph', img: 'phonograph', track: 'hiphop',
    text: 'Thomas Edison shouts "Mary had a little lamb" into a horn, and a needle cuts the vibration into tinfoil. No microphone, no electricity: the singer\'s own lungs drive the groove.',
    facts: { Bandwidth: '≈ 250 Hz – 2.5 kHz', Medium: 'Tinfoil cylinder', Capture: 'Horn + diaphragm' },
    filters: [B('HPF', 300, 0, 0.71, 24), B('LPF', 2500, 0, 0.71, 24), B('PK', 1000, 6, 1)],
    credit: 'Photo: Levin C. Handy, public domain',
  },
  {
    year: 1925, place: 'Camden · Electrical', title: 'The microphone age', img: 'ribbon', track: 'hiphop',
    text: 'Western Electric\'s microphone and amplifier replace the horn. Singers no longer have to shout, so crooning is born, and ribbon microphones like the RCA 44 give jazz its velvet.',
    facts: { Bandwidth: '≈ 100 Hz – 5 kHz', Medium: '78 rpm shellac', Capture: 'Microphone + amplifier' },
    filters: [B('HPF', 100, 0, 0.71, 24), B('LPF', 5000, 0, 0.71, 24), B('PK', 2000, 3, 1)],
    credit: 'Photo: Roadside Guitars, CC BY-SA 2.0',
  },
  {
    year: 1948, place: 'New York · Microgroove', title: 'The long-playing record', img: 'vinyl', track: 'hiphop',
    text: 'Columbia\'s 33⅓ rpm LP fits over 20 minutes a side. The RIAA curve later standardises how records are cut and played back, and in 1958 the stereo LP puts the band in a room around you.',
    facts: { Bandwidth: '≈ 30 Hz – 15 kHz', Medium: 'Vinyl LP', Capture: 'Mono, then stereo' },
    filters: [B('HPF', 35, 0, 0.71, 12), B('LPF', 15000, 0, 0.71, 12), B('LSC', 120, 2, 0.71), B('HSC', 9000, -2, 0.71)],
    credit: 'Photo: Franz van Duns, CC BY-SA 4.0',
  },
  {
    year: 1967, place: 'Abbey Road · Multitrack', title: 'The studio as an instrument', img: 'tape', track: 'hiphop',
    text: 'Sgt. Pepper is built on four-track Studer J37 machines, bouncing parts together to fit more in. Tape saturates warmly when pushed, and producers start composing with the mixing desk.',
    facts: { Bandwidth: '≈ 30 Hz – 18 kHz', Medium: '1-inch tape', Capture: '4 tracks' },
    filters: [B('PK', 80, 2.5, 1), B('LSC', 150, 1.5, 0.71), B('HSC', 12000, -3, 0.71), B('LPF', 18000, 0, 0.71, 12)],
    credit: 'Photo: Josephenus P. Riley, CC BY 2.0',
  },
  {
    year: 1982, place: 'Tokyo · Digital', title: 'The compact disc', img: 'cd', track: 'hiphop',
    text: 'Sixteen bits, 44,100 samples a second, no surface noise. The CD covers the whole range of human hearing with 96 dB of dynamic range. For the first time, the medium is not the bottleneck.',
    facts: { Bandwidth: '20 Hz – 20 kHz', Medium: 'Compact disc', 'Dynamic range': '96 dB' },
    filters: [],
    credit: 'Photo: Vahram Mekhitarian, CC BY-SA 3.0',
  },
  {
    year: 1991, place: 'London · Shoegaze', title: 'A wall of sound', img: 'shoegaze', track: 'metal',
    text: 'My Bloody Valentine\'s Loveless bends whole chords with the tremolo arm and drowns them in reverse reverb. Vocals sink into the guitars like another instrument, and players stare at their pedalboards, which gives the scene its name.',
    facts: { Signature: 'Glide guitar, reverse reverb', Mix: 'Dense, warm mids', 'Top end': 'Soft, hazy' },
    filters: [B('PK', 350, 4, 0.7), B('PK', 2500, -3, 1), B('HSC', 6000, -6, 0.71)],
    credit: 'Photo: Martie Donohoe, CC BY-SA 3.0',
  },
  {
    year: 2001, place: 'Cupertino · Compressed', title: 'MP3 and the loudness war', img: 'ipod', track: 'hiphop',
    text: '"1,000 songs in your pocket." Napster and the iPod make music weightless, but 128 kbps MP3s throw away almost everything above 16 kHz, and masters are limited so hard that the quiet parts disappear.',
    facts: { Bandwidth: '≈ 20 Hz – 16 kHz', Medium: '128 kbps MP3', 'Dynamic range': 'often under 6 dB' },
    filters: [B('LSC', 80, 6, 0.71), B('HSC', 8000, 4, 0.71), B('LPF', 16000, 0, 0.71, 24)],
    credit: 'Photo: Raimond Spekking, CC BY-SA 4.0',
  },
  {
    year: 2013, place: 'San Francisco · Blackgaze', title: 'Blast beats in the haze', img: 'blackgaze', track: 'metal',
    text: 'Alcest fuses black metal\'s tremolo picking with shoegaze haze, and Deafheaven\'s Sunbather carries it far beyond metal. Thin, bright guitars shimmer over washed-out blast beats: beauty and harshness in one wall.',
    facts: { Signature: 'Tremolo picking, blast beats', Mix: 'Lean low end', 'Top end': 'Bright shimmer' },
    filters: [B('HPF', 90, 0, 0.71, 12), B('PK', 250, -3, 1), B('PK', 4000, 4, 1), B('HSC', 9000, 3, 0.71)],
    credit: 'Photo: saul torres, CC BY-SA 2.0',
  },
  {
    year: 2016, place: 'Atlanta · Trap', title: 'The 808 takes over', img: 'trap', track: 'hiphop',
    text: 'Producers like Lex Luger and Metro Boomin tune the TR-808 kick into the bass line itself: long, gliding sub notes under rattling hi-hat rolls. The song now lives below 60 Hz, so your headphones\' bass suddenly matters.',
    facts: { Signature: '808 bass, hi-hat rolls', 'Key range': '30 – 60 Hz sub', Tempo: '≈ 140 BPM, half-time' },
    filters: [B('LSC', 60, 8, 0.71), B('PK', 300, -3, 1), B('HSC', 10000, 3, 0.71)],
    credit: 'Photo: Brandon Daniel / Clusternote, CC BY-SA 2.0',
  },
  {
    year: 2026, place: 'Everywhere · Personal', title: 'Your sound', img: 'now', track: 'hiphop', personal: true,
    text: 'Lossless streaming, measured headphones and a target curve for every model. The last step in fidelity is not the medium any more. It is you: an EQ shaped to your gear and your ears.',
    facts: { Bandwidth: '20 Hz – 20 kHz+', Medium: 'Lossless streams', Tuning: 'Your Lab EQ' },
    filters: [],
    credit: 'Product photo: Moondrop',
  },
];

const T = { index: -1, tuned: true, loading: false, trigger: null, gl: null, yearTween: null };
const playing = () => engine.state.source === 'guide' && engine.state.owner === 'history';
const era = () => ERAS[Math.max(0, T.index)];
const pad = (n) => String(n).padStart(2, '0');

// ---------- audio ----------

// The last stop plays your own Lab tuning instead of a historical medium.
const eraSpecs = (e) => (e.personal ? eqSpecs() : expandBands(e.filters));

function applyEq() {
  const specs = eraSpecs(era());
  engine.setGuideEq(specs, safePreamp(specs));
  engine.setGuideBypass(T.tuned);
}

async function startTrack() {
  const { track } = era();
  if (await playTrack(track, 'history')) applyEq();
}

async function toggle(index) {
  if (T.loading) return;
  if (playing() && index === T.index) return engine.stopSource();
  setEra(index);
  T.loading = true;
  syncPlayers();
  try {
    await startTrack();
  } catch (err) {
    toast(`Could not start the track: ${err.message}`, 'error');
  } finally {
    T.loading = false;
    syncPlayers();
  }
}

function setTuned(tuned) {
  T.tuned = tuned;
  haptic(6);
  if (playing()) engine.setGuideBypass(tuned);
  syncPlayers();
}

function syncPlayers() {
  for (const p of $$('.tl-listen')) {
    const mine = Number(p.dataset.index) === T.index;
    const on = mine && playing();
    const btn = p.querySelector('.tl-play');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-disabled', String(T.loading));
    btn.replaceChildren(icon(on ? 'stop' : 'play'), on ? 'Stop' : T.loading && mine ? 'Pressing…' : 'Hear it');
    p.querySelector('[data-ab="then"]').setAttribute('aria-pressed', String(T.tuned));
    p.querySelector('[data-ab="now"]').setAttribute('aria-pressed', String(!T.tuned));
  }
}

// ---------- HUD ----------

function rollYear(to) {
  const { gsap } = globalThis;
  const out = $('#tl-year');
  if (!gsap || reducedMotion) {
    out.textContent = String(to);
    return;
  }
  // One tween at a time, starting from whatever year is on screen right now.
  T.yearTween?.kill();
  const counter = { v: Number(out.textContent) || to };
  T.yearTween = gsap.to(counter, {
    v: to, duration: 0.9, ease: 'power3.out',
    onUpdate: () => { out.textContent = String(Math.round(counter.v)); },
  });
}

function setEra(index) {
  if (index === T.index) return;
  const previous = T.index >= 0 ? era() : null;
  T.index = index;
  const e = era();
  $('#tl-index').textContent = pad(index + 1);
  $('#tl-place').textContent = e.place;
  rollYear(e.year);
  for (const [i, b] of $$('#tl-rail button').entries()) b.setAttribute('aria-current', String(i === index));
  // Scrolling while listening carries the music into the next era.
  if (playing()) (previous?.track === e.track ? Promise.resolve(applyEq()) : startTrack()).catch((err) => toast(err.message, 'error'));
  syncPlayers();
}

// ---------- markup ----------

function panel(e, i) {
  return h('article', { class: 'tl-panel', 'data-index': String(i), 'aria-label': `${e.year}: ${e.title}` },
    h('span', { class: 'tl-ghost', 'aria-hidden': 'true' }, String(e.year)),
    h('figure', { class: 'tl-media' },
      h('img', { src: `/history/${e.img}.webp`, alt: '', loading: i < 2 ? 'eager' : 'lazy', decoding: 'async' }),
      h('figcaption', {}, e.credit)),
    h('div', { class: 'tl-copy' },
      h('p', { class: 'tl-kicker' }, h('span', {}, pad(i + 1)), e.place),
      h('h2', { class: 'tl-title' }, e.title),
      h('p', { class: 'tl-text' }, e.text),
      h('dl', { class: 'tl-facts' }, Object.entries(e.facts).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
      h('div', { class: 'tl-listen', 'data-index': String(i), role: 'group', 'aria-label': `Listen: ${e.title}` },
        h('button', { type: 'button', class: 'btn primary tl-play', onclick: () => toggle(i) }, icon('play'), 'Hear it'),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Compare' },
          h('button', { type: 'button', 'data-ab': 'then', onclick: () => setTuned(true) }, e.personal ? 'Your tuning' : String(e.year)),
          h('button', { type: 'button', 'data-ab': 'now', onclick: () => setTuned(false) }, e.personal ? 'Flat' : 'Today')))));
}

function goTo(i) {
  const st = T.trigger;
  if (!st) return $$('.tl-panel')[i].scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  scrollToY(st.start + (i / (ERAS.length - 1)) * (st.end - st.start));
}

// ---------- scroll ----------

function initScroll() {
  const { gsap } = globalThis;
  const track = $('#tl-track');
  const distance = () => track.scrollWidth - innerWidth;
  const tween = gsap.to(track, {
    x: () => -distance(), ease: 'none',
    scrollTrigger: {
      trigger: '#tl', pin: true, scrub: 1, start: 'top top', end: () => `+=${distance()}`, invalidateOnRefresh: true,
      snap: { snapTo: 1 / (ERAS.length - 1), inertia: false, duration: { min: 0.3, max: 0.9 }, delay: 0.15, ease: 'power2.inOut' },
      onUpdate: (self) => {
        if ($('#view-history').hidden) return; // measured while hidden; ignore until shown
        const pos = self.progress * (ERAS.length - 1);
        T.gl?.setEra(pos);
        $('#tl-progress').style.transform = `scaleX(${self.progress})`;
        setEra(Math.round(pos));
      },
    },
  });
  T.trigger = tween.scrollTrigger;
  // Tabbing into an off-screen panel makes the browser scroll the clipped track; bring that
  // panel in through the timeline instead.
  $('#tl-track').addEventListener('focusin', (e) => {
    const panel = e.target.closest('.tl-panel');
    $('#tl').scrollLeft = 0;
    const i = Number(panel?.dataset.index);
    if (panel && i !== T.index) goTo(i);
  });
  const inTrack = (p, vars) => ({ trigger: p, containerAnimation: tween, ...vars });
  for (const p of $$('.tl-panel')) {
    gsap.from(p.querySelectorAll('.tl-kicker, .tl-title, .tl-text, .tl-facts, .tl-listen'), {
      y: 70, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.07,
      scrollTrigger: inTrack(p, { start: 'left 65%', toggleActions: 'play none none reverse' }),
    });
    gsap.fromTo(p.querySelector('.tl-media img'), { xPercent: -8, scale: 1.2 }, {
      xPercent: 8, scale: 1.05, ease: 'none', scrollTrigger: inTrack(p, { start: 'left right', end: 'right left', scrub: true }),
    });
    gsap.fromTo(p.querySelector('.tl-media'), { clipPath: 'inset(18% 30% 18% 0% round 24px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 24px)', ease: 'none', scrollTrigger: inTrack(p, { start: 'left 95%', end: 'left 30%', scrub: true }),
    });
    gsap.fromTo(p.querySelector('.tl-ghost'), { xPercent: 25 }, {
      xPercent: -25, ease: 'none', scrollTrigger: inTrack(p, { start: 'left right', end: 'right left', scrub: true }),
    });
  }
}

export function initHistory() {
  $('#tl-track').replaceChildren(...ERAS.map(panel));
  $('#tl-rail').replaceChildren(...ERAS.map((e, i) => h('button', {
    type: 'button', 'aria-label': `Go to ${e.year}, ${e.title}`, 'aria-current': 'false', onclick: () => goTo(i),
  }, h('span', {}, String(e.year)))));
  $('#tl-total').textContent = pad(ERAS.length);
  try {
    T.gl = createEraGL($('#tl-gl'), () => !$('#view-history').hidden);
  } catch (err) {
    console.error('[history gl]', err);
  }
  setEra(0);
  engine.onChange(syncPlayers);
  if (motionReady && !reducedMotion) initScroll();
  else $('#tl').classList.add('static'); // stacked chapters, no pin
  syncPlayers();
}
