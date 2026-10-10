# Oura Prototype Builder (Figma plugin)

Builds a clickable Figma prototype of the site on a new page, **Prototype v2**:

- 26 screens at 1440×900: Home · Store (All page 1/2, Studio monitors, In-ear monitors) · Tuning Lab (Default, Dragging band 3, Advanced settings) · Guide (intro + 6 stops) · History (intro + 10 eras)
- 24 product-detail overlays (click any store card)
- 8 component sets with interactive variants: Nav, Button, Chip, Page, Product card (hover), EQ node (hover → press = dragging), Toggle, A/B switch (click flips)
- An "Oura tokens" variable collection (colours and radii, with CSS code syntax)
- Smart Animate between Guide stops and History eras on **click** (Next/Back, rail years) and **drag** (across the graph or photo)

## Run it

1. Open the Figma **desktop app** and any design file (for example *Oura Acoustics — Website Prototype*).
2. Menu → **Plugins → Development → Import plugin from manifest…** and pick `figma-plugin/manifest.json`.
3. Menu → **Plugins → Development → Oura Prototype Builder**. It takes a few seconds and ends with a "Built …" message.
4. Press **Present** (▶). Flows are set up for Full site, Store, Tuning Lab, Guide and History.

Running it again creates "Prototype v2 (2)" instead of touching the first page.

## Edit and rebuild

`src/builder.js` is the plugin logic; `build.mjs` pulls the real catalog, Guide chapters, History eras, EQ curves (computed with `public/js/eq.js`) and photos from the site and writes `code.js` + `manifest.json`.

```bash
node figma-plugin/build.mjs      # regenerate code.js (needs Python + Pillow for the images)
node figma-plugin/mock-run.mjs   # run it against a strict mock of the Figma API
```
