// Theme picker: five palettes, a circular reveal from the swatch you pick, remembered per browser.
import { $, h, store } from './ui.js';

export const THEMES = [
  { id: 'dark', name: 'Obsidian', note: 'Dark' },
  { id: 'light', name: 'Ivory', note: 'Light' },
  { id: 'burgundy', name: 'Bordeaux', note: 'Burgundy' },
  { id: 'earth', name: 'Terra', note: 'Earth tone' },
  { id: 'soft', name: 'Mist', note: 'Soft' },
];
const REVEAL_MS = 650;
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';

const current = () => document.documentElement.dataset.theme;

function apply(id) {
  document.documentElement.dataset.theme = id;
  store.set('aura.theme', id);
  dispatchEvent(new CustomEvent('themechange', { detail: id }));
}

function setTheme(id, origin) {
  if (id === current()) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduced) return apply(id);
  const transition = document.startViewTransition(() => apply(id));
  transition.ready.then(() => {
    const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
      { duration: REVEAL_MS, easing: EASE_IN_OUT, pseudoElement: '::view-transition-new(root)' },
    );
  });
}

export function initThemePicker() {
  const trigger = $('#theme-trigger');
  const panel = $('#theme-panel');
  const options = THEMES.map((t) =>
    h('button', {
      type: 'button', role: 'menuitemradio', class: 'theme-option', 'data-theme-option': t.id,
      onclick: (e) => {
        const r = e.currentTarget.querySelector('.swatch').getBoundingClientRect();
        close();
        setTheme(t.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      },
    },
    h('span', { class: `swatch swatch-${t.id}`, 'aria-hidden': 'true' }),
    h('span', { class: 'theme-name' }, t.name),
    h('small', {}, t.note)));
  panel.replaceChildren(...options);

  const sync = () => {
    for (const o of options) o.setAttribute('aria-checked', String(o.dataset.themeOption === current()));
    $('#theme-trigger .swatch').className = `swatch swatch-${current()}`;
  };
  function open() {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    (options.find((o) => o.getAttribute('aria-checked') === 'true') ?? options[0]).focus();
  }
  function close() {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }
  trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.addEventListener('keydown', (e) => {
    const i = options.indexOf(document.activeElement);
    if (e.key === 'Escape') { close(); trigger.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); options.at((i + 1) % options.length).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); options.at(i - 1).focus(); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !e.target.closest('.theme-picker')) close();
  });
  addEventListener('themechange', sync);
  sync();
}
