import * as engine from './audio-engine.js';
import { playTrack } from './synth.js';
import { makeBand, expandBands } from './peq.js';
import { safePreamp } from './eq.js';
import { eqSpecs } from './peq-state.js';
import { createStage } from './stage3d.js';
import { motionReady, reducedMotion, scrollToY } from './motion.js';
import { photo, rollNumber } from './img.js';
import { play } from './sound.js';
import { $, $$, h, icon, toast, haptic } from './ui.js';

const B = (type, fc, gain, q, slope) => makeBand({ type, fc, gain, q, slope });

const ERAS = [
  {
    year: 1877, place: 'Menlo Park · New Jersey', title: 'The phonograph', model: 'phonograph', track: 'hiphop',
    lead: 'A needle, a sheet of tinfoil and a man shouting a nursery rhyme.',
    text: 'Thomas Edison shouts "Mary had a little lamb" into a horn, and a needle cuts the vibration into tinfoil. No microphone, no electricity: the singer\'s own lungs drive the groove.',
    facts: { Bandwidth: '≈ 250 Hz – 2.5 kHz', Medium: 'Tinfoil cylinder', Capture: 'Horn + diaphragm' },
    filters: [B('HPF', 300, 0, 0.71, 24), B('LPF', 2500, 0, 0.71, 24), B('PK', 1000, 6, 1)],
    backdrop: 'h1877-edison', photos: ['h1877-tinfoil', 'h1877-lab', 'h1877-sketch', 'h1877-menlo', 'h1877-foil'],
    parts: {
      mouthpiece: ['Mouthpiece', 'You shouted into it. No microphone, no amplifier: your lungs did all the work, so the first recording ever made is a man yelling.'],
      diaphragm: ['Diaphragm & stylus', 'A thin disc trembles with the voice and presses a steel point into the foil. The same point reads it back, wearing the recording out within a few plays.'],
      cylinder: ['Tinfoil cylinder', 'A grooved brass drum wrapped in foil. The groove is cut up and down, so a loud sound is a deeper dent, not a wider one.'],
      screw: ['Feed screw', 'Turning the crank also slides the drum along a fine thread, so the needle draws one long spiral instead of a ring.'],
      crank: ['Hand crank', 'Playback speed was whatever your arm did. Crank faster and Mary\'s lamb sings higher.'],
      base: ['Cast-iron base', 'Heavy iron keeps the machine from walking across the bench. Machinist John Kruesi built it from Edison\'s sketch.'],
    },
  },
  {
    year: 1925, place: 'Camden · New Jersey', title: 'The microphone age', model: 'ribbon-mic', track: 'hiphop',
    lead: 'Electricity arrives, and singers no longer have to shout.',
    text: 'Western Electric\'s microphone and amplifier replace the horn in 1925. Singers can finally sing softly, so crooning is born, and in 1932 RCA\'s ribbon microphone, the 44, gives jazz and radio its velvet.',
    facts: { Bandwidth: '≈ 100 Hz – 5 kHz', Medium: '78 rpm shellac', Capture: 'Microphone + amplifier' },
    filters: [B('HPF', 100, 0, 0.71, 24), B('LPF', 5000, 0, 0.71, 24), B('PK', 2000, 3, 1)],
    backdrop: 'h1925-control', photos: ['h1925-rca44', 'h1925-label', 'h1925-mics', 'h1925-plate', 'h1925-rca44bx', 'h1925-reproducer'],
    parts: {
      ribbon: ['Aluminium ribbon', 'A corrugated strip of aluminium a few microns thick hangs in a magnetic field. Air moves it, and the movement makes a tiny current. Nothing in the chain is lighter.'],
      magnet: ['Magnet frame', 'Sound reaches the ribbon from the front and the back but not the sides, so the 44 hears in a figure of eight. Engineers placed two singers face to face.'],
      grille: ['Chrome grille', 'The capsule shape became the look of 1930s radio. It also kept breath off a ribbon that one hard "p" could stretch for good.'],
      transformer: ['Output transformer', 'The ribbon makes almost no voltage. A transformer in the base steps it up to something an amplifier of the day could use.'],
      yoke: ['Yoke & stand', 'Sing close and a ribbon swells your low end. That proximity effect gave crooners their warm, intimate voice.'],
    },
  },
  {
    year: 1948, place: 'New York · New York', title: 'The long-playing record', model: 'turntable', track: 'hiphop',
    lead: 'Twenty minutes a side, and the album as we know it.',
    text: 'Columbia\'s 33⅓ rpm LP fits over 20 minutes a side. The RIAA curve later standardises how records are cut and played back, and in 1958 the stereo LP puts the band in a room around you.',
    facts: { Bandwidth: '≈ 30 Hz – 15 kHz', Medium: 'Vinyl LP', Capture: 'Mono, then stereo' },
    filters: [B('HPF', 35, 0, 0.71, 12), B('LPF', 15000, 0, 0.71, 12), B('LSC', 120, 2, 0.71), B('HSC', 9000, -2, 0.71)],
    backdrop: 'h1948-billie', photos: ['h1948-groove', 'h1948-monk', 'h1948-crates', 'h1948-cartridge', 'h1948-bass', 'h1948-turntable'],
    parts: {
      record: ['Microgroove LP', 'Grooves a third the width of a 78\'s, spinning at 33⅓ rpm: a whole symphony movement on one side of vinyl.'],
      cartridge: ['Cartridge & stylus', 'A diamond tip rides a groove that wiggles side to side. From 1958 each wall of the V carries one stereo channel.'],
      tonearm: ['Tonearm', 'It lets the stylus float on a couple of grams. Too heavy and it wears the vinyl; too light and it skips on the bass.'],
      platter: ['Platter', 'A heavy disc at a steady 33⅓. Any wobble in speed is heard as wow and flutter, a seasick pitch.'],
      plinth: ['Plinth', 'Footsteps and loud bass shake the deck and the stylus reads them as rumble. Mass and soft feet keep it quiet.'],
    },
  },
  {
    year: 1967, place: 'Abbey Road · London', title: 'The studio as an instrument', model: 'tape-machine', track: 'hiphop',
    lead: 'Four tracks, a razor blade and a mixing desk you can play.',
    text: 'Sgt. Pepper is built on four-track Studer J37 machines, bouncing parts together to fit more in. Tape saturates warmly when pushed, and producers start composing with the mixing desk.',
    facts: { Bandwidth: '≈ 30 Hz – 18 kHz', Medium: '1-inch tape', Capture: '4 tracks' },
    filters: [B('PK', 80, 2.5, 1), B('LSC', 150, 1.5, 0.71), B('HSC', 12000, -3, 0.71), B('LPF', 18000, 0, 0.71, 12)],
    backdrop: 'h1967-abbey', photos: ['h1967-j37', 'h1967-redd', 'h1967-door', 'h1967-tg', 'h1967-reels'],
    parts: {
      heads: ['Erase, record, play', 'Three heads in a row. Record on one track while listening back to the other three, and a band can overdub itself.'],
      reels: ['Reels', 'One-inch tape held four tracks. When they filled up, engineers mixed them down to one and kept going: bouncing.'],
      capstan: ['Capstan & pinch roller', 'The capstan sets the speed. Nudge it and voices slow down or speed up, the varispeed trick all over late-\'60s records.'],
      meters: ['VU meters', 'Engineers drove the needles past zero on purpose. Tape rounds off the peaks and thickens the drums.'],
      deck: ['Transport deck', 'Tape could be cut with a razor and spliced. Loops, reversed guitars and sound collages became physical edits.'],
    },
  },
  {
    year: 1982, place: 'Tokyo · Japan', title: 'The compact disc', model: 'compact-disc', track: 'hiphop',
    lead: 'Silence, for the first time. No hiss, no crackle, no wear.',
    text: 'Sixteen bits, 44,100 samples a second, no surface noise. The CD covers the whole range of human hearing with 96 dB of dynamic range. For the first time, the medium is not the bottleneck.',
    facts: { Bandwidth: '20 Hz – 20 kHz', Medium: 'Compact disc', 'Dynamic range': '96 dB' },
    filters: [],
    backdrop: 'h1982-tokyo', photos: ['h1982-rainbow', 'h1982-cdp101', 'h1982-ginza', 'h1982-inside', 'h1982-tray'],
    parts: {
      polycarbonate: ['Polycarbonate', '1.2 mm of clear plastic. The laser focuses through it, so dust and scratches on the surface sit out of focus.'],
      aluminium: ['Aluminium layer', 'A spiral of microscopic pits more than five kilometres long. The music is in the edges between pit and land.'],
      label: ['Lacquer & label', 'The data sits just under the printed side, which is why a scratch on the label hurts a CD more than one underneath.'],
      laser: ['Laser pickup', 'An infrared laser reads from below, centre outwards. Nothing touches the music, so the thousandth play sounds like the first.'],
      spindle: ['Spindle motor', 'The disc slows from about 500 rpm at the centre to 200 at the edge, so the data passes the laser at a steady speed.'],
    },
  },
  {
    year: 1991, place: 'Camden · London', title: 'A wall of sound', model: 'fuzz-pedal', track: 'metal',
    lead: 'Guitars bent out of tune and drowned on purpose.',
    text: 'My Bloody Valentine\'s Loveless bends whole chords with the tremolo arm and drowns them in reverse reverb. Vocals sink into the guitars like another instrument, and players stare at their pedalboards, which gives the scene its name.',
    facts: { Signature: 'Glide guitar, reverse reverb', Mix: 'Dense, warm mids', 'Top end': 'Soft, hazy' },
    filters: [B('PK', 350, 4, 0.7), B('PK', 2500, -3, 1), B('HSC', 6000, -6, 0.71)],
    backdrop: 'h1991-mbv', photos: ['h1991-muff', 'h1991-board', 'h1991-camden', 'h1991-jazzmaster'],
    parts: {
      circuit: ['Transistor circuit', 'Stage after stage of transistors clips the guitar into a near-square wave. Stack reverb on top and a chord stops being notes and becomes a texture.'],
      knobs: ['Sustain, tone, volume', 'Turn sustain up and a note never seems to stop, which suits songs built from one long, bending chord.'],
      footswitch: ['Footswitch', 'Players spent the gig looking down at their pedals. The press called it shoegazing, and the name stuck.'],
      enclosure: ['Enclosure', 'A folded metal box built to be stamped on, night after night, by people looking at their feet.'],
      battery: ['9 V battery', 'As the battery dies, fuzz turns gated and sputtery. Some players swore by half-flat batteries.'],
    },
  },
  {
    year: 2001, place: 'Cupertino · California', title: 'MP3 and the loudness war', model: 'ipod', track: 'hiphop',
    lead: 'A thousand songs in your pocket, and the quiet parts gone.',
    text: '"1,000 songs in your pocket." Napster and the iPod make music weightless, but 128 kbps MP3s throw away almost everything above 16 kHz, and masters are limited so hard that the quiet parts disappear.',
    facts: { Bandwidth: '≈ 20 Hz – 16 kHz', Medium: '128 kbps MP3', 'Dynamic range': 'often under 6 dB' },
    filters: [B('LSC', 80, 6, 0.71), B('HSC', 8000, 4, 0.71), B('LPF', 16000, 0, 0.71, 24)],
    backdrop: 'h2001-ipod-hp', photos: ['h2001-ipod', 'h2001-earbuds', 'h2001-chip', 'h2001-street', 'h2001-ipod-pair'],
    parts: {
      wheel: ['Scroll wheel', 'Spin a thumb to fly through a thousand songs. On the first iPod the wheel really turned; later ones went touch-sensitive.'],
      drive: ['1.8-inch hard drive', 'Five gigabytes the size of a coaster. At 128 kbps that is about a thousand songs: the slogan was arithmetic.'],
      screen: ['Screen', 'A small monochrome display: just enough for an artist, a title and a playlist.'],
      battery: ['Battery', 'Songs were buffered in memory so the hard drive could sleep, and a bump in your pocket never skipped.'],
      back: ['Polished back', 'Mirror-finish steel, famous for scratching if you looked at it.'],
      front: ['White front', 'White case, white earbuds. For the first time you could see who was listening.'],
    },
  },
  {
    year: 2013, place: 'San Francisco · California', title: 'Blast beats in the haze', model: 'amp-head', track: 'metal',
    lead: 'Black metal\'s fury, shoegaze\'s fog.',
    text: 'Alcest fuses black metal\'s tremolo picking with shoegaze haze, and Deafheaven\'s Sunbather carries it far beyond metal. Thin, bright guitars shimmer over washed-out blast beats: beauty and harshness in one wall.',
    facts: { Signature: 'Tremolo picking, blast beats', Mix: 'Lean low end', 'Top end': 'Bright shimmer' },
    filters: [B('HPF', 90, 0, 0.71, 12), B('PK', 250, -3, 1), B('PK', 4000, 4, 1), B('HSC', 9000, 3, 0.71)],
    backdrop: 'h2013-deafheaven', photos: ['h2013-alcest', 'h2013-sf', 'h2013-dh18', 'h2013-alcest2'],
    parts: {
      preamp: ['Preamp valves', 'Small valves add gain stage by stage until the guitar breaks up into distortion.'],
      power: ['Power valves', 'Pushed hard, they compress and sag, so tremolo-picked chords blur into one shimmering wall.'],
      transformer: ['Output transformer', 'When it saturates the low end softens, part of why these guitars sound lean and bright.'],
      speaker: ['Speaker', 'Guitar speakers fall away above about 5 kHz, so the shimmer lives in the upper mids, not real treble.'],
      chassis: ['Chassis', 'Valves, wiring and a steel tray: built for the stage, now mic\'d up close in the studio.'],
      cabinet: ['Head cabinet', 'Wood, vinyl covering and grille cloth. The one part that does nothing to the sound.'],
    },
  },
  {
    year: 2016, place: 'Atlanta · Georgia', title: 'The 808 takes over', model: 'tr-808', track: 'hiphop',
    lead: 'The song moves below 60 Hz.',
    text: 'Producers like Lex Luger and Metro Boomin tune the TR-808 kick into the bass line itself: long, gliding sub notes under rattling hi-hat rolls. The song now lives below 60 Hz, so your headphones\' bass suddenly matters.',
    facts: { Signature: '808 bass, hi-hat rolls', 'Key range': '30 – 60 Hz sub', Tempo: '≈ 140 BPM, half-time' },
    filters: [B('LSC', 60, 8, 0.71), B('PK', 300, -3, 1), B('HSC', 10000, 3, 0.71)],
    backdrop: 'h2016-atlanta', photos: ['h2016-808', 'h2016-crowd', 'h2016-808mim', 'h2016-808-909'],
    parts: {
      circuit: ['Bass-drum circuit', 'The kick is a filter that rings like a bell when struck. Turn the decay up and it becomes a long, tunable boom.'],
      keys: ['Step keys', 'Sixteen coloured keys, one per sixteenth note. Light the steps and the bar plays itself.'],
      knobs: ['Voice knobs', 'Level, tone and decay for every sound. Trap producers turn the kick\'s decay all the way up.'],
      tempo: ['Tempo', 'Around 140 BPM played half-time: hi-hats roll fast over a slow, heavy groove.'],
      case: ['Case', 'A flop when it launched in 1980. Second-hand prices fell, and hip-hop producers picked it up cheap.'],
    },
  },
  {
    year: 2026, place: 'Everywhere', title: 'Your sound', model: 'iem', track: 'hiphop', personal: true,
    lead: 'The medium is transparent. The last variable is you.',
    text: 'Lossless streaming, measured headphones and a target curve for every model. The last step in fidelity is not the medium any more. It is you: an EQ shaped to your gear and your ears.',
    facts: { Bandwidth: '20 Hz – 20 kHz+', Medium: 'Lossless streams', Tuning: 'Your Lab EQ' },
    filters: [],
    backdrop: 'h2026-iem1', photos: ['h2026-listen', 'h2026-studio', 'h2026-iem2'],
    parts: {
      faceplate: ['Faceplate', 'Lacquer and a brass inlay. Pure decoration, and the first thing anyone notices.'],
      shell: ['Resin shell', 'Shaped like the inside of an ear, it seals like an earplug so the bass can\'t leak out.'],
      driver: ['Dynamic driver', 'A small moving cone for the bass, where only moving air gives you weight.'],
      armatures: ['Balanced armatures', 'Tiny hearing-aid drivers for mids and treble, each routed to the nozzle through its own tube.'],
      nozzle: ['Nozzle & filters', 'Damping here tames the peaks. This is where a tuning gets its signature, and where your EQ takes over.'],
      tip: ['Ear tip', 'The cheapest part and the most important. One size too small can cost 10 dB of bass.'],
    },
  },
];

const T = { index: -1, tuned: true, loading: false, stage: null, stageIndex: -1, part: null, lastExplode: ERAS.map(() => 0) };
const playing = () => engine.state.source === 'guide' && engine.state.owner === 'history';
const era = () => ERAS[Math.max(0, T.index)];
const pad = (n) => String(n).padStart(2, '0');
const slugYear = (e) => `ch-${e.year}`;

const eraSpecs = (e) => (e.personal ? eqSpecs() : expandBands(e.filters));

function applyEq() {
  const specs = eraSpecs(era());
  engine.setGuideEq(specs, safePreamp(specs));
  engine.setGuideBypass(T.tuned);
}

async function startTrack() {
  if (await playTrack(era().track, 'history')) applyEq();
}

async function toggle(index) {
  if (T.loading) return;
  if (playing() && index === T.index) return engine.stopSource();
  setEra(index);
  T.loading = true;
  syncPlayers();
  play('needle');
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
  play('click');
  if (playing()) engine.setGuideBypass(tuned);
  syncPlayers();
}

function syncPlayers() {
  for (const p of $$('.hx-listen')) {
    const i = Number(p.dataset.index);
    const on = i === T.index && playing();
    const e = ERAS[i];
    const btn = p.querySelector('.needle');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-disabled', String(T.loading));
    btn.querySelector('.needle-label').textContent = on ? 'Lift the needle' : T.loading && i === T.index ? 'Dropping…' : `Hear ${e.personal ? 'your sound' : e.year}`;
    p.querySelector('.era-switch').setAttribute('aria-checked', String(T.tuned));
  }
}

function setEra(index) {
  if (index === T.index) return;
  const previous = T.index >= 0 ? era() : null;
  T.index = index;
  const e = era();
  rollNumber($('#hx-year'), e.year);
  $('#hx-count').textContent = `${pad(index + 1)} / ${pad(ERAS.length)}`;
  $('#hx-place').textContent = e.place;
  for (const [i, b] of $$('#hx-rail a').entries()) {
    if (i === index) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
  }
  if (playing()) (previous?.track === e.track ? Promise.resolve(applyEq()) : startTrack()).catch((err) => toast(err.message, 'error'));
  syncPlayers();
}

function showPart(index, id, { from = 'list' } = {}) {
  const e = ERAS[index];
  const ch = $(`#${slugYear(e)}`);
  if (!ch) return;
  const story = ch.querySelector('.hx-story');
  const ids = Object.keys(e.parts);
  for (const b of ch.querySelectorAll('.hx-part')) b.setAttribute('aria-pressed', String(b.dataset.part === id));
  if (T.stage && T.stageIndex === index) T.stage.highlight(id);
  T.part = id;
  if (!id) {
    story.classList.remove('on');
    drawLeader(index, null);
    return;
  }
  const [label, text] = e.parts[id];
  story.querySelector('.hx-story-n').textContent = `Part ${pad(ids.indexOf(id) + 1)} / ${pad(ids.length)}`;
  story.querySelector('.hx-story-t').textContent = label;
  story.querySelector('.hx-story-p').textContent = text;
  story.classList.add('on');
  if (from !== 'list') play('detent');
  drawLeader(index, id);
}

function drawLeader(index, id) {
  const ch = index >= 0 ? $(`#${slugYear(ERAS[index])}`) : null;
  const svg = ch?.querySelector('.hx-leader');
  if (!svg) return;
  const pt = id && T.stage && T.stageIndex === index ? T.stage.project(id) : null;
  const btn = id ? ch.querySelector(`.hx-part[data-part="${id}"]`) : null;
  if (!pt || !btn || !btn.offsetParent) {
    svg.replaceChildren();
    return;
  }
  const box = svg.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const c = ch.querySelector('.hx-canvas').getBoundingClientRect();
  const x1 = b.right - box.left + 10;
  const y1 = b.top + b.height / 2 - box.top;
  const x2 = c.left - box.left + pt.x;
  const y2 = c.top - box.top + pt.y;
  const ns = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)} H${((x1 + x2) / 2).toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`);
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', x2.toFixed(1));
  dot.setAttribute('cy', y2.toFixed(1));
  dot.setAttribute('r', '3.5');
  svg.replaceChildren(path, dot);
}

async function stageInto(index) {
  if (T.stageIndex === index) return;
  T.stageIndex = index;
  const e = ERAS[index];
  const host = $(`#${slugYear(e)} .hx-canvas`);
  try {
    if (!T.stage) {
      T.stage = await createStage(host, {
        look: 'line', distance: 1.1,
        onHover: (id, { tap } = {}) => {
          if (!id && tap) return;
          showPart(T.stageIndex, id, { from: 'canvas' });
        },
      });
    } else {
      T.stage.attach(host);
    }
    if (T.stageIndex !== index) return;
    await T.stage.setModel(e.model);
    T.stage.setExplode(reducedMotion || !motionReady ? 1 : T.lastExplode[index]);
    T.stage.highlight(T.part && e.parts[T.part] ? T.part : null);
    host.classList.add('ready');
  } catch (err) {
    console.error('[history 3d]', err);
    host.classList.add('no-3d');
  }
}

function partList(e, i) {
  return h('ol', { class: 'hx-parts', 'aria-label': `Parts of the ${e.title.replace(/^The /, '').toLowerCase()}` },
    Object.entries(e.parts).map(([id, [label]], n) => h('li', {},
      h('button', {
        type: 'button', class: 'hx-part', 'data-part': id, 'aria-pressed': 'false',
        'aria-controls': `${slugYear(e)}-story`,
        onclick: () => showPart(i, id),
        onfocus: () => showPart(i, id),
        onmouseenter: () => showPart(i, id),
      }, h('span', { class: 'hx-part-n', 'aria-hidden': 'true' }, pad(n + 1)), label))));
}

function listen(e, i) {
  return h('div', { class: 'hx-listen', 'data-index': String(i), role: 'group', 'aria-label': `Listen: ${e.title}` },
    h('button', { type: 'button', class: 'needle', 'aria-pressed': 'false', 'data-cursor': 'play', onclick: () => toggle(i) },
      h('span', { class: 'needle-disc', 'aria-hidden': 'true' }, h('span', { class: 'needle-arm' })),
      h('span', { class: 'needle-label' }, `Hear ${e.personal ? 'your sound' : e.year}`)),
    h('div', { class: 'era-ab' },
      h('span', { class: 'era-ab-l', 'aria-hidden': 'true' }, e.personal ? 'Flat' : 'Today'),
      h('button', {
        type: 'button', role: 'switch', class: 'era-switch', 'aria-checked': 'true',
        'aria-label': e.personal ? 'Apply your Lab tuning' : `Hear it as in ${e.year}`,
        onclick: () => setTuned(!T.tuned),
      }, h('span', { class: 'era-lever', 'aria-hidden': 'true' })),
      h('span', { class: 'era-ab-r', 'aria-hidden': 'true' }, e.personal ? 'Your tuning' : String(e.year))));
}

function chapter(e, i) {
  const id = slugYear(e);
  return h('article', { class: 'hx-ch', id, 'data-index': String(i), 'aria-labelledby': `${id}-title` },
    h('header', { class: 'hx-open' },
      photo(e.backdrop, { className: 'hx-backdrop', sizes: '100vw', eager: i === 0 }),
      h('div', { class: 'hx-open-copy' },
        h('p', { class: 'hx-num caps' }, `Chapter ${pad(i + 1)} / ${pad(ERAS.length)}`),
        h('p', { class: 'hx-bigyear', 'aria-hidden': 'true' }, String(e.year)),
        h('p', { class: 'hx-place eyebrow' }, e.place),
        h('h2', { id: `${id}-title`, class: 'hx-title' }, h('span', { class: 'sr-only' }, `${e.year}: `), e.title),
        h('p', { class: 'hx-lead' }, e.lead))),
    h('div', { class: 'hx-stage-wrap' },
      h('div', { class: 'hx-stage' },
        h('div', { class: 'hx-hud', 'aria-hidden': 'true' },
          h('span', { class: 'hx-corner tl' }), h('span', { class: 'hx-corner tr' }), h('span', { class: 'hx-corner bl' }), h('span', { class: 'hx-corner br' }),
          h('span', { class: 'hx-rec' }, h('i'), `Exploded view · ${e.year}`),
          h('span', { class: 'hx-ticks' })),
        h('div', { class: 'hx-stage-head' },
          h('p', { class: 'hx-stage-title' }, e.title),
          partList(e, i)),
        h('div', {
          class: 'hx-canvas', tabindex: '0', role: 'img', 'data-cursor': 'drag',
          'aria-label': `${e.title}, drawn as an exploded view. Arrow keys turn it; the parts list explains each part.`,
          onkeydown: (ev) => {
            const step = { ArrowLeft: -1, ArrowRight: 1 }[ev.key];
            const tilt = { ArrowUp: -1, ArrowDown: 1 }[ev.key];
            if ((step || tilt) && T.stage && T.stageIndex === i) {
              ev.preventDefault();
              T.stage.turn(step ?? 0, tilt ?? 0);
            }
          },
        }),
        h('svg', { class: 'hx-leader', 'aria-hidden': 'true' }),
        h('div', { class: 'hx-story', id: `${id}-story`, 'aria-live': 'polite' },
          h('p', { class: 'hx-story-n caps' }), h('h3', { class: 'hx-story-t' }), h('p', { class: 'hx-story-p' })),
        h('p', { class: 'hx-hint caps', 'aria-hidden': 'true' }, 'Hover a part · drag to turn'))),
    h('div', { class: 'hx-lore' },
      h('div', { class: 'hx-mosaic' }, e.photos.map((p, n) => photo(p, { className: `m${n}`, sizes: '(max-width: 760px) 100vw, 33vw' }))),
      h('div', { class: 'hx-text' },
        h('p', { class: 'hx-body' }, e.text),
        h('dl', { class: 'hx-facts' }, Object.entries(e.facts).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
        listen(e, i),
        e.personal ? h('a', { class: 'btn primary has-icon hx-cta', href: '#/lab' }, 'Tune your sound in the Lab',
          h('span', { class: 'btn-icon' }, icon('arrow'))) : null)));
}

function initScroll() {
  const { gsap, ScrollTrigger } = globalThis;
  const ease = gsap.parseEase('power2.inOut');
  for (const ch of $$('.hx-ch')) {
    const i = Number(ch.dataset.index);
    const wrap = ch.querySelector('.hx-stage-wrap');
    ScrollTrigger.create({
      trigger: ch, start: 'top 55%', end: 'bottom 45%',
      onToggle: (self) => { if (self.isActive && !$('#view-history').hidden) setEra(i); },
    });
    ScrollTrigger.create({
      trigger: wrap, start: 'top 90%', end: 'bottom 10%',
      onToggle: (self) => { if (self.isActive && !$('#view-history').hidden) stageInto(i); },
    });
    ScrollTrigger.create({
      trigger: wrap, start: 'top 20%', end: 'bottom 80%',
      onToggle: (self) => document.body.classList.toggle('hx-staging', self.isActive && !$('#view-history').hidden),
    });
    ScrollTrigger.create({
      trigger: wrap, start: 'top top', end: 'bottom bottom', scrub: 1.2,
      onUpdate: (self) => {
        const t = ease(Math.min(1, Math.max(0, (self.progress - 0.1) / 0.55)));
        T.lastExplode[i] = t;
        if (T.stage && T.stageIndex === i) {
          T.stage.setExplode(t);
          T.stage.setScrollYaw(self.progress * 1.2);
          if (T.part) drawLeader(i, T.part);
        }
        ch.classList.toggle('exploded', t > 0.55);
      },
    });
    gsap.from(ch.querySelectorAll('.hx-open-copy > *'), {
      y: 60, opacity: 0, duration: 1.4, ease: 'expo.out', stagger: 0.08,
      scrollTrigger: { trigger: ch.querySelector('.hx-open'), start: 'top 70%', once: true },
    });
    gsap.fromTo(ch.querySelector('.hx-backdrop img'), { scale: 1.15, yPercent: -5 }, {
      scale: 1.02, yPercent: 5, ease: 'none',
      scrollTrigger: { trigger: ch.querySelector('.hx-open'), start: 'top bottom', end: 'bottom top', scrub: true },
    });
    gsap.from(ch.querySelectorAll('.hx-mosaic .photo'), {
      clipPath: 'inset(100% 0% 0% 0%)', duration: 1.4, ease: 'expo.out', stagger: 0.1,
      scrollTrigger: { trigger: ch.querySelector('.hx-mosaic'), start: 'top 80%', once: true },
    });
  }
}

function initStatic() {
  $('#view-history').classList.add('static');
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || $('#view-history').hidden) continue;
      const ch = entry.target.closest('.hx-ch');
      const i = Number(ch.dataset.index);
      setEra(i);
      stageInto(i);
      ch.classList.add('exploded');
    }
  }, { threshold: 0.4 });
  for (const s of $$('.hx-stage')) io.observe(s);
}

function goTo(i) {
  const target = $(`#${slugYear(ERAS[i])}`);
  if (target) scrollToY(target.getBoundingClientRect().top + scrollY);
}

export function initHistory() {
  $('#hx-chapters').replaceChildren(...ERAS.map(chapter));
  $('#hx-rail').replaceChildren(...ERAS.map((e, i) => h('a', {
    href: `#/history`, 'aria-label': `Chapter ${i + 1}: ${e.year}, ${e.title}`,
    onclick: (ev) => { ev.preventDefault(); goTo(i); },
  }, h('span', {}, String(e.year)))));
  setEra(0);
  engine.onChange(syncPlayers);
  addEventListener('resize', () => { if (T.part) drawLeader(T.stageIndex, T.part); }, { passive: true });
  if (motionReady && !reducedMotion) initScroll();
  else initStatic();
  syncPlayers();
}
