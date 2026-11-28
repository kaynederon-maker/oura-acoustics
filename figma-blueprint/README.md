# Oura Blueprint v3 (Figma plugin)

Builds the redesign blueprint in any Figma design file. It makes five pages:

- 00 · Cover
- 01 · Design system: colour tokens as variables with five modes (Obsidian, Ivory, Bordeaux, Terra, Mist), spacing and radius variables, text styles, and components with interactive variants (Button, Lever, Filter chip, History part, Needle drop, Knob)
- 02 · Blueprint: the sitemap, three core user flows, and annotated wireframes on a 12-column grid (Home, Store, Product, Lab, History)
- 03 · Prototype: 29 screens of the live site with hotspots measured from the real DOM. There are overlays for quick view, bag, checkout, order, the Ask Oura assistant and the full-screen photo viewer, screens for the photo inspector and AI Sommelier, Smart Animate between states, and six flows.
- 04 · Themes & devices: every page in all five themes, plus tablet and phone

## Run it

1. Open or create a design file in the Figma desktop app.
2. Menu → Plugins → Development → Import plugin from manifest… → `figma-blueprint/manifest.json`.
3. Menu → Plugins → Development → Oura Blueprint v3. The screenshots load from this repo on GitHub, so you need to be online.
4. Open 03 · Prototype and press Present.

Running it again in the same file replaces the pages, variables and text styles it made last time.

After changing `src/blueprint.js` or `shots/`, rebuild with `node figma-blueprint/build.mjs`.
