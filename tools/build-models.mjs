// Builds every 3D object on the site from three.js geometry and writes meshopt-compressed .glb
// files to public/models/. Each part is a named node whose extras carry its explode offset, so the
// exploded views and the material presets (applied at runtime by material name) need no other data.
//   node tools/build-models.mjs [name ...]
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/models/', import.meta.url));
const D = Math.PI / 180;

// Fallback colours; the site swaps these for physical material presets by name.
const COLORS = {
  brass: [0.69, 0.55, 0.34], steel: [0.6, 0.62, 0.65], chrome: [0.85, 0.87, 0.89], aluminium: [0.76, 0.78, 0.79],
  lacquer: [0.05, 0.05, 0.05], resin: [0.16, 0.15, 0.18], glass: [0.9, 0.92, 0.94], walnut: [0.42, 0.26, 0.15],
  rubber: [0.08, 0.08, 0.08], paper: [0.17, 0.17, 0.16], silicone: [0.2, 0.2, 0.21], plastic: [0.93, 0.93, 0.92],
  black: [0.1, 0.1, 0.1], iron: [0.17, 0.17, 0.17], felt: [0.2, 0.19, 0.18], pcb: [0.11, 0.23, 0.16],
  velour: [0.13, 0.13, 0.13], vinyl: [0.04, 0.04, 0.04], label: [0.79, 0.64, 0.36], foil: [0.81, 0.82, 0.83],
  tolex: [0.1, 0.1, 0.1], cloth: [0.23, 0.2, 0.17], copper: [0.72, 0.45, 0.3], ivory: [0.91, 0.89, 0.85],
  'key-red': [0.82, 0.24, 0.16], 'key-orange': [0.88, 0.48, 0.15], 'key-yellow': [0.9, 0.77, 0.23], 'key-white': [0.91, 0.89, 0.85],
  ceramic: [0.92, 0.9, 0.86],
};
const METALS = new Set(['brass', 'steel', 'chrome', 'aluminium', 'foil', 'copper', 'iron']);

// ---------- geometry helpers ----------
function place(geo, { p = [0, 0, 0], r = [0, 0, 0], s = 1 } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * D, r[1] * D, r[2] * D)),
    new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])),
  );
  return geo.applyMatrix4(m);
}
const box = (w, h, d, o, radius = 0) => place(radius ? new RoundedBoxGeometry(w, h, d, 3, radius) : new THREE.BoxGeometry(w, h, d), o);
const cyl = (rt, rb, h, o, seg = 48) => place(new THREE.CylinderGeometry(rt, rb, h, seg), o);
const torus = (r, t, o, seg = 64) => place(new THREE.TorusGeometry(r, t, 16, seg), o);
const sphere = (r, o, seg = 32) => place(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), o);
const lathe = (pts, o, seg = 64) => place(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), o);
const tube = (points, radius, o, seg = 64) => place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, radius, 12), o);
function extrude(shape, depth, o, bevel = 0.02) {
  return place(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 48 }), o);
}
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// part(id, explode offset, { materialName: [geometries] })
const part = (id, explode, groups) => ({ id, explode, groups });

// ---------- models ----------

function iem() {
  // Kidney-shaped custom shell: one 2D outline, extruded twice (faceplate and shell).
  const k = new THREE.Shape();
  k.moveTo(-0.55, -0.1);
  k.bezierCurveTo(-0.6, 0.45, -0.15, 0.62, 0.2, 0.55);
  k.bezierCurveTo(0.58, 0.48, 0.66, 0.1, 0.5, -0.22);
  k.bezierCurveTo(0.36, -0.5, 0.0, -0.58, -0.22, -0.48);
  k.bezierCurveTo(-0.46, -0.38, -0.52, -0.3, -0.55, -0.1);
  const inlay = new THREE.Shape();
  inlay.absarc(0.02, 0.02, 0.26, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0.02, 0.02, 0.23, 0, Math.PI * 2, true);
  inlay.holes.push(hole);
  return [
    part('faceplate', [0, 0, 0.9], {
      lacquer: [extrude(k, 0.06, { p: [0, 0, 0.2] }, 0.03)],
      brass: [extrude(inlay, 0.015, { p: [0, 0, 0.29] }, 0.004), cyl(0.05, 0.05, 0.02, { p: [0.02, 0.02, 0.3], r: [90, 0, 0] })],
    }),
    part('shell', [0, 0, 0], { resin: [extrude(k, 0.36, { p: [0, 0, -0.18], s: [0.97, 0.97, 1] }, 0.12)] }),
    part('driver', [0, 0.05, 0.45], {
      steel: [cyl(0.2, 0.2, 0.06, { p: [-0.05, 0.08, 0.02], r: [90, 0, 0] })],
      paper: [lathe([[0.02, 0], [0.17, 0.04], [0.18, 0.045]], { p: [-0.05, 0.08, 0.055], r: [90, 0, 0] })],
      brass: [torus(0.19, 0.012, { p: [-0.05, 0.08, 0.05] })],
    }),
    part('armatures', [0.25, -0.15, 0.25], {
      brass: [box(0.16, 0.09, 0.11, { p: [0.22, -0.18, 0.02] }, 0.015), box(0.16, 0.09, 0.11, { p: [0.22, -0.06, 0.02] }, 0.015)],
      copper: [tube([[0.3, -0.18, 0.02], [0.42, -0.3, -0.1], [0.45, -0.42, -0.32]], 0.012), tube([[0.3, -0.06, 0.02], [0.44, -0.2, -0.12], [0.47, -0.4, -0.33]], 0.012)],
    }),
    part('nozzle', [0.35, -0.35, -0.6], {
      steel: [cyl(0.09, 0.1, 0.32, { p: [0.42, -0.38, -0.42], r: [62, 0, -22] })],
      brass: [torus(0.095, 0.008, { p: [0.47, -0.45, -0.55], r: [-28, 0, -22] })],
    }),
    part('tip', [0.6, -0.6, -1.1], {
      silicone: [lathe([[0.04, 0], [0.16, 0.02], [0.2, 0.1], [0.17, 0.2], [0.1, 0.24], [0.06, 0.24]], { p: [0.5, -0.5, -0.62], r: [-118, 0, -22] })],
    }),
  ];
}

function overEar(cup = 'black') {
  const arc = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 23) * Math.PI;
    return [Math.cos(a) * 0.95, 0.35 + Math.sin(a) * 1.0, 0];
  });
  const side = (sx) => ({
    yoke: [tube([[sx * 0.95, 0.32, 0], [sx * 1.0, 0.1, 0.34], [sx * 1.0, -0.35, 0.36]], 0.03), tube([[sx * 0.95, 0.32, 0], [sx * 1.0, 0.1, -0.34], [sx * 1.0, -0.35, -0.36]], 0.03)],
    cup: cyl(0.48, 0.48, 0.16, { p: [sx * 1.02, -0.45, 0], r: [0, 0, 90], s: [1, 1, 1.18] }, 64),
    grille: cyl(0.4, 0.4, 0.02, { p: [sx * 1.11, -0.45, 0], r: [0, 0, 90], s: [1, 1, 1.18] }, 64),
    pad: torus(0.36, 0.11, { p: [sx * 0.88, -0.45, 0], r: [0, 90, 0], s: [1, 1.18, 1] }, 64),
    driver: cyl(0.3, 0.3, 0.04, { p: [sx * 0.95, -0.45, 0], r: [0, 0, 90] }, 48),
  });
  const L = side(-1);
  const R = side(1);
  return [
    part('headband', [0, 0.7, 0], { [cup === 'black' ? 'black' : 'plastic']: [tube(arc, 0.07)], velour: [tube(arc.slice(4, 20).map(([x, y, z]) => [x * 0.93, y - 0.08, z]), 0.075)] }),
    part('yokes', [0, 0.35, 0], { steel: [...L.yoke, ...R.yoke] }),
    part('cups', [0, 0, 0], { [cup]: [L.cup, R.cup] }),
    part('grilles', [0, 0, 0], { steel: [L.grille, R.grille] }),
    part('pads', [0, -0.15, 0], { velour: [L.pad, R.pad] }),
    part('drivers', [0, -0.5, 0], { paper: [L.driver, R.driver] }),
  ];
}

function speaker({ cabinet = 'walnut', baffle = 'black', cone = 'paper', w = 1.1, h = 1.7, d = 1.1 } = {}) {
  const front = d / 2 + 0.01;
  return [
    part('cabinet', [0, 0, -0.5], { [cabinet]: [box(w, h, d, {}, 0.04)] }),
    part('baffle', [0, 0, 0.35], { [baffle]: [box(w - 0.04, h - 0.04, 0.05, { p: [0, 0, front] }, 0.02)], black: [cyl(0.07, 0.07, 0.02, { p: [w * 0.28, -h * 0.4, front + 0.03], r: [90, 0, 0] })] }),
    part('woofer', [0, -0.1, 0.9], {
      [cone]: [lathe([[0.06, 0], [0.33, 0.14], [0.35, 0.15]], { p: [0, -h * 0.17, front + 0.05], r: [-90, 0, 0] })],
      rubber: [torus(0.36, 0.035, { p: [0, -h * 0.17, front + 0.04] })],
      steel: [sphere(0.07, { p: [0, -h * 0.17, front + 0.07], s: [1, 1, 0.5] })],
    }),
    part('tweeter', [0, 0.1, 0.9], {
      aluminium: [sphere(0.1, { p: [0, h * 0.27, front + 0.03], s: [1, 1, 0.5] })],
      black: [torus(0.16, 0.025, { p: [0, h * 0.27, front + 0.03] })],
    }),
    part('controls', [0.5, 0, 0], { brass: [0.1, -0.15, -0.4].map((y) => cyl(0.06, 0.06, 0.06, { p: [w / 2 + 0.03, y, 0.2], r: [0, 0, 90] })) }),
  ];
}

function phonograph() {
  const spiral = Array.from({ length: 220 }, (_, i) => {
    const a = i * 0.35;
    return [-0.55 + (i / 219) * 1.1, Math.sin(a) * 0.31, Math.cos(a) * 0.31 - 0.3];
  });
  return [
    part('base', [0, -0.5, 0], { iron: [box(2.0, 0.12, 1.1, { p: [0, -0.62, 0] }, 0.03), box(0.12, 0.5, 0.12, { p: [-0.72, -0.33, -0.3] }), box(0.12, 0.5, 0.12, { p: [0.72, -0.33, -0.3] })] }),
    part('cylinder', [0, 0.2, 0], { brass: [cyl(0.3, 0.3, 1.1, { p: [0, 0, -0.3], r: [0, 0, 90] }, 64)], foil: [tube(spiral, 0.006, {}, 600)] }),
    part('screw', [0, 0.1, -0.35], { steel: [cyl(0.04, 0.04, 2.1, { p: [0, 0, -0.3], r: [0, 0, 90] }), ...Array.from({ length: 30 }, (_, i) => torus(0.045, 0.008, { p: [-0.95 + i * 0.065, 0, -0.3], r: [0, 90, 0] }))] }),
    part('crank', [0.6, 0.2, 0], { steel: [box(0.06, 0.45, 0.06, { p: [1.08, -0.18, -0.3] })], walnut: [cyl(0.05, 0.05, 0.25, { p: [1.15, -0.38, -0.3], r: [0, 0, 90] })] }),
    part('diaphragm', [0, 0.25, 0.7], { brass: [cyl(0.2, 0.2, 0.06, { p: [0, 0.05, 0.25], r: [90, 0, 0] }), box(0.08, 0.06, 0.5, { p: [0, -0.15, 0.25] })], steel: [cyl(0.005, 0.02, 0.06, { p: [0, 0, 0.04], r: [90, 0, 0] })] }),
    part('mouthpiece', [0, 0.35, 1.3], { brass: [lathe([[0.08, 0], [0.1, 0.12], [0.18, 0.28], [0.19, 0.3]], { p: [0, 0.05, 0.28], r: [90, 0, 0] })] }),
  ];
}

function ribbonMic() {
  const body = roundedRect(0.9, 1.5, 0.42);
  return [
    part('grille', [0, 0, 0.7], { chrome: [extrude(body, 0.5, { p: [0, 0.35, -0.25] }, 0.06)] }),
    part('ribbon', [0, 0.1, 0], { foil: [box(0.08, 1.1, 0.004, { p: [0, 0.35, 0] })] }),
    part('magnet', [0.6, 0, 0], { iron: [box(0.12, 1.15, 0.3, { p: [-0.16, 0.35, 0] }), box(0.12, 1.15, 0.3, { p: [0.16, 0.35, 0] })] }),
    part('transformer', [0, -0.5, 0], { black: [box(0.6, 0.42, 0.5, { p: [0, -0.62, 0] }, 0.04)], copper: [cyl(0.12, 0.12, 0.2, { p: [0, -0.62, 0.2], r: [90, 0, 0] })] }),
    part('yoke', [0, -0.3, -0.5], { steel: [tube([[-0.56, 0.3, 0], [-0.6, -0.4, 0], [0, -0.95, 0], [0.6, -0.4, 0], [0.56, 0.3, 0]], 0.04), cyl(0.05, 0.05, 0.7, { p: [0, -1.25, 0] })] }),
  ];
}

function turntable() {
  const grooves = Array.from({ length: 22 }, (_, i) => torus(0.42 + i * 0.016, 0.002, { p: [-0.25, 0.063, 0], r: [90, 0, 0] }, 96));
  return [
    part('plinth', [0, -0.5, 0], { walnut: [box(2.2, 0.2, 1.7, { p: [0, -0.15, 0] }, 0.03)], steel: [-0.95, 0.95].flatMap((x) => [-0.7, 0.7].map((z) => cyl(0.08, 0.1, 0.08, { p: [x, -0.29, z] }))) }),
    part('platter', [0, -0.15, 0], { aluminium: [cyl(0.82, 0.82, 0.08, { p: [-0.25, 0.0, 0] }, 96)], felt: [cyl(0.8, 0.8, 0.01, { p: [-0.25, 0.045, 0] }, 96)] }),
    part('record', [0, 0.35, 0], { vinyl: [cyl(0.78, 0.78, 0.012, { p: [-0.25, 0.056, 0] }, 96), ...grooves], label: [cyl(0.27, 0.27, 0.014, { p: [-0.25, 0.057, 0] }, 64)], steel: [cyl(0.015, 0.015, 0.1, { p: [-0.25, 0.1, 0] })] }),
    part('tonearm', [0.35, 0.3, 0], {
      steel: [cyl(0.09, 0.11, 0.18, { p: [0.75, 0.04, -0.45] }), tube([[0.75, 0.2, -0.45], [0.55, 0.2, 0.05], [0.22, 0.2, 0.32]], 0.018)],
      black: [cyl(0.08, 0.08, 0.16, { p: [0.84, 0.2, -0.66], r: [90, 0, -20] })],
    }),
    part('cartridge', [0.2, 0.55, 0.25], { black: [box(0.1, 0.07, 0.16, { p: [0.18, 0.15, 0.36], r: [0, -25, 0] })], brass: [box(0.13, 0.015, 0.2, { p: [0.18, 0.2, 0.36], r: [0, -25, 0] })], steel: [cyl(0.004, 0.012, 0.05, { p: [0.18, 0.095, 0.38] })] }),
  ];
}

function tapeMachine() {
  const reel = (x) => [
    cyl(0.55, 0.55, 0.02, { p: [x, 0.55, 0.28], r: [90, 0, 0] }, 96),
    cyl(0.55, 0.55, 0.02, { p: [x, 0.55, 0.12], r: [90, 0, 0] }, 96),
    cyl(0.12, 0.12, 0.18, { p: [x, 0.55, 0.2], r: [90, 0, 0] }),
  ];
  return [
    part('deck', [0, 0, -0.6], { black: [box(2.6, 2.2, 0.3, {}, 0.04)], aluminium: [box(2.5, 2.1, 0.02, { p: [0, 0, 0.16] })] }),
    part('reels', [0, 0.2, 0.8], { aluminium: [...reel(-0.7), ...reel(0.7)], vinyl: [cyl(0.38, 0.38, 0.14, { p: [-0.7, 0.55, 0.2], r: [90, 0, 0] }, 64), cyl(0.25, 0.25, 0.14, { p: [0.7, 0.55, 0.2], r: [90, 0, 0] }, 64)] }),
    part('heads', [0, -0.1, 0.7], { chrome: [-0.22, 0, 0.22].map((x) => box(0.14, 0.18, 0.12, { p: [x, -0.35, 0.24] }, 0.02)), black: [box(0.8, 0.08, 0.2, { p: [0, -0.48, 0.22] })] }),
    part('capstan', [0.4, -0.2, 0.6], { steel: [cyl(0.03, 0.03, 0.22, { p: [0.55, -0.35, 0.28], r: [90, 0, 0] })], rubber: [cyl(0.1, 0.1, 0.12, { p: [0.72, -0.35, 0.28], r: [90, 0, 0] })] }),
    part('meters', [0, -0.3, 0.5], { ivory: [-0.6, 0, 0.6].map((x) => box(0.42, 0.28, 0.04, { p: [x, -0.8, 0.2] })), glass: [-0.6, 0, 0.6].map((x) => box(0.44, 0.3, 0.02, { p: [x, -0.8, 0.24] })) }),
  ];
}

function compactDisc() {
  const ringCyl = (rOut, rIn, h, y) => lathe([[rIn, -h / 2], [rOut, -h / 2], [rOut, h / 2], [rIn, h / 2], [rIn, -h / 2]], { p: [0, y, 0] }, 128);
  return [
    part('label', [0, 0.9, 0], { label: [ringCyl(1.0, 0.18, 0.01, 0.06)] }),
    part('aluminium', [0, 0.5, 0], { foil: [ringCyl(0.99, 0.2, 0.006, 0.045)] }),
    part('polycarbonate', [0, 0, 0], { glass: [ringCyl(1.0, 0.12, 0.08, 0)] }),
    part('laser', [0.2, -0.6, 0], { black: [box(0.5, 0.12, 0.3, { p: [0.55, -0.25, 0] }, 0.02)], glass: [cyl(0.05, 0.05, 0.03, { p: [0.55, -0.17, 0] })], steel: [cyl(0.015, 0.015, 1.6, { p: [0.55, -0.32, 0.18], r: [0, 0, 90] }), cyl(0.015, 0.015, 1.6, { p: [0.55, -0.32, -0.18], r: [0, 0, 90] })] }),
    part('spindle', [0, -0.9, 0], { steel: [cyl(0.11, 0.11, 0.08, { p: [0, -0.15, 0] }), cyl(0.2, 0.2, 0.2, { p: [0, -0.32, 0] })] }),
  ];
}

function fuzzPedal() {
  return [
    part('enclosure', [0, 0.6, 0], { aluminium: [box(1.4, 0.36, 1.9, { p: [0, 0.18, 0] }, 0.06)] }),
    part('knobs', [0, 1.2, 0], { black: [-0.42, 0, 0.42].map((x) => cyl(0.13, 0.15, 0.16, { p: [x, 0.44, -0.55] })), brass: [-0.42, 0, 0.42].map((x) => cyl(0.06, 0.06, 0.01, { p: [x, 0.525, -0.55] })) }),
    part('footswitch', [0, 0.9, 0.4], { chrome: [cyl(0.11, 0.11, 0.12, { p: [0, 0.42, 0.55] }), cyl(0.07, 0.08, 0.1, { p: [0, 0.5, 0.55] })] }),
    part('circuit', [0, -0.1, 0], {
      pcb: [box(1.2, 0.03, 1.6, { p: [0, -0.1, 0] })],
      black: [-0.3, 0, 0.3, 0.45].map((x, i) => cyl(0.04, 0.04, 0.1, { p: [x, -0.03, -0.2 + i * 0.15] })),
      copper: Array.from({ length: 6 }, (_, i) => cyl(0.05, 0.05, 0.14, { p: [-0.45 + i * 0.18, -0.02, 0.35] })),
    }),
    part('battery', [0, -0.5, 0.4], { black: [box(0.5, 0.17, 0.9, { p: [0, -0.3, 0.3] }, 0.02)], brass: [box(0.2, 0.06, 0.1, { p: [0, -0.2, -0.2] })] }),
  ];
}

function ipod() {
  return [
    part('front', [0, 0, 0.6], { plastic: [box(1.2, 2.0, 0.14, { p: [0, 0, 0.12] }, 0.07)] }),
    part('wheel', [0, 0, 1.0], { plastic: [lathe([[0.17, 0], [0.42, 0], [0.42, 0.02], [0.17, 0.02], [0.17, 0]], { p: [0, -0.45, 0.2], r: [90, 0, 0] }, 96)], aluminium: [cyl(0.15, 0.15, 0.03, { p: [0, -0.45, 0.205], r: [90, 0, 0] })] }),
    part('screen', [0, 0.1, 0.85], { glass: [box(0.95, 0.72, 0.02, { p: [0, 0.48, 0.2] })], black: [box(0.88, 0.66, 0.02, { p: [0, 0.48, 0.185] })] }),
    part('drive', [0, 0, 0.1], { aluminium: [box(0.95, 1.2, 0.1, { p: [0, 0.2, 0.0] }, 0.02)], chrome: [cyl(0.36, 0.36, 0.02, { p: [0, 0.25, 0.06], r: [90, 0, 0] }, 64)] }),
    part('battery', [0, -0.4, -0.3], { black: [box(0.9, 0.55, 0.08, { p: [0, -0.62, 0] }, 0.02)] }),
    part('back', [0, 0, -0.9], { chrome: [box(1.2, 2.0, 0.1, { p: [0, 0, -0.1] }, 0.05)] }),
  ];
}

function ampHead() {
  const valve = (x, h, y = 0.15) => [cyl(0.09, 0.09, h, { p: [x, y + h / 2, -0.1] }, 32), sphere(0.09, { p: [x, y + h, -0.1] }, 24)];
  return [
    part('cabinet', [0, 0.9, 0], { tolex: [box(2.4, 0.95, 1.0, { p: [0, 0.3, 0] }, 0.06)], cloth: [box(2.1, 0.5, 0.02, { p: [0, 0.38, 0.51] })], brass: [box(1.6, 0.06, 0.03, { p: [0, 0.1, 0.52] })] }),
    part('chassis', [0, 0, 0], { aluminium: [box(2.2, 0.1, 0.8, { p: [0, 0.1, 0] })], black: [box(2.2, 0.3, 0.06, { p: [0, 0.0, 0.37] })], brass: Array.from({ length: 6 }, (_, i) => cyl(0.05, 0.05, 0.06, { p: [-0.75 + i * 0.3, 0.02, 0.42], r: [90, 0, 0] })) }),
    part('preamp', [-0.3, 0.6, 0], { glass: [...valve(-0.75, 0.32), ...valve(-0.55, 0.32), ...valve(-0.35, 0.32)] }),
    part('power', [0.3, 0.7, 0], { glass: [...valve(0.15, 0.5), ...valve(0.4, 0.5), ...valve(0.65, 0.5), ...valve(0.9, 0.5)] }),
    part('transformer', [0, 0.5, -0.8], { iron: [box(0.4, 0.38, 0.34, { p: [-0.1, 0.34, -0.2] }, 0.02)], copper: [cyl(0.14, 0.14, 0.3, { p: [-0.1, 0.34, -0.2], r: [0, 0, 90] })] }),
    part('speaker', [0, -1.0, 0], { tolex: [box(2.4, 1.6, 1.0, { p: [0, -1.0, 0] }, 0.06)], paper: [lathe([[0.1, 0], [0.55, 0.22], [0.58, 0.24]], { p: [0, -1.0, 0.52], r: [-90, 0, 0] })], rubber: [torus(0.6, 0.04, { p: [0, -1.0, 0.52] })] }),
  ];
}

function tr808() {
  const keyMat = ['key-red', 'key-orange', 'key-yellow', 'key-white'];
  const keys = Object.fromEntries(keyMat.map((m) => [m, []]));
  for (let i = 0; i < 16; i++) keys[keyMat[Math.floor(i / 4)]].push(box(0.1, 0.06, 0.14, { p: [-1.2 + i * 0.16, 0.12, 0.55] }, 0.015));
  const knobRows = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) knobRows.push(cyl(0.045, 0.05, 0.06, { p: [-1.2 + i * 0.21, 0.12, -0.25 + r * 0.25] }, 24));
  return [
    part('case', [0, -0.5, 0], { black: [box(2.8, 0.18, 1.5, {}, 0.03)], walnut: [box(0.08, 0.3, 1.5, { p: [-1.44, 0.05, 0] }), box(0.08, 0.3, 1.5, { p: [1.44, 0.05, 0] })] }),
    part('keys', [0, 0.6, 0.3], keys),
    part('knobs', [0, 0.5, -0.2], { ivory: knobRows }),
    part('circuit', [0, -1.0, 0], { pcb: [box(2.4, 0.03, 1.2, { p: [0, -0.15, 0] })], copper: Array.from({ length: 8 }, (_, i) => cyl(0.05, 0.05, 0.1, { p: [-0.9 + i * 0.25, -0.08, -0.2] })) }),
    part('tempo', [0.4, 0.8, 0], { ivory: [cyl(0.14, 0.16, 0.12, { p: [1.15, 0.15, -0.55] }, 48)], brass: [box(0.02, 0.01, 0.1, { p: [1.15, 0.215, -0.5] })] }),
  ];
}

const MODELS = {
  'iem': iem,
  'headphone-open': () => overEar('black'),
  'speaker-walnut': () => speaker(),
  'monitor-black': () => speaker({ cabinet: 'black', baffle: 'black', cone: 'ceramic', w: 1.0, h: 1.6, d: 1.2 }),
  'phonograph': phonograph,
  'ribbon-mic': ribbonMic,
  'turntable': turntable,
  'tape-machine': tapeMachine,
  'compact-disc': compactDisc,
  'fuzz-pedal': fuzzPedal,
  'ipod': ipod,
  'amp-head': ampHead,
  'tr-808': tr808,
};

// ---------- export ----------
function toPrimitive(doc, buffer, geometries) {
  const merged = mergeGeometries(geometries.map((g) => {
    const ng = toCreasedNormals(g.index ? g.toNonIndexed() : g, 35 * D);
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
    if (!ng.attributes.normal) ng.computeVertexNormals();
    return ng;
  }));
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(merged.attributes.position.array)).setBuffer(buffer);
  const nor = doc.createAccessor().setType('VEC3').setArray(new Float32Array(merged.attributes.normal.array)).setBuffer(buffer);
  return doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nor);
}

async function build(name, make) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);
  const materials = new Map();
  const mat = (key) => {
    if (!materials.has(key)) {
      const [r, g, b] = COLORS[key] ?? [0.5, 0.5, 0.5];
      const metal = METALS.has(key);
      materials.set(key, doc.createMaterial(key).setBaseColorFactor([r, g, b, 1]).setMetallicFactor(metal ? 1 : 0).setRoughnessFactor(metal ? 0.35 : 0.6));
    }
    return materials.get(key);
  };
  for (const p of make()) {
    const mesh = doc.createMesh(p.id);
    for (const [key, geos] of Object.entries(p.groups)) {
      if (geos.length) mesh.addPrimitive(toPrimitive(doc, buffer, geos).setMaterial(mat(key)));
    }
    scene.addChild(doc.createNode(p.id).setMesh(mesh).setExtras({ explode: p.explode }));
  }
  await MeshoptEncoder.ready;
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  await io.write(`${OUT}${name}.glb`, doc);
}

await mkdir(OUT, { recursive: true });
const only = process.argv.slice(2);
for (const [name, make] of Object.entries(MODELS)) {
  if (only.length && !only.includes(name)) continue;
  await build(name, make);
  console.log('ok', name);
}
