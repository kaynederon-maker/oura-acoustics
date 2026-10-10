// Entry: hash router (one page, so captured audio survives navigation), audio dock, background.
import * as engine from './audio-engine.js';
import { startBackground, setIntensity } from './background.js';
import { initLab, redrawLab } from './lab.js';
import { initGuide } from './guide.js';
import { initJourney } from './journey.js';
import { initHistory } from './history.js';
import { initMissions } from './missions.js';
import { initMotion, showView, scrollTop } from './motion.js';
import { attachElementHover } from './freq-hover.js';
import { initThemePicker } from './theme.js';
import { initStore, showProduct } from './store.js';
import { $, $$, toast } from './ui.js';

const VIEWS = { '': 'home', store: 'store', lab: 'lab', guide: 'guide', history: 'history' };
const ALL_VIEWS = [...Object.values(VIEWS), 'product'];
const TITLES = { home: 'Oura Acoustics', store: 'Store', lab: 'Tuning Lab', guide: 'Tuning Guide', history: 'History of Sound' };
const AURA_INTENSITY = { home: 0.62, store: 0.3, product: 0.3, lab: 0.34, guide: 0.26, history: 0.2 }; // calmer where people read or shop

function route() {
  const path = location.hash.replace(/^#\/?/, '');
  const productId = path.startsWith('product/') ? decodeURIComponent(path.slice('product/'.length)) : null;
  const view = productId ? 'product' : VIEWS[path] ?? 'home';
  const title = productId ? showProduct(productId) : TITLES[view];
  for (const name of ALL_VIEWS) $(`#view-${name}`).hidden = name !== view;
  const navTarget = view === 'product' ? 'store' : view;
  for (const link of $$('[data-nav]')) {
    if (link.dataset.nav === navTarget) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = view === 'home' ? title : `${title} · Oura Acoustics`;
  setIntensity(AURA_INTENSITY[view]);
  scrollTop();
  $(`#view-${view} h1`).focus({ preventScroll: true });
  if (view === 'lab') requestAnimationFrame(redrawLab);
  showView($(`#view-${view}`));
}

const STARTERS = { system: engine.captureSystem, mic: engine.captureMic, pink: engine.playPink };
const NOTES = {
  none: 'Pick a source. The background and analyzer react to it.',
  system: 'Listening to your computer. Analysis only; nothing is recorded or uploaded.',
  mic: 'Listening through the microphone. Analysis only; nothing is recorded.',
  file: 'Playing through your EQ.',
  pink: 'Pink noise through your EQ: good for hearing the tonal balance.',
  band: 'Playing one frequency band (EQ bypassed).',
  guide: 'Practice track for the guide. Flip A/B to hear the change.',
  sweep: 'Sine sweep from 20 Hz to 20 kHz.',
};

async function startSource(kind) {
  if (engine.state.source === kind) return engine.stopSource();
  if (kind === 'file') return $('#file-input').click();
  try {
    await STARTERS[kind]();
  } catch (err) {
    const declined = err.name === 'NotAllowedError' || err.name === 'AbortError';
    toast(declined ? 'Permission was declined, so nothing is being captured.' : err.message, 'error');
  }
}

function renderDock(state) {
  $('#dock-label').textContent = state.label;
  $('#dock-note').textContent = NOTES[state.source];
  $('#dock').dataset.live = String(state.source !== 'none');
  for (const btn of $$('[data-source]')) btn.setAttribute('aria-pressed', String(btn.dataset.source === state.source));
  $('#eq-toggle').checked = state.eqOn;
}

function meterLoop() {
  requestAnimationFrame(meterLoop);
  const { bass, mid, high } = engine.peekLevels();
  const dock = $('#dock');
  dock.style.setProperty('--bass', Math.min(1, bass * 1.4).toFixed(3));
  dock.style.setProperty('--mid', Math.min(1, mid * 1.8).toFixed(3));
  dock.style.setProperty('--high', Math.min(1, high * 3).toFixed(3));
}

function initDock() {
  if (!engine.canCaptureSystem()) $('[data-source="system"]').hidden = true; // phones: mic instead
  for (const btn of $$('[data-source]')) btn.addEventListener('click', () => startSource(btn.dataset.source));
  $('#file-input').addEventListener('change', async (e) => {
    const [file] = e.target.files;
    e.target.value = '';
    if (!file) return;
    try {
      await engine.playFile(file);
    } catch (err) {
      toast(`Could not play that file: ${err.message}`, 'error');
    }
  });
  $('#dock-stop').addEventListener('click', engine.stopSource);
  $('#eq-toggle').addEventListener('change', (e) => engine.setEqOn(e.target.checked));
  engine.onChange(renderDock);
  renderDock(engine.state);
  requestAnimationFrame(meterLoop);
}

// Vengeance cursor spotlight: one delegated listener feeds --mx/--my to whichever card is hovered.
addEventListener('pointermove', (e) => {
  const card = e.target.closest?.('.vng-spot');
  if (!card || e.pointerType !== 'mouse') return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

// Content eases in once as it first scrolls into view (CSS owns the motion).
function initReveals() {
  const items = $$('.reveal');
  if (!('IntersectionObserver' in window)) return items.forEach((el) => el.classList.add('in'));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach((el) => observer.observe(el));
}

try {
  startBackground($('#aura'));
} catch (err) {
  console.error('[background]', err);
  document.body.classList.add('no-webgl');
}
initMotion();
initDock();
initLab();
initGuide();
initMissions();
initJourney();
initHistory();
attachElementHover(document);
initThemePicker();
initStore();
initReveals();
addEventListener('hashchange', route);
route();
