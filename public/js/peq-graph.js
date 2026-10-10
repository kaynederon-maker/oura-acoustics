// Interactive PEQ graph (D3): drag nodes for frequency/gain, scroll for Q, double-click to add,
// keyboard for everything. The curve is computed with the same biquad maths the audio engine runs.
//
// model = {
//   bands(): Band[]            selected(): id|null          select(id)
//   change(id, changes, { live })   commit()   add(bandLike)   remove(id)
//   layers(freqs): { curve: dB[], series: [{ cls, freqs, values }], phase?: deg[] }
//   readout?(freq): string[]
// }
import { responseDb, logFreqs } from './eq.js';
import { expandBands, GAIN_TYPES, TYPES } from './peq.js';
import { showTip, hideTip } from './freq-hover.js';
import { fmtHz, fmtDb, haptic } from './ui.js';

const d3 = globalThis.d3;
const FREQS = logFreqs(240);
const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const SNAP_FREQS = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]; // ISO third-octave centres
const MARGIN = { top: 14, right: 46, bottom: 28, left: 46 };
const SNAP_PX = 6;
const GAIN_STEP = 0.5;
const ZERO_SNAP_DB = 0.4;
const Q_STEP = 1.12;
const KEY_OCTAVE = 1 / 24;
const COMMIT_AFTER_WHEEL_MS = 350;
const TOUCH_TIP_MS = 2500;
const BAND_COLORS = ['--plot-1', '--plot-2', '--accent', '--aura-1', '--aura-3', '--aura-2'];

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const tick = (f) => (f >= 1000 ? `${f / 1000}k` : String(f));
const typeShort = { PK: 'P', LSC: 'LS', HSC: 'HS', HPF: 'HP', LPF: 'LP', NOTCH: 'N', AP: 'AP' };
const describe = (b, i) => `Band ${i + 1}, ${TYPES[b.type]}, ${fmtHz(b.fc)}${GAIN_TYPES.has(b.type) ? `, ${fmtDb(b.gain)}` : ''}, Q ${b.q}`;

export function createPeqGraph(host, model, { yDomain = [-20, 20], phase = () => false, compact = false } = {}) {
  const svg = d3.select(host).append('svg').attr('class', 'peq-svg').attr('role', 'group')
    .attr('aria-label', 'Parametric EQ graph. Drag a band to change its frequency and gain, scroll on it for Q, double-click empty space to add a band.');
  const plot = svg.append('g');
  const hit = plot.append('rect').attr('class', 'peq-hit');
  const grid = plot.append('g').attr('class', 'peq-grid');
  const layers = plot.append('g').attr('class', 'peq-layers');
  const bandFill = plot.append('path').attr('class', 'peq-band-fill');
  const phasePath = plot.append('path').attr('class', 'peq-phase');
  const curve = plot.append('path').attr('class', 'peq-curve');
  const cross = plot.append('line').attr('class', 'peq-cross').attr('visibility', 'hidden');
  const nodesG = plot.append('g').attr('class', 'peq-nodes');
  let x;
  let y;
  let yPhase;
  let inner = { w: 0, h: 0 };
  let dragging = false;
  let wheelTimer;

  function layout() {
    const r = host.getBoundingClientRect();
    const width = Math.max(240, r.width);
    const height = Math.max(compact ? 180 : 240, r.height);
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    inner = { w: width - MARGIN.left - MARGIN.right, h: height - MARGIN.top - MARGIN.bottom };
    plot.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    x = d3.scaleLog([20, 20000], [0, inner.w]).clamp(true);
    y = d3.scaleLinear(yDomain, [inner.h, 0]).clamp(true);
    yPhase = d3.scaleLinear([-180, 180], [inner.h, 0]);
    hit.attr('width', inner.w).attr('height', inner.h);
    drawGrid();
  }

  function drawGrid() {
    grid.selectAll('*').remove();
    const dbTicks = d3.range(Math.ceil(yDomain[0] / 6) * 6, yDomain[1] + 1, 6);
    grid.selectAll('.v').data(GRID_FREQS).join('line').attr('class', 'v')
      .attr('x1', (f) => x(f)).attr('x2', (f) => x(f)).attr('y1', 0).attr('y2', inner.h);
    grid.selectAll('.h').data(dbTicks).join('line').attr('class', (d) => (d === 0 ? 'h zero' : 'h'))
      .attr('x1', 0).attr('x2', inner.w).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    grid.selectAll('.fx').data(GRID_FREQS).join('text').attr('class', 'fx')
      .attr('x', (f) => x(f)).attr('y', inner.h + 18).text(tick);
    grid.selectAll('.dy').data(dbTicks).join('text').attr('class', 'dy')
      .attr('x', -8).attr('y', (d) => y(d) + 4).text((d) => (d > 0 ? `+${d}` : d));
    if (phase()) {
      grid.selectAll('.py').data([-180, -90, 0, 90, 180]).join('text').attr('class', 'py')
        .attr('x', inner.w + 8).attr('y', (d) => yPhase(d) + 4).text((d) => `${d}°`);
    }
  }

  const line = (ys, scale = y, freqs = FREQS) => d3.line().x((d) => x(d[0])).y((d) => scale(d[1]))(freqs.map((f, i) => [f, ys[i]]));
  const colorOf = (i) => css(BAND_COLORS[i % BAND_COLORS.length]);

  function render() {
    if (!x) layout();
    const bands = model.bands();
    const data = model.layers(FREQS);
    layers.selectAll('path').data(data.series, (d) => d.cls).join('path')
      .attr('class', (d) => `peq-series ${d.cls}`)
      .attr('d', (d) => line(d.values, y, d.freqs));
    curve.attr('d', line(data.curve));
    phasePath.attr('d', phase() && data.phase ? line(data.phase, yPhase) : null);

    const sel = bands.find((b) => b.id === model.selected());
    if (sel && sel.enabled) {
      const r = responseDb(expandBands([sel]), 0, FREQS);
      bandFill.attr('d', d3.area().x((d) => x(d[0])).y0(y(0)).y1((d) => y(d[1]))(FREQS.map((f, i) => [f, r[i]])))
        .attr('fill', colorOf(bands.indexOf(sel)));
    } else {
      bandFill.attr('d', null);
    }

    nodesG.selectAll('g.peq-node').data(bands, (b) => b.id).join((enter) => {
      const g = enter.append('g').attr('class', 'peq-node').attr('tabindex', 0).attr('role', 'slider');
      g.append('circle').attr('class', 'halo').attr('r', 18);
      g.append('circle').attr('class', 'dot').attr('r', compact ? 9 : 11);
      g.append('text').attr('class', 'lbl').attr('y', 4);
      g.call(dragBehaviour).on('wheel', onWheel).on('keydown', onKey).on('focus', (e, b) => model.select(b.id));
      return g;
    })
      .attr('transform', (b) => `translate(${x(b.fc)},${y(GAIN_TYPES.has(b.type) ? b.gain : 0)})`)
      .classed('selected', (b) => b.id === model.selected())
      .classed('disabled', (b) => !b.enabled)
      .attr('aria-label', (b, i) => describe(b, i))
      .attr('aria-valuenow', (b) => b.fc)
      .each(function eachNode(b, i) {
        const g = d3.select(this);
        g.select('.dot').attr('fill', colorOf(i));
        g.select('.lbl').text(compact ? typeShort[b.type] : i + 1);
      });
  }

  // ---------- interactions ----------

  let lastSnap = '';
  const dragBehaviour = d3.drag()
    .on('start', (event, b) => {
      dragging = true;
      hideTip();
      model.select(b.id);
      haptic(6);
      lastSnap = '';
    })
    .on('drag', (event, b) => {
      const snapF = SNAP_FREQS.find((f) => Math.abs(x(f) - event.x) < SNAP_PX);
      const changes = { fc: snapF ?? x.invert(event.x) };
      if (GAIN_TYPES.has(b.type)) {
        let gain = Math.round(y.invert(event.y) / GAIN_STEP) * GAIN_STEP;
        if (Math.abs(gain) < ZERO_SNAP_DB) gain = 0;
        changes.gain = gain;
      }
      const snapKey = `${snapF ?? ''}|${changes.gain === 0 ? 'zero' : ''}`;
      if (snapKey !== '|' && snapKey !== lastSnap) haptic(8); // physical tick on each new snap
      lastSnap = snapKey;
      model.change(b.id, changes, { live: true });
    })
    .on('end', () => {
      dragging = false;
      model.commit();
    });

  function onWheel(event, b) {
    event.preventDefault();
    model.change(b.id, { q: b.q * (event.deltaY < 0 ? Q_STEP : 1 / Q_STEP) }, { live: true });
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => model.commit(), COMMIT_AFTER_WHEEL_MS);
  }

  function onKey(event, b) {
    const big = event.shiftKey;
    const octave = big ? 1 / 3 : KEY_OCTAVE;
    const moves = {
      ArrowRight: { fc: b.fc * 2 ** octave },
      ArrowLeft: { fc: b.fc / 2 ** octave },
      ArrowUp: GAIN_TYPES.has(b.type) ? { gain: b.gain + (big ? 2 : GAIN_STEP) } : null,
      ArrowDown: GAIN_TYPES.has(b.type) ? { gain: b.gain - (big ? 2 : GAIN_STEP) } : null,
      PageUp: { q: b.q * Q_STEP },
      PageDown: { q: b.q / Q_STEP },
    };
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      model.remove(b.id);
      return;
    }
    const change = moves[event.key];
    if (!change) return;
    event.preventDefault();
    model.change(b.id, change, { live: false });
    requestAnimationFrame(() => nodesG.selectAll('g.peq-node').filter((d) => d.id === b.id).node()?.focus());
  }

  hit.on('dblclick', (event) => {
    const [px, py] = d3.pointer(event);
    const gain = Math.round(y.invert(py) / GAIN_STEP) * GAIN_STEP;
    model.add({ type: 'PK', fc: x.invert(px), gain: Math.abs(gain) < ZERO_SNAP_DB ? 0 : gain, q: 1.41 });
    haptic(12);
  });
  hit.on('pointermove', (event) => {
    if (dragging) return;
    const [px] = d3.pointer(event);
    const f = x.invert(px);
    cross.attr('x1', px).attr('x2', px).attr('y1', 0).attr('y2', inner.h).attr('visibility', 'visible');
    showTip(Math.round(f), { x: event.clientX, y: event.clientY }, model.readout?.(f) ?? []);
  });
  hit.on('pointerleave', (event) => {
    cross.attr('visibility', 'hidden');
    hideTip(event.pointerType === 'touch' ? TOUCH_TIP_MS : 0);
  });
  hit.on('pointerdown', () => model.select(null));

  const observer = new ResizeObserver(() => {
    if (!host.isConnected || host.getBoundingClientRect().width === 0) return;
    layout();
    render();
  });
  observer.observe(host);

  return {
    render,
    relayout() { layout(); render(); },
    destroy() { observer.disconnect(); svg.remove(); },
  };
}
