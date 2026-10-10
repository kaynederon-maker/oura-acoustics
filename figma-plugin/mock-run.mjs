// Runs code.js against a strict mock of the Figma Plugin API, so builder bugs show up before
// anyone opens Figma. It checks the things the real API would reject: unloaded fonts, bad
// sizes, invalid paints, unknown variables/component properties, and broken prototype links.
//   node figma-plugin/mock-run.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, 'code.js'), 'utf8');
const problems = [];
const fail = (msg) => { problems.push(msg); if (problems.length > 40) throw new Error('too many problems'); };

let nextId = 1;
const registry = new Map();
const fonts = new Set();
const fontKey = (f) => `${f.family}|${f.style}`;
const AVAILABLE = new Set(['Inter|Regular', 'Inter|Medium', 'Inter|Semi Bold', 'Inter|Semi Bold Italic', 'Fraunces|SemiBold', 'Fraunces|SemiBold Italic', 'Geist|Regular', 'Geist|Medium', 'Geist|SemiBold', 'Geist Mono|Regular']);
const TRIGGERS = new Set(['ON_CLICK', 'ON_HOVER', 'ON_PRESS', 'ON_DRAG']);
const NAVS = new Set(['NAVIGATE', 'SWAP', 'OVERLAY', 'SCROLL_TO', 'CHANGE_TO']);
const TRANSITIONS = new Set(['DISSOLVE', 'SMART_ANIMATE', 'SCROLL_ANIMATE', 'MOVE_IN', 'MOVE_OUT', 'PUSH', 'SLIDE_IN', 'SLIDE_OUT']);
let reactionCount = 0;
const reactionsByTrigger = {};

function checkPaints(node, list, field) {
  if (!Array.isArray(list)) return fail(`${node.name}: ${field} is not an array`);
  for (const p of list) {
    if (!p || !['SOLID', 'IMAGE'].includes(p.type)) fail(`${node.name}: bad paint type in ${field}`);
    if (p.type === 'SOLID' && (!p.color || 'a' in p.color)) fail(`${node.name}: SOLID paint color must be {r,g,b}`);
    if (p.type === 'IMAGE' && !p.imageHash) fail(`${node.name}: IMAGE paint without hash`);
    if (p.opacity !== undefined && (p.opacity < 0 || p.opacity > 1)) fail(`${node.name}: paint opacity out of range`);
  }
}

class Node {
  constructor(type) {
    this.id = `${nextId}:${nextId++}`;
    this.type = type;
    this.name = type;
    this.children = [];
    this.parent = null;
    this.x = 0;
    this.y = 0;
    this.width = 100;
    this.height = 100;
    this.reactions = [];
    this._fills = [];
    this._strokes = [];
    registry.set(this.id, this);
    if (figma.currentPage && type !== 'PAGE') figma.currentPage.appendChild(this);
  }
  get fills() { return this._fills; }
  set fills(v) { checkPaints(this, v, 'fills'); this._fills = v; }
  get strokes() { return this._strokes; }
  set strokes(v) { checkPaints(this, v, 'strokes'); this._strokes = v; }
  appendChild(c) {
    if (!(c instanceof Node)) fail('appendChild: not a node');
    if (c.parent) c.parent.children = c.parent.children.filter((x) => x !== c);
    c.parent = this;
    this.children.push(c);
  }
  resize(w, h) {
    if (!(w >= 0.01 && h >= 0.01) || !Number.isFinite(w) || !Number.isFinite(h)) fail(`${this.name}: resize(${w}, ${h})`);
    this.width = w;
    this.height = h;
  }
  findOne(fn) { for (const c of this.children) { if (fn(c)) return c; const r = c.findOne(fn); if (r) return r; } return null; }
  findAll(fn) { const out = []; for (const c of this.children) { if (fn(c)) out.push(c); out.push(...c.findAll(fn)); } return out; }
  setBoundVariable(field, v) { if (!v || !v.id) fail(`${this.name}: setBoundVariable(${field}) without variable`); }
  async setReactionsAsync(list) {
    for (const r of list) {
      if (!TRIGGERS.has(r.trigger?.type)) fail(`${this.name}: bad trigger ${r.trigger?.type}`);
      for (const a of r.actions || []) {
        if (a.type === 'CLOSE' || a.type === 'BACK') continue;
        if (a.type !== 'NODE') fail(`${this.name}: bad action ${a.type}`);
        if (!registry.has(a.destinationId)) fail(`${this.name}: destination ${a.destinationId} missing`);
        if (!NAVS.has(a.navigation)) fail(`${this.name}: bad navigation ${a.navigation}`);
        if (a.transition && !TRANSITIONS.has(a.transition.type)) fail(`${this.name}: bad transition`);
        if (a.navigation === 'CHANGE_TO' && registry.get(a.destinationId)?.type !== 'COMPONENT') fail(`${this.name}: CHANGE_TO must target a variant`);
      }
      reactionsByTrigger[r.trigger.type] = (reactionsByTrigger[r.trigger.type] || 0) + 1;
      reactionCount++;
    }
    this.reactions = list;
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); }
}

class TextNode extends Node {
  constructor() { super('TEXT'); this._font = { family: 'Inter', style: 'Regular' }; this._chars = ''; this.fontSize = 12; }
  get fontName() { return this._font; }
  set fontName(f) { if (!fonts.has(fontKey(f))) fail(`fontName ${fontKey(f)} not loaded`); this._font = f; }
  get characters() { return this._chars; }
  set characters(s) {
    if (!fonts.has(fontKey(this._font))) fail(`characters set with unloaded font ${fontKey(this._font)}`);
    if (typeof s !== 'string') fail('characters must be a string');
    this._chars = s;
    this.width = Math.max(1, s.length * (this.fontSize || 12) * 0.55);
    this.height = (this.fontSize || 12) * 1.25;
  }
}

class ComponentNode extends Node {
  constructor(type = 'COMPONENT') { super(type); this.componentPropertyDefinitions = {}; }
  createInstance() {
    const clone = (src, isRoot) => {
      const n = src instanceof TextNode ? new TextNode() : new Node(isRoot ? 'INSTANCE' : src.type);
      if (src instanceof TextNode) { n._font = src._font; n._chars = src._chars; n.fontSize = src.fontSize; }
      n.name = src.name;
      n.width = src.width;
      n.height = src.height;
      for (const c of src.children) n.appendChild(clone(c, false));
      return n;
    };
    const inst = clone(this, true);
    inst.mainComponent = this;
    inst.setProperties = (props) => {
      const set = this.parent && this.parent.type === 'COMPONENT_SET' ? this.parent : this;
      for (const k of Object.keys(props)) if (!(k in set.componentPropertyDefinitions)) fail(`setProperties: unknown property ${k} on ${set.name}`);
    };
    return inst;
  }
  addComponentProperty(name, type, def) {
    if (this.type !== 'COMPONENT_SET' && this.type !== 'COMPONENT') fail('addComponentProperty on non-component');
    const key = `${name}#${nextId++}:0`;
    this.componentPropertyDefinitions[key] = { type, defaultValue: def };
    return key;
  }
}

const pages = [];
const figma = {
  currentPage: null,
  root: { children: pages },
  viewport: { scrollAndZoomIntoView() {} },
  async loadFontAsync(f) { if (!AVAILABLE.has(fontKey(f))) throw new Error(`font ${fontKey(f)} unavailable`); fonts.add(fontKey(f)); },
  createPage() { const p = new Node('PAGE'); pages.push(p); return p; },
  async setCurrentPageAsync(p) { figma.currentPage = p; },
  createFrame: () => new Node('FRAME'),
  createRectangle: () => new Node('RECTANGLE'),
  createEllipse: () => new Node('ELLIPSE'),
  createVector() {
    const v = new Node('VECTOR');
    Object.defineProperty(v, 'vectorPaths', { set(paths) {
      for (const p of paths) {
        const nums = p.data.split(/\s+/).filter((t) => !/^[A-Za-z]$/.test(t)).map(Number);
        if (nums.some((n) => !Number.isFinite(n))) fail(`${v.name}: non-numeric path data`);
        const xs = nums.filter((_, i) => i % 2 === 0);
        const ys = nums.filter((_, i) => i % 2 === 1);
        if (Math.min(...xs) !== 0 || Math.min(...ys) !== 0) fail(`${v.name}: path not normalized`);
      }
    } });
    return v;
  },
  createText: () => new TextNode(),
  createComponent: () => new ComponentNode(),
  combineAsVariants(nodes, parent) {
    if (nodes.some((n) => n.type !== 'COMPONENT')) fail('combineAsVariants: non-component');
    if (nodes.some((n) => !/^[^=]+=[^=]+$/.test(n.name))) fail('combineAsVariants: variant names must be Prop=Value');
    const set = new ComponentNode('COMPONENT_SET');
    parent.appendChild(set);
    for (const n of nodes) set.appendChild(n);
    return set;
  },
  createImage(bytes) { if (!bytes || !bytes.length) fail('createImage: empty bytes'); return { hash: `h${nextId++}` }; },
  base64Decode: (s) => new Uint8Array(Buffer.from(s, 'base64')),
  closePlugin(msg) { figma._closed = msg; },
  variables: {
    async getLocalVariableCollectionsAsync() { return []; },
    async getLocalVariablesAsync() { return []; },
    createVariableCollection(name) { return { id: `VC:${nextId++}`, name, modes: [{ modeId: 'm1', name: 'Mode 1' }], renameMode() {} }; },
    createVariable(name, coll, type) {
      if (!coll || !coll.id) fail(`createVariable ${name}: bad collection`);
      return { id: `V:${nextId++}`, name, variableCollectionId: coll.id, resolvedType: type, setValueForMode(m, v) { if (type === 'COLOR' && (typeof v !== 'object' || !('r' in v))) fail(`${name}: bad color value`); }, setVariableCodeSyntax(p, s) { if (!/^var\(--/.test(s)) fail(`${name}: code syntax ${s}`); }, scopes: [] };
    },
    setBoundVariableForPaint(p, field, v) { if (!v || !v.id) fail('setBoundVariableForPaint: missing variable'); return { ...p, boundVariables: { [field]: { type: 'VARIABLE_ALIAS', id: v.id } } }; },
  },
};

const start = Date.now();
try {
  await new Function('figma', 'console', `${code}\n;return null;`)(figma, { log() {}, error: (e) => fail(`console.error: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`) });
  for (let i = 0; i < 300 && !figma._closed; i++) await new Promise((r) => setTimeout(r, 10));
} catch (err) {
  fail(`threw: ${err.stack.split('\n').slice(0, 4).join(' | ')}`);
}
const page = pages[pages.length - 1];
const frames = page ? page.children.filter((n) => n.type === 'FRAME') : [];
const screens = frames.filter((f) => f.width === 1440 && f.height === 900);
console.log(JSON.stringify({
  closedWith: figma._closed,
  ms: Date.now() - start,
  screens: screens.length,
  screenNames: screens.map((f) => f.name),
  overlays: frames.filter((f) => f.name.startsWith('Overlay')).length,
  componentSets: page ? page.findAll((n) => n.type === 'COMPONENT_SET').map((n) => `${n.name} (${n.children.length})`) : [],
  reactions: reactionCount,
  reactionsByTrigger,
  flowStarts: page && page.flowStartingPoints ? page.flowStartingPoints.length : 0,
  problems,
}, null, 2));
process.exitCode = problems.length || !String(figma._closed).startsWith('Built') ? 1 : 0;
