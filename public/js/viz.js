// Real-time visualizers: a scrolling log-frequency spectrogram and an oscilloscope,
// both reading the shared visual analyser and coloured from the active theme.
import * as engine from './audio-engine.js';

const SCROLL_PX = 2;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rgb = (hex) => hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16));

// 256-step colour ramp: background -> plot-1 -> accent -> near white.
function ramp() {
  const stops = [rgb(css('--bg')), rgb(css('--plot-1')), rgb(css('--accent')), [255, 248, 236]];
  return Array.from({ length: 256 }, (_, i) => {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t));
    const f = t - k;
    return stops[k].map((c, j) => Math.round(c + (stops[k + 1][j] - c) * f));
  });
}

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
  return { w, h };
}

export function startVisualizers({ spectrogram, scope, isVisible }) {
  let colors = ramp();
  addEventListener('themechange', () => { colors = ramp(); });
  const sg = spectrogram.getContext('2d');
  const sc = scope.getContext('2d');
  let freqData = null;
  let waveData = null;

  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden || !isVisible()) return;
    const live = engine.state.source !== 'none';
    const analyser = live ? engine.visualAnalyser() : null;

    // Spectrogram: shift left, paint the newest column on the right (log frequency, low at bottom).
    const { w, h } = fit(spectrogram);
    if (!w || !h) return;
    sg.drawImage(spectrogram, -SCROLL_PX, 0);
    const column = sg.createImageData(SCROLL_PX, h);
    if (analyser) {
      freqData ??= new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);
    }
    const nyquist = analyser ? analyser.context.sampleRate / 2 : 24000;
    for (let y = 0; y < h; y++) {
      const f = 20 * 1000 ** (1 - y / h);
      const v = analyser ? freqData[Math.min(freqData.length - 1, Math.round((f / nyquist) * freqData.length))] : 0;
      const [r, g, b] = colors[v];
      for (let x = 0; x < SCROLL_PX; x++) column.data.set([r, g, b, 255], (y * SCROLL_PX + x) * 4);
    }
    sg.putImageData(column, w - SCROLL_PX, 0);

    // Oscilloscope.
    const s = fit(scope);
    sc.clearRect(0, 0, s.w, s.h);
    sc.strokeStyle = css('--plot-2');
    sc.lineWidth = Math.max(1.5, s.h / 90);
    sc.beginPath();
    if (analyser) {
      waveData ??= new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(waveData);
      for (let i = 0; i < waveData.length; i += 2) {
        const x = (i / waveData.length) * s.w;
        const y = s.h / 2 - waveData[i] * s.h * 0.45;
        if (i) sc.lineTo(x, y); else sc.moveTo(x, y);
      }
    } else {
      sc.moveTo(0, s.h / 2);
      sc.lineTo(s.w, s.h / 2);
    }
    sc.stroke();
  }
  requestAnimationFrame(frame);
}
