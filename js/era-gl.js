// WebGL backdrop for the History timeline: glowing sound-wave strands whose shape morphs
// between eras (scratchy acoustic horn, warm tape, stepped digital, shoegaze haze, brick-walled
// loudness, blackgaze tremolo, 808 sub pulses). uEra is fractional, so scrolling blends two eras.
import { peekLevels } from './audio-engine.js';

const VERTEX = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float; // the hash noise bands badly at mediump on phones
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime, uEra, uLevel;
uniform vec3 uBase, uC1, uC2, uC3;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }

// Wave height for era e at position x, strand k.
float shape(float e, float x, float t, float k) {
  float ph = k * 1.7;
  if (e < 0.5) return 0.18 * sin(x * 9.0 + t * 2.0 + ph) * (0.6 + 0.4 * noise(x * 40.0 + t * 20.0)) + 0.05 * (noise(x * 300.0 + t * 60.0) - 0.5);
  if (e < 1.5) return 0.22 * sin(x * 6.0 + t * 1.2 + ph) + 0.06 * sin(x * 18.0 - t + ph);
  if (e < 2.5) return 0.2 * sin(x * 7.0 + t + ph) * (0.8 + 0.2 * sin(x * 60.0 + t * 8.0));
  if (e < 3.5) return 0.26 * sin(x * 5.0 + t * 0.9 + ph + 1.5 * sin(x * 2.0 + t * 0.7 + k));
  if (e < 4.5) { float s = 0.24 * sin(x * 8.0 + t + ph); return floor(s * 14.0) / 14.0; }
  if (e < 5.5) return 0.3 * sin(x * 3.0 + t * 0.5 + ph) + 0.12 * noise(x * 4.0 + t * 0.4 + k);
  if (e < 6.5) return clamp(0.6 * sin(x * 9.0 + t * 2.0 + ph), -0.17, 0.17);
  if (e < 7.5) return 0.22 * sin(x * 4.0 + t * 0.6 + ph) + 0.05 * sin(x * 140.0 + t * 30.0 + k);
  if (e < 8.5) { float beat = fract(t * 0.7); return 0.35 * sin(x * 2.2 - t * 2.0 + ph) * exp(-beat * 3.0) + 0.02 * noise(x * 220.0 + t * 90.0); }
  return 0.2 * sin(x * 6.0 + t + ph) * (0.7 + 0.3 * sin(x * 1.3 + k));
}

// Glow width per era: shoegaze and blackgaze are smeared, digital is razor sharp.
float blur(float e) {
  if (e < 0.5) return 0.010;
  if (e < 3.5) return 0.007;
  if (e < 4.5) return 0.003;
  if (e < 5.5) return 0.035;
  if (e < 6.5) return 0.004;
  if (e < 7.5) return 0.022;
  if (e < 8.5) return 0.009;
  return 0.005;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float x = uv.x * uRes.x / uRes.y;
  float y = uv.y - 0.5;
  float e0 = floor(uEra);
  float f = smoothstep(0.0, 1.0, fract(uEra));
  float t = uTime;
  vec3 col = uBase;
  for (int i = 0; i < 6; i++) {
    float k = float(i);
    float h = mix(shape(e0, x, t, k), shape(e0 + 1.0, x, t, k), f) * (1.0 + uLevel * 1.5) * (1.0 - k * 0.12);
    float b = mix(blur(e0), blur(e0 + 1.0), f) * (1.0 + k * 0.35);
    float d = abs(y - h * 0.9 - (k - 2.5) * 0.015);
    col = mix(col, mix(uC1, uC2, k / 5.0), clamp((b / (d + b * 0.6)) * (0.2 - k * 0.022), 0.0, 1.0)); // mix, not add: reads on light themes too
  }
  col = mix(uBase, col, smoothstep(1.2, 0.3, length(uv - 0.5) * 1.5));
  col += uC3 * 0.05 * (hash(uv.x * 991.0 + uv.y * 113.0 + floor(t * 24.0)) - 0.5) * (1.0 - smoothstep(0.0, 1.0, uEra));
  gl_FragColor = vec4(col, 1.0);
}`;

const RESOLUTION = matchMedia('(pointer: coarse)').matches ? 0.5 : Math.min(devicePixelRatio, 1.5) * 0.75;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rgb = (hex) => (hex.replace('#', '').match(/../g) ?? ['0', '0', '0']).map((v) => parseInt(v, 16) / 255);

// Returns { setEra(e) }, or null without WebGL (the CSS gradient behind it stays).
export function createEraGL(canvas, isVisible) {
  const gl = canvas.getContext('webgl', { antialias: false, powerPreference: 'low-power' });
  if (!gl) return null;
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
  const u = Object.fromEntries(['uRes', 'uTime', 'uEra', 'uLevel', 'uBase', 'uC1', 'uC2', 'uC3']
    .map((n) => [n, gl.getUniformLocation(program, n)]));

  const setColors = () => {
    gl.uniform3fv(u.uBase, rgb(css('--bg')));
    gl.uniform3fv(u.uC1, rgb(css('--plot-1')));
    gl.uniform3fv(u.uC2, rgb(css('--accent')));
    gl.uniform3fv(u.uC3, rgb(css('--plot-2')));
  };
  setColors();
  addEventListener('themechange', setColors);

  let era = 0;
  let level = 0;
  const start = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !isVisible()) return;
    const w = Math.round(canvas.clientWidth * RESOLUTION);
    const h = Math.round(canvas.clientHeight * RESOLUTION);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      Object.assign(canvas, { width: w, height: h });
      gl.viewport(0, 0, w, h);
    }
    const { bass = 0, mid = 0 } = peekLevels();
    level += ((bass + mid) * 0.5 - level) * 0.15;
    gl.uniform2f(u.uRes, w, h);
    gl.uniform1f(u.uTime, (now - start) / 1000);
    gl.uniform1f(u.uEra, era);
    gl.uniform1f(u.uLevel, level);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
  return { setEra: (e) => { era = e; } };
}
