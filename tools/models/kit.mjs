import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const D = Math.PI / 180;
export const V = (p) => new THREE.Vector3(...p);

export function place(geo, { p = [0, 0, 0], r = [0, 0, 0], s = 1 } = {}) {
  const m = new THREE.Matrix4().compose(
    V(p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * D, r[1] * D, r[2] * D)),
    new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])),
  );
  return geo.applyMatrix4(m);
}

export const part = (id, explode, groups, origin = [0, 0, 0]) => ({ id, explode, groups, origin });

export function merge(...objs) {
  const out = {};
  for (const o of objs) for (const [k, v] of Object.entries(o)) out[k] = [...(out[k] ?? []), ...v];
  return out;
}

export const box = (w, h, d, o, radius = 0, seg = 4) =>
  place(radius ? new RoundedBoxGeometry(w, h, d, seg, Math.min(radius, w / 2, h / 2, d / 2) * 0.999) : new THREE.BoxGeometry(w, h, d), o);
export const cyl = (rt, rb, h, o, seg = 48, open = false) => place(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), o);
export const torus = (r, t, o, seg = 64, tube = 12, arc = Math.PI * 2) => place(new THREE.TorusGeometry(r, t, tube, seg, arc), o);
export const sphere = (r, o, seg = 32) => place(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), o);
export const lathe = (pts, o, seg = 64) => place(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)), seg), o);
export const tube = (points, radius, o, seg = 64, radial = 12, closed = false) =>
  place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(V), closed), seg, radius, radial, closed), o);

export function arc(cx, cy, r, a0, a1, n = 8) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (a0 + ((a1 - a0) * i) / n) * D;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

export function roundCyl(r, h, o, b = Math.min(r, h) * 0.18, seg = 64) {
  const pts = [[0, -h / 2], ...arc(r - b, -h / 2 + b, b, -90, 0, 6), ...arc(r - b, h / 2 - b, b, 0, 90, 6), [0, h / 2]];
  return lathe(pts, o, seg);
}

export function ring(rOut, rIn, h, o, b = 0.004, seg = 96) {
  const pts = [
    ...arc(rIn + b, -h / 2 + b, b, 180, 270, 3), ...arc(rOut - b, -h / 2 + b, b, -90, 0, 3),
    ...arc(rOut - b, h / 2 - b, b, 0, 90, 3), ...arc(rIn + b, h / 2 - b, b, 90, 180, 3),
  ];
  return lathe([...pts, pts[0]], o, seg);
}

export function knurl(r, h, o, n = 36, depth = 0.07) {
  const g = new THREE.CylinderGeometry(r, r, h, n * 2, 1, false);
  const pos = g.attributes.position;
  const cols = n * 2 + 1;
  for (let i = 0; i < cols * 2; i++) {
    const k = (i % cols) % 2 ? 1 - depth : 1;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  return place(g, o);
}

export function knob(r, h, o, { skirt = 1.25, n = 32, cap = true, seg = 48 } = {}) {
  const body = knurl(r, h * 0.78, { p: [0, h * 0.39, 0] }, n, 0.08);
  const top = roundCyl(r * 0.94, h * 0.18, { p: [0, h * 0.86, 0] }, r * 0.12, seg);
  const sk = roundCyl(r * skirt, h * 0.16, { p: [0, h * 0.06, 0] }, r * 0.06, seg);
  const parts = [body, sk, ...(cap ? [top] : [])].map((g) => place(g, o));
  return parts;
}

export function screwHead(r, o, kind = 'slot') {
  const head = lathe([[0, 0], [r, 0], [r, r * 0.12], ...arc(0, -r * 0.55, r * 1.05, 58, 90, 8)], {}, 24);
  const recess = kind === 'cross'
    ? [box(r * 1.5, r * 0.2, r * 0.22, { p: [0, r * 0.48, 0] }), box(r * 0.22, r * 0.2, r * 1.5, { p: [0, r * 0.48, 0] })]
    : kind === 'hex' ? [cyl(r * 0.42, r * 0.42, r * 0.25, { p: [0, r * 0.45, 0] }, 6)]
      : [box(r * 1.7, r * 0.22, r * 0.24, { p: [0, r * 0.45, 0] })];
  return { head: [place(head, o)], recess: recess.map((g) => place(g, o)) };
}

export function screws(points, r, rot, kind = 'slot', metal = 'steel~fine') {
  const out = { [metal]: [], 'black~fine': [] };
  for (const p of points) {
    const s = screwHead(r, { p, r: rot }, kind);
    out[metal].push(...s.head);
    out['black~fine'].push(...s.recess);
  }
  return out;
}

export function circlePts(n, r, cx = 0, cy = 0, a0 = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

export function shapeFrom(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

export function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

export function holePath(x, y, r) {
  const h = new THREE.Path();
  h.absarc(x, y, r, 0, Math.PI * 2, true);
  return h;
}

export function extrude(shape, depth, o, bevel = 0.02, opts = {}) {
  return place(new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: opts.bevelSegments ?? 5,
    curveSegments: opts.curveSegments ?? 48, steps: 1, ...(opts.extrudePath ? { extrudePath: opts.extrudePath, steps: opts.steps ?? 64 } : {}),
  }), o);
}

export function perforated(shape, holes, depth, o, bevel = 0.004) {
  for (const [x, y, r] of holes) shape.holes.push(holePath(x, y, r));
  return extrude(shape, depth, o, bevel, { curveSegments: 8, bevelSegments: 2 });
}

export function hexGrid(w, h, pitch, keep) {
  const pts = [];
  const rowH = pitch * Math.sqrt(3) / 2;
  for (let j = -Math.ceil(h / rowH); j <= Math.ceil(h / rowH); j++) {
    for (let i = -Math.ceil(w / pitch); i <= Math.ceil(w / pitch); i++) {
      const x = i * pitch + (j % 2 ? pitch / 2 : 0);
      const y = j * rowH;
      if (keep(x, y)) pts.push([x, y]);
    }
  }
  return pts;
}

export function aim(geo, from, dir) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(dir).normalize());
  return geo.applyQuaternion(q).translate(...from);
}

export function loft(outline, stations, o) {
  if (THREE.ShapeUtils.isClockWise(outline.map(([x, y]) => new THREE.Vector2(x, y)))) outline = [...outline].reverse();
  const n = outline.length;
  const pos = [];
  const idx = [];
  for (const st of stations) {
    for (const [x, y] of outline) pos.push(x * st.s * (st.sx ?? 1) + (st.dx ?? 0), y * st.s * (st.sy ?? 1) + (st.dy ?? 0), st.z);
  }
  for (let j = 0; j < stations.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      const c = a + n;
      const d = b + n;
      idx.push(a, b, d, a, d, c);
    }
  }
  const capCenter = (j, flip) => {
    const st = stations[j];
    const ci = pos.length / 3;
    pos.push(st.dx ?? 0, st.dy ?? 0, st.z);
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      flip ? idx.push(ci, b, a) : idx.push(ci, a, b);
    }
  };
  capCenter(0, true);
  capCenter(stations.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return place(g, o);
}

export function sampleShape(shape, n) {
  return shape.getSpacedPoints(n).slice(0, n).map((v) => [v.x, v.y]);
}

export function helix(radius, pitch, turns, tubeR, o, perTurn = 48) {
  const pts = Array.from({ length: Math.round(turns * perTurn) + 1 }, (_, i) => {
    const a = (i / perTurn) * Math.PI * 2;
    return [(i / perTurn) * pitch, Math.cos(a) * radius, Math.sin(a) * radius];
  });
  return tube(pts, tubeR, o, pts.length * 2, 6);
}

export function braid(points, spread, strandR, twists, o, strands = 2, seg = 240) {
  const curve = new THREE.CatmullRomCurve3(points.map(V));
  const frames = curve.computeFrenetFrames(seg, false);
  return Array.from({ length: strands }, (_, s) => {
    const pts = Array.from({ length: seg + 1 }, (_, i) => {
      const t = i / seg;
      const a = t * twists * Math.PI * 2 + (s / strands) * Math.PI * 2;
      const c = curve.getPointAt(t);
      return c.add(frames.normals[i].clone().multiplyScalar(Math.cos(a) * spread)).add(frames.binormals[i].clone().multiplyScalar(Math.sin(a) * spread)).toArray();
    });
    return tube(pts, strandR, o, seg * 2, 8);
  });
}

export function spokedWheel(rOut, rIn, width, spokes, spokeR, o, seg = 64) {
  const parts = [ring(rOut, rOut - width * 0.9, width, {}, width * 0.15, seg), ring(rIn * 1.6, rIn * 0.5, width * 1.4, {}, width * 0.1, 32)];
  const r0 = rIn * 1.5;
  const r1 = rOut - width * 0.8;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * 360;
    parts.push(cyl(spokeR * 0.75, spokeR, r1 - r0, { p: [Math.cos(a * D) * (r0 + r1) / 2, 0, Math.sin(a * D) * (r0 + r1) / 2], r: [0, -a, -90] }, 10));
  }
  return parts.map((g) => place(g, o));
}

const G = {
  A: [[[0, 0], [2, 6], [4, 0]], [[0.9, 2.6], [3.1, 2.6]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2.5, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]], [[1, 0], [3, 0]], [[1, 6], [3, 6]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2.5]], [[1.3, 3.5], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]]],
  P: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  R: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  0: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]]],
  1: [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  2: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  3: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1.5, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  4: [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  5: [[[4, 6], [0, 6], [0, 3.5], [3, 3.5], [4, 2.5], [4, 1], [3, 0], [0, 0]]],
  6: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
  7: [[[0, 6], [4, 6], [1.5, 0]]],
  8: [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  9: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 3.5], [1, 2.5], [4, 2.5]]],
  '-': [[[1, 3], [3, 3]]],
  '.': [[[1.7, 0], [2.3, 0]]],
  '+': [[[0.5, 3], [3.5, 3]], [[2, 1.5], [2, 4.5]]],
  '/': [[[0, 0], [4, 6]]],
};

export function text(str, size, o, { weight = 0.13, depth = 0.08, align = 'center', track = 1.6 } = {}) {
  const k = size / 6;
  const adv = 4 + track;
  const width = str.length * adv - track;
  const x0 = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
  const geos = [];
  const sw = 6 * weight;
  [...str.toUpperCase()].forEach((ch, ci) => {
    for (const stroke of G[ch] ?? []) {
      stroke.forEach(([x, y], i) => {
        const X = x0 + ci * adv + x;
        geos.push(place(new THREE.CylinderGeometry(sw / 2, sw / 2, depth * 6, 8), { p: [X * k, (y - 3) * k, 0], r: [90, 0, 0], s: k }));
        if (!i) return;
        const [px, py] = stroke[i - 1];
        const PX = x0 + ci * adv + px;
        const len = Math.hypot(X - PX, y - py);
        const ang = Math.atan2(y - py, X - PX) / D;
        geos.push(place(new THREE.BoxGeometry(len, sw, depth * 6), { p: [((X + PX) / 2) * k, ((y + py) / 2 - 3) * k, 0], r: [0, 0, ang], s: k }));
      });
    }
  });
  return place(mergeGeometries(geos.map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; })), o);
}

export function ticks(n, r0, r1, w, depth, a0, a1, o) {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / Math.max(1, n - 1);
    const rr = i % 5 === 0 ? r1 : r0 + (r1 - r0) * 0.55;
    return place(box(rr - r0 + 0.0001, w, depth, { p: [(r0 + rr) / 2, 0, 0] }), { ...o, r: [o?.r?.[0] ?? 0, o?.r?.[1] ?? 0, (o?.r?.[2] ?? 0) + a] });
  });
}

export function corrugated(w, h, waves, amp, o, segH = 160) {
  const g = new THREE.PlaneGeometry(w, h, 1, segH);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getY(i) / h) * waves * Math.PI * 2) * amp);
  g.computeVertexNormals();
  return place(g, o);
}
