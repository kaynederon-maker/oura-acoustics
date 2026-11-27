# Oura Blueprint v3 (Figma plugin)

Builds the redesign blueprint in any Figma design file:

- **00 · Cover**
- **01 · Design system**: colour tokens as variables with five modes (Obsidian, Ivory, Bordeaux, Terra, Mist), spacing and radius variables, text styles, and components with interactive variants (Button, Lever, Filter chip, History part, Needle drop, Knob)
- **02 · Blueprint**: sitemap, three core user flows, and annotated wireframes on a 12-column grid (Home, Store, Product, Lab, History)
- **03 · Prototype**: 25 screens of the live site with hotspots measured from the real DOM; overlays for quick view, bag, checkout and order; Smart Animate between states; five flows
- **04 · Themes & devices**: every page in all five themes, plus tablet and phone

## Run it

1. Figma **desktop app** → open or create a design file.
2. Menu → Plugins → Development → **Import plugin from manifest…** → `figma-blueprint/manifest.json`.
3. Menu → Plugins → Development → **Oura Blueprint v3**. Screenshots load from this repo on GitHub, so stay online.
4. Open **03 · Prototype** and press **Present**.

Rebuild after changing `src/blueprint.js` or `shots/`: `node figma-blueprint/build.mjs`.
