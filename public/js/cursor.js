const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FOLLOW = 0.22;
const LABELS = { drag: 'Drag', view: 'View', play: 'Play' };

export function initCursor() {
  const root = document.querySelector('.cursor');
  if (!root || !FINE || REDUCED) return;
  const ring = root.querySelector('.cursor-ring');
  let x = -100;
  let y = -100;
  let tx = x;
  let ty = y;
  let state = '';

  const setState = (next) => {
    if (next === state) return;
    state = next;
    if (next) root.dataset.state = next;
    else delete root.dataset.state;
    ring.textContent = LABELS[next] ?? '';
  };

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return setState('');
    tx = e.clientX;
    ty = e.clientY;
    const target = e.target.closest?.('[data-cursor], a, button, [role="slider"], summary, select, label');
    setState(target ? target.closest('[data-cursor]')?.dataset.cursor ?? 'hover' : '');
  }, { passive: true });
  addEventListener('pointerdown', () => { if (state === 'drag') setState('pressing'); }, { passive: true });
  addEventListener('pointerup', (e) => {
    if (state !== 'pressing') return;
    setState(e.target.closest?.('[data-cursor]')?.dataset.cursor ?? '');
  }, { passive: true });
  document.addEventListener('pointerleave', () => setState(''));

  (function frame() {
    requestAnimationFrame(frame);
    x += (tx - x) * FOLLOW;
    y += (ty - y) * FOLLOW;
    root.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  })();
}
