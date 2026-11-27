const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches;
const DRAG_SPEED = 0.008;
const FRICTION = 0.92;
const KEY_STEP = 0.18;
const EDGE_ANGLE = 28;

let lib = null;
export const loadThree = () => (lib ??= import('../vendor/three/three.js'));

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const PRESETS = {
  brass: { color: '#b8945c', metalness: 1, roughness: 0.3 },
  steel: { color: '#a9aeb3', metalness: 1, roughness: 0.36 },
  chrome: { color: '#eceef0', metalness: 1, roughness: 0.07 },
  aluminium: { color: '#c9ccd0', metalness: 1, roughness: 0.26 },
  foil: { color: '#dcdee0', metalness: 1, roughness: 0.16 },
  copper: { color: '#b9744e', metalness: 1, roughness: 0.3 },
  iron: { color: '#2a2a2a', metalness: 0.7, roughness: 0.55 },
  lacquer: { color: '#0e0d0d', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04 },
  resin: { color: '#2a2530', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06, transmission: 0.35, thickness: 0.6, ior: 1.5 },
  glass: { color: '#f3f6f8', roughness: 0.04, transmission: 1, thickness: 0.2, ior: 1.5, transparent: true },
  walnut: { color: '#5c3a22', roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3 },
  rubber: { color: '#131313', roughness: 0.9 },
  paper: { color: '#211f1c', roughness: 0.85 },
  silicone: { color: '#2b2b2e', roughness: 0.55, sheen: 0.4, sheenColor: '#666666' },
  plastic: { color: '#f1efea', roughness: 0.3, clearcoat: 0.6 },
  black: { color: '#151515', roughness: 0.45, clearcoat: 0.3 },
  felt: { color: '#2b2826', roughness: 1 },
  pcb: { color: '#18321f', roughness: 0.6 },
  velour: { color: '#1b1a1a', roughness: 1, sheen: 1, sheenColor: '#4a4a4a', sheenRoughness: 0.8 },
  vinyl: { color: '#0a0a0a', roughness: 0.22, clearcoat: 0.8 },
  label: { color: '#c8a465', roughness: 0.6 },
  tolex: { color: '#161616', roughness: 0.8 },
  cloth: { color: '#3b332b', roughness: 1, sheen: 0.6, sheenColor: '#6b5a48' },
  ivory: { color: '#ebe6dc', roughness: 0.45 },
  ceramic: { color: '#ece7dd', roughness: 0.32, clearcoat: 0.4 },
  'key-red': { color: '#d23c2a', roughness: 0.4, clearcoat: 0.5 },
  'key-orange': { color: '#e07b26', roughness: 0.4, clearcoat: 0.5 },
  'key-yellow': { color: '#e5c43a', roughness: 0.4, clearcoat: 0.5 },
  'key-white': { color: '#e8e4da', roughness: 0.4, clearcoat: 0.5 },
};

const modelCache = new Map();
async function fetchModel(T, name) {
  if (!modelCache.has(name)) {
    const loader = new T.GLTFLoader().setMeshoptDecoder(T.MeshoptDecoder);
    modelCache.set(name, loader.loadAsync(`models/${name}.glb`).then((g) => g.scene));
  }
  return (await modelCache.get(name)).clone(true);
}

export async function createStage(container, {
  look = 'lux', model, label = '', interactive = true, autoTurn = 0, tilt = 0.18, distance = 1, onHover = null, onReady = null,
} = {}) {
  const T = await loadThree();
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.5 : 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.className = 'stage-canvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 1, 0.1, 100);
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;
  const key = new T.DirectionalLight('#fff4e0', 1.4);
  key.position.set(3, 5, 4);
  const rim = new T.DirectionalLight('#dfe8ff', 0.8);
  rim.position.set(-4, 2, -3);
  scene.add(key, rim);

  const pivot = new T.Group();
  scene.add(pivot);

  const state = {
    yaw: -0.5, pitch: tilt, vyaw: 0, vpitch: 0, scrollYaw: 0, explode: 0, explodeShown: 0,
    hovered: null, highlighted: null, dirty: true, visible: false, dragging: false, alive: true,
  };
  let parts = new Map();
  let fitRadius = 1;
  let host = null;

  const lines = { line: new T.LineBasicMaterial({ color: css('--text-lo') }), lineHi: new T.LineBasicMaterial({ color: css('--accent') }) };
  const fillColor = () => new T.Color(css('--bg')).lerp(new T.Color(css('--text-hi')), 0.035);
  const fillMat = new T.MeshBasicMaterial({ color: fillColor(), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const fillHiColor = () => new T.Color(css('--bg')).lerp(new T.Color(css('--accent')), 0.22);
  const fillHi = new T.MeshBasicMaterial({ color: fillHiColor(), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const hull = { value: 0.0035 };
  const outline = (color) => {
    const m = new T.MeshBasicMaterial({ color, side: T.BackSide });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uHull = hull;
      shader.vertexShader = `uniform float uHull;\n${shader.vertexShader}`.replace('#include <project_vertex>',
        '#include <project_vertex>\nmvPosition.xyz += normalize(normalMatrix * normal) * uHull * -mvPosition.z;\ngl_Position = projectionMatrix * mvPosition;');
    };
    return m;
  };
  const hullMat = outline(css('--text-lo'));
  const hullHi = outline(css('--accent'));

  function dress(root) {
    const meshes = [];
    root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      const name = o.material?.name ?? '';
      if (look === 'line') {
        o.material = fillMat;
        const edges = new T.LineSegments(new T.EdgesGeometry(o.geometry, EDGE_ANGLE), lines.line);
        const shell = new T.Mesh(o.geometry, hullMat);
        edges.raycast = () => {};
        shell.raycast = () => {};
        o.add(edges, shell);
        o.userData.edges = edges;
        o.userData.hull = shell;
      } else {
        o.material = new T.MeshPhysicalMaterial({ ...(PRESETS[name] ?? { color: '#888888', roughness: 0.5 }) });
      }
    }
  }

  async function setModel(name) {
    const root = await fetchModel(T, name);
    if (!state.alive) return;
    pivot.clear();
    dress(root);
    parts = new Map();
    for (const node of root.children) {
      parts.set(node.name, { node, home: node.position.clone(), explode: new T.Vector3(...(node.userData.explode ?? [0, 0, 0])) });
    }
    const bounds = new T.Box3().setFromObject(root);
    const center = bounds.getCenter(new T.Vector3());
    for (const p of parts.values()) {
      p.home.sub(center);
      p.node.position.copy(p.home);
    }
    fitRadius = bounds.getBoundingSphere(new T.Sphere()).radius;
    pivot.add(root);
    state.explodeShown = -1;
    applyExplode(state.explode);
    resize();
    paintHighlight();
  }

  function applyExplode(t) {
    if (Math.abs(t - state.explodeShown) < 1e-4) return;
    state.explodeShown = t;
    for (const p of parts.values()) p.node.position.copy(p.home).addScaledVector(p.explode, t);
    state.dirty = true;
  }

  function paintHighlight() {
    const id = state.hovered ?? state.highlighted;
    for (const [pid, p] of parts) {
      const on = pid === id;
      p.node.traverse((o) => {
        if (!o.isMesh || o.material === hullMat || o.material === hullHi) return;
        if (look === 'line') {
          o.material = on ? fillHi : fillMat;
          if (o.userData.edges) o.userData.edges.material = on ? lines.lineHi : lines.line;
          if (o.userData.hull) o.userData.hull.material = on ? hullHi : hullMat;
        } else if (o.material.emissive) {
          o.material.emissive.set(on ? css('--accent') : '#000000');
          o.material.emissiveIntensity = on ? 0.18 : 0;
        }
      });
    }
    state.dirty = true;
  }

  function resize() {
    if (!host) return;
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    const fov = (camera.fov * Math.PI) / 180;
    const fitH = fitRadius / Math.sin(fov / 2);
    const fitW = fitH / Math.min(1, camera.aspect);
    camera.position.set(0, 0, Math.max(fitH, fitW) * distance * (1 + state.explode * 0.35));
    camera.near = camera.position.z / 50;
    camera.far = camera.position.z * 4;
    camera.updateProjectionMatrix();
    state.dirty = true;
  }
  const ro = new ResizeObserver(resize);
  const io = new IntersectionObserver(([e]) => { state.visible = e.isIntersecting; state.dirty = true; });

  function attach(el) {
    if (host) { ro.unobserve(host); io.unobserve(host); }
    host = el;
    host.append(canvas);
    ro.observe(host);
    io.observe(host);
    resize();
  }

  const raycaster = new T.Raycaster();
  const ndc = new T.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    let o = raycaster.intersectObject(pivot, true)[0]?.object;
    while (o && !parts.has(o.name)) o = o.parent;
    return o?.name ?? null;
  }

  if (interactive) {
    let lastX = 0;
    let lastY = 0;
    let moved = 0;
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', (e) => {
      state.dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (state.dragging) {
        moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
        state.vyaw = (e.clientX - lastX) * DRAG_SPEED;
        state.vpitch = (e.clientY - lastY) * DRAG_SPEED * 0.5;
        state.yaw += state.vyaw;
        state.pitch = Math.max(-0.6, Math.min(0.9, state.pitch + state.vpitch));
        lastX = e.clientX;
        lastY = e.clientY;
        state.dirty = true;
        return;
      }
      if (!onHover || e.pointerType !== 'mouse') return;
      const id = pick(e);
      if (id !== state.hovered) {
        state.hovered = id;
        paintHighlight();
        onHover(id);
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      state.dragging = false;
      if (onHover && moved < 6) onHover(pick(e), { tap: true });
    });
    canvas.addEventListener('pointercancel', () => { state.dragging = false; });
    canvas.addEventListener('pointerleave', () => {
      if (state.hovered && onHover) { state.hovered = null; paintHighlight(); onHover(null); }
    });
  }

  function turn(dx, dy = 0) {
    state.yaw += dx * KEY_STEP;
    state.pitch = Math.max(-0.6, Math.min(0.9, state.pitch + dy * KEY_STEP));
    state.dirty = true;
  }

  function frame() {
    if (!state.alive) return;
    requestAnimationFrame(frame);
    if (!state.visible || document.hidden) return;
    if (!state.dragging && (Math.abs(state.vyaw) > 1e-4 || Math.abs(state.vpitch) > 1e-4)) {
      state.yaw += state.vyaw;
      state.pitch = Math.max(-0.6, Math.min(0.9, state.pitch + state.vpitch));
      state.vyaw *= FRICTION;
      state.vpitch *= FRICTION;
      state.dirty = true;
    }
    if (autoTurn && !REDUCED && !state.dragging) {
      state.yaw += autoTurn;
      state.dirty = true;
    }
    applyExplode(state.explode);
    if (!state.dirty) return;
    state.dirty = false;
    pivot.rotation.set(state.pitch, state.yaw + state.scrollYaw, 0);
    renderer.render(scene, camera);
  }

  const onTheme = () => {
    fillMat.color.copy(fillColor());
    hullMat.color.set(css('--text-lo'));
    hullHi.color.set(css('--accent'));
    fillHi.color.copy(fillHiColor());
    lines.line.color.set(css('--text-lo'));
    lines.lineHi.color.set(css('--accent'));
    paintHighlight();
  };
  addEventListener('themechange', onTheme);

  attach(container);
  if (label) canvas.setAttribute('aria-label', label);
  if (model) await setModel(model);
  requestAnimationFrame(frame);
  onReady?.();

  return {
    canvas,
    scene,
    redraw() { state.dirty = true; },
    attach,
    setModel,
    turn,
    parts: () => [...parts.keys()],
    setExplode(t) {
      state.explode = t;
      resize();
    },
    setScrollYaw(v) {
      state.scrollYaw = v;
      state.dirty = true;
    },
    highlight(id) {
      state.highlighted = id;
      paintHighlight();
    },
    project(id) {
      const p = parts.get(id);
      if (!p) return null;
      pivot.updateMatrixWorld(true);
      const v = new T.Box3().setFromObject(p.node).getCenter(new T.Vector3()).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height };
    },
    dispose() {
      state.alive = false;
      ro.disconnect();
      io.disconnect();
      removeEventListener('themechange', onTheme);
      renderer.dispose();
      canvas.remove();
    },
  };
}
