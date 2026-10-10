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

const V = {};
async function makeTokens() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let coll = collections.find((c) => c.name === 'Oura tokens');
  if (!coll) coll = figma.variables.createVariableCollection('Oura tokens');
  const mode = coll.modes[0].modeId;
  coll.renameMode(mode, 'Dark');
  const existing = await figma.variables.getLocalVariablesAsync();
  const BG = ['FRAME_FILL', 'SHAPE_FILL'];
  const defs = [
    ['color/bg', 'COLOR', hex('#0c0b0a'), BG, '--bg'],
    ['color/surface', 'COLOR', hex('#161412'), BG, '--surface'],
    ['color/surface-2', 'COLOR', hex('#1e1b18'), BG, '--surface-2'],
    ['color/well', 'COLOR', hex('#110f0e'), BG, '--well'],
    ['color/hairline', 'COLOR', hex('#f3eee6', 0.12), ['STROKE_COLOR', 'FRAME_FILL', 'SHAPE_FILL'], '--hairline'],
    ['color/text-hi', 'COLOR', hex('#f3eee6'), ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'], '--text-hi'],
    ['color/text-lo', 'COLOR', hex('#a89f93'), ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'], '--text-lo'],
    ['color/accent', 'COLOR', hex('#e3c58e'), ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR'], '--accent'],
    ['color/accent-ink', 'COLOR', hex('#1a1408'), ['TEXT_FILL', 'SHAPE_FILL'], '--accent-ink'],
    ['color/plot-1', 'COLOR', hex('#e0708f'), ['STROKE_COLOR', 'SHAPE_FILL', 'FRAME_FILL', 'TEXT_FILL'], '--plot-1'],
    ['color/plot-2', 'COLOR', hex('#3fb8a8'), ['STROKE_COLOR', 'SHAPE_FILL', 'FRAME_FILL', 'TEXT_FILL'], '--plot-2'],
    ['radius/sm', 'FLOAT', 12, ['CORNER_RADIUS'], '--radius-sm'],
    ['radius/md', 'FLOAT', 18, ['CORNER_RADIUS'], '--radius-md'],
    ['radius/lg', 'FLOAT', 28, ['CORNER_RADIUS'], '--radius-lg'],
  ];
  for (const [name, type, value, scopes, css] of defs) {
    let v = existing.find((x) => x.name === name && x.variableCollectionId === coll.id);
    if (!v) v = figma.variables.createVariable(name, coll, type);
    v.setValueForMode(mode, value);
    v.scopes = scopes;
    v.setVariableCodeSyntax('WEB', `var(${css})`);
    V[name] = v;
  }
}
const paint = (name, opacity) => {
  const p = figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V[`color/${name}`]);
  return opacity === undefined ? p : Object.assign({}, p, { opacity });
};
const radius = (node, name) => {
  for (const corner of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) node.setBoundVariable(corner, V[`radius/${name}`]);
};
const clear = () => [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0 }];

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

function buildComponents(screens) {
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
    c.paddingBottom = 16;
    c.itemSpacing = 12;
    radius(c, 'lg');
    c.fills = [paint(hover ? 'surface-2' : 'surface')];
    c.strokes = [paint(hover ? 'accent' : 'hairline')];
    c.strokeWeight = 1;
    c.effects = shadow(hover ? 30 : 18, hover ? 60 : 40, hover ? 0.6 : 0.4);
    const media = figma.createFrame();
    media.name = 'Media';
    media.resize(278, 150);
    media.fills = [paint('well')];
    radius(media, 'md');
    media.clipsContent = true;
    const quick = box('row', { name: 'Quick view', px: 14, py: 8, radius: 999, fill: 'surface', kids: [text('Quick view', { font: 'uiSemi', size: 13 })] });
    place(media, quick, 139 - quick.width / 2, hover ? 104 : 118);
    quick.opacity = hover ? 1 : 0;
    c.appendChild(media);
    c.appendChild(box('col', { name: 'Info', gap: 6, px: 8, kids: [
      text('Brand', { name: 'Brand', size: 13, color: 'text-lo' }),
      text('Product name', { name: 'Name', font: 'display', size: 17, w: 262, lh: 115 }),
      text('★ 4.7 (1,024)', { name: 'Rating', size: 13, color: 'text-lo' }),
      text('$129.99', { name: 'Price', font: 'display', size: 19 }),
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

function storeScreen(frame, o) {
  glow(frame, 1000, -300, 700, 'plot-1', 0.08);
  const head = box('row', { name: 'Header', w: W - 192, justify: 'SPACE_BETWEEN', align: 'MAX' });
  head.appendChild(box('col', { name: 'Title', gap: 4, kids: [text(o.title, { font: 'display', size: 42, ls: -1 }), text(o.subtitle, { size: 15, color: 'text-lo' })] }));
  const pager = box('row', { name: 'Pagination', gap: 8, align: 'CENTER' });
  pager.appendChild(text(`Page ${o.page} of ${o.pages}`, { size: 14, color: 'text-lo' }));
  const pageItems = [];
  const shown = o.pages <= 4 ? Array.from({ length: o.pages }, (_, i) => i + 1) : [1, 2, 3, '…', o.pages];
  for (const p of shown) {
    if (p === '…') { pager.appendChild(text('…', { color: 'text-lo' })); continue; }
    const item = inst(C.page, p === o.page ? 'Active' : 'Default', { [C.pageLabel]: String(p) });
    item.name = `Page ${p}`;
    pager.appendChild(item);
    pageItems.push([p, item]);
  }
  const next = inst(C.page, 'Default', { [C.pageLabel]: '→' });
  next.name = 'Next page';
  pager.appendChild(next);
  head.appendChild(pager);
  place(frame, head, 96, 108);
  const chips = box('row', { name: 'Filters', gap: 8 });
  const chipNodes = {};
  for (const c of DATA.categories) {
    const ch = chip(c.id === 'iems' ? 'In-ear monitors' : c.label, c.id === o.category);
    ch.name = `Filter/${c.id}`;
    chips.appendChild(ch);
    chipNodes[c.id] = ch;
  }
  place(frame, chips, 96, 196);
  const grid = box('row', { name: 'Grid', w: W - 192, gap: 24 });
  grid.layoutWrap = 'WRAP';
  grid.counterAxisSpacing = 20;
  const cards = [];
  for (const p of o.products) {
    const card = inst(C.card, 'Default');
    card.name = `Card/${p.id}`;
    card.findOne((n) => n.name === 'Media').fills = [imagePaint(`product:${p.id}`)];
    const set = (layer, value) => { const t = card.findOne((n) => n.type === 'TEXT' && n.name === layer); if (t) t.characters = value; };
    set('Brand', p.brand);
    set('Name', p.name);
    set('Rating', `★ ${p.rating.toFixed(1)}  (${p.reviews.toLocaleString('en-US')})`);
    set('Price', money(p.price));
    grid.appendChild(card);
    cards.push([p, card]);
  }
  place(frame, grid, 96, 252);
  navBar(frame, 'Store');
  return { pageItems, next, chipNodes, cards };
}

function productOverlay(p, col, y) {
  const f = figma.createFrame();
  f.name = `Overlay / ${p.brand} ${p.name}`;
  f.resize(1040, 620);
  f.x = col * 1160;
  f.y = y;
  f.fills = [paint('surface')];
  radius(f, 'lg');
  f.strokes = [paint('hairline')];
  f.strokeWeight = 1;
  f.effects = shadow(40, 120, 0.7);
  f.clipsContent = true;
  place(f, rect(500, 620, { name: 'Image', image: `product:${p.id}` }), 0, 0);
  const category = (DATA.categories.find((c) => c.id === p.category) || {}).label || '';
  const info = box('col', { name: 'Details', gap: 12, w: 460 });
  info.appendChild(text(`${p.brand} · ${category}`, { size: 13, color: 'text-lo' }));
  info.appendChild(text(p.name, { name: 'Name', font: 'display', size: 32, w: 440, lh: 105 }));
  info.appendChild(text(`★ ${p.rating.toFixed(1)}  (${p.reviews.toLocaleString('en-US')} reviews)`, { size: 13, color: 'text-lo' }));
  info.appendChild(text(money(p.price) + (p.compareAt ? `   was ${money(p.compareAt)}` : ''), { font: 'display', size: 24 }));
  info.appendChild(text(p.blurb, { size: 14, color: 'text-lo', w: 440, lh: 150 }));
  const specs = box('col', { name: 'Spec sheet', w: 440 });
  for (const [k, v] of Object.entries(p.specs).slice(0, 4)) {
    const r = box('row', { name: `Spec/${k}`, w: 440, py: 8, justify: 'SPACE_BETWEEN', kids: [text(k, { size: 13, color: 'text-lo' }), text(String(v), { size: 13, w: 270, align: 'RIGHT' })] });
    r.strokes = [paint('hairline')];
    r.strokeTopWeight = 1;
    r.strokeBottomWeight = 0;
    r.strokeLeftWeight = 0;
    r.strokeRightWeight = 0;
    specs.appendChild(r);
  }
  info.appendChild(specs);
  const tune = button('Tune in the Lab', 'Secondary');
  info.appendChild(box('row', { name: 'Buttons', gap: 10, kids: [button('Add to bag', 'Primary'), tune] }));
  place(f, info, 540, 40);
  const close = place(f, box('row', { name: 'Close', w: 40, h: 40, radius: 999, fill: 'surface-2', stroke: 'hairline', justify: 'CENTER', align: 'CENTER', kids: [text('×', { size: 20 })] }), 984, 16);
  return { f, close, tune };
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

async function main() {
  const missingFonts = await loadFonts();
  await makeTokens();
  let name = 'Prototype v2';
  let n = 2;
  while (figma.root.children.some((p) => p.name === name)) name = `Prototype v2 (${n++})`;
  const page = figma.createPage();
  page.name = name;
  await figma.setCurrentPageAsync(page);

  const ROW = { home: 0, store: 1, overlays: 2, lab: 3, guide: 4, history: 5, components: 6 };
  for (const [label, row] of [['Home', ROW.home], ['Store', ROW.store], ['Product details (open as overlays)', ROW.overlays], ['Tuning Lab', ROW.lab], ['Guide', ROW.guide], ['History', ROW.history], ['Components', ROW.components]]) {
    rowLabel(page, label, row * ROW_H - 110);
  }

  // 1. Empty screens first, so everything can link to them.
  const s = {
    home: screen('Home', 0, ROW.home),
    storeAll1: screen('Store / All · page 1', 0, ROW.store),
    storeAll2: screen('Store / All · page 2', 1, ROW.store),
    storeMonitors: screen('Store / Studio monitors', 2, ROW.store),
    storeIems: screen('Store / In-ear monitors', 3, ROW.store),
    labDefault: screen('Tuning Lab / Default', 0, ROW.lab),
    labActive: screen('Tuning Lab / Dragging band 3', 1, ROW.lab),
    labPro: screen('Tuning Lab / Advanced settings', 2, ROW.lab),
    guide: Array.from({ length: DATA.guide.chapters.length + 1 }, (_, k) => screen(k === 0 ? 'Guide / 00 Intro' : `Guide / ${pad2(k)} ${DATA.guide.chapters[k - 1].title}`, k, ROW.guide)),
    history: Array.from({ length: DATA.history.length + 1 }, (_, k) => screen(k === 0 ? 'History / 00 Intro' : `History / ${pad2(k)} ${DATA.history[k - 1].year}`, k, ROW.history)),
  };

  // 2. Components (on this page, so their links can target the screens).
  compArea = figma.createFrame();
  compArea.name = 'Components';
  compArea.layoutMode = 'VERTICAL';
  compArea.primaryAxisSizingMode = 'AUTO';
  compArea.counterAxisSizingMode = 'AUTO';
  compArea.itemSpacing = 40;
  compArea.paddingLeft = compArea.paddingRight = compArea.paddingTop = compArea.paddingBottom = 40;
  compArea.fills = [paint('bg')];
  compArea.cornerRadius = 24;
  compArea.x = 0;
  compArea.y = ROW.components * ROW_H;
  buildComponents(s);
  await wireComponentInteractions();
  const navDest = { Home: s.home, Store: s.storeAll1, 'Tuning Lab': s.labDefault, Guide: s.guide[0], History: s.history[0] };
  for (const v of C.nav.children) {
    for (const [label, dest] of Object.entries(navDest)) {
      const link = v.findOne((x) => x.name === `Link/${label}`);
      if (link) await link.setReactionsAsync([on('ON_CLICK', nav(dest))]);
    }
  }

  // 3. Home
  const home = buildHome(s.home);
  await home.ctas.children[0].setReactionsAsync([on('ON_CLICK', nav(s.labDefault))]);
  await home.ctas.children[1].setReactionsAsync([on('ON_CLICK', nav(s.guide[0]))]);
  const entryDest = [s.storeAll1, s.labDefault, s.guide[0], s.history[0]];
  for (let k = 0; k < entryDest.length; k++) await home.cards.children[k].setReactionsAsync([on('ON_CLICK', nav(entryDest[k]))]);

  // 4. Store: 4 browsing screens + one overlay per product shown
  const pages = Math.ceil(DATA.total / 8);
  const sub = `${DATA.total} products · speakers to studio gear`;
  const stores = [
    [s.storeAll1, { title: 'The listening room', subtitle: sub, category: 'all', page: 1, pages, products: DATA.store.all1 }],
    [s.storeAll2, { title: 'The listening room', subtitle: sub, category: 'all', page: 2, pages, products: DATA.store.all2 }],
    [s.storeMonitors, { title: 'Studio monitors', subtitle: `${DATA.store.monitors.length} products · honest, flat speakers for mixing`, category: 'monitors', page: 1, pages: 1, products: DATA.store.monitors }],
    [s.storeIems, { title: 'In-ear monitors', subtitle: `${DATA.store.iems.length} products · stage-grade sound in your ears`, category: 'iems', page: 1, pages: 1, products: DATA.store.iems }],
  ];
  const overlayFor = {};
  let oc = 0;
  for (const [, o] of stores) for (const p of o.products) if (!overlayFor[p.id]) overlayFor[p.id] = productOverlay(p, oc++, ROW.overlays * ROW_H);
  const hoverCard = variant(C.card, 'Hover');
  const chipDest = { all: s.storeAll1, monitors: s.storeMonitors, iems: s.storeIems };
  for (const [frame, o] of stores) {
    const ui = storeScreen(frame, o);
    for (const [p, card] of ui.cards) {
      // keep the inherited hover state and add the overlay on click
      await card.setReactionsAsync([on('ON_HOVER', changeTo(hoverCard, 220)), on('ON_CLICK', { type: 'NODE', destinationId: overlayFor[p.id].f.id, navigation: 'OVERLAY', transition: smart(320) })]);
    }
    if (o.category === 'all') {
      const pageDest = { 1: s.storeAll1, 2: s.storeAll2 };
      for (const [p, item] of ui.pageItems) if (pageDest[p] && pageDest[p] !== frame) await item.setReactionsAsync([on('ON_CLICK', nav(pageDest[p], smart(400)))]);
      await ui.next.setReactionsAsync([on('ON_CLICK', nav(o.page === 1 ? s.storeAll2 : s.storeAll1, smart(400)))]);
    }
    for (const [id, dest] of Object.entries(chipDest)) if (dest !== frame) await ui.chipNodes[id].setReactionsAsync([on('ON_CLICK', nav(dest, smart(400)))]);
  }
  for (const ov of Object.values(overlayFor)) {
    await ov.close.setReactionsAsync([on('ON_CLICK', { type: 'CLOSE' })]);
    await ov.tune.setReactionsAsync([on('ON_CLICK', nav(s.labDefault))]);
  }

  // 5. Tuning Lab: Default → (drag or click node 3) Dragging; Advanced row → Advanced settings
  const labD = labScreen(s.labDefault, 'default', false);
  const labA = labScreen(s.labActive, 'active', false);
  const labP = labScreen(s.labPro, 'default', true);
  const hoverNode = variant(C.node, 'Hover');
  await labD.nodes[3].setReactionsAsync([on('ON_HOVER', changeTo(hoverNode, 160)), on('ON_DRAG', nav(s.labActive, smart(450))), on('ON_CLICK', nav(s.labActive, smart(450)))]);
  await labP.nodes[3].setReactionsAsync([on('ON_HOVER', changeTo(hoverNode, 160)), on('ON_DRAG', nav(s.labActive, smart(450))), on('ON_CLICK', nav(s.labActive, smart(450)))]);
  await labA.nodes[3].setReactionsAsync([on('ON_CLICK', nav(s.labDefault, smart(450))), on('ON_DRAG', nav(s.labDefault, smart(450)))]);
  await labD.advRow.setReactionsAsync([on('ON_CLICK', nav(s.labPro, smart(400)))]);
  await labA.advRow.setReactionsAsync([on('ON_CLICK', nav(s.labPro, smart(400)))]);
  await labP.advRow.setReactionsAsync([on('ON_CLICK', nav(s.labDefault, smart(400)))]);

  // 6. Guide: frame by frame, Smart Animate on click and drag
  const gTotal = s.guide.length;
  for (let k = 0; k < gTotal; k++) {
    const ui = guideScreen(s.guide[k], k, gTotal);
    const last = k === gTotal - 1;
    await ui.next.setReactionsAsync([on('ON_CLICK', nav(last ? s.labDefault : s.guide[k + 1], last ? dissolve() : smart(600)))]);
    if (ui.prev) await ui.prev.setReactionsAsync([on('ON_CLICK', nav(s.guide[k - 1], smart(600)))]);
    if (!last) await ui.swipe.setReactionsAsync([on('ON_DRAG', nav(s.guide[k + 1], smart(600)))]);
  }

  // 7. History: same pattern, plus clickable years on the rail
  const hTotal = s.history.length;
  for (let k = 0; k < hTotal; k++) {
    const ui = historyScreen(s.history[k], k);
    const last = k === hTotal - 1;
    await ui.next.setReactionsAsync([on('ON_CLICK', nav(last ? s.labDefault : s.history[k + 1], last ? dissolve() : smart(700)))]);
    if (ui.prev) await ui.prev.setReactionsAsync([on('ON_CLICK', nav(s.history[k - 1], smart(700)))]);
    if (!last) await ui.swipe.setReactionsAsync([on('ON_DRAG', nav(s.history[k + 1], smart(700)))]);
    for (let y = 0; y < ui.years.length; y++) if (y + 1 !== k) await ui.years[y].setReactionsAsync([on('ON_CLICK', nav(s.history[y + 1], smart(800)))]);
  }

  page.flowStartingPoints = [
    { nodeId: s.home.id, name: 'Full site' },
    { nodeId: s.storeAll1.id, name: 'Store' },
    { nodeId: s.labDefault.id, name: 'Tuning Lab' },
    { nodeId: s.guide[0].id, name: 'Guide' },
    { nodeId: s.history[0].id, name: 'History' },
  ];
  figma.viewport.scrollAndZoomIntoView([s.home]);
  const screens = 1 + stores.length + 3 + gTotal + hTotal;
  return `Built "${name}": ${screens} screens, ${Object.keys(overlayFor).length} product overlays, 8 interactive component sets.${missingFonts.length ? ` Fonts swapped to Inter: ${missingFonts.join(', ')}.` : ''}`;
}

main()
  .then((msg) => figma.closePlugin(msg))
  .catch((err) => {
    console.error(err);
    figma.closePlugin(`Oura Prototype Builder failed: ${err && err.message ? err.message : err}`);
  });
