import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { iem, overEar, speaker } from './models/studio.mjs';
import { phonograph, ribbonMic, turntable, tapeMachine, compactDisc, fuzzPedal, ipod, ampHead, tr808 } from './models/history.mjs';

const OUT = fileURLToPath(new URL('../public/models/', import.meta.url));
const D = Math.PI / 180;

const COLORS = {
  brass: [0.69, 0.55, 0.34], steel: [0.6, 0.62, 0.65], chrome: [0.85, 0.87, 0.89], aluminium: [0.76, 0.78, 0.79], spun: [0.76, 0.78, 0.79],
  lacquer: [0.05, 0.05, 0.05], resin: [0.16, 0.15, 0.18], glass: [0.9, 0.92, 0.94], walnut: [0.42, 0.26, 0.15], rubber: [0.08, 0.08, 0.08],
  paper: [0.17, 0.17, 0.16], silicone: [0.2, 0.2, 0.21], plastic: [0.93, 0.93, 0.92], black: [0.1, 0.1, 0.1], iron: [0.17, 0.17, 0.17],
  pcb: [0.11, 0.23, 0.16], velour: [0.13, 0.13, 0.13], vinyl: [0.04, 0.04, 0.04], label: [0.79, 0.64, 0.36], foil: [0.81, 0.82, 0.83],
  tolex: [0.1, 0.1, 0.1], cloth: [0.23, 0.2, 0.17], copper: [0.72, 0.45, 0.3], ivory: [0.91, 0.89, 0.85], ceramic: [0.92, 0.9, 0.86],
  flake: [0.08, 0.1, 0.14], film: [0.3, 0.3, 0.32], grille: [0.5, 0.5, 0.52], satin: [0.07, 0.07, 0.07], speckle: [0.09, 0.09, 0.1],
  leather: [0.12, 0.1, 0.09], enamel: [0.35, 0.08, 0.06], tape: [0.25, 0.15, 0.08], kapton: [0.8, 0.5, 0.15], led: [0.9, 0.1, 0.05],
  screen: [0.55, 0.6, 0.55], grooved: [0.69, 0.55, 0.34], 'tube-glass': [0.9, 0.92, 0.94],
  'key-red': [0.82, 0.24, 0.16], 'key-orange': [0.88, 0.48, 0.15], 'key-yellow': [0.9, 0.77, 0.23], 'key-white': [0.91, 0.89, 0.85],
};
const METALS = new Set(['brass', 'steel', 'chrome', 'aluminium', 'spun', 'foil', 'copper', 'iron', 'grille', 'grooved']);

const MODELS = {
  'iem': iem,
  'headphone-open': () => overEar('black'),
  'speaker-walnut': () => speaker(),
  'monitor-black': () => speaker({ cabinet: 'black', baffle: 'satin', cone: 'ceramic', dome: 'aluminium', w: 1.0, h: 1.6, d: 1.2 }),
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

function toPrimitive(doc, buffer, geometries, origin) {
  const merged = mergeGeometries(geometries.map((g) => {
    g.translate(-origin[0], -origin[1], -origin[2]);
    const ng = toCreasedNormals(g.index ? g.toNonIndexed() : g, 35 * D);
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
    if (!ng.attributes.normal) ng.computeVertexNormals();
    return ng;
  }));
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(merged.attributes.position.array)).setBuffer(buffer);
  const nor = doc.createAccessor().setType('VEC3').setArray(new Float32Array(merged.attributes.normal.array)).setBuffer(buffer);
  return doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nor);
}

function withoutGenerator(glb) {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  delete json.asset.generator;
  let text = JSON.stringify(json);
  text += ' '.repeat((4 - (Buffer.byteLength(text) % 4)) % 4);
  const chunk = Buffer.from(text);
  const rest = glb.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + chunk.length + rest.length, 8);
  header.writeUInt32LE(chunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, chunk, rest]);
}

async function build(name, make) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);
  const materials = new Map();
  const mat = (key) => {
    if (!materials.has(key)) {
      const base = key.split('~')[0];
      const [r, g, b] = COLORS[base] ?? [0.5, 0.5, 0.5];
      const metal = METALS.has(base);
      materials.set(key, doc.createMaterial(key).setBaseColorFactor([r, g, b, 1]).setMetallicFactor(metal ? 1 : 0).setRoughnessFactor(metal ? 0.35 : 0.6));
    }
    return materials.get(key);
  };
  let tris = 0;
  for (const p of make()) {
    const mesh = doc.createMesh(p.id);
    for (const [key, geos] of Object.entries(p.groups)) {
      if (!geos.length) continue;
      const prim = toPrimitive(doc, buffer, geos, p.origin);
      tris += prim.getAttribute('POSITION').getCount() / 3;
      mesh.addPrimitive(prim.setMaterial(mat(key)));
    }
    scene.addChild(doc.createNode(p.id).setMesh(mesh).setTranslation(p.origin).setExtras({ explode: p.explode }));
  }
  await MeshoptEncoder.ready;
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const glb = withoutGenerator(Buffer.from(await io.writeBinary(doc)));
  await writeFile(`${OUT}${name}.glb`, glb);
  return { tris: Math.round(tris), kb: Math.round(glb.length / 1024) };
}

await mkdir(OUT, { recursive: true });
const only = process.argv.slice(2);
for (const [name, make] of Object.entries(MODELS)) {
  if (only.length && !only.includes(name)) continue;
  const { tris, kb } = await build(name, make);
  console.log('ok', name, `${tris} tris`, `${kb} KB`);
}
