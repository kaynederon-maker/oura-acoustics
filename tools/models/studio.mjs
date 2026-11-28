import * as THREE from 'three';
import {
  D, place, part, merge, box, cyl, torus, sphere, lathe, tube, arc, roundCyl, ring, knurl, knob, screws, circlePts,
  roundedRect, extrude, loft, sampleShape, braid, text, aim,
} from './kit.mjs';

function kidney(s = 1) {
  const k = new THREE.Shape();
  k.moveTo(-0.55 * s, -0.1 * s);
  k.bezierCurveTo(-0.6 * s, 0.45 * s, -0.15 * s, 0.62 * s, 0.2 * s, 0.55 * s);
  k.bezierCurveTo(0.58 * s, 0.48 * s, 0.66 * s, 0.1 * s, 0.5 * s, -0.22 * s);
  k.bezierCurveTo(0.36 * s, -0.5 * s, 0.0 * s, -0.58 * s, -0.22 * s, -0.48 * s);
  k.bezierCurveTo(-0.46 * s, -0.38 * s, -0.52 * s, -0.3 * s, -0.55 * s, -0.1 * s);
  return k;
}

export function iem() {
  const outline = sampleShape(kidney(), 128);
  const shell = loft(outline, [
    { z: -0.335, s: 0.3, dx: 0.12, dy: -0.12 },
    { z: -0.325, s: 0.52, dx: 0.1, dy: -0.1 },
    { z: -0.3, s: 0.7, dx: 0.07, dy: -0.07 },
    { z: -0.26, s: 0.82, dx: 0.045, dy: -0.045 },
    { z: -0.2, s: 0.9, dx: 0.025, dy: -0.025 },
    { z: -0.12, s: 0.955, dx: 0.01, dy: -0.01 },
    { z: -0.03, s: 0.985 },
    { z: 0.07, s: 0.998 },
    { z: 0.15, s: 1.0 },
    { z: 0.185, s: 0.993 },
    { z: 0.2, s: 0.975 },
  ]);
  const plateShape = kidney(0.985);
  const plate = extrude(plateShape, 0.035, { p: [0, 0, 0.2] }, 0.022, { bevelSegments: 8, curveSegments: 96 });
  const inset = extrude(kidney(0.86), 0.01, { p: [0, 0, 0.258] }, 0.004, { curveSegments: 96 });
  const inlayShape = kidney(0.895);
  inlayShape.holes.push(new THREE.Path(kidney(0.865).getSpacedPoints(128).reverse()));
  const inlay = extrude(inlayShape, 0.012, { p: [0, 0, 0.26] }, 0.003, { curveSegments: 96 });
  const logo = text('OURA', 0.075, { p: [0.03, -0.02, 0.277] }, { weight: 0.1, depth: 0.1, track: 2.4 });
  const dot = roundCyl(0.022, 0.012, { p: [0.03, 0.1, 0.277], r: [90, 0, 0] }, 0.005, 32);

  const socketPos = [0.02, 0.555, 0.06];
  const socket = box(0.2, 0.06, 0.11, { p: socketPos, r: [0, 0, -6] }, 0.02);
  const pins = [-0.035, 0.035].map((x) => roundCyl(0.011, 0.03, { p: [socketPos[0] + x, socketPos[1] + 0.03, socketPos[2]], r: [0, 0, -6] }, 0.003, 16));
  const socketRim = box(0.17, 0.012, 0.085, { p: [socketPos[0], socketPos[1] + 0.03, socketPos[2]], r: [0, 0, -6] }, 0.004);
  const vent = ring(0.02, 0.011, 0.02, { p: [-0.42, 0.18, 0.05], r: [0, 0, 80] }, 0.003, 24);

  const base = [0.3, -0.27, -0.24];
  const dir = [0.3, -0.33, -0.89];
  const stem = aim(lathe([[0.19, -0.06], [0.17, 0.02], [0.135, 0.1], [0.11, 0.16], [0.1, 0.2], [0, 0.2]], {}, 64), base, dir);
  const along = (t) => { const v = new THREE.Vector3(...dir).normalize().multiplyScalar(t); return [base[0] + v.x, base[1] + v.y, base[2] + v.z]; };
  const nozzle = aim(lathe([
    [0.078, 0], [0.09, 0], [0.09, 0.2], ...arc(0.095, 0.215, 0.012, -90, 90, 6), [0.1, 0.24], ...arc(0.093, 0.255, 0.012, -60, 90, 6),
    [0.072, 0.267], [0.072, 0.255], [0.078, 0.25], [0.078, 0],
  ], {}, 64), along(0.19), dir);
  const filter = aim(cyl(0.074, 0.074, 0.006, {}, 48), along(0.44), dir);
  const filterRim = aim(ring(0.08, 0.068, 0.012, {}, 0.003, 48), along(0.445), dir);
  const tip = aim(lathe([
    [0.064, 0.0], [0.077, 0.0], [0.077, 0.11], [0.165, 0.03], [0.184, 0.038], [0.192, 0.068], [0.182, 0.115], [0.15, 0.155],
    [0.105, 0.177], [0.064, 0.18], [0.064, 0.0],
  ], {}, 64), along(0.3), dir);

  const dPos = [-0.08, 0.08, 0.0];
  const can = lathe([[0, -0.04], [0.17, -0.04], ...arc(0.17, -0.025, 0.015, -90, 0, 4), [0.185, 0.03], [0.19, 0.034], [0.19, 0.04], [0.16, 0.04]], {}, 64);
  const dome = lathe([[0, 0.075], [0.06, 0.07], [0.11, 0.055], [0.14, 0.045], [0.155, 0.05], [0.165, 0.045], [0.17, 0.04]], {}, 64);
  const driver = {
    steel: [place(can, { p: dPos, r: [90, 0, 0] })],
    film: [place(dome, { p: dPos, r: [90, 0, 0] })],
    copper: [torus(0.085, 0.009, { p: [dPos[0], dPos[1], dPos[2] + 0.045] }, 48, 8)],
    'brass~fine': [torus(0.188, 0.006, { p: [dPos[0], dPos[1], dPos[2] + 0.04] }, 64, 8), ...circlePts(6, 0.11).map(([x, y]) => cyl(0.012, 0.012, 0.004, { p: [dPos[0] + x, dPos[1] + y, dPos[2] - 0.042], r: [90, 0, 0] }, 12))],
  };

  const ba = (y) => [
    box(0.17, 0.085, 0.11, { p: [0.24, y, 0.0] }, 0.012),
    box(0.04, 0.03, 0.03, { p: [0.34, y - 0.01, -0.03] }, 0.008),
  ];
  const pcbPos = [0.0, -0.24, 0.07];
  const armatures = {
    aluminium: [...ba(-0.2), ...ba(-0.085)],
    pcb: [box(0.22, 0.012, 0.13, { p: pcbPos }, 0.004)],
    'black~fine': [[-0.06, 0.02], [0.0, -0.03], [0.05, 0.03], [-0.02, 0.04]].map(([x, z]) => box(0.03, 0.012, 0.018, { p: [pcbPos[0] + x, pcbPos[1] + 0.012, pcbPos[2] + z] }, 0.003)),
    'brass~fine': [[0.08, -0.04], [0.08, 0.04]].map(([x, z]) => box(0.025, 0.006, 0.02, { p: [pcbPos[0] + x, pcbPos[1] + 0.009, pcbPos[2] + z] })),
    silicone: [
      tube([[0.36, -0.21, -0.03], [0.4, -0.28, -0.12], [0.37, -0.36, -0.26], [0.34, -0.38, -0.32]], 0.018, {}, 48, 10),
      tube([[0.36, -0.095, -0.03], [0.42, -0.2, -0.13], [0.39, -0.33, -0.27], [0.355, -0.37, -0.33]], 0.018, {}, 48, 10),
    ],
    copper: braid([[0.02, 0.5, 0.06], [0.1, 0.3, 0.06], [0.18, 0.05, 0.05], [0.22, -0.1, 0.06]], 0.006, 0.0045, 9),
  };

  return [
    part('faceplate', [0, 0, 0.9], {
      lacquer: [plate],
      flake: [inset],
      brass: [inlay, dot],
      'brass~fine': [logo],
    }),
    part('shell', [0, 0, 0], {
      resin: [shell, stem],
      black: [socket],
      'black~fine': [socketRim],
      'brass~fine': [...pins, vent],
    }),
    part('driver', [0, 0.05, 0.45], driver),
    part('armatures', [0.25, -0.15, 0.25], armatures),
    part('nozzle', [0.35, -0.35, -0.6], { steel: [nozzle, filterRim], grille: [filter] }),
    part('tip', [0.6, -0.6, -1.1], { silicone: [tip] }),
  ];
}

export function overEar(cup = 'black') {
  const R = 1.0;
  const cy = 0.35;
  const arcPts = (r, a0, a1, n = 48, z = 0) => Array.from({ length: n + 1 }, (_, i) => {
    const a = (a0 + ((a1 - a0) * i) / n) * D;
    return new THREE.Vector3(Math.cos(a) * r, cy + Math.sin(a) * r, z);
  });
  const bandPath = new THREE.CatmullRomCurve3(arcPts(R, 6, 174));
  const band = extrude(roundedRect(0.2, 0.05, 0.022), 0, {}, 0, { extrudePath: bandPath, steps: 120, curveSegments: 12 });
  const cushion = [-1, 1].map((sz) => extrude(roundedRect(0.085, 0.045, 0.02), 0, {}, 0, {
    extrudePath: new THREE.CatmullRomCurve3(arcPts(R - 0.06, 32, 148, 40, sz * 0.05)), steps: 90, curveSegments: 10,
  }));
  const seams = [-1, 1].flatMap((sz) => [-1, 1].map((e) => tube(arcPts(R - 0.082, 34, 146, 40, sz * 0.05 + e * 0.034).map((v) => v.toArray()), 0.004, {}, 120, 5)));
  const bandLogo = place(text('OURA', 0.06, {}, { weight: 0.11, depth: 0.12, track: 2.6 }), { p: [0, cy + R + 0.026, 0], r: [-90, 0, 0] });

  const side = (sx) => {
    const x = sx * 1.02;
    const y = -0.45;
    const slider = box(0.065, 0.42, 0.03, { p: [sx * 0.985, 0.2, 0] }, 0.012);
    const marks = Array.from({ length: 7 }, (_, i) => box(0.004, 0.003, 0.02, { p: [sx * 0.985 - sx * 0.034, 0.05 + i * 0.04, 0], r: [0, 0, 90] }));
    const fork = [-1, 1].map((sz) => tube([[sx * 0.99, 0.02, 0], [sx * 1.01, -0.05, sz * 0.25], [sx * 1.02, -0.25, sz * 0.43], [sx * 1.02, -0.45, sz * 0.47]], 0.026, {}, 64, 12));
    const hubs = [-1, 1].map((sz) => roundCyl(0.055, 0.05, { p: [sx * 1.02, -0.45, sz * 0.47], r: [90, 0, 0] }, 0.012, 32));
    const cupBody = lathe([[0, -0.09], [0.43, -0.09], ...arc(0.43, -0.05, 0.04, -90, 0, 5), [0.475, 0.02], ...arc(0.44, 0.03, 0.035, 0, 80, 5), [0.4, 0.07], [0.4, 0.06], [0, 0.06]], {}, 96);
    const cupG = place(cupBody, { p: [x, y, 0], r: [0, 0, -sx * 90], s: [1, 1, 1.18] });
    const grille = place(cyl(0.39, 0.39, 0.012, {}, 96), { p: [x + sx * 0.075, y, 0], r: [0, 0, -sx * 90], s: [1, 1, 1.18] });
    const grilleRim = place(ring(0.405, 0.385, 0.02, {}, 0.004, 96), { p: [x + sx * 0.078, y, 0], r: [0, 0, -sx * 90], s: [1, 1, 1.18] });
    const badge = place(roundCyl(0.085, 0.02, {}, 0.006, 48), { p: [x + sx * 0.088, y, 0], r: [0, 0, -sx * 90] });
    const badgeText = place(text('OURA', 0.034, {}, { weight: 0.12, depth: 0.12, track: 2.4 }), { p: [x + sx * 0.1, y, 0], r: [0, sx * 90, 0] });
    const sock = box(0.07, 0.06, 0.1, { p: [x - sx * 0.02, y - 0.5, 0.12] }, 0.015);
    const sockPins = [-0.02, 0.02].map((z) => cyl(0.007, 0.007, 0.03, { p: [x - sx * 0.02, y - 0.535, 0.12 + z] }, 12));
    const padLoop = [...arc(0.345, -0.015, 0.045, 180, 270, 6), ...arc(0.375, -0.015, 0.045, 270, 360, 6), ...arc(0.375, 0.015, 0.045, 0, 90, 6), ...arc(0.345, 0.015, 0.045, 90, 180, 6)];
    const pad = place(lathe([...padLoop, padLoop[0]], {}, 96), { p: [sx * 0.86, y, 0], r: [0, 0, -sx * 90], s: [1, 1, 1.18] });
    const padCloth = place(cyl(0.28, 0.28, 0.01, {}, 64), { p: [sx * 0.85, y, 0], r: [0, 0, -sx * 90], s: [1, 1, 1.18] });
    const frame = place(ring(0.33, 0.3, 0.03, {}, 0.005, 64), { p: [sx * 0.95, y, 0], r: [0, 0, -sx * 90] });
    const spokes = Array.from({ length: 6 }, (_, i) => place(box(0.012, 0.3, 0.018, { p: [0, 0.15, 0] }), { p: [sx * 0.955, y, 0], r: [i * 60, 0, 0] }));
    const film = place(lathe([[0, 0.035], [0.08, 0.03], [0.2, 0.012], [0.28, 0.004], [0.3, 0]], {}, 64), { p: [sx * 0.94, y, 0], r: [0, 0, -sx * 90] });
    const magnet = place(roundCyl(0.11, 0.06, {}, 0.01, 48), { p: [sx * 0.985, y, 0], r: [0, 0, -sx * 90] });
    return { slider, marks, fork, hubs, cupG, grille, grilleRim, badge, badgeText, sock, sockPins, pad, padCloth, frame, spokes, film, magnet };
  };
  const L = side(-1);
  const Rt = side(1);
  const both = (k) => [...[].concat(L[k]), ...[].concat(Rt[k])];
  const hubScrews = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * 1.02, -0.45, sz * 0.5]));
  return [
    part('headband', [0, 0.7, 0], merge(
      { [cup === 'black' ? 'black' : 'plastic']: [band], leather: cushion, 'black~fine': seams, 'steel~fine': [bandLogo] },
    )),
    part('yokes', [0, 0.35, 0], merge(
      { steel: both('slider'), 'black~fine': both('marks'), black: [...both('fork'), ...both('hubs')] },
      screws(hubScrews.filter((q) => q[2] > 0), 0.02, [90, 0, 0], 'cross'),
      screws(hubScrews.filter((q) => q[2] < 0), 0.02, [-90, 0, 0], 'cross'),
    )),
    part('cups', [0, 0, 0], { speckle: both('cupG'), black: both('sock'), 'brass~fine': both('sockPins') }),
    part('grilles', [0, 0, 0], { grille: both('grille'), steel: [...both('grilleRim'), ...both('badge')], 'black~fine': both('badgeText') }),
    part('pads', [0, -0.15, 0], { velour: both('pad'), cloth: both('padCloth') }),
    part('drivers', [0, -0.5, 0], { aluminium: [...both('frame'), ...both('spokes')], film: both('film'), iron: both('magnet') }),
  ];
}

export function speaker({ cabinet = 'walnut', baffle = 'satin', cone = 'paper', dome = 'cloth', w = 1.1, h = 1.7, d = 1.1, label = 'OURA' } = {}) {
  const front = d / 2;
  const wy = -h * 0.17;
  const ty = h * 0.27;
  const wr = Math.min(w * 0.36, 0.4);
  const cab = box(w, h, d, {}, 0.05, 6);
  const port = ring(0.09, 0.07, 0.06, { p: [0, -h * 0.3, -front], r: [90, 0, 0] }, 0.01, 48);
  const portHole = cyl(0.071, 0.071, 0.02, { p: [0, -h * 0.3, -front + 0.012], r: [90, 0, 0] }, 48);
  const feet = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => roundCyl(0.07, 0.035, { p: [sx * (w / 2 - 0.12), -h / 2 - 0.0175, sz * (d / 2 - 0.12)] }, 0.012, 32)));
  const posts = [-0.1, 0.1].flatMap((x) => [knurl(0.035, 0.07, { p: [x, -h * 0.12, -front - 0.035], r: [90, 0, 0] }, 16, 0.1), cyl(0.012, 0.012, 0.1, { p: [x, -h * 0.12, -front - 0.05], r: [90, 0, 0] }, 12)]);
  const plate = box(w - 0.06, h - 0.06, 0.04, { p: [0, 0, front + 0.005] }, 0.018);

  const trim = ring(wr + 0.06, wr - 0.005, 0.03, { p: [0, wy, front + 0.03], r: [90, 0, 0] }, 0.008, 96);
  const surround = lathe(arc(wr - 0.035, 0, 0.035, 0, 180, 12).map(([x, y]) => [x, y]), { p: [0, wy, front + 0.02], r: [90, 0, 0] }, 96);
  const conePts = Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    return [0.085 + t * (wr - 0.155), -0.13 + t * 0.13 + Math.sin(t * Math.PI * 7) * 0.003];
  });
  const coneG = lathe(conePts, { p: [0, wy, front + 0.02], r: [90, 0, 0] }, 96);
  const capDome = sphere(0.09, { p: [0, wy, front - 0.1], s: [1, 1, 0.55] }, 48);
  const wScrews = circlePts(6, wr + 0.03, 0, 0, Math.PI / 6).map(([x, y]) => [x, wy + y, front + 0.047]);

  const guide = lathe([[0.085, -0.012], [0.12, -0.008], [0.16, 0.004], [0.19, 0.02], [0.2, 0.03], [0.19, 0.034], [0.15, 0.022], [0.1, 0.006], [0.08, 0.0]], { p: [0, ty, front + 0.03], r: [90, 0, 0] }, 96);
  const tDome = sphere(0.075, { p: [0, ty, front + 0.025], s: [1, 1, 0.55] }, 48);
  const tRing = torus(0.085, 0.01, { p: [0, ty, front + 0.03] }, 64, 10);
  const tScrews = circlePts(3, 0.165, 0, 0, Math.PI / 2).map(([x, y]) => [x, ty + y, front + 0.052]);
  const logo = text(label, 0.05, { p: [0, -h / 2 + 0.11, front + 0.05] }, { weight: 0.1, depth: 0.12, track: 2.6 });
  const led = roundCyl(0.012, 0.012, { p: [w * 0.3, -h / 2 + 0.11, front + 0.048], r: [90, 0, 0] }, 0.004, 16);
  const knobs = [0.12, -0.08, -0.28].flatMap((y) => knob(0.055, 0.07, { p: [w / 2 + 0.002, y, d * 0.22], r: [0, 0, -90] }, { skirt: 1.18 }));
  const knobMarks = [0.12, -0.08, -0.28].map((y) => box(0.004, 0.035, 0.008, { p: [w / 2 + 0.072, y + 0.028, d * 0.22] }));
  return [
    part('cabinet', [0, 0, -0.5], merge({ [cabinet]: [cab] }, { [baffle]: [port] }, { black: [portHole] }, { rubber: feet, brass: posts })),
    part('baffle', [0, 0, 0.35], merge({ [baffle]: [plate], 'steel~fine': [logo], led: [led] })),
    part('woofer', [0, -0.1, 0.9], merge(
      { [cone]: [coneG] }, { rubber: [surround], aluminium: [trim] }, { [cone === 'ceramic' ? 'ceramic' : 'film']: [capDome] },
      screws(wScrews, 0.018, [90, 0, 0], 'hex', 'black~fine'),
    )),
    part('tweeter', [0, 0.1, 0.9], merge(
      { black: [guide] }, { [dome]: [tDome] }, { aluminium: [tRing] },
      screws(tScrews, 0.014, [90, 0, 0], 'hex', 'black~fine'),
    )),
    part('controls', [0.5, 0, 0], { aluminium: knobs, 'black~fine': knobMarks }),
  ];
}
