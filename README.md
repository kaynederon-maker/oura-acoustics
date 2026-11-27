# Oura Acoustics

A headphone tuning site dressed as a luxury listening room. The server and the site have no runtime npm
dependencies (plain Node + browser ES modules); the build tools below are dev dependencies only.

```bash
cp .env.example .env   # add GEMINI_API_KEY (optional; rule-based advice works without it)
npm start              # http://localhost:3000
npm test               # maths, store logic, AA contrast for all five themes, image/model/font credits
```

**Live prototype:** https://kaynederon-maker.github.io/oura-acoustics/ (GitHub Pages, served from the `gh-pages` branch).
Everything runs in the browser except the AI Sommelier, which needs the Node server (`npm start`). To republish after
changing `public/`: `git subtree split --prefix public -b gh-pages && git push -f origin gh-pages`.

Design direction, decisions, validation results and open questions: [DESIGN_NOTES.md](DESIGN_NOTES.md).
Screenshots of every page in every theme: [`screenshots/`](screenshots).

### Asset pipeline (dev dependencies, only needed to rebuild assets)

| Script | What it does | Uses |
| --- | --- | --- |
| `npm run images` | Downloads the photos in `tools/images.json`, refuses anything not CC0 / PD / CC BY / CC BY-SA, grades them into one set and writes AVIF + WebP at 480/960/1600 px plus `public/img/credits.json` | `sharp`, Wikimedia Commons + Openverse APIs (no account) |
| `npm run models` | Builds the 13 3D objects from three.js geometry and writes meshopt-compressed `public/models/*.glb` | `three`, `@gltf-transform/*`, `meshoptimizer` |
| `npm run vendor` | Bundles the tree-shaken three.js module (GLTFLoader, meshopt decoder, RoomEnvironment) to `public/vendor/three/three.js` | `esbuild` |
| `node tools/product-details.mjs` | Two focal close-ups per product photo for hover swaps and product galleries | `sharp` |

`node tools/images.mjs search "<query>"` / `ov "<query>"` prints numbered candidates with licences and writes a
contact sheet; `tools/picks.txt` records which result was chosen for every image.

## What it does

| Page | |
| --- | --- |
| Home | The reference in-ear as a 3D gallery piece in front of a giant wordmark: drag to turn, scroll to take it apart; a masked, audio-reactive silk backdrop; listening-room photo strip |
| Tuning Lab | 1) pick headphones (8,800+ [AutoEq](https://github.com/jaakkopasanen/AutoEq) profiles, or **Detect** from OS device names) 2) analyze 20 s of system audio / mic 3) hearing check 4) bass/treble taste → recommendations, optional Gemini advice, export to Equalizer APO / Wavelet |
| Tuning Guide | Hands-on: boost-and-sweep dial, two pro missions (IEM drum monitoring, desk sub crossover) with knobs, scores and exploded hardware, a scroll journey through the spectrum, 8 practice lessons, and a reference handbook |
| History | Ten chapters, 1877 to 2026, each built around one object drawn as a brass line engraving that separates into parts (hover, focus or tap for the story); period photos; a needle-drop player and Then/Today switch to hear each era |

## Studio (Tuning Lab + Guide)

- **Parametric EQ** (`peq.js`, `peq-state.js`, `peq-panel.js`): peak, shelf, high/low-pass (12/24 dB/oct), notch and all-pass bands; undo/redo; AutoEq correction layer; Harman target overlays; phase view.
- **Interactive graph** (`peq-graph.js`, D3 7.9 vendored in `public/vendor`): drag nodes (frequency/gain), scroll for Q, double-click to add, full keyboard control, snapping with haptics on phones. The graph and the audio run the same RBJ biquad maths (`eq.js`); custom-Q shelves use `IIRFilterNode`, so the curve is exact.
- **Crossover + time & phase**: Linkwitz-Riley LR2/LR4/LR8 sub crossover with gain, delay and polarity; per-channel delay/polarity; distance→delay helper; all-pass filters. The graph shows the acoustic sum.
- **Exports**: full Equalizer APO config (crossover routed to `SUB`, delays, polarity), AutoEq ParametricEQ, GraphicEQ.
- **Hardware push**: [devicePEQ](https://github.com/jeromeof/devicePEQ) (0BSD, vendored) over WebHID / Web Serial / Web Bluetooth in desktop Chrome or Edge. Its UI needs `style-src 'unsafe-inline'`; scripts stay `'self'`-only.
- **Simple / Advanced**: the Lab opens in a beginner mode (drag nodes, frequency and gain). The *Advanced settings* switch reveals filter type, Q, slope, phase, crossover and time alignment; the choice is remembered.
- **Guide journey** (`journey.js`, `journey.css`): a long scroll from sub-bass to air. A sticky stage holds a live spectrum analyzer and an EQ curve that draws itself as each chapter scrolls in; every chapter has a photo or diagram (Wikimedia Commons, credited on the image; see `public/guide/credits.json`) and an inline A/B player. Motion is GSAP 3.12.5 + ScrollTrigger, vendored in `public/vendor/gsap` and disabled under reduced motion. Playback follows you from chapter to chapter.
- **Guide practice** (`guide.js`, `synth.js`, `viz.js`): 8 lessons with A/B quizzes on two tracks synthesized in the browser (808 hip-hop, black-metal blast beat), a hearing-range sweep, a draggable practice EQ and hardware templates; live spectrogram and oscilloscope.

## Motion and scroll

- **three.js 0.187** (bundled, lazy-loaded) renders the shared stage in `stage3d.js`: a physical "lux" look (Home, Store) and a brass line-engraving look (History), with drag inertia, keyboard turning, part highlighting and explode offsets read from each .glb.
- **Lenis 1.1.20** smooth scrolling driven by the **GSAP 3.13** ticker (`motion.js`); both vendored in `public/vendor`, CSP stays `'self'`. Dialogs, knobs and the EQ graphs opt out of smooth wheel (`data-lenis-prevent`).
- Declarative effects, built the first time a view is shown: `data-split` (SplitText masked line reveals), `data-clip` (inset clip-path opening), `data-speed` (parallax), `data-velocity` (skews with scroll speed).
- Everything is skipped under `prefers-reduced-motion`: no intro or route curtain, History chapters stack with static exploded views, knobs and rolling digits stop animating.
- No global `scroll-behavior: smooth`: ScrollTrigger measures by jumping the scroll position.
- **History** (`history.js`, `history.css`): vertical chapters, each with a sticky stage that one shared WebGL renderer moves into; scroll assembles then separates the object, parts are hoverable / focusable / tappable with a leader line to the part, a chapter rail and a rolling year counter. Photos are credited on each image (`public/img/credits.json`).
- **Missions** (`missions.js`, `widgets.js`, `mission-model.js`): rotary knobs (drag, wheel, keyboard, screen-reader slider), mini response plots, live A/B through the guide audio path, and CSS 3D exploded views scrubbed by scroll. The crossover maths is tested in `test/missions.test.mjs`.
- The guide audio path is shared by the coach, journey, history and missions; `engine.state.owner` records which one is playing.

## Store

`#/store` sells 42 products in 8 categories (speakers, headphones, earbuds, IEMs, studio monitors, DACs & amps, audio interfaces, cables & accessories): category chips, a **quick view** dialog with the full spec sheet on every card, search, sort, favourites, a bag drawer with quantity steppers and a free-shipping meter, product pages, and a demo checkout (validated form, no payment taken). Every headphone page has **Tune it in the Lab**, which searches its AutoEq measurement. Bag and favourites persist in `localStorage`.

- Data: `public/js/catalog.js` (approximate list prices; ratings are demo data). Logic: `public/js/shop-logic.js` (tested). UI: `public/js/store.js`, `public/store.css`.
- Images: `public/products/*.webp`, 800 px WebP pulled from manufacturer pages, RTINGS and retailers; `sources.json` records where each came from. RTINGS photos have their watermark band cropped.
- Look: products sit on plinths with a light sweep and a detail-shot swap on hover (`public/products/detail/`); editorial lifestyle tiles and category banners use the credited photo set; four flagships have interpretive 3D studies, the rest a drag-to-tilt photo turntable.

## Themes

Five palettes in `public/styles.css` (`[data-theme=…]`), picked from the top bar and remembered per browser: **Obsidian** (dark), **Ivory** (light), **Bordeaux** (burgundy), **Terra** (earth tone), **Mist** (soft). All share one brass accent. Each remaps the same semantic tokens; WebGL reads `--bg`, `--accent` and `--aura-1..3`, graphs read `--plot-1/2`. `test/contrast.test.mjs` checks that every text pair passes WCAG AA and graph lines pass 3:1.

Fonts are self-hosted OFL (Fraunces, Instrument Sans, Geist Mono) in `public/fonts/`. Interface sounds (needle drop, knob detents, switch clicks) are synthesized and muted until the **Sound** switch is turned on.

## Audio sources (dock)

- **System audio**: `getDisplayMedia` with `systemAudio: 'include'`. Pick *Entire screen* and turn on *Share system audio* (Chrome/Edge on Windows; on macOS/Linux share a tab with *Share tab audio*). Analysed only, never played back.
- **Microphone**: phones and anything else; point it at your speakers.
- **Play a file / Pink noise**: played *through* your EQ, so you hear changes live. The EQ switch is a level-matched A/B.

A browser can listen to system audio but cannot change it. To hear the tuning in Spotify and games, export it from the Lab and load it into Equalizer APO/Peace (Windows), Wavelet (Android), SoundSource/eqMac (macOS) or EasyEffects (Linux).

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

AutoEq data (MIT) is fetched live from `raw.githubusercontent.com`; nothing is vendored.
