// Oura Prototype Builder: runs inside Figma (Plugin API) and builds "Prototype v2":
// tokens, interactive components, 1440x900 screens for Home, Store (paginated + filtered,
// product overlays), Tuning Lab (default / dragging / advanced), Guide and History
// (frame-by-frame with Smart Animate on click and drag), and every prototype link.
// DATA and IMAGES are injected above this file by build.mjs.

const W = 1440;
const H = 900;
const GAP = 200; // between screens on the canvas
const ROW_H = H + GAP + 120;

// ---------- small utilities ----------

const hex = (h, a) => {
  const n = parseInt(h.slice(1), 16);
  const c = { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  return a === undefined ? c : { ...c, a };
};
const money = (v) => `$${v.toFixed(2)}`;
const fmtHz = (f) => (f >= 1000 ? `${String(+(f / 1000).toFixed(2))} kHz` : `${Math.round(f)} Hz`);
const signed = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const pad2 = (n) => String(n).padStart(2, '0');
const smart = (ms = 500) => ({ type: 'SMART_ANIMATE', easing: { type: 'EASE_IN_AND_OUT' }, duration: ms / 1000 });
const dissolve = (ms = 300) => ({ type: 'DISSOLVE', easing: { type: 'EASE_OUT' }, duration: ms / 1000 });
const nav = (dest, transition = dissolve()) => ({ type: 'NODE', destinationId: dest.id, navigation: 'NAVIGATE', transition, resetScrollPosition: true });
const changeTo = (variantNode, ms = 200) => ({ type: 'NODE', destinationId: variantNode.id, navigation: 'CHANGE_TO', transition: smart(ms) });
const on = (type, ...actions) => ({ trigger: { type }, actions });

// ---------- fonts ----------

const FONT = {
  display: { family: 'Fraunces', style: 'SemiBold' },
  displayItalic: { family: 'Fraunces', style: 'SemiBold Italic' },
  ui: { family: 'Geist', style: 'Regular' },
  uiMed: { family: 'Geist', style: 'Medium' },
  uiSemi: { family: 'Geist', style: 'SemiBold' },
  mono: { family: 'Geist Mono', style: 'Regular' },
};
const FALLBACK = {
  display: { family: 'Inter', style: 'Semi Bold' },
  displayItalic: { family: 'Inter', style: 'Semi Bold Italic' },
  ui: { family: 'Inter', style: 'Regular' },
  uiMed: { family: 'Inter', style: 'Medium' },
  uiSemi: { family: 'Inter', style: 'Semi Bold' },
  mono: { family: 'Inter', style: 'Regular' },
};
async function loadFonts() {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  const missing = [];
  for (const key of Object.keys(FONT)) {
    try {
      await figma.loadFontAsync(FONT[key]);
    } catch (err) {
      missing.push(`${FONT[key].family} ${FONT[key].style}`);
      FONT[key] = FALLBACK[key];
      await figma.loadFontAsync(FONT[key]);
    }
  }
  return missing;
}

// ---------- tokens ----------

// Every paint carries the real colour; the variable binding is layered on top. If binding fails
// (older Figma, permissions), the design still renders correctly instead of turning black.
const TOKENS = {
  bg: '#0c0b0a', surface: '#161412', 'surface-2': '#1e1b18', well: '#110f0e', hairline: '#2a2724',
  'text-hi': '#f3eee6', 'text-lo': '#a89f93', accent: '#e3c58e', 'accent-ink': '#1a1408',
  'plot-1': '#e0708f', 'plot-2': '#3fb8a8',
};
const RADII = { sm: 12, md: 18, lg: 28 };
const V = {};
async function makeTokens() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let coll = collections.find((c) => c.name === 'Oura tokens');
  if (!coll) coll = figma.variables.createVariableCollection('Oura tokens');
  const mode = coll.modes[0].modeId;
  coll.renameMode(mode, 'Dark');
  const existing = await figma.variables.getLocalVariablesAsync();
  const fills = ['FRAME_FILL', 'SHAPE_FILL'];
  const scopes = {
    bg: fills, surface: fills, 'surface-2': fills, well: fills,
    hairline: ['STROKE_COLOR', 'FRAME_FILL', 'SHAPE_FILL'], 'text-hi': ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'], 'text-lo': ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'],
    accent: ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR'], 'accent-ink': ['TEXT_FILL', 'SHAPE_FILL'],
    'plot-1': ['STROKE_COLOR', 'SHAPE_FILL', 'FRAME_FILL', 'TEXT_FILL'], 'plot-2': ['STROKE_COLOR', 'SHAPE_FILL', 'FRAME_FILL', 'TEXT_FILL'],
  };
  const make = (name, type, value, sc, css) => {
    let v = existing.find((x) => x.name === name && x.variableCollectionId === coll.id);
    if (!v) v = figma.variables.createVariable(name, coll, type);
    v.setValueForMode(mode, value);
    v.scopes = sc;
    v.setVariableCodeSyntax('WEB', `var(${css})`);
    V[name] = v;
  };
  for (const [k, value] of Object.entries(TOKENS)) make(`color/${k}`, 'COLOR', hex(value), scopes[k], `--${k}`);
  for (const [k, value] of Object.entries(RADII)) make(`radius/${k}`, 'FLOAT', value, ['CORNER_RADIUS'], `--radius-${k}`);
}
const paint = (name, opacity) => {
  let p = { type: 'SOLID', color: hex(TOKENS[name]) };
  const v = V[`color/${name}`];
  if (v) {
    try { p = figma.variables.setBoundVariableForPaint(p, 'color', v); } catch (err) { /* keep the raw colour */ }
  }
  return opacity === undefined ? p : Object.assign({}, p, { opacity });
};
const radius = (node, name) => {
  node.cornerRadius = RADII[name];
  const v = V[`radius/${name}`];
  if (!v) return;
  try {
    for (const corner of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) node.setBoundVariable(corner, v);
  } catch (err) { /* keep the raw radius */ }
};
const clear = () => [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0 }];

// ---------- build report: one failing link or section never empties the rest ----------

const REPORT = { ok: [], errors: [], links: 0, linkErrors: 0 };
async function step(name, fn) {
  try {
    await fn();
    REPORT.ok.push(name);
  } catch (err) {
    REPORT.errors.push(`${name}: ${err && err.message ? err.message : err}`);
  }
}
async function react(node, reactions) {
  if (!node) return;
  try {
    await node.setReactionsAsync(reactions);
    REPORT.links += reactions.length;
  } catch (err) {
    REPORT.linkErrors++;
    if (REPORT.errors.length < 30) REPORT.errors.push(`link on "${node.name}": ${err && err.message ? err.message : err}`);
  }
}

// ---------- images ----------

const imageHashes = {};
function imagePaint(key) {
  if (!IMAGES[key]) return paint('well');
  if (!imageHashes[key]) imageHashes[key] = figma.createImage(figma.base64Decode(IMAGES[key])).hash;
  return { type: 'IMAGE', scaleMode: 'FILL', imageHash: imageHashes[key] };
}

// ---------- node builders ----------

function text(chars, o = {}) {
  const t = figma.createText();
  t.fontName = FONT[o.font || 'ui'];
  t.characters = String(chars);
  t.fontSize = o.size || 16;
  t.fills = [paint(o.color || 'text-hi')];
  if (o.lh) t.lineHeight = { unit: 'PERCENT', value: o.lh };
  if (o.ls !== undefined) t.letterSpacing = { unit: 'PERCENT', value: o.ls };
  if (o.upper) t.textCase = 'UPPER';
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.name) t.name = o.name;
  if (o.w) {
    t.resize(o.w, Math.max(1, t.height)); // fixed width first, then let the height follow the text
    t.textAutoResize = 'HEIGHT';
  }
  return t;
}

// Auto-layout container. w/h fix that axis; otherwise it hugs.
function box(dir, o = {}) {
  const f = figma.createFrame();
  f.layoutMode = dir === 'row' ? 'HORIZONTAL' : 'VERTICAL';
  f.name = o.name || (dir === 'row' ? 'Row' : 'Stack');
  f.fills = o.fill ? [paint(o.fill, o.fillOpacity)] : [];
  f.itemSpacing = o.gap || 0;
  f.paddingLeft = f.paddingRight = o.px !== undefined ? o.px : (o.p || 0);
  f.paddingTop = f.paddingBottom = o.py !== undefined ? o.py : (o.p || 0);
  f.primaryAxisAlignItems = o.justify || 'MIN';
  f.counterAxisAlignItems = o.align || 'MIN';
  f.clipsContent = !!o.clip;
  if (o.stroke) { f.strokes = [paint(o.stroke)]; f.strokeWeight = 1; }
  if (o.r) radius(f, o.r);
  if (o.radius !== undefined) f.cornerRadius = o.radius;
  const horizontal = f.layoutMode === 'HORIZONTAL';
  const fixW = o.w !== undefined;
  const fixH = o.h !== undefined;
  if (fixW || fixH) f.resize(fixW ? o.w : 100, fixH ? o.h : 100);
  f.primaryAxisSizingMode = (horizontal ? fixW : fixH) ? 'FIXED' : 'AUTO';
  f.counterAxisSizingMode = (horizontal ? fixH : fixW) ? 'FIXED' : 'AUTO';
  for (const kid of o.kids || []) if (kid) f.appendChild(kid);
  return f;
}

function rect(w, h, o = {}) {
  const r = figma.createRectangle();
  r.resize(Math.max(0.01, w), Math.max(0.01, h));
  r.name = o.name || 'Rect';
  r.fills = o.fill ? [paint(o.fill, o.opacity)] : o.image ? [imagePaint(o.image)] : [];
  if (o.r) radius(r, o.r);
  if (o.radius !== undefined) r.cornerRadius = o.radius;
  if (o.stroke) { r.strokes = [paint(o.stroke)]; r.strokeWeight = o.strokeWeight || 1; }
  return r;
}

function place(parent, node, x, y) {
  parent.appendChild(node);
  node.x = x;
  node.y = y;
  return node;
}

// Shift a path so its bounding box starts at 0,0 and return that offset. Placing the vector at
// the offset then lines it up exactly, however Figma stores vector coordinates.
function normalizePath(d) {
  const tokens = d.trim().split(/\s+/);
  let k = 0;
  const pts = [];
  for (const tok of tokens) {
    if (/^[A-Za-z]$/.test(tok)) continue;
    pts.push(Number(tok));
  }
  let minX = Infinity;
  let minY = Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) { minX = Math.min(minX, pts[i]); minY = Math.min(minY, pts[i + 1]); }
  const out = tokens.map((tok) => {
    if (/^[A-Za-z]$/.test(tok)) return tok;
    const v = Number(tok) - (k++ % 2 === 0 ? minX : minY);
    return String(Math.round(v * 100) / 100);
  });
  return { d: out.join(' '), x: minX, y: minY };
}

function placePath(parent, raw, o, x, y) {
  const p = normalizePath(typeof raw === 'string' ? raw : raw.d);
  const v = figma.createVector();
  v.vectorPaths = [{ windingRule: 'NONE', data: p.d }];
  v.name = o.name || 'Curve';
  v.fills = [];
  v.strokes = [paint(o.color || 'plot-2', o.opacity)];
  v.strokeWeight = o.weight || 2.5;
  v.strokeCap = 'ROUND';
  v.strokeJoin = 'ROUND';
  if (o.dash) v.dashPattern = o.dash;
  return place(parent, v, x + p.x, y + p.y);
}

const shadow = (y = 24, blur = 60, a = 0.5) => [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a }, offset: { x: 0, y }, radius: blur, spread: -12, visible: true, blendMode: 'NORMAL' }];

// ---------- components ----------

const C = {};
let compArea; // canvas area that holds the main components

function variantSet(name, variants, build, description) {
  const comps = variants.map((v) => {
    const c = figma.createComponent();
    c.name = v;
    build(c, v);
    return c;
  });
  const set = figma.combineAsVariants(comps, compArea);
  set.name = name;
  set.layoutMode = 'HORIZONTAL';
  set.itemSpacing = 24;
  set.paddingLeft = set.paddingRight = set.paddingTop = set.paddingBottom = 24;
  set.primaryAxisSizingMode = 'AUTO';
  set.counterAxisSizingMode = 'AUTO';
  set.fills = [paint('surface-2')];
  set.cornerRadius = 16;
  if (description) set.description = description;
  return set;
}
const variant = (set, value) => set.children.find((c) => c.name.endsWith(`=${value}`));

// A TEXT component property on a set, wired to every variant's text node with that name.
function textProp(set, prop, layerName, fallback) {
  const key = set.addComponentProperty(prop, 'TEXT', fallback);
  for (const v of set.children) {
    const node = v.findOne((n) => n.type === 'TEXT' && n.name === layerName);
    if (node) node.componentPropertyReferences = { characters: key };
  }
  return key;
}

function hugRow(c, o = {}) {
  c.layoutMode = 'HORIZONTAL';
  c.primaryAxisSizingMode = 'AUTO';
  c.counterAxisSizingMode = 'AUTO';
  c.paddingLeft = c.paddingRight = o.px || 0;
  c.paddingTop = c.paddingBottom = o.py || 0;
  c.itemSpacing = o.gap || 0;
  c.counterAxisAlignItems = 'CENTER';
  c.cornerRadius = 999;
}

// Simple line icons (24x24 artboard).
const ICON = {
  heart: 'M 12 20 L 4.5 12.5 C 2.5 10.5 2.5 7.3 4.5 5.5 C 6.4 3.8 9.4 4 11 6 L 12 7.2 L 13 6 C 14.6 4 17.6 3.8 19.5 5.5 C 21.5 7.3 21.5 10.5 19.5 12.5 Z',
  bag: 'M 5 8 L 19 8 L 18 20 L 6 20 Z M 9 8 C 9 4 15 4 15 8',
};
function icon(name) {
  const f = figma.createFrame();
  f.name = `Icon/${name}`;
  f.resize(24, 24);
  f.fills = [];
  placePath(f, ICON[name], { name: 'Glyph', color: 'text-hi', weight: 1.6 }, 0, 0);
  return f;
}

function buildComponents() {
  const SECTIONS = ['Home', 'Store', 'Tuning Lab', 'Guide', 'History'];
  C.nav = variantSet('Nav', SECTIONS.map((s) => `Active=${s}`), (c, v) => {
    const active = v.split('=')[1];
    c.layoutMode = 'HORIZONTAL';
    c.resize(W - 96, 64);
    c.primaryAxisSizingMode = 'FIXED';
    c.counterAxisSizingMode = 'FIXED';
    c.primaryAxisAlignItems = 'SPACE_BETWEEN';
    c.counterAxisAlignItems = 'CENTER';
    c.paddingLeft = 24;
    c.paddingRight = 10;
    c.cornerRadius = 999;
    c.fills = [paint('surface', 0.86)];
    c.strokes = [paint('hairline')];
    c.strokeWeight = 1;
    c.effects = shadow(16, 40, 0.35);
    c.appendChild(box('row', { name: 'Brand', gap: 6, align: 'CENTER', kids: [text('Oura', { font: 'display', size: 22 }), text('Acoustics', { font: 'displayItalic', size: 22, color: 'text-lo' })] }));
    const links = box('row', { name: 'Links', gap: 4, align: 'CENTER' });
    for (const label of SECTIONS) {
      const isActive = label === active;
      links.appendChild(box('row', { name: `Link/${label}`, px: 16, py: 10, radius: 999, fill: isActive ? 'surface-2' : undefined, stroke: isActive ? 'hairline' : undefined, kids: [text(label, { font: 'uiMed', size: 15, color: isActive ? 'text-hi' : 'text-lo' })] }));
    }
    c.appendChild(links);
    c.appendChild(box('row', { name: 'Actions', gap: 8, align: 'CENTER', kids: [
      box('row', { name: 'Favourites', w: 44, h: 44, radius: 999, stroke: 'hairline', justify: 'CENTER', align: 'CENTER', kids: [icon('heart')] }),
      box('row', { name: 'Bag', w: 44, h: 44, radius: 999, stroke: 'hairline', justify: 'CENTER', align: 'CENTER', kids: [icon('bag')] }),
    ] }));
  }, 'Top navigation. One variant per section (Active=…); every link navigates to that section.');

  C.button = variantSet('Button', ['Style=Primary', 'Style=Secondary'], (c, v) => {
    const primary = v.endsWith('Primary');
    hugRow(c, { px: 22, py: 14, gap: 8 });
    c.fills = primary ? [paint('accent')] : [paint('surface-2')];
    if (!primary) { c.strokes = [paint('hairline')]; c.strokeWeight = 1; }
    c.appendChild(text('Button', { name: 'Label', font: 'uiSemi', size: 15, color: primary ? 'accent-ink' : 'text-hi' }));
  });
  C.buttonLabel = textProp(C.button, 'Label', 'Label', 'Button');

  C.chip = variantSet('Chip', ['State=Default', 'State=Active'], (c, v) => {
    const isActive = v.endsWith('Active');
    hugRow(c, { px: 16, py: 10 });
    c.fills = isActive ? [paint('text-hi')] : [paint('surface')];
    c.strokes = [paint('hairline')];
    c.strokeWeight = 1;
    c.appendChild(text('Chip', { name: 'Label', font: 'uiMed', size: 14, color: isActive ? 'bg' : 'text-hi' }));
  }, 'Category filter. Active = the current category.');
  C.chipLabel = textProp(C.chip, 'Label', 'Label', 'Chip');

  C.page = variantSet('Page', ['State=Default', 'State=Active'], (c, v) => {
    const isActive = v.endsWith('Active');
    c.layoutMode = 'HORIZONTAL';
    c.resize(40, 40);
    c.primaryAxisSizingMode = 'FIXED';
    c.counterAxisSizingMode = 'FIXED';
    c.primaryAxisAlignItems = 'CENTER';
    c.counterAxisAlignItems = 'CENTER';
    c.cornerRadius = 999;
    c.fills = isActive ? [paint('accent')] : [];
    c.strokes = isActive ? [] : [paint('hairline')];
    c.strokeWeight = 1;
    c.appendChild(text('1', { name: 'Label', font: 'mono', size: 14, color: isActive ? 'accent-ink' : 'text-hi' }));
  }, 'Pagination item.');
  C.pageLabel = textProp(C.page, 'Label', 'Label', '1');

  // Product card: Default / Hover (interactive: while hovering).
  C.card = variantSet('Product card', ['State=Default', 'State=Hover'], (c, v) => {
    const hover = v.endsWith('Hover');
    c.layoutMode = 'VERTICAL';
    c.resize(294, 100);
    c.primaryAxisSizingMode = 'AUTO';
    c.counterAxisSizingMode = 'FIXED';
    c.paddingLeft = c.paddingRight = c.paddingTop = 8;
    c.paddingBottom = 14;
    c.itemSpacing = 10;
    radius(c, 'lg');
    c.fills = [paint(hover ? 'surface-2' : 'surface')];
    c.strokes = [paint(hover ? 'accent' : 'hairline')];
    c.strokeWeight = 1;
    c.effects = shadow(hover ? 30 : 18, hover ? 60 : 40, hover ? 0.6 : 0.4);
    const media = figma.createFrame();
    media.name = 'Media';
    media.resize(278, 140);
    media.fills = [paint('well')];
    radius(media, 'md');
    media.clipsContent = true;
    const quick = box('row', { name: 'Quick view', px: 14, py: 7, radius: 999, fill: 'surface', kids: [text('Quick view', { font: 'uiSemi', size: 12 })] });
    place(media, quick, 139 - quick.width / 2, hover ? 98 : 112);
    quick.opacity = hover ? 1 : 0;
    c.appendChild(media);
    c.appendChild(box('col', { name: 'Info', gap: 4, px: 8, kids: [
      text('Brand', { name: 'Brand', size: 12, color: 'text-lo' }),
      text('Product name', { name: 'Name', font: 'display', size: 16, w: 262, lh: 115 }),
      text('★ 4.7 (1,024)', { name: 'Rating', size: 12, color: 'text-lo' }),
      text('$129.99', { name: 'Price', font: 'display', size: 18 }),
    ] }));
  }, 'Store card. Hover variant lifts the card and reveals Quick view; instances override the Media fill and texts.');

  // EQ node: Default → (hover) Hover → (press) Dragging.
  C.node = variantSet('EQ node', ['State=Default', 'State=Hover', 'State=Dragging'], (c, v) => {
    const state = v.split('=')[1];
    c.resize(64, 64);
    c.fills = [];
    c.clipsContent = false;
    const haloSize = state === 'Default' ? 26 : state === 'Hover' ? 46 : 60;
    const halo = figma.createEllipse();
    halo.name = 'Halo';
    halo.resize(haloSize, haloSize);
    halo.fills = [paint('accent', state === 'Dragging' ? 0.3 : 0.18)];
    halo.opacity = state === 'Default' ? 0 : 1;
    place(c, halo, 32 - haloSize / 2, 32 - haloSize / 2);
    const dotSize = state === 'Dragging' ? 30 : 26;
    const dot = figma.createEllipse();
    dot.name = 'Dot';
    dot.resize(dotSize, dotSize);
    dot.fills = [paint('plot-1')];
    dot.strokes = [paint('bg')];
    dot.strokeWeight = 2;
    place(c, dot, 32 - dotSize / 2, 32 - dotSize / 2);
    const label = text('1', { name: 'Band', font: 'uiSemi', size: 12, align: 'CENTER' });
    place(c, label, 32 - label.width / 2, 32 - label.height / 2);
  }, 'Draggable EQ band handle. Hover shows a halo; pressing switches to Dragging.');
  C.nodeBand = textProp(C.node, 'Band', 'Band', '1');

  C.toggle = variantSet('Toggle', ['State=Off', 'State=On'], (c, v) => {
    const isOn = v.endsWith('On');
    c.resize(48, 28);
    c.cornerRadius = 999;
    c.fills = [paint(isOn ? 'accent' : 'hairline')];
    const knob = figma.createEllipse();
    knob.name = 'Knob';
    knob.resize(22, 22);
    knob.fills = [paint(isOn ? 'accent-ink' : 'text-hi')];
    place(c, knob, isOn ? 23 : 3, 3);
  }, 'Switch. In the Lab the whole "Advanced settings" row navigates between screens.');

  C.ab = variantSet('A/B switch', ['Choice=A', 'Choice=B'], (c, v) => {
    const b = v.endsWith('B');
    hugRow(c, { px: 4, py: 4, gap: 4 });
    c.fills = [paint('well')];
    c.strokes = [paint('hairline')];
    c.strokeWeight = 1;
    for (const [label, isSel] of [['A · original', !b], ['B · tuned', b]]) {
      c.appendChild(box('row', { name: label.startsWith('A') ? 'Option A' : 'Option B', px: 16, py: 10, radius: 999, fill: isSel ? 'accent' : undefined, kids: [text(label, { font: 'uiSemi', size: 14, color: isSel ? 'accent-ink' : 'text-hi' })] }));
    }
  }, 'Click to flip between A and B (interactive component, Smart Animate).');
}

async function wireComponentInteractions() {
  await variant(C.card, 'Default').setReactionsAsync([on('ON_HOVER', changeTo(variant(C.card, 'Hover'), 220))]);
  await variant(C.node, 'Default').setReactionsAsync([on('ON_HOVER', changeTo(variant(C.node, 'Hover'), 160))]);
  await variant(C.node, 'Hover').setReactionsAsync([on('ON_PRESS', changeTo(variant(C.node, 'Dragging'), 140))]);
  await variant(C.ab, 'A').setReactionsAsync([on('ON_CLICK', changeTo(variant(C.ab, 'B'), 260))]);
  await variant(C.ab, 'B').setReactionsAsync([on('ON_CLICK', changeTo(variant(C.ab, 'A'), 260))]);
}

function inst(set, variantValue, props) {
  const i = variant(set, variantValue).createInstance();
  if (props) i.setProperties(props);
  return i;
}
const button = (label, style = 'Primary') => inst(C.button, style, { [C.buttonLabel]: label });
const chip = (label, active) => inst(C.chip, active ? 'Active' : 'Default', { [C.chipLabel]: label });

// ---------- screen scaffolding ----------

function screen(name, col, row) {
  const f = figma.createFrame();
  f.name = name;
  f.resize(W, H);
  f.x = col * (W + GAP);
  f.y = row * ROW_H;
  f.fills = [paint('bg')];
  f.clipsContent = true;
  return f;
}
function navBar(frame, active) {
  const n = inst(C.nav, active);
  n.name = 'Nav';
  return place(frame, n, 48, 16);
}
function glow(frame, x, y, size, color, opacity) {
  const e = figma.createEllipse();
  e.name = 'Glow';
  e.resize(size, size);
  e.fills = [paint(color, opacity)];
  e.effects = [{ type: 'LAYER_BLUR', blurType: 'NORMAL', radius: 160, visible: true }];
  return place(frame, e, x, y);
}
function rowLabel(page, label, y) {
  const t = text(label, { font: 'display', size: 64, color: 'text-lo', name: `Label · ${label}` });
  page.appendChild(t);
  t.x = 0;
  t.y = y;
}

// ---------- Home ----------

function buildHome(frame) {
  glow(frame, 820, -200, 700, 'plot-2', 0.18);
  glow(frame, 1050, 300, 600, 'plot-1', 0.14);
  place(frame, box('col', { name: 'Hero', gap: 24, w: 700, kids: [
    text('Headphone & speaker tuning', { font: 'uiSemi', size: 13, color: 'accent', upper: true, ls: 14 }),
    text('Hear what your headphones have been hiding.', { name: 'Title', font: 'display', size: 74, w: 700, lh: 96, ls: -2 }),
    text('Oura loads a lab measurement of your exact headphones, listens to what you play, and turns both into an EQ you can use everywhere.', { size: 19, color: 'text-lo', w: 600, lh: 150 }),
  ] }), 96, 150);
  const ctas = place(frame, box('row', { name: 'CTAs', gap: 12, kids: [button('Open the Tuning Lab', 'Primary'), button('Learn by ear', 'Secondary')] }), 96, 560);
  const art = place(frame, rect(470, 380, { name: 'Hero image', image: 'era:shoegaze', r: 'lg' }), 874, 140);
  art.effects = shadow(30, 80, 0.6);
  const cards = box('row', { name: 'Entry cards', gap: 16 });
  for (const [title, sub] of [['Store', '42 products, 8 categories'], ['Tuning Lab', 'Drag an EQ, export it'], ['Guide', 'Learn every frequency'], ['History', '1877 → 2026 in ten stops']]) {
    cards.appendChild(box('col', { name: `Entry/${title}`, w: 300, gap: 6, p: 20, r: 'md', fill: 'surface', stroke: 'hairline', kids: [text(title, { font: 'display', size: 22 }), text(sub, { size: 14, color: 'text-lo' }), text('Open →', { font: 'uiSemi', size: 13, color: 'accent' })] }));
  }
  place(frame, cards, 96, 680);
  navBar(frame, 'Home');
  return { ctas, cards };
}

// ---------- Store ----------

const PER_PAGE = 8;
const FREE_SHIPPING_MIN = 199;
const SHIPPING_FEE = 9.99;
const SORTS = [
  ['featured', 'Featured', () => 0],
  ['price-asc', 'Price ↑', (a, b) => a.price - b.price],
  ['price-desc', 'Price ↓', (a, b) => b.price - a.price],
  ['rating', 'Top rated', (a, b) => b.rating - a.rating || b.reviews - a.reviews],
];
const sortLabel = (key) => SORTS.find((s) => s[0] === key)[1];
const catLabel = (id) => (id === 'iems' ? 'In-ear monitors' : (DATA.categories.find((c) => c.id === id) || {}).label || id);
const TUNABLE = new Set(['headphones', 'earbuds', 'iems', 'speakers', 'monitors']);

function setText(root, layer, value) {
  const t = root.findOne((n) => n.type === 'TEXT' && n.name === layer);
  if (t) t.characters = value;
}

function productCard(p) {
  const card = inst(C.card, 'Default');
  card.name = `Card/${p.id}`;
  card.findOne((n) => n.name === 'Media').fills = [imagePaint(`product:${p.id}`)];
  setText(card, 'Brand', p.brand);
  setText(card, 'Name', p.name);
  setText(card, 'Rating', `★ ${p.rating.toFixed(1)}  (${p.reviews.toLocaleString('en-US')})`);
  setText(card, 'Price', money(p.price));
  return card;
}

function arrowButton(label, name) {
  const b = inst(C.page, 'Default', { [C.pageLabel]: label });
  b.name = name;
  return b;
}

// One store listing screen. Returns the nodes that need prototype links.
function storeScreen(frame, o) {
  glow(frame, 1000, -300, 700, 'plot-1', 0.08);
  const head = box('row', { name: 'Header', w: W - 192, justify: 'SPACE_BETWEEN', align: 'MAX' });
  head.appendChild(box('col', { name: 'Title', gap: 4, kids: [text(o.title, { font: 'display', size: 40, ls: -1 }), text(o.subtitle, { size: 15, color: 'text-lo' })] }));
  head.appendChild(box('row', { name: 'Search', w: 320, px: 18, py: 12, radius: 999, fill: 'surface', stroke: 'hairline', kids: [text(`Search ${DATA.total} products…`, { size: 14, color: 'text-lo' })] }));
  place(frame, head, 96, 104);

  const chips = box('row', { name: 'Categories', gap: 8 });
  const chipNodes = {};
  for (const c of DATA.categories) {
    const ch = chip(catLabel(c.id), c.id === o.category);
    ch.name = `Category/${c.id}`;
    chips.appendChild(ch);
    chipNodes[c.id] = ch;
  }
  place(frame, chips, 96, 184);

  const bar = box('row', { name: 'Toolbar', w: W - 192, justify: 'SPACE_BETWEEN', align: 'CENTER' });
  const sortRow = box('row', { name: 'Sort', gap: 6, align: 'CENTER', kids: [text('Sort', { size: 13, color: 'text-lo' })] });
  const sortNodes = {};
  for (const [key, label] of SORTS) {
    const sc = chip(label, key === o.sort);
    sc.name = `Sort/${key}`;
    sortRow.appendChild(sc);
    sortNodes[key] = sc;
  }
  bar.appendChild(sortRow);
  const pager = box('row', { name: 'Pagination', gap: 6, align: 'CENTER' });
  pager.appendChild(text(`${o.count} products · page ${o.page} of ${o.pages}`, { size: 13, color: 'text-lo' }));
  const prev = o.pages > 1 ? arrowButton('←', 'Previous page') : null;
  if (prev) pager.appendChild(prev);
  const pageItems = [];
  for (let n = 1; n <= o.pages; n++) {
    const item = inst(C.page, n === o.page ? 'Active' : 'Default', { [C.pageLabel]: String(n) });
    item.name = `Page ${n}`;
    pager.appendChild(item);
    pageItems.push([n, item]);
  }
  const next = o.pages > 1 ? arrowButton('→', 'Next page') : null;
  if (next) pager.appendChild(next);
  bar.appendChild(pager);
  place(frame, bar, 96, 236);

  const grid = box('row', { name: 'Grid', w: W - 192, gap: 24 });
  grid.layoutWrap = 'WRAP';
  grid.counterAxisSpacing = 16;
  const cards = [];
  for (const p of o.products) {
    const card = productCard(p);
    grid.appendChild(card);
    cards.push([p, card]);
  }
  place(frame, grid, 96, 292);
  navBar(frame, 'Store');
  return { chipNodes, sortNodes, pageItems, prev, next, cards };
}

function hairlineTop(node) {
  node.strokes = [paint('hairline')];
  node.strokeTopWeight = 1;
  node.strokeBottomWeight = 0;
  node.strokeLeftWeight = 0;
  node.strokeRightWeight = 0;
  return node;
}

function productPage(frame, p, related) {
  glow(frame, 700, -300, 800, 'accent', 0.06);
  const crumbs = box('row', { name: 'Breadcrumb', gap: 10, align: 'CENTER' });
  const crumbStore = text('Store', { name: 'Crumb/Store', size: 14, color: 'text-lo' });
  const crumbCat = text(catLabel(p.category), { name: 'Crumb/Category', size: 14, color: 'text-lo' });
  crumbs.appendChild(crumbStore);
  crumbs.appendChild(text('/', { size: 14, color: 'text-lo' }));
  crumbs.appendChild(crumbCat);
  crumbs.appendChild(text('/', { size: 14, color: 'text-lo' }));
  crumbs.appendChild(text(p.name, { size: 14 }));
  place(frame, crumbs, 96, 104);

  const hero = place(frame, rect(640, 460, { name: 'Product image', image: `product:${p.id}`, r: 'lg' }), 96, 140);
  hero.effects = shadow(24, 70, 0.5);
  if (p.badge) place(frame, box('row', { name: 'Badge', px: 12, py: 6, radius: 999, fill: 'surface', kids: [text(p.badge, { font: 'uiSemi', size: 12 })] }), 116, 160);

  place(frame, text('You might also like', { name: 'Related title', font: 'display', size: 20 }), 96, 628);
  const minis = [];
  const row = box('row', { name: 'Related', gap: 16 });
  for (const r of related) {
    const mini = box('col', { name: `Related/${r.id}`, w: 148, gap: 6, kids: [rect(148, 96, { name: 'Thumb', image: `product:${r.id}`, r: 'sm' }), text(r.name, { size: 12, w: 148, lh: 125 }), text(money(r.price), { font: 'uiSemi', size: 12, color: 'text-lo' })] });
    row.appendChild(mini);
    minis.push([r, mini]);
  }
  place(frame, row, 96, 664);

  const d = box('col', { name: 'Details', gap: 12, w: 560 });
  d.appendChild(text(`${p.brand} · ${catLabel(p.category)}`, { size: 13, color: 'text-lo' }));
  d.appendChild(text(p.name, { name: 'Name', font: 'display', size: 40, w: 560, lh: 102, ls: -1 }));
  d.appendChild(text(`★ ${p.rating.toFixed(1)}  ·  ${p.reviews.toLocaleString('en-US')} reviews`, { size: 13, color: 'text-lo' }));
  const priceRow = box('row', { name: 'Price', gap: 12, align: 'CENTER', kids: [text(money(p.price), { font: 'display', size: 28 })] });
  if (p.compareAt) {
    priceRow.appendChild(text(`was ${money(p.compareAt)}`, { size: 14, color: 'text-lo' }));
    priceRow.appendChild(text(`Save ${money(p.compareAt - p.price)}`, { font: 'uiSemi', size: 13, color: 'plot-2' }));
  }
  d.appendChild(priceRow);
  d.appendChild(text(p.blurb, { size: 15, color: 'text-lo', w: 540, lh: 150 }));
  const qty = box('row', { name: 'Quantity', gap: 18, px: 18, py: 12, radius: 999, stroke: 'hairline', align: 'CENTER', kids: [text('−', { size: 16 }), text('1', { font: 'mono', size: 15 }), text('+', { size: 16 })] });
  const addBtn = button('Add to bag', 'Primary');
  const favBtn = box('row', { name: 'Favourite', w: 48, h: 48, radius: 999, stroke: 'hairline', justify: 'CENTER', align: 'CENTER', kids: [icon('heart')] });
  d.appendChild(box('row', { name: 'Buy', gap: 10, align: 'CENTER', kids: [qty, addBtn, favBtn] }));
  d.appendChild(text(`Free shipping over ${money(FREE_SHIPPING_MIN)} · 30-day returns`, { size: 13, color: 'text-lo' }));
  let tuneBtn = null;
  if (TUNABLE.has(p.category)) {
    tuneBtn = box('row', { name: 'Tune in the Lab', w: 540, gap: 12, p: 14, r: 'md', fill: 'surface', stroke: 'hairline', align: 'CENTER', kids: [
      box('col', { gap: 2, kids: [text('Tune it in the Lab', { font: 'uiSemi', size: 14 }), text('Load the measured correction for this model', { size: 12, color: 'text-lo' })] }),
    ] });
    d.appendChild(tuneBtn);
  }
  const hl = box('row', { name: 'Highlights', w: 560, gap: 8 });
  hl.layoutWrap = 'WRAP';
  hl.counterAxisSpacing = 8;
  for (const h of p.highlights) hl.appendChild(text(`✓  ${h}`, { size: 13, w: 270 }));
  d.appendChild(hl);
  const specs = box('col', { name: 'Specs', w: 560 });
  for (const [k, v] of Object.entries(p.specs).slice(0, 5)) {
    specs.appendChild(hairlineTop(box('row', { name: `Spec/${k}`, w: 560, py: 8, justify: 'SPACE_BETWEEN', kids: [text(k, { size: 13, color: 'text-lo' }), text(String(v), { size: 13, w: 340, align: 'RIGHT' })] })));
  }
  d.appendChild(specs);
  place(frame, d, 784, 140);
  navBar(frame, 'Store');
  return { crumbStore, crumbCat, addBtn, favBtn, tuneBtn, minis };
}

function quickView(p, x, y) {
  const f = figma.createFrame();
  f.name = `Quick view / ${p.brand} ${p.name}`;
  f.resize(1000, 600);
  f.x = x;
  f.y = y;
  f.fills = [paint('surface')];
  radius(f, 'lg');
  f.strokes = [paint('hairline')];
  f.strokeWeight = 1;
  f.effects = shadow(40, 120, 0.7);
  f.clipsContent = true;
  place(f, rect(480, 600, { name: 'Image', image: `product:${p.id}` }), 0, 0);
  const info = box('col', { name: 'Details', gap: 12, w: 440 });
  info.appendChild(text(`${p.brand} · ${catLabel(p.category)}`, { size: 13, color: 'text-lo' }));
  info.appendChild(text(p.name, { name: 'Name', font: 'display', size: 30, w: 420, lh: 105 }));
  info.appendChild(text(`★ ${p.rating.toFixed(1)}  (${p.reviews.toLocaleString('en-US')} reviews)`, { size: 13, color: 'text-lo' }));
  info.appendChild(text(money(p.price) + (p.compareAt ? `   was ${money(p.compareAt)}` : ''), { font: 'display', size: 24 }));
  info.appendChild(text(p.blurb, { size: 14, color: 'text-lo', w: 420, lh: 150 }));
  const specs = box('col', { name: 'Spec sheet', w: 420 });
  for (const [k, v] of Object.entries(p.specs).slice(0, 4)) {
    specs.appendChild(hairlineTop(box('row', { name: `Spec/${k}`, w: 420, py: 8, justify: 'SPACE_BETWEEN', kids: [text(k, { size: 13, color: 'text-lo' }), text(String(v), { size: 13, w: 250, align: 'RIGHT' })] })));
  }
  info.appendChild(specs);
  const add = button('Add to bag', 'Primary');
  const details = button('View full details', 'Secondary');
  info.appendChild(box('row', { name: 'Buttons', gap: 10, kids: [add, details] }));
  place(f, info, 520, 40);
  const close = place(f, box('row', { name: 'Close', w: 40, h: 40, radius: 999, fill: 'surface-2', stroke: 'hairline', justify: 'CENTER', align: 'CENTER', kids: [text('×', { size: 20 })] }), 944, 16);
  return { f, add, details, close };
}

function totals(items) {
  const sub = items.reduce((t, it) => t + it.p.price * it.qty, 0);
  const ship = sub >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE;
  return { sub, ship, total: sub + ship, count: items.reduce((t, it) => t + it.qty, 0) };
}

function sheet(name, title, x, y) {
  const f = figma.createFrame();
  f.name = name;
  f.resize(520, 760);
  f.x = x;
  f.y = y;
  f.fills = [paint('surface')];
  radius(f, 'lg');
  f.strokes = [paint('hairline')];
  f.strokeWeight = 1;
  f.effects = shadow(40, 120, 0.7);
  f.clipsContent = true;
  place(f, text(title, { name: 'Title', font: 'display', size: 28 }), 32, 28);
  const close = place(f, box('row', { name: 'Close', w: 40, h: 40, radius: 999, fill: 'surface-2', stroke: 'hairline', justify: 'CENTER', align: 'CENTER', kids: [text('×', { size: 20 })] }), 456, 24);
  return { f, close };
}

function lineItem(p, right) {
  return box('row', { name: `Line/${p.id}`, w: 456, gap: 14, py: 12, align: 'CENTER', kids: [
    rect(76, 76, { name: 'Thumb', image: `product:${p.id}`, r: 'sm' }),
    box('col', { name: 'Info', gap: 4, w: 220, kids: [text(`${p.brand} ${p.name}`, { size: 14, w: 220, lh: 125 }), text(money(p.price), { font: 'uiSemi', size: 13, color: 'text-lo' })] }),
    right,
  ] });
}

function bagSheet(items, x, y) {
  const t = totals(items);
  const { f, close } = sheet(`Bag / ${items.map((it) => it.p.id).join(' + ')}`, `Your bag (${t.count})`, x, y);
  const list = box('col', { name: 'Items', w: 456 });
  for (const it of items) list.appendChild(lineItem(it.p, box('row', { name: 'Qty', gap: 12, px: 12, py: 8, radius: 999, stroke: 'hairline', align: 'CENTER', kids: [text('−', { size: 14 }), text(String(it.qty), { font: 'mono', size: 13 }), text('+', { size: 14 })] })));
  place(f, list, 32, 88);
  const left = FREE_SHIPPING_MIN - t.sub;
  const progress = box('col', { name: 'Free shipping', w: 456, gap: 8, p: 16, r: 'md', fill: 'well', kids: [
    text(left > 0 ? `Add ${money(left)} more for free shipping` : 'Free shipping unlocked', { size: 13 }),
  ] });
  const track = box('row', { name: 'Track', w: 424, h: 6, radius: 999, fill: 'hairline' });
  track.appendChild(rect(Math.max(8, 424 * Math.min(1, t.sub / FREE_SHIPPING_MIN)), 6, { name: 'Fill', fill: 'plot-2', radius: 999 }));
  progress.appendChild(track);
  place(f, progress, 32, 420);
  const sum = box('col', { name: 'Totals', w: 456, gap: 8 });
  for (const [k, v] of [['Subtotal', money(t.sub)], ['Shipping', t.ship ? money(t.ship) : 'Free'], ['Total', money(t.total)]]) {
    sum.appendChild(box('row', { name: k, w: 456, justify: 'SPACE_BETWEEN', kids: [text(k, { size: 14, color: k === 'Total' ? 'text-hi' : 'text-lo' }), text(v, { font: k === 'Total' ? 'display' : 'ui', size: k === 'Total' ? 20 : 14 })] }));
  }
  place(f, sum, 32, 530);
  const checkout = button('Checkout', 'Primary');
  const keep = button('Keep shopping', 'Secondary');
  place(f, box('row', { name: 'Buttons', gap: 10, kids: [checkout, keep] }), 32, 680);
  return { f, close, checkout, keep };
}

function favouritesSheet(products, x, y) {
  const { f, close } = sheet('Favourites', `Favourites (${products.length})`, x, y);
  const list = box('col', { name: 'Items', w: 456 });
  const adds = [];
  for (const p of products) {
    const add = button('Add', 'Secondary');
    adds.push([p, add]);
    list.appendChild(lineItem(p, add));
  }
  place(f, list, 32, 88);
  place(f, text('Tap the heart on any product to save it here.', { size: 13, color: 'text-lo', w: 456 }), 32, 700);
  return { f, close, adds };
}

function field(label, value, w) {
  return box('col', { name: `Field/${label}`, gap: 6, w, kids: [
    text(label, { size: 12, color: 'text-lo' }),
    box('row', { name: 'Input', w, px: 14, py: 12, r: 'sm', fill: 'well', stroke: 'hairline', kids: [text(value, { size: 14 })] }),
  ] });
}

function checkoutScreen(frame, items) {
  const t = totals(items);
  place(frame, text('Checkout', { font: 'display', size: 40, ls: -1 }), 96, 104);
  const form = box('col', { name: 'Form', w: 760, gap: 16, p: 32, r: 'lg', fill: 'surface', stroke: 'hairline' });
  form.appendChild(text('Contact', { font: 'uiSemi', size: 16 }));
  form.appendChild(field('Email', 'you@example.com', 696));
  form.appendChild(text('Delivery', { font: 'uiSemi', size: 16 }));
  form.appendChild(box('row', { gap: 16, kids: [field('First name', 'Alex', 340), field('Last name', 'Rivera', 340)] }));
  form.appendChild(field('Address', '12 Harbour Street', 696));
  form.appendChild(box('row', { gap: 16, kids: [field('City', 'Sydney', 340), field('Postcode', '2000', 340)] }));
  form.appendChild(text('Payment (demo, nothing is charged)', { font: 'uiSemi', size: 16 }));
  form.appendChild(box('row', { gap: 16, kids: [field('Card number', '4242 4242 4242 4242', 400), field('Expiry', '12 / 28', 130), field('CVC', '123', 134)] }));
  place(frame, form, 96, 170);
  const sum = box('col', { name: 'Summary', w: 440, gap: 12, p: 28, r: 'lg', fill: 'surface', stroke: 'hairline' });
  sum.appendChild(text('Order summary', { font: 'uiSemi', size: 16 }));
  for (const it of items) sum.appendChild(box('row', { name: `Item/${it.p.id}`, w: 384, gap: 12, align: 'CENTER', kids: [rect(56, 56, { image: `product:${it.p.id}`, r: 'sm' }), text(`${it.qty} × ${it.p.brand} ${it.p.name}`, { size: 13, w: 220 }), text(money(it.p.price * it.qty), { font: 'uiSemi', size: 13 })] }));
  for (const [k, v] of [['Subtotal', money(t.sub)], ['Shipping', t.ship ? money(t.ship) : 'Free'], ['Total', money(t.total)]]) {
    sum.appendChild(box('row', { name: k, w: 384, justify: 'SPACE_BETWEEN', kids: [text(k, { size: 14, color: 'text-lo' }), text(v, { font: k === 'Total' ? 'display' : 'ui', size: k === 'Total' ? 22 : 14 })] }));
  }
  const placeOrder = button(`Place order · ${money(t.total)}`, 'Primary');
  sum.appendChild(placeOrder);
  const back = text('← Back to the store', { name: 'Back', size: 13, color: 'text-lo' });
  sum.appendChild(back);
  place(frame, sum, 904, 170);
  navBar(frame, 'Store');
  return { placeOrder, back };
}

function confirmationScreen(frame, items) {
  const t = totals(items);
  glow(frame, 420, 100, 600, 'plot-2', 0.14);
  const tick = figma.createEllipse();
  tick.name = 'Success';
  tick.resize(88, 88);
  tick.fills = [paint('plot-2')];
  place(frame, tick, W / 2 - 44, 190);
  const mark = text('✓', { font: 'uiSemi', size: 44, color: 'bg' });
  place(frame, mark, W / 2 - mark.width / 2, 234 - mark.height / 2);
  const col = box('col', { name: 'Message', gap: 14, w: 640, align: 'CENTER', kids: [
    text('Order confirmed', { font: 'display', size: 52, align: 'CENTER', w: 640 }),
    text(`Order OA-10482 · ${t.count} items · ${money(t.total)}. A receipt is on its way to you@example.com.`, { size: 16, color: 'text-lo', align: 'CENTER', w: 640, lh: 150 }),
  ] });
  place(frame, col, W / 2 - 320, 310);
  const cont = button('Continue shopping', 'Primary');
  const lab = button('Tune your new gear', 'Secondary');
  place(frame, box('row', { name: 'Buttons', gap: 12, kids: [cont, lab] }), W / 2 - 190, 470);
  navBar(frame, 'Store');
  return { cont, lab };
}

// ---------- Tuning Lab ----------

function labScreen(frame, state, pro) {
  glow(frame, -200, 300, 700, 'plot-2', 0.08);
  const S = DATA.lab.states[state];
  const L = DATA.lab.size;
  place(frame, box('row', { name: 'Header', gap: 16, align: 'CENTER', kids: [
    text('Tune like a studio', { font: 'display', size: 40, ls: -1 }),
    box('row', { name: 'Device', px: 14, py: 8, radius: 999, fill: 'surface-2', stroke: 'hairline', kids: [text('Sennheiser HD 600 · AutoEq loaded', { font: 'uiMed', size: 13 })] }),
  ] }), 96, 112);
  const card = figma.createFrame();
  card.name = 'Graph card';
  card.resize(940, 640);
  card.fills = [paint('surface')];
  radius(card, 'lg');
  card.strokes = [paint('hairline')];
  card.strokeWeight = 1;
  card.clipsContent = true;
  place(frame, card, 96, 196);
  const legend = box('row', { name: 'Legend', gap: 18, align: 'CENTER' });
  for (const [label, color] of [['Your headphones', 'text-lo'], ['Target', 'text-hi'], ['With your EQ', 'plot-2'], ['EQ curve', 'plot-1']]) {
    legend.appendChild(box('row', { name: `Legend/${label}`, gap: 6, align: 'CENTER', kids: [rect(18, 3, { name: 'Swatch', fill: color }), text(label, { size: 12, color: 'text-lo' })] }));
  }
  place(card, legend, 40, 28);
  const plot = figma.createFrame();
  plot.name = 'Plot';
  plot.resize(L.w, L.h);
  plot.fills = [];
  plot.clipsContent = false;
  place(card, plot, 48, 80);
  for (const f of [50, 100, 500, 1000, 5000, 10000]) {
    const x = (Math.log10(f / 20) / 3) * L.w;
    place(plot, rect(1, L.h, { name: `Grid ${f}`, fill: 'hairline' }), x, 0);
    if (f === 100 || f === 1000 || f === 10000) place(plot, text(fmtHz(f), { name: `Axis ${f}`, size: 11, color: 'text-lo' }), x - 14, L.h + 10);
  }
  for (const db of [-12, -6, 0, 6, 12]) {
    const y = L.h - ((db - L.min) / (L.max - L.min)) * L.h;
    place(plot, rect(L.w, db === 0 ? 1.5 : 1, { name: `Grid ${db} dB`, fill: 'hairline' }), 0, y);
    place(plot, text(`${db > 0 ? '+' : ''}${db}`, { name: `dB ${db}`, size: 11, color: 'text-lo' }), -34, y - 8);
  }
  placePath(plot, DATA.lab.raw, { name: 'Raw curve', color: 'text-lo', weight: 1.5 }, 0, 0);
  placePath(plot, DATA.lab.target, { name: 'Target curve', color: 'text-hi', weight: 1.2, dash: [6, 5], opacity: 0.7 }, 0, 0);
  placePath(plot, S.eq, { name: 'EQ curve', color: 'plot-1', weight: 2.5 }, 0, 0);
  placePath(plot, S.tuned, { name: 'Tuned curve', color: 'plot-2', weight: 3 }, 0, 0);
  const nodes = {};
  for (const n of S.nodes) {
    const dragging = state === 'active' && n.n === 3;
    const node = inst(C.node, dragging ? 'Dragging' : 'Default', { [C.nodeBand]: String(n.n) });
    node.name = `Node ${n.n}`;
    place(plot, node, n.x - 32, n.y - 32);
    nodes[n.n] = node;
  }
  if (state === 'active') {
    const b = S.bands.find((x) => x.n === 3);
    const n3 = S.nodes.find((x) => x.n === 3);
    place(plot, box('col', { name: 'Readout', gap: 2, px: 14, py: 10, r: 'sm', fill: 'surface-2', stroke: 'hairline', kids: [
      text(`Band 3 · ${fmtHz(b.fc)}`, { font: 'uiSemi', size: 13 }),
      text(`${signed(b.gain)} · Q ${b.q.toFixed(2)}`, { font: 'mono', size: 12, color: 'text-lo' }),
    ] }), n3.x + 32, n3.y - 76);
  }
  place(card, text(state === 'active' ? 'Release to set the band. It snaps to standard frequencies and 0 dB.' : 'Drag a node: up/down for gain, left/right for frequency. Scroll for Q.', { name: 'Hint', size: 13, color: 'text-lo' }), 40, 596);

  const side = box('col', { name: 'Side panel', w: 344, gap: 16, p: 24, r: 'lg', fill: 'surface', stroke: 'hairline' });
  const advRow = box('row', { name: 'Advanced row', w: 296, justify: 'SPACE_BETWEEN', align: 'CENTER', kids: [text('Advanced settings', { font: 'uiSemi', size: 15 }), inst(C.toggle, pro ? 'On' : 'Off')] });
  side.appendChild(advRow);
  const cols = pro ? ['#', 'Type', 'Freq', 'Gain', 'Q'] : ['#', 'Freq', 'Gain'];
  const widths = pro ? [24, 52, 80, 80, 60] : [40, 128, 128];
  const table = box('col', { name: 'Bands', w: 296 });
  const headRow = box('row', { name: 'Head', w: 296, py: 8 });
  cols.forEach((c, i) => headRow.appendChild(text(c, { size: 12, color: 'text-lo', w: widths[i] })));
  table.appendChild(headRow);
  for (const b of S.bands) {
    const isActive = state === 'active' && b.n === 3;
    const r = box('row', { name: `Row ${b.n}`, w: 296, py: 10, fill: isActive ? 'accent' : undefined, fillOpacity: isActive ? 0.14 : undefined, radius: 10 });
    const cells = pro ? [String(b.n), b.type, fmtHz(b.fc), signed(b.gain), b.q.toFixed(2)] : [String(b.n), fmtHz(b.fc), signed(b.gain)];
    cells.forEach((c, i) => r.appendChild(text(c, { name: cols[i], font: i ? 'mono' : 'uiSemi', size: 13, w: widths[i] })));
    table.appendChild(r);
  }
  side.appendChild(table);
  if (pro) {
    side.appendChild(box('col', { name: 'Crossover', w: 296, gap: 6, p: 16, r: 'md', fill: 'well', kids: [text('Crossover · LR4 at 80 Hz', { font: 'uiSemi', size: 14 }), text('Sub +1 dB · delay 1.5 ms · polarity normal', { size: 12, color: 'text-lo', w: 264 })] }));
    side.appendChild(box('col', { name: 'Time alignment', w: 296, gap: 6, p: 16, r: 'md', fill: 'well', kids: [text('Time & phase', { font: 'uiSemi', size: 14 }), text('Left 0.44 ms · Right 0 ms', { size: 12, color: 'text-lo' })] }));
  }
  side.appendChild(text(`Preamp −${state === 'active' ? '9.1' : '6.3'} dB`, { name: 'Preamp', font: 'mono', size: 13, color: 'text-lo' }));
  side.appendChild(box('col', { name: 'Export', gap: 8, kids: [button('Download Equalizer APO config', 'Primary'), button('Push to hardware', 'Secondary')] }));
  place(frame, side, 1060, 196);
  navBar(frame, 'Tuning Lab');
  return { nodes, advRow };
}

// ---------- Guide ----------

function guideScreen(frame, i, total) {
  const chapter = i === 0 ? null : DATA.guide.chapters[i - 1];
  const G = DATA.guide.size;
  glow(frame, 900, -250, 760, 'plot-2', 0.12);
  const dots = box('row', { name: 'Progress', gap: 8, align: 'CENTER' });
  for (let k = 0; k < total; k++) dots.appendChild(rect(k === i ? 28 : 8, 8, { name: `Dot ${k}`, fill: k === i ? 'accent' : 'hairline', radius: 999 }));
  place(frame, dots, 96, 124);
  place(frame, text(`${pad2(i + 1)} / ${pad2(total)}`, { name: 'Step', font: 'mono', size: 13, color: 'text-lo' }), 96 + total * 16 + 40, 120);

  const left = box('col', { name: 'Copy', gap: 16, w: 520 });
  if (!chapter) {
    left.appendChild(text('The Guide · hands on', { font: 'uiSemi', size: 13, color: 'accent', upper: true, ls: 14 }));
    left.appendChild(text('Tune by ear.', { name: 'Title', font: 'display', size: 96, ls: -3, w: 520 }));
    left.appendChild(text('Not a manual. Six stops through the spectrum, from the sub-bass you feel to the air above 10 kHz. At every stop, flip A and B and hear exactly what changes.', { name: 'Body', size: 19, color: 'text-lo', w: 500, lh: 150 }));
  } else {
    left.appendChild(rect(520, 230, { name: 'Image', image: `guide:${chapter.img}`, r: 'lg' }));
    left.appendChild(text(chapter.kicker, { name: 'Kicker', font: 'uiSemi', size: 13, color: 'accent', upper: true, ls: 14 }));
    left.appendChild(text(chapter.title, { name: 'Title', font: 'display', size: 50, ls: -1.5, w: 520, lh: 100 }));
    left.appendChild(text(chapter.lede, { name: 'Body', size: 16, color: 'text-lo', w: 510, lh: 150 }));
  }
  place(frame, left, 96, 168);

  const stage = figma.createFrame();
  stage.name = 'Stage';
  stage.resize(684, 560);
  stage.fills = [paint('surface')];
  radius(stage, 'lg');
  stage.strokes = [paint('hairline')];
  stage.strokeWeight = 1;
  stage.clipsContent = true;
  place(frame, stage, 660, 168);
  place(stage, text(chapter ? chapter.kicker : '20 Hz – 20 kHz', { name: 'Stage kicker', font: 'uiSemi', size: 12, color: 'accent', upper: true, ls: 12 }), 32, 30);
  place(stage, text(chapter ? chapter.title : 'The whole spectrum', { name: 'Stage title', font: 'display', size: 28 }), 32, 50);
  const plot = figma.createFrame();
  plot.name = 'Plot';
  plot.resize(G.w, G.h);
  plot.fills = [paint('well')];
  plot.cornerRadius = 14;
  plot.clipsContent = true;
  place(stage, plot, 32, 104);
  for (const f of [100, 1000, 10000]) {
    const x = (Math.log10(f / 20) / 3) * G.w;
    place(plot, rect(1, G.h, { name: `Grid ${f}`, fill: 'hairline' }), x, 0);
    place(plot, text(fmtHz(f), { name: `Axis ${f}`, size: 11, color: 'text-lo' }), x + 6, G.h - 22);
  }
  place(plot, rect(G.w, 1, { name: 'Zero', fill: 'hairline' }), 0, G.h / 2);
  const x0 = chapter ? chapter.x0 : 0;
  const x1 = chapter ? chapter.x1 : G.w;
  place(plot, rect(Math.max(4, x1 - x0), G.h, { name: 'Region', fill: 'accent', opacity: chapter && chapter.id !== 'loudness' ? 0.12 : 0.04 }), x0, 0);
  placePath(plot, chapter ? chapter.curve : DATA.guide.flat, { name: 'Curve', color: 'plot-2', weight: 3 }, 0, 0);
  const ab = inst(C.ab, 'B');
  ab.name = 'A/B';
  place(stage, ab, 32, 432);
  place(stage, text(chapter ? chapter.ab : 'Press Start to begin. Each stop changes this curve.', { name: 'AB note', size: 13, color: 'text-lo', w: 330 }), 322, 438);
  const swipe = place(stage, rect(G.w, G.h, { name: 'Swipe zone' }), 32, 104);
  swipe.fills = clear();

  const controls = box('row', { name: 'Controls', gap: 12, align: 'CENTER' });
  const prev = i > 0 ? button('← Back', 'Secondary') : null;
  const next = button(i === 0 ? 'Start the journey →' : i === total - 1 ? 'Open the Tuning Lab →' : 'Next stop →', 'Primary');
  if (prev) controls.appendChild(prev);
  controls.appendChild(next);
  controls.appendChild(text('Click, or drag across the graph to continue', { name: 'Hint', size: 13, color: 'text-lo' }));
  place(frame, controls, 96, 790);
  navBar(frame, 'Guide');
  return { prev, next, swipe };
}

// ---------- History ----------

function historyScreen(frame, i) {
  const eras = DATA.history;
  const era = i === 0 ? null : eras[i - 1];
  // Era waveform (three strands with stable names, so Smart Animate morphs them between eras)
  eras[Math.max(0, i - 1)].waves.forEach((p, k) => {
    placePath(frame, p, { name: `Wave ${k + 1}`, color: k === 1 ? 'accent' : 'plot-1', weight: k === 0 ? 2.5 : 1.5, opacity: era ? 0.55 - k * 0.12 : 0.22 }, 0, 470 + k * 14);
  });
  const year = text(era ? String(era.year) : '1877', { name: 'Year', font: 'display', size: 210, ls: -5 });
  year.fills = [];
  year.strokes = [paint('text-hi', 0.35)];
  year.strokeWeight = 1.5;
  place(frame, year, W - 96 - year.width, 90);
  let swipeBox = { x: 96, y: 150, w: 600, h: 400 };
  if (!era) {
    place(frame, box('col', { name: 'Copy', gap: 22, w: 760, kids: [
      text('1877 — 2026 · Ten stops', { font: 'uiSemi', size: 13, color: 'accent', upper: true, ls: 14 }),
      text('Every sound has a history.', { name: 'Title', font: 'display', size: 100, w: 760, lh: 92, ls: -3 }),
      text('From a needle scratching tinfoil to an 808 shaking a car. Click or drag through each era and hear what it sounded like.', { name: 'Body', size: 19, color: 'text-lo', w: 600, lh: 150 }),
    ] }), 96, 210);
    swipeBox = { x: 0, y: 560, w: W, h: 120 };
  } else {
    const img = place(frame, rect(600, 400, { name: 'Era image', image: `era:${era.img}`, r: 'lg' }), 96, 150);
    img.effects = shadow(30, 80, 0.6);
    const copy = box('col', { name: 'Copy', gap: 14, w: 560 });
    copy.appendChild(text(`${pad2(i)}  ${era.place}`, { name: 'Kicker', font: 'uiSemi', size: 13, color: 'accent', upper: true, ls: 12 }));
    copy.appendChild(text(era.title, { name: 'Title', font: 'display', size: 50, w: 560, lh: 100, ls: -1 }));
    copy.appendChild(text(era.text, { name: 'Body', size: 16, color: 'text-lo', w: 540, lh: 150 }));
    const facts = box('row', { name: 'Facts', gap: 20 });
    for (const [k, v] of Object.entries(era.facts)) facts.appendChild(box('col', { name: `Fact/${k}`, gap: 4, w: 172, kids: [text(k, { size: 11, color: 'text-lo', upper: true, ls: 8 }), text(v, { font: 'uiMed', size: 14, w: 172 })] }));
    copy.appendChild(facts);
    copy.appendChild(box('row', { name: 'Listen', gap: 10, align: 'CENTER', kids: [button('▶  Hear it', 'Primary'), inst(C.ab, 'B')] }));
    place(frame, copy, 760, 260);
  }
  const swipe = place(frame, rect(swipeBox.w, swipeBox.h, { name: 'Swipe zone' }), swipeBox.x, swipeBox.y);
  swipe.fills = clear();
  // Rail: line, fill, marker and clickable years
  const railW = W - 192;
  const railY = 800;
  const progress = i === 0 ? 0 : (i - 1) / (eras.length - 1);
  place(frame, rect(railW, 2, { name: 'Rail', fill: 'hairline' }), 96, railY);
  place(frame, rect(Math.max(2, railW * progress), 2, { name: 'Rail fill', fill: 'accent' }), 96, railY);
  const marker = figma.createEllipse();
  marker.name = 'Rail marker';
  marker.resize(14, 14);
  marker.fills = [paint('accent')];
  place(frame, marker, 96 + railW * progress - 7, railY - 6);
  const years = eras.map((e, k) => {
    const t = text(String(e.year), { name: `Year/${e.year}`, font: 'mono', size: 13, color: k === i - 1 ? 'text-hi' : 'text-lo' });
    return place(frame, t, 96 + (railW * k) / (eras.length - 1) - t.width / 2, railY + 16);
  });
  const controls = box('row', { name: 'Controls', gap: 12, align: 'CENTER' });
  const prev = i > 0 ? button('←', 'Secondary') : null;
  const next = button(i === 0 ? 'Begin the journey →' : i === eras.length ? 'Tune your sound →' : 'Next era →', 'Primary');
  if (prev) controls.appendChild(prev);
  controls.appendChild(next);
  place(frame, controls, 96, 716);
  place(frame, text(i === 0 ? 'Drag or click to travel through time' : `${pad2(i)} / ${pad2(eras.length)}`, { name: 'Counter', font: 'mono', size: 13, color: 'text-lo' }), 96, 118);
  navBar(frame, 'History');
  return { prev, next, swipe, years };
}

// ---------- main ----------

// Canvas layout: labelled rows of screens, top to bottom.
const canvas = { y: 0, page: null };
function newRow(label, height = H) {
  if (label) rowLabel(canvas.page, label, canvas.y);
  const y = canvas.y + 110;
  canvas.y = y + height + 160;
  return y;
}
function screenAt(name, x, y) {
  const f = figma.createFrame();
  f.name = name;
  f.resize(W, H);
  f.x = x;
  f.y = y;
  f.fills = [paint('bg')];
  f.clipsContent = true;
  return f;
}

function writeReport(page, x, y) {
  const lines = [
    `${REPORT.ok.length} sections built, ${REPORT.links} prototype links${REPORT.linkErrors ? `, ${REPORT.linkErrors} links failed` : ''}.`,
    ...(REPORT.errors.length ? ['Problems:', ...REPORT.errors.slice(0, 25).map((e) => `• ${e}`)] : ['No problems.']),
  ];
  const card = box('col', { name: 'Build report', w: 900, gap: 8, p: 28, r: 'md', fill: 'surface', stroke: REPORT.errors.length ? 'plot-1' : 'plot-2', kids: [
    text('Build report', { font: 'display', size: 28 }),
    ...lines.map((l) => text(l, { size: 14, w: 844, color: l.startsWith('•') ? 'plot-1' : 'text-hi' })),
  ] });
  page.appendChild(card);
  card.x = x;
  card.y = y;
}

async function main() {
  const missingFonts = await loadFonts();
  await step('Tokens', makeTokens);
  let name = 'Prototype v2';
  let n = 2;
  while (figma.root.children.some((p) => p.name === name)) name = `Prototype v2 (${n++})`;
  const page = figma.createPage();
  page.name = name;
  await figma.setCurrentPageAsync(page);
  canvas.page = page;
  canvas.y = 600; // room for the build report above Home

  const PRODUCTS = DATA.store.products;
  const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const sortedBy = (list, key) => list.slice().sort(SORTS.find((s) => s[0] === key)[2]);
  const pagesOf = (list) => Math.max(1, Math.ceil(list.length / PER_PAGE));
  const listFor = (ctx) => (ctx === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === ctx));

  // ---------- 1. empty screens, so every link has a target ----------
  const S = { store: {}, product: {}, quick: {}, bag: {} };
  S.home = screenAt('Home', 0, newRow('Home'));
  const contexts = DATA.categories.map((c) => c.id); // 'all' first
  for (const ctx of contexts) {
    const pages = pagesOf(listFor(ctx));
    for (const [key] of SORTS) {
      const y = newRow(`Store · ${catLabel(ctx)} · ${sortLabel(key)}`);
      for (let pg = 1; pg <= pages; pg++) S.store[`${ctx}|${key}|${pg}`] = screenAt(`Store / ${catLabel(ctx)} · ${sortLabel(key)} · p${pg}`, (pg - 1) * (W + GAP), y);
    }
  }
  const storeHome = S.store['all|featured|1'];
  for (let i = 0; i < PRODUCTS.length; i += 7) {
    const y = newRow(i === 0 ? 'Product pages' : '');
    PRODUCTS.slice(i, i + 7).forEach((p, k) => { S.product[p.id] = screenAt(`Product / ${p.brand} ${p.name}`, k * (W + GAP), y); });
  }
  const sample = [{ p: byId['sony-wh-1000xm5'] || PRODUCTS[0], qty: 1 }, { p: byId['moondrop-blessing-3'] || PRODUCTS[1], qty: 1 }];
  const favs = ['sennheiser-hd-600', 'fiio-k11', 'yamaha-hs5'].map((id) => byId[id]).filter(Boolean);
  const flowY = newRow('Checkout and confirmation');
  S.checkout = screenAt('Checkout', 0, flowY);
  S.confirm = screenAt('Order confirmed', W + GAP, flowY);
  const labY = newRow('Tuning Lab');
  S.labDefault = screenAt('Tuning Lab / Default', 0, labY);
  S.labActive = screenAt('Tuning Lab / Dragging band 3', W + GAP, labY);
  S.labPro = screenAt('Tuning Lab / Advanced settings', 2 * (W + GAP), labY);
  const guideY = newRow('Guide');
  S.guide = Array.from({ length: DATA.guide.chapters.length + 1 }, (_, k) => screenAt(k === 0 ? 'Guide / 00 Intro' : `Guide / ${pad2(k)} ${DATA.guide.chapters[k - 1].title}`, k * (W + GAP), guideY));
  const histY = newRow('History');
  S.history = Array.from({ length: DATA.history.length + 1 }, (_, k) => screenAt(k === 0 ? 'History / 00 Intro' : `History / ${pad2(k)} ${DATA.history[k - 1].year}`, k * (W + GAP), histY));

  // ---------- 2. components (left of the screens) ----------
  compArea = figma.createFrame();
  compArea.name = 'Components';
  compArea.layoutMode = 'VERTICAL';
  compArea.primaryAxisSizingMode = 'AUTO';
  compArea.counterAxisSizingMode = 'AUTO';
  compArea.itemSpacing = 40;
  compArea.paddingLeft = compArea.paddingRight = compArea.paddingTop = compArea.paddingBottom = 40;
  compArea.fills = [paint('bg')];
  compArea.cornerRadius = 24;
  compArea.x = -3400;
  compArea.y = 600;
  await step('Components', async () => { buildComponents(); await wireComponentInteractions(); });

  // ---------- 3. overlays: quick view + bag per product, nav bag, favourites ----------
  await step('Overlays', async () => {
    let y = newRow('Quick view overlays (open from a store card)', 600);
    PRODUCTS.forEach((p, i) => {
      if (i && i % 10 === 0) y = newRow('', 600);
      S.quick[p.id] = quickView(p, (i % 10) * 1100, y);
    });
    y = newRow('Bag overlays (open from Add to bag)', 760);
    PRODUCTS.forEach((p, i) => {
      if (i && i % 14 === 0) y = newRow('', 760);
      S.bag[p.id] = bagSheet([{ p, qty: 1 }], (i % 14) * 640, y);
    });
    y = newRow('Nav: bag and favourites', 760);
    S.bagNav = bagSheet(sample, 0, y);
    S.favs = favouritesSheet(favs, 640, y);
  });

  // Nav links live in the Nav component, so every screen inherits them.
  await step('Nav links', async () => {
    const dest = { Home: S.home, Store: storeHome, 'Tuning Lab': S.labDefault, Guide: S.guide[0], History: S.history[0] };
    const overlayOf = (f) => ({ type: 'NODE', destinationId: f.id, navigation: 'OVERLAY', transition: smart(300) });
    for (const v of C.nav.children) {
      for (const [label, d] of Object.entries(dest)) await react(v.findOne((x) => x.name === `Link/${label}`), [on('ON_CLICK', nav(d))]);
      if (S.bagNav) await react(v.findOne((x) => x.name === 'Bag'), [on('ON_CLICK', overlayOf(S.bagNav.f))]);
      if (S.favs) await react(v.findOne((x) => x.name === 'Favourites'), [on('ON_CLICK', overlayOf(S.favs.f))]);
    }
  });

  // ---------- 4. Home ----------
  await step('Home', async () => {
    const home = buildHome(S.home);
    await react(home.ctas.children[0], [on('ON_CLICK', nav(S.labDefault))]);
    await react(home.ctas.children[1], [on('ON_CLICK', nav(S.guide[0]))]);
    const entryDest = [storeHome, S.labDefault, S.guide[0], S.history[0]];
    for (let k = 0; k < entryDest.length; k++) await react(home.cards.children[k], [on('ON_CLICK', nav(entryDest[k]))]);
  });

  // ---------- 5. Store listings ----------
  const overlay = (f) => ({ type: 'NODE', destinationId: f.id, navigation: 'OVERLAY', transition: smart(320) });
  const swap = (f) => ({ type: 'NODE', destinationId: f.id, navigation: 'SWAP', transition: smart(320) });
  await step('Store listings', async () => {
    const hoverCard = variant(C.card, 'Hover');
    for (const ctx of contexts) {
      const base = listFor(ctx);
      const pages = pagesOf(base);
      for (const [key] of SORTS) {
        const sorted = sortedBy(base, key);
        for (let pg = 1; pg <= pages; pg++) {
          const ui = storeScreen(S.store[`${ctx}|${key}|${pg}`], {
            title: ctx === 'all' ? 'The listening room' : catLabel(ctx),
            subtitle: ctx === 'all' ? 'Speakers, headphones, IEMs and studio gear, measured and tunable' : `${base.length} products in ${catLabel(ctx).toLowerCase()}`,
            category: ctx, sort: key, page: pg, pages, count: base.length,
            products: sorted.slice((pg - 1) * PER_PAGE, pg * PER_PAGE),
          });
          for (const [id, node] of Object.entries(ui.chipNodes)) if (id !== ctx) await react(node, [on('ON_CLICK', nav(S.store[`${id}|featured|1`], smart(380)))]);
          for (const [k2, node] of Object.entries(ui.sortNodes)) if (k2 !== key) await react(node, [on('ON_CLICK', nav(S.store[`${ctx}|${k2}|1`], smart(380)))]);
          for (const [p2, item] of ui.pageItems) if (p2 !== pg) await react(item, [on('ON_CLICK', nav(S.store[`${ctx}|${key}|${p2}`], smart(380)))]);
          if (ui.prev && pg > 1) await react(ui.prev, [on('ON_CLICK', nav(S.store[`${ctx}|${key}|${pg - 1}`], smart(380)))]);
          if (ui.next && pg < pages) await react(ui.next, [on('ON_CLICK', nav(S.store[`${ctx}|${key}|${pg + 1}`], smart(380)))]);
          for (const [p, card] of ui.cards) await react(card, [on('ON_HOVER', changeTo(hoverCard, 220)), on('ON_CLICK', overlay(S.quick[p.id].f))]);
        }
      }
    }
  });

  // ---------- 6. Product pages, overlay links, checkout ----------
  await step('Product pages', async () => {
    for (const p of PRODUCTS) {
      const related = PRODUCTS.filter((r) => r.category === p.category && r.id !== p.id).concat(PRODUCTS.filter((r) => r.category !== p.category)).slice(0, 4);
      const ui = productPage(S.product[p.id], p, related);
      await react(ui.crumbStore, [on('ON_CLICK', nav(storeHome))]);
      await react(ui.crumbCat, [on('ON_CLICK', nav(S.store[`${p.category}|featured|1`]))]);
      await react(ui.addBtn, [on('ON_CLICK', overlay(S.bag[p.id].f))]);
      await react(ui.favBtn, [on('ON_CLICK', overlay(S.favs.f))]);
      if (ui.tuneBtn) await react(ui.tuneBtn, [on('ON_CLICK', nav(S.labDefault))]);
      for (const [r, mini] of ui.minis) await react(mini, [on('ON_CLICK', nav(S.product[r.id], smart(400)))]);
    }
  });
  await step('Overlay links', async () => {
    for (const p of PRODUCTS) {
      const q = S.quick[p.id];
      await react(q.add, [on('ON_CLICK', swap(S.bag[p.id].f))]);
      await react(q.details, [on('ON_CLICK', nav(S.product[p.id]))]);
      await react(q.close, [on('ON_CLICK', { type: 'CLOSE' })]);
    }
    for (const b of [...Object.values(S.bag), S.bagNav]) {
      await react(b.checkout, [on('ON_CLICK', nav(S.checkout))]);
      await react(b.keep, [on('ON_CLICK', { type: 'CLOSE' })]);
      await react(b.close, [on('ON_CLICK', { type: 'CLOSE' })]);
    }
    for (const [p, add] of S.favs.adds) await react(add, [on('ON_CLICK', swap(S.bag[p.id].f))]);
    await react(S.favs.close, [on('ON_CLICK', { type: 'CLOSE' })]);
  });
  await step('Checkout', async () => {
    const co = checkoutScreen(S.checkout, sample);
    await react(co.placeOrder, [on('ON_CLICK', nav(S.confirm, smart(500)))]);
    await react(co.back, [on('ON_CLICK', nav(storeHome))]);
    const done = confirmationScreen(S.confirm, sample);
    await react(done.cont, [on('ON_CLICK', nav(storeHome))]);
    await react(done.lab, [on('ON_CLICK', nav(S.labDefault))]);
  });

  // ---------- 7. Tuning Lab ----------
  await step('Tuning Lab', async () => {
    const labD = labScreen(S.labDefault, 'default', false);
    const labA = labScreen(S.labActive, 'active', false);
    const labP = labScreen(S.labPro, 'default', true);
    const hoverNode = variant(C.node, 'Hover');
    for (const ui of [labD, labP]) await react(ui.nodes[3], [on('ON_HOVER', changeTo(hoverNode, 160)), on('ON_DRAG', nav(S.labActive, smart(450))), on('ON_CLICK', nav(S.labActive, smart(450)))]);
    await react(labA.nodes[3], [on('ON_CLICK', nav(S.labDefault, smart(450))), on('ON_DRAG', nav(S.labDefault, smart(450)))]);
    await react(labD.advRow, [on('ON_CLICK', nav(S.labPro, smart(400)))]);
    await react(labA.advRow, [on('ON_CLICK', nav(S.labPro, smart(400)))]);
    await react(labP.advRow, [on('ON_CLICK', nav(S.labDefault, smart(400)))]);
  });

  // ---------- 8. Guide ----------
  await step('Guide', async () => {
    const total = S.guide.length;
    for (let k = 0; k < total; k++) {
      const ui = guideScreen(S.guide[k], k, total);
      const last = k === total - 1;
      await react(ui.next, [on('ON_CLICK', nav(last ? S.labDefault : S.guide[k + 1], last ? dissolve() : smart(600)))]);
      if (ui.prev) await react(ui.prev, [on('ON_CLICK', nav(S.guide[k - 1], smart(600)))]);
      if (!last) await react(ui.swipe, [on('ON_DRAG', nav(S.guide[k + 1], smart(600)))]);
    }
  });

  // ---------- 9. History ----------
  await step('History', async () => {
    const total = S.history.length;
    for (let k = 0; k < total; k++) {
      const ui = historyScreen(S.history[k], k);
      const last = k === total - 1;
      await react(ui.next, [on('ON_CLICK', nav(last ? S.labDefault : S.history[k + 1], last ? dissolve() : smart(700)))]);
      if (ui.prev) await react(ui.prev, [on('ON_CLICK', nav(S.history[k - 1], smart(700)))]);
      if (!last) await react(ui.swipe, [on('ON_DRAG', nav(S.history[k + 1], smart(700)))]);
      for (let y = 0; y < ui.years.length; y++) if (y + 1 !== k) await react(ui.years[y], [on('ON_CLICK', nav(S.history[y + 1], smart(800)))]);
    }
  });

  await step('Flows', async () => {
    page.flowStartingPoints = [
      { nodeId: S.home.id, name: 'Full site' },
      { nodeId: storeHome.id, name: 'Store' },
      { nodeId: S.labDefault.id, name: 'Tuning Lab' },
      { nodeId: S.guide[0].id, name: 'Guide' },
      { nodeId: S.history[0].id, name: 'History' },
    ];
  });
  if (missingFonts.length) REPORT.errors.push(`Fonts not available, Inter used instead: ${missingFonts.join(', ')}`);
  writeReport(page, 0, 0);
  figma.viewport.scrollAndZoomIntoView([S.home]);
  const screens = page.children.filter((x) => x.type === 'FRAME' && x.width === W && x.height === H).length;
  return `Built "${name}": ${screens} screens, ${REPORT.links} links${REPORT.errors.length ? `, ${REPORT.errors.length} problems (see Build report)` : ', no problems'}.`;
}

main()
  .then((msg) => figma.closePlugin(msg))
  .catch((err) => {
    console.error(err);
    figma.closePlugin(`Oura Prototype Builder failed: ${err && err.message ? err.message : err}`);
  });
