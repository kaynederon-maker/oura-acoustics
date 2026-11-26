// Intro loader: a brass needle travels a single groove while fonts and the hero object load.
// Once per browser session, at most ~2.4 s, skippable (button, Esc, click), and skipped
// entirely under reduced motion.
import { play } from './sound.js';

const KEY = 'aura.introSeen';
const MIN_MS = 900;
const MAX_MS = 2400;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

function seen() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

export function runIntro(ready) {
  const el = document.getElementById('intro');
  if (!el || seen() || REDUCED || location.hash.replace(/^#\/?/, '') !== '') return Promise.resolve();
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // private mode: the intro may show again, which is harmless
  }
  el.hidden = false;
  const count = document.getElementById('intro-count');
  const start = performance.now();
  let progress = 0;
  let finished = false;
  let loaded = false;
  ready.finally(() => { loaded = true; });

  return new Promise((resolve) => {
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(); };
    function finish() {
      if (finished) return;
      finished = true;
      el.style.setProperty('--p', '1');
      count.textContent = '100';
      play('needle');
      el.classList.add('done');
      removeEventListener('keydown', onKey);
      setTimeout(() => { el.hidden = true; }, 950);
      resolve();
    }
    addEventListener('keydown', onKey);
    el.addEventListener('click', finish);
    document.getElementById('intro-skip').focus({ preventScroll: true });

    (function tick() {
      if (finished) return;
      const t = performance.now() - start;
      const target = loaded ? 1 : Math.min(0.9, t / MAX_MS);
      progress += (target - progress) * 0.08;
      el.style.setProperty('--p', progress.toFixed(3));
      count.textContent = String(Math.round(progress * 100)).padStart(3, '0');
      if ((loaded && t > MIN_MS && progress > 0.98) || t > MAX_MS) {
        finish();
        return;
      }
      requestAnimationFrame(tick);
    })();
  });
}
