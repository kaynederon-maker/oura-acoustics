# Oura Prototype Builder (Figma plugin)

Builds a clickable Figma prototype of the site on a new page called Prototype v2. It contains:

- 122 screens at 1440×900:
  - Store: every category chip works (All + 8 categories) and so does every sort (Featured, Price ↑, Price ↓, Top rated). All is split across 6 pages, so there are 56 listing screens in total.
  - 42 product pages (breadcrumb, quantity, Add to bag, favourite, Tune in the Lab, highlights, specs, related products)
  - The shopping flow: click a card → quick view → Add to bag → bag → Checkout → Place order → Order confirmed. The bag and heart in the nav open the bag and favourites.
  - Home · Tuning Lab (Default, Dragging band 3, Advanced settings) · Guide (intro + 6 stops) · History (intro + 10 eras)
- 86 overlays: a quick view and a bag for every product, plus the nav bag and favourites
- A Build report card at the top of the page that lists anything that failed. Each section builds on its own, so one failure doesn't stop the rest.
- 8 component sets with interactive variants: Nav, Button, Chip, Page, Product card (hover), EQ node (hover → press = dragging), Toggle, A/B switch (click flips)
- An "Oura tokens" variable collection (colours and radii, with CSS code syntax)
- Smart Animate between Guide stops and History eras, on click (Next/Back, rail years) and on drag (across the graph or photo)

## Run it

1. Open the Figma desktop app and any design file (for example *Oura Acoustics — Website Prototype*).
2. Menu → Plugins → Development → Import plugin from manifest… and pick `figma-plugin/manifest.json`.
3. Menu → Plugins → Development → Oura Prototype Builder. It takes a few seconds and finishes with a "Built …" message.
4. Press Present (▶). There are flows for Full site, Store, Tuning Lab, Guide and History.

If you run it again it makes "Prototype v2 (2)" and leaves the first page alone.

## Edit and rebuild

`src/builder.js` is the plugin logic. `build.mjs` pulls the real catalog, Guide chapters, History eras, EQ curves (computed with `public/js/eq.js`) and photos from the site and writes `code.js` + `manifest.json`.

```bash
node figma-plugin/build.mjs      # regenerate code.js (needs Python + Pillow for the images)
node figma-plugin/mock-run.mjs   # run it against a strict mock of the Figma API
```
