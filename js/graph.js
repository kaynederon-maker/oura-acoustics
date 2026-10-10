// Log-frequency line plots on a canvas (frequency response + live spectrum).

const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const PAD = { left: 52, right: 10, top: 10, bottom: 22 };
export const GRAPH_PAD = PAD;
const fmtHz = (f) => (f >= 1000 ? `${f / 1000}k` : `${f}`);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function setup(canvas) {
  const dpr = devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

// series: [{ freqs, values, color, width?, dash? }]
export function plot(canvas, series, { yMin = -15, yMax = 15, yStep = 5, unit = 'dB' } = {}) {
  const { g, w, h } = setup(canvas);
  const x = (f) => PAD.left + (Math.log10(f / 20) / 3) * (w - PAD.left - PAD.right);
  const y = (v) => PAD.top + ((yMax - v) / (yMax - yMin)) * (h - PAD.top - PAD.bottom);

  g.font = '11px Inter, system-ui, sans-serif';
  g.fillStyle = css('--text-lo');
  g.strokeStyle = css('--grid');
  g.lineWidth = 1;
  g.textAlign = 'center';
  for (const f of GRID_FREQS) {
    g.beginPath(); g.moveTo(x(f), PAD.top); g.lineTo(x(f), h - PAD.bottom); g.stroke();
    g.fillText(fmtHz(f), x(f), h - 6);
  }
  g.textAlign = 'right';
  for (let v = yMin; v <= yMax; v += yStep) {
    g.beginPath(); g.moveTo(PAD.left, y(v)); g.lineTo(w - PAD.right, y(v)); g.stroke();
    g.fillText(`${v > 0 ? '+' : ''}${v}${v === yMax ? ` ${unit}` : ''}`, PAD.left - 6, y(v) + 4);
  }

  g.save();
  g.beginPath(); g.rect(PAD.left, PAD.top, w - PAD.left - PAD.right, h - PAD.top - PAD.bottom); g.clip();
  for (const s of series) {
    g.strokeStyle = s.color;
    g.lineWidth = s.width ?? 2;
    g.setLineDash(s.dash ?? []);
    g.beginPath();
    s.freqs.forEach((f, i) => (i ? g.lineTo(x(f), y(s.values[i])) : g.moveTo(x(f), y(s.values[i]))));
    g.stroke();
  }
  g.restore();
}

// Live spectrum from an AnalyserNode, drawn as a filled log-frequency curve.
export function drawSpectrum(canvas, analyser, data, sampleRate) {
  analyser.getFloatFrequencyData(data);
  const { g, w, h } = setup(canvas);
  const binHz = sampleRate / 2 / data.length;
  const x = (f) => (Math.log10(f / 20) / 3) * w;
  const y = (db) => h - ((Math.max(-100, Math.min(-10, db)) + 100) / 90) * h;
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, css('--plot-1'));
  grad.addColorStop(0.5, css('--accent'));
  grad.addColorStop(1, css('--plot-2'));
  g.beginPath();
  g.moveTo(0, h);
  for (let px = 0; px <= w; px += 2) {
    const f = 20 * 10 ** ((px / w) * 3);
    g.lineTo(x(f), y(data[Math.min(data.length - 1, Math.round(f / binHz))]));
  }
  g.lineTo(w, h);
  g.closePath();
  g.globalAlpha = 0.35;
  g.fillStyle = grad;
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = grad;
  g.lineWidth = 1.5;
  g.stroke();
}
