# Oura Acoustics

A headphone tuning site that reacts to whatever you're listening to. It has no npm dependencies: plain Node + browser ES modules.

```bash
cp .env.example .env   # add GEMINI_API_KEY (optional; rule-based advice works without it)
npm start              # http://localhost:3000
npm test
```

## Pages

| Page | |
| --- | --- |
| Home | A hero section over a live "silk aurora" WebGL background that reacts to whichever audio source is on |
| Tuning Lab | 1) pick headphones (8,800+ [AutoEq](https://github.com/jaakkopasanen/AutoEq) profiles, or Detect from OS device names) 2) analyze 20 s of system audio / mic 3) hearing check 4) bass/treble taste → recommendations, optional Gemini advice, export to Equalizer APO / Wavelet |
| Tuning Guide | A boost-and-sweep dial, two pro missions (IEM drum monitoring, desk sub crossover) with knobs, scores and exploded hardware, a scroll through the spectrum, 8 practice lessons and a reference handbook |
| History | A pinned horizontal timeline from 1877 to 2026 (phonograph to shoegaze, blackgaze and trap) over a WebGL wave field. You can hear the practice track at each era's fidelity |

## Studio (Tuning Lab + Guide)

- Parametric EQ (`peq.js`, `peq-state.js`, `peq-panel.js`): peak, shelf, high/low-pass (12/24 dB/oct), notch and all-pass bands, undo/redo, an AutoEq correction layer, Harman target overlays and a phase view.
- Graph (`peq-graph.js`, D3 7.9 vendored in `public/vendor`): drag nodes for frequency and gain, scroll for Q, double-click to add a band. It works fully from the keyboard and snaps with haptics on phones. The graph and the audio use the same RBJ biquad maths (`eq.js`), and custom-Q shelves use `IIRFilterNode`, so the drawn curve is the curve you hear.
- Crossover, time and phase: Linkwitz-Riley LR2/LR4/LR8 sub crossover with gain, delay and polarity, per-channel delay/polarity, a distance-to-delay helper and all-pass filters. The graph shows the acoustic sum.
- Exports: a full Equalizer APO config (crossover routed to `SUB`, delays, polarity), AutoEq ParametricEQ and GraphicEQ.
- Hardware: [devicePEQ](https://github.com/jeromeof/devicePEQ) (0BSD, vendored) pushes the EQ over WebHID / Web Serial / Web Bluetooth in desktop Chrome or Edge. Its UI needs `style-src 'unsafe-inline'`; scripts stay `'self'`-only.
- Simple and Advanced: the Lab opens in a beginner mode where you only drag nodes for frequency and gain. The *Advanced settings* switch adds filter type, Q, slope, phase, crossover and time alignment, and the site remembers which one you used.
- Guide journey (`journey.js`, `journey.css`): one long scroll from sub-bass to air. A sticky stage holds a live spectrum analyzer and an EQ curve that draws itself as each chapter comes in. Every chapter has a photo or diagram (Wikimedia Commons, credited on the image, see `public/guide/credits.json`) and an A/B player, and playback carries on from chapter to chapter. Motion is GSAP 3.12.5 + ScrollTrigger, vendored in `public/vendor/gsap` and turned off under reduced motion.
- Guide practice (`guide.js`, `synth.js`, `viz.js`): 8 lessons with A/B quizzes on two tracks synthesized in the browser (808 hip-hop and a black-metal blast beat), a hearing-range sweep, a practice EQ you can drag, hardware templates, and a live spectrogram and oscilloscope.

## Motion and scroll

- Lenis 1.1.20 smooth scrolling runs on the GSAP 3.13 ticker (`motion.js`). Both are vendored in `public/vendor`, so the CSP stays `'self'`. Dialogs, knobs and the EQ graphs opt out of smooth wheel (`data-lenis-prevent`).
- Effects are declared in the markup and built the first time a view opens: `data-split` (SplitText masked line reveals), `data-clip` (inset clip-path opening), `data-speed` (parallax), `data-velocity` (skews with scroll speed).
- With `prefers-reduced-motion` all of it is skipped and the timeline stacks vertically.
- There's no global `scroll-behavior: smooth` because ScrollTrigger measures by jumping the scroll position.
- History (`history.js`, `era-gl.js`, `history.css`): a pinned horizontal track with snapping, rail navigation, a rolling year counter and a shader whose wave shape changes from era to era as you scroll. The era photos are from Wikimedia Commons and credited on each image (`public/history/credits.json`).
- Missions (`missions.js`, `widgets.js`, `mission-model.js`): rotary knobs (drag, wheel, keyboard, screen-reader slider), small response plots, live A/B through the guide audio path, and CSS 3D exploded views scrubbed by scroll. `test/missions.test.mjs` covers the crossover maths.
- The coach, journey, history and missions all share the guide audio path, and `engine.state.owner` records which one is playing.

## Store

`#/store` sells 42 products in 8 categories: speakers, headphones, earbuds, IEMs, studio monitors, DACs & amps, audio interfaces, and cables & accessories. It has category chips, a quick view with the full spec sheet on every card, search, sort, favourites, a bag drawer with quantity steppers and a free-shipping meter, product pages, and a demo checkout (the form is validated but no payment is taken). Every headphone page has a Tune it in the Lab button that looks up its AutoEq measurement. The bag and favourites are saved in `localStorage`.

- Data: `public/js/catalog.js` (approximate list prices; ratings are made up for the demo). Logic: `public/js/shop-logic.js` (tested). UI: `public/js/store.js`, `public/store.css`.
- Images: `public/products/*.webp`, 800 px WebP taken from manufacturer pages, RTINGS and retailers. `sources.json` lists where each one came from. I cropped the watermark band off the RTINGS photos.
- Look: VengeanceUI patterns (MIT) ported to plain CSS in `public/vengeance.css`, with a rotating conic glow border, a hover beam and a cursor spotlight on the cards.

## Themes

There are five palettes in `public/styles.css` (`[data-theme=…]`), picked from the top bar and remembered per browser: Obsidian (dark), Ivory (light), Bordeaux (burgundy), Terra (earth tone) and Mist (soft). They all remap the same semantic tokens. The WebGL silk reads `--bg` and `--aura-1..3`, and the graphs read `--plot-1/2`. Every text pair passes WCAG AA and every graph line passes 3:1.

## Audio sources (dock)

- System audio: `getDisplayMedia` with `systemAudio: 'include'`. Pick *Entire screen* and turn on *Share system audio* (Chrome/Edge on Windows; on macOS/Linux share a tab with *Share tab audio*). It's only analysed, never played back.
- Microphone: for phones and anything else. Point it at your speakers.
- Play a file / Pink noise: these play *through* your EQ, so you hear changes as you make them. The EQ switch is a level-matched A/B.

A browser can listen to system audio but can't change it. To hear your tuning in Spotify or games, export it from the Lab and load it into Equalizer APO/Peace (Windows), Wavelet (Android), SoundSource/eqMac (macOS) or EasyEffects (Linux).

## Layout

```
server.mjs            static files + POST /api/advice (rate-limited, 32 KB body cap)
server/advice.mjs     Gemini call; input whitelist, output clamped to ±4 dB / 5 filters
public/js/eq.js       AutoEq index/EQ/CSV parsing, RBJ biquad math, exports   (tested)
public/js/tuner.js    listening analysis + recommendation rules              (tested)
public/js/audio-engine.js  one AudioContext: sources → EQ chain → analysers
public/js/background.js    aurora shader driven by eased bass/mid/high
public/js/lab.js, guide.js, app.js, graph.js, ui.js
```

AutoEq data (MIT) is fetched live from `raw.githubusercontent.com`, so none of it is vendored.
