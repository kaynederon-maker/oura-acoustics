const DATA = __DATA__;
const W = 1440;
const H = 900;
const REPORT = { ok: [], errors: [] };

const THEMES = {
  Obsidian: { bg: '#0e0d0c', surface: '#171513', surface2: '#1f1c19', textHi: '#f1ebe1', textLo: '#a59c90', accent: '#d4b06a', accentInk: '#16110a', plot1: '#e08a7a', plot2: '#7fb8a4' },
  Ivory: { bg: '#f3eee5', surface: '#faf7f1', surface2: '#ece6da', textHi: '#1d1914', textLo: '#62594e', accent: '#7c5b22', accentInk: '#fffaf0', plot1: '#8c3b4a', plot2: '#22655c' },
  Bordeaux: { bg: '#160a0e', surface: '#210f17', surface2: '#2b141e', textHi: '#f4e6df', textLo: '#c0a2a3', accent: '#d6b06c', accentInk: '#1f0e0d', plot1: '#e59a86', plot2: '#b8c4a0' },
  Terra: { bg: '#e8ddca', surface: '#f2e9da', surface2: '#e2d5bf', textHi: '#2a2018', textLo: '#5b4b38', accent: '#6e4c1a', accentInk: '#fff8ef', plot1: '#9a4321', plot2: '#4d6129' },
  Mist: { bg: '#efeef2', surface: '#fbfbfd', surface2: '#e7e5ec', textHi: '#24222d', textLo: '#5d596b', accent: '#76592a', accentInk: '#ffffff', plot1: '#9c3f62', plot2: '#335f9c' },
};
const T = THEMES.Obsidian;

const FONTS = {
  display: [{ family: 'Fraunces', style: 'Light' }, { family: 'Playfair Display', style: 'Regular' }],
  displayItalic: [{ family: 'Fraunces', style: 'Light Italic' }, { family: 'Playfair Display', style: 'Italic' }],
  ui: [{ family: 'Instrument Sans', style: 'Regular' }, { family: 'Inter', style: 'Regular' }],
  uiMedium: [{ family: 'Instrument Sans', style: 'Medium' }, { family: 'Inter', style: 'Medium' }],
  mono: [{ family: 'Geist Mono', style: 'Regular' }, { family: 'Roboto Mono', style: 'Regular' }, { family: 'Inter', style: 'Regular' }],
};
const F = {};

async function loadFonts() {
  for (const [key, options] of Object.entries(FONTS)) {
    for (const font of options) {
      try {
        await figma.loadFontAsync(font);
        F[key] = font;
        break;
      } catch (err) {
        continue;
      }
    }
    if (!F[key]) {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      F[key] = { family: 'Inter', style: 'Regular' };
    }
  }
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
const solid = (hex, opacity = 1) => ({ type: 'SOLID', color: rgb(hex), opacity });

async function step(name, fn) {
  try {
    await fn();
    REPORT.ok.push(name);
  } catch (err) {
    REPORT.errors.push(`${name}: ${err && err.message ? err.message : err}`);
  }
}

function text(chars, o = {}) {
  const t = figma.createText();
  t.fontName = F[o.font || 'ui'];
  t.characters = String(chars);
  t.fontSize = o.size || 15;
  t.fills = [solid(o.color || T.textHi)];
  if (o.tracking) t.letterSpacing = { unit: 'PERCENT', value: o.tracking };
  if (o.lineHeight) t.lineHeight = { unit: 'PERCENT', value: o.lineHeight };
  if (o.upper) t.textCase = 'UPPER';
  if (o.width) {
    t.textAutoResize = 'HEIGHT';
    t.resize(o.width, t.height);
  }
  if (o.name) t.name = o.name;
  return t;
}

function frame(name, w, h, o = {}) {
  const f = figma.createFrame();
  f.name = name;
  f.resize(w, h);
  f.fills = o.fill === null ? [] : [solid(o.fill || T.bg)];
  if (o.radius) f.cornerRadius = o.radius;
  if (o.stroke) {
    f.strokes = [solid(o.stroke, o.strokeOpacity ?? 1)];
    f.strokeWeight = o.strokeWeight || 1;
    if (o.dash) f.dashPattern = o.dash;
  }
  f.clipsContent = o.clip ?? true;
  return f;
}

function put(parent, node, x, y) {
  parent.appendChild(node);
  node.x = x;
  node.y = y;
  return node;
}

function stack(parent, nodes, x, y, gap = 8) {
  let cy = y;
  for (const n of nodes) {
    put(parent, n, x, cy);
    cy += n.height + gap;
  }
  return cy;
}

function line(parent, x1, y1, x2, y2, color = T.accent, weight = 1, dash) {
  const v = figma.createVector();
  const ox = Math.min(x1, x2);
  const oy = Math.min(y1, y2);
  v.vectorPaths = [{ windingRule: 'NONE', data: `M ${x1 - ox} ${y1 - oy} L ${x2 - ox} ${y2 - oy}` }];
  v.strokes = [solid(color)];
  v.strokeWeight = weight;
  if (dash) v.dashPattern = dash;
  parent.appendChild(v);
  v.x = ox;
  v.y = oy;
  return v;
}

function caption(parent, label, x, y, width = 600) {
  return put(parent, text(label, { font: 'uiMedium', size: 11, color: T.accent, tracking: 18, upper: true, width }), x, y);
}

async function newPage(name) {
  const page = figma.createPage();
  page.name = name;
  await figma.setCurrentPageAsync(page);
  page.backgrounds = [solid('#0a0908')];
  return page;
}

async function imageFill(url) {
  const img = await figma.createImageAsync(url);
  return [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
}

const TEXT_STYLES = [['Display/112', 112], ['Display/72', 72], ['Display/48', 48], ['Title/27', 27], ['Body/17', 17], ['Body/15', 15], ['Caps/11', 11], ['Mono/13', 13]];
const PAGE_NAMES = ['00 · Cover', '01 · Design system', '02 · Blueprint', '03 · Prototype', '04 · Themes & devices'];
const COLLECTION = 'Oura · Luxury tokens';

async function clearPrevious() {
  const old = figma.root.children.filter((p) => PAGE_NAMES.includes(p.name));
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) if (c.name === COLLECTION) c.remove();
  const names = new Set(TEXT_STYLES.map(([n]) => n));
  for (const st of await figma.getLocalTextStylesAsync()) if (names.has(st.name)) st.remove();
  return old;
}

const VARS = {};
async function buildVariables() {
  const coll = figma.variables.createVariableCollection(COLLECTION);
  const names = Object.keys(THEMES);
  coll.renameMode(coll.modes[0].modeId, names[0]);
  const modeIds = { [names[0]]: coll.modes[0].modeId };
  for (const n of names.slice(1)) modeIds[n] = coll.addMode(n);
  for (const key of Object.keys(THEMES.Obsidian)) {
    const v = figma.variables.createVariable(`color/${key}`, coll, 'COLOR');
    for (const n of names) v.setValueForMode(modeIds[n], rgb(THEMES[n][key]));
    VARS[key] = v;
  }
  const numbers = { 'radius/xs': 2, 'radius/sm': 6, 'radius/md': 10, 'radius/lg': 14, 'space/1': 4, 'space/2': 8, 'space/3': 12, 'space/4': 16, 'space/5': 24, 'space/6': 32, 'space/7': 48, 'space/8': 64, 'space/9': 96, 'space/10': 128, 'space/11': 192 };
  for (const [name, value] of Object.entries(numbers)) {
    const v = figma.variables.createVariable(name, coll, 'FLOAT');
    for (const n of names) v.setValueForMode(modeIds[n], value);
  }
  return { coll, modeIds };
}

function bound(key) {
  const p = solid(THEMES.Obsidian[key]);
  try {
    return figma.variables.setBoundVariableForPaint(p, 'color', VARS[key]);
  } catch (err) {
    return p;
  }
}

const C = {};
function variants(name, list, make) {
  const comps = list.map((v) => {
    const c = figma.createComponent();
    c.name = v;
    make(c, v);
    return c;
  });
  const set = figma.combineAsVariants(comps, figma.currentPage);
  set.name = name;
  set.layoutMode = 'HORIZONTAL';
  set.primaryAxisSizingMode = 'AUTO';
  set.counterAxisSizingMode = 'AUTO';
  set.itemSpacing = 24;
  set.paddingLeft = set.paddingRight = set.paddingTop = set.paddingBottom = 24;
  set.fills = [solid('#141210')];
  set.cornerRadius = 10;
  C[name] = set;
  return set;
}

function autoRow(c, o = {}) {
  c.layoutMode = 'HORIZONTAL';
  c.primaryAxisSizingMode = 'AUTO';
  c.counterAxisSizingMode = 'AUTO';
  c.counterAxisAlignItems = 'CENTER';
  c.itemSpacing = o.gap ?? 10;
  c.paddingLeft = c.paddingRight = o.px ?? 24;
  c.paddingTop = c.paddingBottom = o.py ?? 14;
}

function underline(c, color, opacity) {
  c.strokes = [solid(color, opacity)];
  c.strokeTopWeight = 0;
  c.strokeLeftWeight = 0;
  c.strokeRightWeight = 0;
  c.strokeBottomWeight = 1;
}

async function linkVariants(set, a, b, trigger, both) {
  const from = set.children.find((n) => n.name === a);
  const to = set.children.find((n) => n.name === b);
  const trans = { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 0.42 };
  await from.setReactionsAsync([{ trigger: { type: trigger }, actions: [{ type: 'NODE', destinationId: to.id, navigation: 'CHANGE_TO', transition: trans, preserveScrollPosition: false }] }]);
  if (both) await to.setReactionsAsync([{ trigger: { type: trigger }, actions: [{ type: 'NODE', destinationId: from.id, navigation: 'CHANGE_TO', transition: trans, preserveScrollPosition: false }] }]);
}

async function buildComponents(board) {
  const btn = variants('Button', ['Style=Primary, State=Default', 'Style=Primary, State=Hover', 'Style=Secondary, State=Default', 'Style=Secondary, State=Hover'], (c, v) => {
    autoRow(c);
    c.cornerRadius = 999;
    const primary = v.includes('Primary');
    const hover = v.includes('Hover');
    c.fills = primary ? [bound('accent')] : [];
    c.strokes = primary ? [] : [solid(hover ? T.accent : T.textHi, hover ? 0.6 : 0.24)];
    if (primary && hover) c.effects = [{ type: 'DROP_SHADOW', color: { ...rgb(T.accent), a: 0.45 }, offset: { x: 0, y: 14 }, radius: 30, spread: -12, visible: true, blendMode: 'NORMAL' }];
    c.appendChild(text('Open the Tuning Lab', { font: 'uiMedium', size: 12, tracking: 16, upper: true, color: primary ? T.accentInk : T.textHi }));
  });
  const lever = variants('Lever', ['State=Off', 'State=On'], (c, v) => {
    c.resize(42, 22);
    c.cornerRadius = 999;
    const on = v.includes('On');
    c.fills = [solid(on ? T.accent : T.surface2, on ? 0.22 : 1)];
    c.strokes = [solid(on ? T.accent : T.textHi, on ? 0.6 : 0.24)];
    const knob = figma.createEllipse();
    knob.name = 'Lever knob';
    knob.resize(16, 16);
    knob.fills = [solid(T.accent)];
    put(c, knob, on ? 23 : 3, 3);
  });
  const chip = variants('Filter chip', ['State=Off', 'State=On'], (c, v) => {
    autoRow(c, { px: 12, py: 12 });
    c.fills = [];
    const on = v.includes('On');
    c.appendChild(text('In-ear monitors', { font: 'uiMedium', size: 11, tracking: 14, upper: true, color: on ? T.textHi : T.textLo }));
    if (on) underline(c, T.accent, 1);
  });
  const part = variants('History part', ['State=Default', 'State=Active'], (c, v) => {
    autoRow(c, { px: 0, py: 10, gap: 12 });
    c.fills = [];
    const on = v.includes('Active');
    if (on) c.paddingLeft = 10;
    c.appendChild(text('01', { font: 'mono', size: 11, color: on ? T.accent : T.textLo }));
    c.appendChild(text('Erase, record, play', { font: 'uiMedium', size: 13, tracking: 6, upper: true, color: on ? T.textHi : T.textLo }));
    underline(c, on ? T.accent : T.textHi, on ? 0.55 : 0.13);
  });
  const needle = variants('Needle drop', ['State=Idle', 'State=Playing'], (c, v) => {
    autoRow(c, { px: 0, py: 4, gap: 18 });
    c.fills = [];
    const disc = figma.createEllipse();
    disc.resize(58, 58);
    disc.fills = [solid('#161616')];
    disc.strokes = [solid(v.includes('Playing') ? T.accent : T.textHi, v.includes('Playing') ? 1 : 0.24)];
    c.appendChild(disc);
    c.appendChild(text(v.includes('Playing') ? 'Lift the needle' : 'Hear 1967', { font: 'uiMedium', size: 12, tracking: 16, upper: true }));
  });
  const knob = figma.createComponent();
  knob.name = 'Knob';
  knob.resize(108, 108);
  knob.fills = [];
  const skirt = figma.createEllipse();
  skirt.resize(68, 68);
  skirt.fills = [solid('#b8945c')];
  put(knob, skirt, 20, 20);
  const cap = figma.createEllipse();
  cap.resize(58, 58);
  cap.fills = [solid('#2a2622')];
  put(knob, cap, 25, 25);
  line(knob, 54, 54, 54, 30, '#f3ead8', 2.2);

  let y = 120;
  for (const s of [btn, lever, chip, part, needle]) {
    caption(board, s.name, 80, y - 24, 300);
    put(board, s, 80, y);
    y += s.height + 70;
  }
  caption(board, 'Knob', 80, y - 24, 300);
  put(board, knob, 80, y);

  await linkVariants(lever, 'State=Off', 'State=On', 'ON_CLICK', true);
  await linkVariants(part, 'State=Default', 'State=Active', 'ON_CLICK', true);
  await linkVariants(needle, 'State=Idle', 'State=Playing', 'ON_CLICK', true);
  await linkVariants(chip, 'State=Off', 'State=On', 'ON_CLICK', true);
  await linkVariants(btn, 'Style=Primary, State=Default', 'Style=Primary, State=Hover', 'ON_HOVER', false);
  await linkVariants(btn, 'Style=Secondary, State=Default', 'Style=Secondary, State=Hover', 'ON_HOVER', false);
}

async function buildCover() {
  const page = await newPage('00 · Cover');
  const f = put(page, frame('Cover', 1920, 1080), 0, 0);
  caption(f, 'Oura Acoustics · Redesign blueprint v3.1', 140, 180);
  put(f, text('Luxury', { font: 'display', size: 220, tracking: -4 }), 132, 230);
  put(f, text('listening room.', { font: 'displayItalic', size: 220, tracking: -4, color: T.accent }), 132, 470);
  put(f, text('Design system, sitemap and flows, annotated wireframes, and a 29-screen clickable prototype of the live site, including the Ask Oura assistant, the photo inspector and the AI Sommelier.', { size: 22, color: T.textLo, width: 900, lineHeight: 150 }), 140, 760);
  put(f, text(DATA.live, { font: 'mono', size: 16, color: T.accent }), 140, 880);
  line(f, 140, 940, 1780, 940, T.textHi, 1);
  put(f, text('Pages: 01 Design system · 02 Blueprint · 03 Prototype · 04 Themes & devices', { font: 'uiMedium', size: 13, tracking: 14, upper: true, color: T.textLo }), 140, 960);
}

async function buildDesignSystem() {
  const page = await newPage('01 · Design system');
  const { coll, modeIds } = await buildVariables();
  const board = put(page, frame('Tokens · five themes', 2200, 1240), 0, 0);
  caption(board, 'Colour tokens (variables, one mode per theme)', 80, 60, 900);
  const keys = Object.keys(THEMES.Obsidian);
  for (const [col, n] of Object.keys(THEMES).entries()) {
    const card = put(board, frame(n, 380, 1000, { radius: 14, stroke: '#ffffff', strokeOpacity: 0.1 }), 80 + col * 410, 120);
    card.fills = [bound('bg')];
    try {
      card.setExplicitVariableModeForCollection(coll, modeIds[n]);
    } catch (err) {
      card.fills = [solid(THEMES[n].bg)];
    }
    put(card, text(n, { font: 'display', size: 40, color: THEMES[n].textHi }), 28, 28);
    keys.forEach((k, i) => {
      const sw = put(card, frame(k, 56, 56, { radius: 28 }), 28, 110 + i * 96);
      sw.fills = [bound(k)];
      put(card, text(k, { font: 'uiMedium', size: 12, tracking: 12, upper: true, color: THEMES[n].textHi }), 104, 118 + i * 96);
      put(card, text(THEMES[n][k], { font: 'mono', size: 12, color: THEMES[n].textLo }), 104, 140 + i * 96);
    });
  }

  const type = put(page, frame('Type scale', 1400, 1240), 2300, 0);
  caption(type, 'Type · Fraunces (display) · Instrument Sans (UI) · Geist Mono (data)', 80, 60, 1200);
  const samples = [['display', 112, 'Every sound has a history.'], ['display', 72, 'Tune like a studio.'], ['display', 48, 'Objects for listening'], ['display', 27, 'The phonograph'], ['ui', 17, 'Load a measured correction, then shape it with a full parametric EQ.'], ['ui', 15, 'Body · 15/1.6 · Instrument Sans'], ['uiMedium', 11, 'Eyebrow · 11 · tracking 22% · uppercase'], ['mono', 13, 'Bandwidth ≈ 250 Hz – 2.5 kHz · $399.00']];
  let y = 120;
  for (const [font, size, s] of samples) {
    const t = put(type, text(s, { font, size, width: 1240, tracking: font === 'display' ? -3 : font === 'uiMedium' ? 22 : 0, upper: font === 'uiMedium' }), 80, y);
    put(type, text(`${F[font].family} ${F[font].style} · ${size}px`, { font: 'mono', size: 11, color: T.textLo }), 80, y + t.height + 6);
    y += t.height + 54;
  }
  for (const [name, size] of TEXT_STYLES) {
    const st = figma.createTextStyle();
    st.name = name;
    st.fontName = /^(Display|Title)/.test(name) ? F.display : name.startsWith('Mono') ? F.mono : name.startsWith('Caps') ? F.uiMedium : F.ui;
    st.fontSize = size;
  }

  const comps = put(page, frame('Components', 1100, 1240), 3800, 0);
  caption(comps, 'Components with interactive variants (click a lever, part, chip or needle in Present)', 80, 60, 960);
  await buildComponents(comps);
}

function sitemapNode(parent, label, sub, x, y, w = 240) {
  const n = put(parent, frame(label, w, 96, { radius: 10, fill: T.surface, stroke: T.accent, strokeOpacity: 0.5 }), x, y);
  put(n, text(label, { font: 'display', size: 22 }), 18, 16);
  put(n, text(sub, { font: 'mono', size: 11, color: T.textLo, width: w - 36 }), 18, 56);
  return n;
}

function wire(parent, name, x, y, regions, notes) {
  const f = put(parent, frame(name, W, H, { fill: '#121110', stroke: '#ffffff', strokeOpacity: 0.12 }), x, y);
  for (let i = 0; i < 12; i++) {
    const col = put(f, frame('col', 79, H, { fill: T.accent }), 93 + i * 104, 0);
    col.opacity = 0.04;
  }
  for (const [label, rx, ry, rw, rh, kind] of regions) {
    const r = put(f, frame(label, rw, rh, { radius: 4, fill: kind === 'media' ? '#2a241c' : '#1c1a17', stroke: kind === 'accent' ? T.accent : '#ffffff', strokeOpacity: kind === 'accent' ? 0.8 : 0.2, dash: kind === 'media' ? [6, 6] : undefined }), rx, ry);
    put(r, text(label, { font: 'uiMedium', size: 11, tracking: 12, upper: true, color: kind === 'accent' ? T.accent : T.textLo, width: Math.max(60, rw - 20) }), 10, 8);
  }
  caption(parent, name, x, y - 34, W);
  put(parent, text(notes, { font: 'mono', size: 12, color: T.textLo, width: 420, lineHeight: 160 }), x + W + 40, y);
  return f;
}

async function buildBlueprint() {
  const page = await newPage('02 · Blueprint');
  const map = put(page, frame('Sitemap & flows', 2400, 1300), 0, 0);
  caption(map, 'Sitemap (hash-routed single page) and the three core flows', 80, 60, 1200);
  const home = sitemapNode(map, 'Home', '#/ · gallery hero, promises, photo strip, teasers', 1050, 140, 300);
  const nodes = {
    store: sitemapNode(map, 'Store', '#/store · 42 products, 8 categories', 120, 360),
    lab: sitemapNode(map, 'Tuning Lab', '#/lab · 4-step setup, PEQ faceplate', 760, 360),
    guide: sitemapNode(map, 'Guide', '#/guide · sweep, missions, lessons', 1400, 360),
    history: sitemapNode(map, 'History', '#/history · 10 chapters, 1877–2026', 2040, 360, 260),
  };
  for (const n of Object.values(nodes)) line(map, home.x + 150, home.y + 96, n.x + n.width / 2, n.y, T.accent, 1);
  const product = sitemapNode(map, 'Product', '#/product/:id · 3D study or turntable', 120, 560);
  sitemapNode(map, 'Quick view', 'dialog over the grid', 400, 560);
  sitemapNode(map, 'Ask Oura', 'AI assistant sheet on store and product pages', 680, 560, 300);
  sitemapNode(map, 'Photo inspector', 'tilt, zoom 2.4x, full-screen viewer', 120, 900, 520);
  line(map, 480, 456, 830, 560, T.accent, 1);
  sitemapNode(map, 'Bag → Checkout → Order placed', 'side sheet, demo checkout', 120, 760, 520);
  line(map, 240, 456, 240, 560);
  line(map, 360, 456, 520, 560);
  line(map, 240, 656, 240, 760);
  const chapters = sitemapNode(map, 'Chapter ×10', 'opener → stage (parts) → lore (needle, Then/Today)', 2040, 560, 260);
  line(map, 2170, 456, 2170, 560);
  line(map, product.x + 240, product.y + 48, nodes.lab.x, nodes.lab.y + 48, T.textLo, 1, [6, 6]);
  line(map, chapters.x, chapters.y + 48, nodes.lab.x + 240, nodes.lab.y + 70, T.textLo, 1, [6, 6]);
  const flows = [
    'Flow A · Buy and tune: Store → Product (3D) → Tune it in the Lab → Lab loads the measured correction → Export',
    'Flow B · Listen through history: History → chapter opener → part story → needle drop → Then / Today → 2026 → Lab',
    'Flow C · Tune: Your headphones → Listen (analyze 20 s) → Hearing check → AI Sommelier → Take it home (APO, AutoEq, GraphicEQ)',
    'Flow D · Ask: Store → Ask Oura → answer with product picks → product page → photo inspector → Add to bag',
  ];
  stack(map, flows.map((s) => text(s, { font: 'mono', size: 14, color: T.textHi, width: 2200 })), 80, 1060, 18);

  let y = 1500;
  const wf = [
    ['Home · gallery hero', [['Nav + sound + theme', 0, 0, W, 72], ['Giant wordmark (behind)', 120, 170, 1200, 420, 'media'], ['3D IEM (drag, scroll explodes)', 560, 150, 320, 420, 'accent'], ['Study No. 01 caption', 93, 100, 220, 90], ['H1 + lede + CTA', 93, 600, 1250, 200], ['Audio dock', 93, 820, 1250, 64]], 'Pinned 260vh. Scroll 15–70%: explode 0→0.85, yaw 0→0.9π. Spec labels fade in one by one, alternating sides. Brass ring traces progress and scales with bass.'],
    ['Store · objects on display', [['Nav', 0, 0, W, 72], ['Eyebrow + H1 112', 93, 110, 900, 180], ['Category banner photo', 93, 330, 1250, 300, 'media'], ['Sticky filter bar', 93, 650, 1250, 60, 'accent'], ['Featured 2×2 card', 93, 730, 600, 170, 'media'], ['Card', 720, 730, 290, 170, 'media'], ['Card', 1040, 730, 300, 170, 'media']], 'Cards: plinth shadow, light sweep + detail swap on hover, Quick view on hover/focus. Editorial tiles at positions 3, 11, 20 when unfiltered.'],
    ['Product page', [['Breadcrumb', 93, 100, 300, 30], ['Viewer: 3D study or tilt turntable', 93, 150, 700, 500, 'media'], ['Thumbs: 3D · photo · details', 93, 670, 400, 64], ['Brand · H1 · rating · price', 860, 150, 480, 220], ['Tune it in the Lab plate', 860, 400, 480, 80, 'accent'], ['Ask Oura plate', 860, 490, 480, 80, 'accent'], ['Qty · Add to bag · ♥', 860, 580, 480, 50], ['Engraved spec rows', 860, 640, 480, 220]], 'Viewer sticky on desktop. Photos open in the inspector: hover tilt with a moving sheen, click to zoom 2.4x, scroll or pinch to 3x, full-screen viewer. Ask Oura opens the assistant with this product in context.'],
    ['Tuning Lab', [['H1 + console photo', 93, 100, 1250, 400, 'media'], ['Setup rail 01–04', 93, 520, 1250, 60, 'accent'], ['Faceplate: toolbar', 93, 600, 1250, 60], ['Recessed PEQ graph', 93, 670, 1250, 230, 'accent']], 'Advanced opens the hidden columns with a hinge (rotateX −80° → 0). Curve glides 420 ms; overlays fade 900 ms. Preamp rolls on mechanical digits.'],
    ['History chapter', [['Backdrop photo + scrim', 0, 0, W, H, 'media'], ['Chapter n / 10', 125, 330, 300, 24], ['Year 340px', 125, 360, 900, 260], ['Place · Title · lead', 125, 640, 900, 200], ['Rail years', 20, 380, 80, 300, 'accent']], 'Then: sticky stage (280vh). Parts list | line-engraving canvas | story column. Explode eases 10–65% of the stage. Lore: photo mosaic + facts + needle + Then/Today lever.'],
  ];
  for (const [name, regions, notes] of wf) {
    wire(page, name, 0, y, regions, notes);
    y += H + 160;
  }
}

async function buildPrototype() {
  const page = await newPage('03 · Prototype');
  const ids = Object.keys(DATA.hotspots.screens);
  const frames = {};
  const cols = 5;
  for (const [i, id] of ids.entries()) {
    await step(`screen ${id}`, async () => {
      const s = DATA.hotspots.screens[id];
      const f = put(page, frame(s.title, W, H, { fill: '#0e0d0c' }), (i % cols) * (W + 240), Math.floor(i / cols) * (H + 320));
      f.fills = await imageFill(`${DATA.base}/figma-blueprint/shots/${id}.jpg`);
      frames[id] = f;
    });
  }
  const trans = (kind) => (kind === 'smart'
    ? { type: 'SMART_ANIMATE', easing: { type: 'EASE_IN_AND_OUT' }, duration: 0.6 }
    : { type: 'DISSOLVE', easing: { type: 'EASE_OUT' }, duration: 0.45 });
  for (const id of ids) {
    const s = DATA.hotspots.screens[id];
    const f = frames[id];
    if (!f) continue;
    for (const l of [...(s.nav ? DATA.hotspots.nav : []), ...s.links]) {
      await step(`link ${id} → ${l.to}`, async () => {
        let action;
        if (l.kind === 'close') action = { type: 'CLOSE' };
        else if (l.to === 'back') action = { type: 'BACK' };
        else if (!frames[l.to]) return;
        else if (l.kind === 'overlay') action = { type: 'NODE', destinationId: frames[l.to].id, navigation: 'OVERLAY', transition: { type: 'DISSOLVE', easing: { type: 'EASE_OUT' }, duration: 0.4 }, preserveScrollPosition: false };
        else if (l.kind === 'swap') action = { type: 'NODE', destinationId: frames[l.to].id, navigation: 'SWAP', transition: trans('dissolve'), preserveScrollPosition: false };
        else action = { type: 'NODE', destinationId: frames[l.to].id, navigation: 'NAVIGATE', transition: trans(l.kind), preserveScrollPosition: false };
        const hs = put(f, frame(`→ ${l.to}`, Math.max(8, l.w), Math.max(8, l.h), { fill: null }), l.x, l.y);
        await hs.setReactionsAsync([{ trigger: { type: 'ON_CLICK' }, actions: [action] }]);
      });
    }
  }
  for (const id of ['quickview', 'bag', 'checkout', 'confirmation', 'lightbox', 'assistant']) {
    if (!frames[id]) continue;
    await step(`overlay ${id}`, async () => {
      frames[id].overlayPositionType = 'CENTER';
      frames[id].overlayBackground = { type: 'NONE' };
    });
  }
  const flows = [['Full site', 'home'], ['Store & checkout', 'store'], ['Ask Oura & inspector', 'product-hd600'], ['Tuning Lab', 'lab'], ['History', 'history-hero'], ['Guide', 'guide']].filter(([, id]) => frames[id]);
  page.flowStartingPoints = flows.map(([name, id]) => ({ nodeId: frames[id].id, name }));
}

async function buildGallery() {
  const page = await newPage('04 · Themes & devices');
  const themes = ['dark', 'light', 'burgundy', 'earth', 'soft'];
  const views = ['home', 'store', 'product', 'lab', 'guide', 'history', 'history-stage'];
  const scale = 0.5;
  for (const [r, t] of themes.entries()) {
    caption(page, `${t} theme`, 0, r * (H * scale + 120) - 30, 400);
    for (const [c, v] of views.entries()) {
      await step(`theme ${t}-${v}`, async () => {
        const f = put(page, frame(`${t} · ${v}`, W * scale, H * scale), c * (W * scale + 40), r * (H * scale + 120));
        f.fills = await imageFill(`${DATA.base}/screenshots/${t}-${v}.jpg`);
      });
    }
  }
  const top = themes.length * (H * scale + 120) + 120;
  for (const [r, [device, w, h]] of [['tablet', 834, 1112], ['phone', 390, 844]].entries()) {
    const rowY = top + r * (1112 * 0.5 + 160);
    caption(page, `${device} · ${w}×${h}`, 0, rowY - 30, 400);
    for (const [c, v] of views.entries()) {
      await step(`${device}-${v}`, async () => {
        const f = put(page, frame(`${device} · ${v}`, w * 0.5, h * 0.5, { radius: device === 'phone' ? 22 : 14 }), c * (w * 0.5 + 40), rowY);
        f.fills = await imageFill(`${DATA.base}/screenshots/dark-${device}-${v}.jpg`);
      });
    }
  }
}

async function main() {
  await loadFonts();
  const previous = await clearPrevious();
  await step('cover', buildCover);
  await step('design system', buildDesignSystem);
  await step('blueprint', buildBlueprint);
  await step('prototype', buildPrototype);
  await step('gallery', buildGallery);
  const proto = figma.root.children.find((p) => p.name === '03 · Prototype' && !previous.includes(p));
  if (proto) await figma.setCurrentPageAsync(proto);
  for (const page of previous) await step(`remove old ${page.name}`, async () => page.remove());
  const msg = REPORT.errors.length
    ? `Built with ${REPORT.errors.length} issue(s): ${REPORT.errors.slice(0, 3).join(' | ')}`
    : `Built ${REPORT.ok.length} steps. Open "03 · Prototype" and press Present.`;
  figma.closePlugin(msg);
}

main().catch((err) => figma.closePlugin(`Failed: ${err && err.message ? err.message : err}`));
