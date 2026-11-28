# Oura Acoustics

A headphone tuning site that looks like a luxury listening room. The server and the site have no runtime npm
dependencies (plain Node + browser ES modules). The build tools below are dev dependencies only.

```bash
cp .env.example .env   # add GEMINI_API_KEY (optional; rule-based advice works without it)
npm start              # http://localhost:3000
npm test               # maths, store logic, AA contrast for all five themes, image/model/font credits
```

Live prototype: https://kaynederon-maker.github.io/oura-acoustics/ (GitHub Pages, served from the `gh-pages` branch).
Everything runs in the browser except the AI Sommelier, which needs the Node server (`npm start`). To republish after
changing `public/`: `git subtree split --prefix public -b gh-pages && git push -f origin gh-pages`.

My design notes and open questions are in [DESIGN_NOTES.md](DESIGN_NOTES.md), and there are screenshots of every page
in every theme in [`screenshots/`](screenshots).

### Asset pipeline (only needed to rebuild assets)

| Script | What it does | Uses |
| --- | --- | --- |
| `npm run images` | Downloads the photos in `tools/images.json`, refuses anything not CC0 / PD / CC BY / CC BY-SA, grades them into one set and writes AVIF + WebP at 480/960/1600 px plus `public/img/credits.json` | `sharp`, Wikimedia Commons + Openverse APIs (no account) |
| `npm run models` | Builds the 13 3D objects from three.js geometry and writes meshopt-compressed `public/models/*.glb` | `three`, `@gltf-transform/*`, `meshoptimizer` |
| `npm run vendor` | Bundles the tree-shaken three.js module (GLTFLoader, meshopt decoder, RoomEnvironment) to `public/vendor/three/three.js` | `esbuild` |
| `node tools/product-details.mjs` | Cuts two close-ups from each product photo for the hover swap and product galleries | `sharp` |

`node tools/images.mjs search "<query>"` / `ov "<query>"` prints numbered candidates with their licences and writes a
contact sheet. `tools/picks.txt` records which result I picked for each image.

## Pages

| Page | |
| --- | --- |
| Home | The reference in-ear as a 3D object in front of a giant wordmark. Drag to turn it, scroll to take it apart. Behind it there's a masked silk backdrop that reacts to audio, and a strip of listening-room photos |
| Tuning Lab | 1) pick headphones (8,800+ [AutoEq](https://github.com/jaakkopasanen/AutoEq) profiles, or Detect from OS device names) 2) analyze 20 s of system audio / mic 3) hearing check 4) bass/treble taste → recommendations, optional Gemini advice, export to Equalizer APO / Wavelet |
| Tuning Guide | A boost-and-sweep dial, two pro missions (IEM drum monitoring, desk sub crossover) with knobs, scores and exploded hardware, a scroll through the spectrum, 8 practice lessons and a reference handbook |
| History | Ten chapters from 1877 to 2026. Each one is built around a single object drawn as a brass line engraving that comes apart into parts (hover, focus or tap a part for its story), with period photos and a needle-drop player. Its Then/Today switch plays a real recording from the era next to a modern version, usually of the same song (Bessie Smith's St. Louis Blues from 1925 against Herbie Hancock's from 1998, Sgt. Pepper's in 1967 against the 2017 mix) |

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

- three.js 0.187 (bundled, lazy-loaded) renders the shared stage in `stage3d.js`. Home and Store get a physical "lux" look, History gets brass line engravings. It has drag inertia, keyboard turning, part highlighting, and explode offsets read from each .glb.
- Lenis 1.1.20 smooth scrolling runs on the GSAP 3.13 ticker (`motion.js`). Both are vendored in `public/vendor`, so the CSP stays `'self'`. Dialogs, knobs and the EQ graphs opt out of smooth wheel (`data-lenis-prevent`).
- Effects are declared in the markup and built the first time a view opens: `data-split` (SplitText masked line reveals), `data-clip` (inset clip-path opening), `data-speed` (parallax), `data-velocity` (skews with scroll speed).
- With `prefers-reduced-motion` all of it is skipped: no intro or route curtain, History chapters stack with static exploded views, and knobs and rolling digits stop animating.
- There's no global `scroll-behavior: smooth` because ScrollTrigger measures by jumping the scroll position.
- History (`history.js`, `history.css`): vertical chapters, each with a sticky stage that one shared WebGL renderer moves into. Scrolling puts the object together and then takes it apart. You can hover, focus or tap each part to get a leader line and its story, and there's a chapter rail with a rolling year counter. Photos are credited on each image (`public/img/credits.json`).
- Missions (`missions.js`, `widgets.js`, `mission-model.js`): rotary knobs (drag, wheel, keyboard, screen-reader slider), small response plots, live A/B through the guide audio path, and CSS 3D exploded views scrubbed by scroll. `test/missions.test.mjs` covers the crossover maths.
- The coach, journey, history and missions all share the guide audio path, and `engine.state.owner` records which one is playing.

## Store

`#/store` sells 42 products in 8 categories: speakers, headphones, earbuds, IEMs, studio monitors, DACs & amps, audio interfaces, and cables & accessories. It has category chips, a quick view with the full spec sheet on every card, search, sort, favourites, a bag drawer with quantity steppers and a free-shipping meter, product pages, and a demo checkout (the form is validated but no payment is taken). Every headphone page has a Tune it in the Lab button that looks up its AutoEq measurement. The bag and favourites are saved in `localStorage`.

- Data: `public/js/catalog.js` (approximate list prices; ratings are made up for the demo). Logic: `public/js/shop-logic.js` (tested). UI: `public/js/store.js`, `public/store.css`.
- Images: `public/products/*.webp`, 800 px WebP taken from manufacturer pages, RTINGS and retailers. `sources.json` lists where each one came from. I cropped the watermark band off the RTINGS photos.
- Products sit on plinths, with a light sweep and a close-up swap on hover (`public/products/detail/`). The lifestyle tiles and category banners use the credited photo set. Four flagships have interpretive 3D studies and the rest have a photo you can drag to tilt.

## Themes

There are five palettes in `public/styles.css` (`[data-theme=…]`), picked from the top bar and remembered per browser: Obsidian (dark), Ivory (light), Bordeaux (burgundy), Terra (earth tone) and Mist (soft). They all share one brass accent and remap the same semantic tokens. WebGL reads `--bg`, `--accent` and `--aura-1..3`, and the graphs read `--plot-1/2`. `test/contrast.test.mjs` checks that every text pair passes WCAG AA and every graph line passes 3:1.

Fonts are self-hosted OFL (Fraunces, Instrument Sans, Geist Mono) in `public/fonts/`. The interface sounds (needle drop, knob detents, switch clicks) are synthesized and stay muted until you turn on the Sound switch.

## Audio sources (dock)

- System audio: `getDisplayMedia` with `systemAudio: 'include'`. Pick *Entire screen* and turn on *Share system audio* (Chrome/Edge on Windows; on macOS/Linux share a tab with *Share tab audio*). It's only analysed, never played back.
- Microphone: for phones and anything else. Point it at your speakers.
- Play a file / Pink noise: these play *through* your EQ, so you hear changes as you make them. The EQ switch is a level-matched A/B.

A browser can listen to system audio but can't change it. To hear your tuning in Spotify or games, export it from the Lab and load it into Equalizer APO/Peace (Windows), Wavelet (Android), SoundSource/eqMac (macOS) or EasyEffects (Linux).

## Layout

```
server.mjs            static files (brotli/gzip, ETags, cached media) + POST /api/advice (rate-limited, 32 KB body cap)
server/advice.mjs     Gemini call; input whitelist, output clamped to ±4 dB / 5 filters
public/js/eq.js       AutoEq index/EQ/CSV parsing, RBJ biquad math, exports   (tested)
public/js/tuner.js    listening analysis + recommendation rules              (tested)
public/js/audio-engine.js  one AudioContext: sources → EQ chain → analysers
public/js/background.js    aurora shader driven by eased bass/mid/high
public/js/lab.js, guide.js, app.js, graph.js, ui.js
```

AutoEq data (MIT) is fetched live from `raw.githubusercontent.com`, so none of it is vendored.
