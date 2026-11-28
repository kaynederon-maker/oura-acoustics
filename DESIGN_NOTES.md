# Oura Acoustics redesign notes

The brief I set myself: a luxury listening room, like a high-end hi-fi boutique that doesn't take itself too seriously.

## 1. References

### The Watch by 60fps (thewatch.60fps.fr): the luxury feel, used across the site

I went through it end to end in a 1440×900 window.

- One precious object with huge type behind it. The "FS 60P" wordmark runs edge to edge *behind* the watch, and the
  watch always sits in front. On Home I put a giant "OURA" wordmark behind the flagship IEM.
- Tiny copy next to a big object. Their body text is 9–11px in narrow columns, well away from the watch. I use small
  uppercase captions (11–12px, wide tracking) beside the big 3D objects and keep long text short.
- Vertical, rotated type as part of the layout. I use it for era labels and spec captions.
- Soft grey spotlight gradients instead of flat backgrounds, so light falls on the object. Every object (3D, product
  photos, history chapters) gets a radial "plinth light" behind it.
- An exploded side view with hairline leaders and vertical part labels (Dial, Tourbillon, Mainplate…). That became the
  IEM anatomy section on Home and the exploded views in History.
- A calm loader where the object fades in out of grey, with no spinner. Mine is a short brass needle drop.
- Slow easing: long (0.9–1.6 s) expo-out moves, nothing bouncy.

### 35mm by Chakib Mzn (lab.chakibmzn.com/35mm): the storytelling, used only in History

- The object is drawn as lines. Their Canon F-1 is a white wireframe on near-black, and a hovered part fills with the
  one orange accent while its story appears on a leader line. Each of my era objects is a brass line engraving made
  from the edges of the real 3D model. Hover, focus or tap a part and it fills with brass, the rest dims, and the
  story slides in.
- A viewfinder HUD with corner brackets, a running fps/time counter and frame ticks along the bottom. Each chapter
  stage has a camera-style HUD with the chapter counter and a rolling year.
- Mono type for the lore, short chapters ("Timeless craft"), and lists styled like data sheets (Film stock / ISO).
  My facts are mono data rows (Bandwidth / Medium / Capture).
- Parts separate as you scroll and then become hoverable.

## 2. Decisions

- History scrolls as vertical chapters with a sticky stage instead of a horizontal pinned track. The exploded views
  need vertical room to stay readable, and keyboard users can step through parts without a sideways track stealing focus.
- History uses one shared WebGL renderer that moves into whichever chapter is active. Ten live contexts would kill phones.
- History draws the models as line art (edges), and Home and Store use physical materials. The same .glb serves both looks.
- The models are generated in code (`tools/models/*.mjs`, three.js geometry) and exported as meshopt-compressed .glb
  with gltf-transform. I don't have Blender on this machine, and building them in code keeps every part named for
  the exploded views.
- Materials are assigned at runtime from each part's material name (brass, steel, chrome, lacquer, resin, glass,
  walnut, velour, rubber, paper…) as MeshPhysicalMaterial presets with clearcoat, sheen and transmission. There are no
  texture maps because the generated meshes have no UVs, and the physical presets already look like metal and lacquer
  under the room lighting.
- Lighting comes from three.js RoomEnvironment (procedural, 0 KB) instead of a downloaded HDRI. Reflections stay soft
  and neutral, which fits the gallery look.
- The WebGL silk only survives as a quiet, masked backdrop on Home (bottom half, low intensity, paused on other pages).
  That way pressing System audio still makes the page move, but it doesn't fight the hero object. The brass ring
  around the hero also breathes with the bass. I dropped the old History wave shader (`era-gl.js`) once the
  line-drawn stage took over.
- I removed the VengeanceUI glow and beam (`vengeance.css` is gone) and used hairline borders, a slow light sweep on
  hover and a small lift with a long soft shadow instead.
- Fonts: Fraunces for display (light optical sizes), Instrument Sans for UI and Geist Mono for data. All are OFL and
  self-hosted. Geist felt like a SaaS dashboard, and Instrument Sans is narrower and sits better next to Fraunces.
- All five themes share one brass accent, tuned per theme for AA contrast. Each theme gets its own character from
  the background, surface and graph colours.
- The sounds (needle drop, knob detent, toggle click) are synthesized with Web Audio. They're muted by default, and
  the sound switch in the top bar remembers your choice.
- Photos are graded at build time (a little less saturation, lifted blacks, a warm cast) and tinted per theme in CSS
  (`.photo` overlay) with a shared grain layer, so pictures from different archives look like one set.

## 3. Tokens

- Type scale (1.25 minor third, clamped): 11 / 12 / 13 / 15 / 17 / 21 / 27 / 34 / 48 / 72 / 112 / 180.
- Spacing (8-pt): 4 8 12 16 24 32 48 64 96 128 192.
- Radii: 2 (hairline chips), 6 (controls), 14 (panels), 999 (pills, used sparingly).
- Easing: `--ease-lux: cubic-bezier(0.16, 1, 0.3, 1)` (expo-out), `--ease-glide: cubic-bezier(0.65, 0, 0.35, 1)`.
  Durations: 240 ms (UI), 700 ms (reveals), 1200–1600 ms (camera and chapter moves).
- Lines: 1px hairlines at 12–14% of the text colour, and brass hairlines (`--brass-line`) for active states.

## 4. History chapters (ten eras, one object each)

| # | Year · place | Object (parts) |
|---|---|---|
| 1 | 1877 · Menlo Park | Tinfoil phonograph: mouthpiece, diaphragm & stylus, tinfoil cylinder, feed screw & crank, cast base |
| 2 | 1925 · Camden | RCA 44 ribbon mic: grille, aluminium ribbon, magnet frame, yoke, output transformer |
| 3 | 1948 · New York | LP turntable: microgroove record, platter, tonearm, cartridge & stylus, plinth |
| 4 | 1967 · Abbey Road | Four-track tape machine: reels, head block, capstan & pinch roller, VU meters, transport deck |
| 5 | 1982 · Tokyo | Compact disc: label lacquer, aluminium pit layer, polycarbonate, laser pickup, spindle |
| 6 | 1991 · London | Fuzz pedal: enclosure, knobs, circuit board, footswitch, battery |
| 7 | 2001 · Cupertino | iPod: click wheel, screen, 1.8" hard drive, battery, chrome back |
| 8 | 2013 · San Francisco | Valve amp head: chassis, preamp valves, power valves, output transformer, speaker |
| 9 | 2016 · Atlanta | TR-808: case, step keys, voice knobs, bass-drum circuit, tempo dial |
| 10 | 2026 · Everywhere | Flagship IEM: faceplate, shell, dynamic driver, balanced armatures, nozzle & tip |

Each chapter opens with a huge year, a place line, a lead and a backdrop photo. Then comes the sticky stage, where
the object comes together and then apart and its parts become hoverable. After that there's the lore with photos and
facts, and a brass Then/Today toggle with a needle-drop play button. Chapter 10 ends in the Tuning Lab.

The toggle plays real music. Then is a recording from the era and Today is a modern version, the same song where I
could find one (`public/js/history-songs.js` has the list). The audio is Apple Music's 30-second previews, streamed
and credited with a link, so no copyrighted files live in the repo. The only local file is Edison reciting "Mary
Had a Little Lamb", which is public domain (`public/audio/credits.json`). If the previews can't load, the player
falls back to the old synthesized loop played through the era's EQ. Chapter 10 plays one modern song, flat or
with your Lab tuning.

## 5. Images and assets

The manifest is `tools/images.json` (Wikimedia Commons, Library of Congress, Openverse/Flickr CC).
`npm run images` downloads and grades them and writes AVIF + WebP at 480/960/1600 px to `public/img/`, plus
`public/img/credits.json` (title, author, licence, source). Every image shows its credit.

`npm run models` writes `public/models/*.glb` (meshopt). Fonts live in `public/fonts/`.

## 6. Still open

- The product photos (`public/products/*.webp` and the detail crops made from them) are manufacturer, RTINGS and
  retailer images (see `products/sources.json`). They aren't freely licensed. That's fine for a private prototype,
  but I need permission or press-kit images before this goes public.
- Unsplash and Pexels need an API key to search, so I didn't pull anything from them directly. Commons and Openverse
  (Flickr CC) covered every slot, and a few of the Commons files are Unsplash/Pixabay uploads under CC0.
- The 3D studies are my own interpretations built in code, and the product pages label them "Interpretive 3D study".
  Real manufacturer CAD would need permission from each brand.
- I wrote the History facts short and haven't checked them against primary sources yet. The part stories and the
  dates in chapters 2 and 9 need a second look before publishing.
- The Gemini key for the AI Sommelier is optional (`.env`).

## 7. What changed in the redesign

- Design system: new tokens (type scale, 8-pt spacing, radii, easing), five themes with one brass accent,
  self-hosted Fraunces + Instrument Sans + Geist Mono, hairline panels, light sweeps and brass lever switches.
  VengeanceUI is gone.
- Motion: an intro loader (once per session, skippable, skipped under reduced motion), a route curtain with a brass
  hairline, a brass cursor ring with Drag / View / Play states, and synthesized interface sounds (muted by default).
- Assets: 75 freely licensed photos graded into one set (AVIF + WebP, 3 sizes, credits on every image), 13 procedural
  3D models (meshopt .glb, 25–410 KB) and a tree-shaken three.js (150 KB brotli) that loads lazily.
- History: ten chapters, each with a big opener, a sticky line-engraving stage that comes apart (hover, focus or tap a
  part for its story, arrow keys to turn), a photo mosaic, a needle-drop player and a brass Then/Today switch, plus a
  chapter rail and rolling year. The last chapter leads into the Lab.
- Home: the reference IEM in front of a giant wordmark. Scrolling takes it apart with spec labels. Below that are the
  promises list, the listening-room photo strip and photo teasers for each page.
- Store: plinths, gallery paper, a close-up swap and light sweep on hover, one large featured tile, lifestyle tiles,
  category banners, 3D studies for four flagships, a tilt turntable for the rest, engraved specs, a brass "Tune it in
  the Lab" plate, and a quieter bag and checkout.
- Lab and Guide: a brushed faceplate with a recessed graph, a brass curve and nodes, smoother redraws, fading overlays,
  a hinged Advanced panel, a guided-setup rail, and machined knobs with inertia, detents and rolling values.
- Server: brotli/gzip, ETags and week-long caching for media. I also fixed static `.json` files being sent as an
  encoded Buffer.

## 8. Testing

- `npm test`: 49 passing (the original 36, plus 10 contrast checks across all themes and 3 credit/licence checks).
- Browser: every route in all five themes at desktop 1440, tablet 834 and phone 390, with no console errors or
  warnings, no failed requests and no horizontal overflow. Screenshots are in `/screenshots`.
- End to end: PEQ add / keyboard / undo, templates, Advanced, all three exports, lessons, A/B, needle drop and
  Then/Today, store search / category / sort / favourites, quick view, product views, checkout validation and order.
- Lighthouse (desktop): Home, History, Store and Lab all score 100 for Accessibility, Best Practices and SEO.
- Performance trace on Home with 4x CPU slowdown and Fast 4G: LCP 759 ms, CLS 0.00.
- Reduced motion: the intro and curtain are skipped, History stacks with static exploded views, and the knobs and
  drums stop animating.

## 9. Known issues

- Eight stylesheets block rendering. Merging them would speed up first paint a little, though LCP is already under 0.8 s.
- Every photo credit is a link, so keyboard users have to tab through several credits in photo-heavy sections.
- The 3D models are stylised studies. Up close they look like clean renders, not photographs.
