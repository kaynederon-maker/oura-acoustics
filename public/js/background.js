// Full-screen "silk aurora" fragment shader driven by eased audio band levels.
import { levels } from './audio-engine.js';

const VERTEX = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAGMENT = `precision mediump float;
uniform vec2 uRes;
uniform float uTime, uBass, uMid, uHigh, uIntensity;
uniform vec3 uBase, uC1, uC2, uC3;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime;
  float warp = fbm(p * 2.0 + t * 0.04);
  float silk = fbm(p * 1.6 + vec2(t * 0.05, -t * 0.03) + warp * (1.2 + uBass * 1.6));
  float folds = sin((p.y + silk * 0.9) * 6.0 + t * 0.2) * 0.5 + 0.5;
  vec3 c = mix(uC1, uC2, smoothstep(0.25, 0.75, silk + uMid * 0.15));
  c = mix(c, uC3, uHigh * 0.7 * folds);
  float glow = smoothstep(0.15, 1.0, folds * silk) * (0.55 + uBass * 1.4);
  float vignette = smoothstep(1.25, 0.2, length(uv - 0.5) * 1.4);
  // Mix (not add) so the silk reads on light themes as well as dark ones.
  gl_FragColor = vec4(mix(uBase, c, clamp(glow * vignette * uIntensity, 0.0, 1.0)), 1.0);
}`;

const MOBILE = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const FRAME_MS = MOBILE ? 1000 / 30 : 0;
const RESOLUTION = MOBILE ? 0.5 : Math.min(devicePixelRatio, 1.5) * 0.6; // soft shader, low res is invisible
const AUDIO_GAIN = 0.9; // how much audio can push the look; 0 = static aurora

let intensity = 0.35;
export const setIntensity = (v) => (intensity = v);

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

export function startBackground(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, powerPreference: 'low-power' });
  if (!gl) {
    document.body.classList.add('no-webgl'); // CSS gradient fallback
    return;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(
    ['uRes', 'uTime', 'uBass', 'uMid', 'uHigh', 'uIntensity', 'uBase', 'uC1', 'uC2', 'uC3']
      .map((n) => [n, gl.getUniformLocation(program, n)]),
  );

  // Palette comes from the active theme's CSS tokens.
  const applyPalette = () => {
    const style = getComputedStyle(document.documentElement);
    const rgb = (name) => {
      const hex = style.getPropertyValue(name).trim().replace('#', '');
      return hex.match(/../g).map((x) => parseInt(x, 16) / 255);
    };
    gl.uniform3fv(u.uBase, rgb('--bg'));
    gl.uniform3fv(u.uC1, rgb('--aura-1'));
    gl.uniform3fv(u.uC2, rgb('--aura-2'));
    gl.uniform3fv(u.uC3, rgb('--aura-3'));
  };
  addEventListener('themechange', applyPalette);
  applyPalette();

  const resize = () => {
    canvas.width = Math.round(innerWidth * RESOLUTION);
    canvas.height = Math.round(innerHeight * RESOLUTION);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  addEventListener('resize', resize);
  resize();

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let flow = 0, last = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - last < FRAME_MS) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const { bass, mid, high } = levels();
    if (!reduced.matches) flow += dt * (0.3 + mid * 0.8 * AUDIO_GAIN); // music speeds the silk a little
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, flow);
    gl.uniform1f(u.uBass, Math.min(bass * 1.6, 1) * 0.5 * AUDIO_GAIN);
    gl.uniform1f(u.uMid, mid * AUDIO_GAIN);
    gl.uniform1f(u.uHigh, Math.min(high * 3, 1) * AUDIO_GAIN);
    gl.uniform1f(u.uIntensity, intensity + bass * 0.25 * AUDIO_GAIN);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
}
