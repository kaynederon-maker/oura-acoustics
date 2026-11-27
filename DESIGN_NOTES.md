# Oura Acoustics — redesign notes

Working brief: "luxury listening room". A high-end hi-fi boutique with a sense of humour.
Built on the `redesign` branch, one commit per phase.

## 1. What we take from the references

### The Watch by 60fps (thewatch.60fps.fr) → the luxury layer, site-wide
Studied in a 1440×900 browser, scrolled end to end.
- **One precious object, huge type behind it.** The "FS 60P" wordmark runs edge to edge *behind* the watch;
  the object always wins the depth fight. → Home hero: a giant "OURA" wordmark behind the flagship IEM.
- **Tiny refined copy next to a big object.** Body copy sits at 9–11px in narrow columns, far from the object.
  → small uppercase captions (11–12px, wide tracking) beside large 3D objects; long text stays short.
- **Vertical, rotated type** used as a structural element. → vertical era labels and spec captions.
- **Soft grey spotlight gradients** instead of flat backgrounds; light falls on the object. → radial "plinth light"
  behind every object (3D, product photos, history chapters).
- **Exploded side view with hairline leaders and vertical part labels** (Dial, Tourbillon, Mainplate…).
  → the IEM hero's "anatomy" section and the History exploded views.
- **Calm loader**: the object fades in out of grey, no spinner. → a short brass "needle drop" loader.
- **Slow, confident easing**: long (0.9–1.6 s) expo-out moves, nothing bouncy.

### 35mm by Chakib Mzn (lab.chakibmzn.com/35mm) → the storytelling layer, History only
- **The object drawn as lines.** The Canon F-1 is a white wireframe on near-black; a hovered part fills with the
  single orange accent and its story appears with a leader line. → every era object is a **brass line engraving**
  (edges of the real 3D model). Hover / focus / tap a part: it fills with brass, the rest dims, the story slides in.
- **Viewfinder HUD**: corner brackets, a running fps/time counter, frame ticks along the bottom.
  → a camera-style HUD around each chapter stage, with the chapter counter and a rolling year.
- **Mono type for the lore**, short chapters ("Timeless craft"), lists styled like data sheets (Film stock / ISO).
  → facts as data rows (Bandwidth / Medium / Capture) in mono.
- **Tactile reveals**: parts separate as you scroll, then become hoverable.

## 2. Key decisions (one line each)
- **History scroll = vertical chapters with a sticky stage**, not horizontal pinning: exploded views need room
  to separate vertically and stay readable, and keyboard users can step through parts without a sideways track fighting focus.
- **One shared WebGL renderer for History**, moved into whichever chapter is active: ten live contexts would kill phones.
- **Line-art (edges) rendering in History, physical materials on Home/Store**: the same .glb serves both looks.
- **Models are generated in code** (`tools/models/*.mjs`, three.js geometry) and exported as meshopt-compressed .glb
  with gltf-transform: no Blender on this machine, and code keeps every part named for the exploded views.
- **Materials are assigned at runtime by part material name** (brass, steel, chrome, lacquer, resin, glass, walnut,
  velour, rubber, paper…) as MeshPhysicalMaterial presets with clearcoat, sheen and transmission. No texture maps:
  the generated meshes carry no UVs, and physical presets under the room environment read as metal and lacquer without them.
- **Environment lighting uses three.js RoomEnvironment** (procedural, 0 KB) instead of a downloaded HDRI: product
  reflections stay soft and neutral, which suits the gallery look.
- **WebGL silk kept only as a quiet, masked backdrop on Home** (bottom half, low intensity, paused on other pages)
  so the "press System audio and the page moves" feature survives without competing with the hero object. The hero's
  brass ring also breathes with the bass. The History wave shader (`era-gl.js`) is retired: the line-drawn stage replaced it.
- **VengeanceUI glow/beam removed** (`vengeance.css` deleted). Replaced by hairline borders, a slow light sweep on
  hover and a gentle lift with a long soft shadow.
- **Fonts**: Fraunces (display, light optical sizes) + Instrument Sans (UI) + Geist Mono (data). All OFL, self-hosted.
  Geist felt like a SaaS dashboard; Instrument Sans is narrower and more editorial next to Fraunces.
- **One accent across all five themes: brass**, tuned per theme for AA contrast. Each theme keeps its own
  character through background, surface and graph colours.
- **Sounds are synthesized** (Web Audio): needle drop, knob detent, toggle click. Muted by default; a sound
  switch in the top bar remembers the choice.
- **Photos are graded at build time** (slight desaturation, lifted blacks, warm cast) and tinted per theme in CSS
  (`.photo` overlay), with a shared grain layer, so photos from different archives read as one set.

## 3. Tokens
- Type scale (1.25 minor third, clamped): 11 / 12 / 13 / 15 / 17 / 21 / 27 / 34 / 48 / 72 / 112 / 180.
- Spacing (8-pt): 4 8 12 16 24 32 48 64 96 128 192.
- Radii: 2 (hairline chips), 6 (controls), 14 (panels), 999 (pills used sparingly).
- Easing: `--ease-lux: cubic-bezier(0.16, 1, 0.3, 1)` (expo-out), `--ease-glide: cubic-bezier(0.65, 0, 0.35, 1)`.
  Durations: 240 ms (UI), 700 ms (reveals), 1200–1600 ms (camera / chapter moves).
- Lines: 1px hairlines at 12–14% of text colour; brass hairlines (`--brass-line`) for active states.

## 4. History chapter plan (ten eras, one hero object each)
| # | Year · place | Hero object (parts) |
|---|---|---|
| 1 | 1877 · Menlo Park | Tinfoil phonograph — mouthpiece, diaphragm & stylus, tinfoil cylinder, feed screw & crank, cast base |
| 2 | 1925 · Camden | RCA 44 ribbon mic — grille, aluminium ribbon, magnet frame, yoke, output transformer |
| 3 | 1948 · New York | LP turntable — microgroove record, platter, tonearm, cartridge & stylus, plinth |
| 4 | 1967 · Abbey Road | Four-track tape machine — reels, head block, capstan & pinch roller, VU meters, transport deck |
| 5 | 1982 · Tokyo | Compact disc — label lacquer, aluminium pit layer, polycarbonate, laser pickup, spindle |
| 6 | 1991 · London | Fuzz pedal — enclosure, knobs, circuit board, footswitch, battery |
| 7 | 2001 · Cupertino | iPod — click wheel, screen, 1.8" hard drive, battery, chrome back |
| 8 | 2013 · San Francisco | Valve amp head — chassis, preamp valves, power valves, output transformer, speaker |
| 9 | 2016 · Atlanta | TR-808 — case, step keys, voice knobs, bass-drum circuit, tempo dial |
| 10 | 2026 · Everywhere | Flagship IEM — faceplate, shell, dynamic driver, balanced armatures, nozzle & tip |

Each chapter: cinematic opener (huge year, place line, lead, backdrop photo) → sticky stage where the object
assembles, then separates; parts become hoverable → lore with a photo set and facts → a brass A/B toggle
("Then / Today") with a needle-drop play button. Chapter 10 ends in the Tuning Lab.

## 5. Image and asset list
Manifest: `tools/images.json` (Wikimedia Commons, Library of Congress, Openverse/Flickr CC).
`npm run images` downloads, grades and writes AVIF + WebP at 480/960/1600 px to `public/img/`, plus
`public/img/credits.json` (title, author, licence, source). Credits show on every image.

Models: `npm run models` writes `public/models/*.glb` (meshopt). Fonts: `public/fonts/`.

## 6. Needs Kayne
- **Product photos** (`public/products/*.webp` and the detail crops made from them) are the catalogue's existing
  manufacturer, RTINGS and retailer images (see `products/sources.json`). They are not freely licensed: fine for a
  private prototype, but get permission or use press-kit images before this goes public.
- **Unsplash / Pexels** need an API key to search, so nothing was fetched from them directly. Commons and Openverse
  (Flickr CC) covered every slot; a few Commons files are Unsplash/Pixabay uploads under CC0.
- **3D studies** are interpretive models generated in code, labelled "Interpretive 3D study" on product pages. Real
  manufacturer CAD would need permission from each brand.
- **History facts** were written short and checked against general knowledge, not against primary sources. Worth a
  read before publishing (e.g. part stories, dates in chapters 2 and 9).
- **Gemini key** for the AI Sommelier is still optional (`.env`); nothing changed there.
- The untracked `Figma/` folder was left alone.

## 7. Summary (end of the redesign)

### What changed
- **System**: new tokens (type scale, 8-pt spacing, radii, easing), five themes sharing one brass accent, self-hosted
  Fraunces + Instrument Sans + Geist Mono, hairline panels, light sweeps, brass lever switches. VengeanceUI removed.
- **Motion**: intro loader (once per session, skippable, skipped under reduced motion), route curtain with a brass
  hairline, brass cursor ring with Drag / View / Play states, synthesized interface sounds (muted by default).
- **Assets**: 75 freely licensed photos graded into one set (AVIF + WebP, 3 sizes, credits on every image);
  13 procedural 3D models (meshopt .glb, 25–410 KB); tree-shaken three.js (150 KB brotli), lazy-loaded.
- **History**: ten chapters, each with a cinematic opener, a sticky line-engraving stage that separates into parts
  (hover / focus / tap for the story, arrow keys to turn), a photo mosaic, a needle-drop player and a brass Then/Today
  switch. Chapter rail and rolling year. The last chapter leads into the Lab.
- **Home**: the reference IEM as a gallery piece in front of a giant wordmark; scroll takes it apart with spec labels.
  Editorial promises list, "listening room" photo strip, photo-led teasers.
- **Store**: plinths, gallery paper, detail-shot swap and light sweep on hover, featured large tile, editorial
  lifestyle tiles, category banners, 3D studies for four flagships, tilt turntable for the rest, engraved specs,
  brass "Tune it in the Lab" plate, calm bag and checkout.
- **Lab & Guide**: brushed faceplate with recessed graph, brass curve and nodes, gliding redraws, fading overlays,
  hinged Advanced panel, guided-setup rail, machined knobs with inertia, detents and rolling values.
- **Server**: brotli/gzip, ETags, week-long caching for media; fixed static `.json` being served as an encoded Buffer.

### Key decisions
See section 2. History is vertical-chaptered with one shared WebGL stage; everything else stays quick and practical.

### Validation results
- `npm test`: 49 passing (36 original + 10 contrast across all themes + 3 credits/licence checks).
- Browser: every route in all five themes, desktop 1440, tablet 834, phone 390: no console errors or warnings, no
  failed requests, no horizontal overflow. Screenshots in `/screenshots`.
- End to end: PEQ add / keyboard / undo, templates, Advanced, all three exports, lessons, A/B, needle drop and
  Then/Today, store search / category / sort / favourites, quick view, product views, checkout validation and order.
- Lighthouse (desktop): Home, History, Store, Lab all 100 for Accessibility, Best Practices and SEO.
- Performance trace, Home with 4x CPU slowdown + Fast 4G: LCP 759 ms, CLS 0.00.
- Reduced motion: intro and curtain skipped, History stacks with static exploded views, knobs and drums stop animating.

### Known issues
- Eight stylesheets are render-blocking; merging them would trim first paint a little (LCP is already under 0.8 s).
- Each photo credit is a link, so keyboard users tab through several credits on photo-heavy sections.
- The 3D models are stylised studies; close up they read as clean renders, not photographs.
