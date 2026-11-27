import { createStage } from './stage3d.js';
import { peekLevels } from './audio-engine.js';
import { motionReady, reducedMotion } from './motion.js';
import { photo } from './img.js';
import { $, h } from './ui.js';

const SPECS = [
  { part: 'faceplate', name: 'Faceplate', detail: 'Lacquer · brass inlay' },
  { part: 'shell', name: 'Shell', detail: 'Smoked resin' },
  { part: 'driver', name: 'Driver', detail: '10 mm dynamic' },
  { part: 'armatures', name: 'Armatures', detail: '2 × balanced' },
  { part: 'nozzle', name: 'Nozzle', detail: 'Stainless steel' },
  { part: 'tip', name: 'Tip', detail: 'Silicone, 3 sizes' },
];
const ROOM = ['m-listen1', 'm-kef', 'm-tube', 'm-crowd', 'm-pads', 'm-neve', 'm-listen2', 'm-speakers', 'm-studio'];

let stage = null;

function placeSpecs() {
  if (!stage) return;
  const box = $('#hero-object').getBoundingClientRect();
  const host = $('.hero').getBoundingClientRect();
  for (const el of document.querySelectorAll('.hero-spec')) {
    const p = stage.project(el.dataset.part);
    if (!p) continue;
    el.style.transform = `translate(${(box.left - host.left + p.x).toFixed(1)}px, ${(box.top - host.top + p.y).toFixed(1)}px)`;
  }
}

function initHeroScroll() {
  const { gsap, ScrollTrigger } = globalThis;
  const ease = gsap.parseEase('power2.inOut');
  const specs = [...document.querySelectorAll('.hero-spec')];
  ScrollTrigger.create({
    trigger: '.hero-pin', start: 'top top', end: 'bottom bottom', scrub: 1,
    onUpdate: (self) => {
      if ($('#view-home').hidden) return;
      const p = self.progress;
      const explode = ease(Math.min(1, Math.max(0, (p - 0.15) / 0.55)));
      stage?.setExplode(explode * 0.85);
      stage?.setScrollYaw(p * Math.PI * 0.9);
      $('.hero').style.setProperty('--p', p.toFixed(3));
      specs.forEach((el, i) => el.classList.toggle('on', explode > 0.35 + i * 0.08));
      placeSpecs();
    },
  });
  gsap.fromTo('.hero-word', { yPercent: 0 }, { yPercent: -18, ease: 'none', scrollTrigger: { trigger: '.hero-pin', start: 'top top', end: 'bottom top', scrub: true } });
}

function ringLoop() {
  requestAnimationFrame(ringLoop);
  if ($('#view-home').hidden || document.hidden) return;
  const { bass = 0 } = peekLevels();
  $('.hero-ring').style.setProperty('--level', Math.min(1, bass * 1.6).toFixed(3));
}

async function initStage() {
  const host = $('#hero-object');
  stage = await createStage(host, { look: 'lux', model: 'iem', distance: 1.55, autoTurn: reducedMotion ? 0 : 0.0018, tilt: 0.25 });
  host.classList.add('ready');
  if (reducedMotion || !motionReady) {
    stage.setExplode(0.55);
    for (const el of document.querySelectorAll('.hero-spec')) el.classList.add('on');
    requestAnimationFrame(placeSpecs);
  }
  host.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    const tilt = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!step && !tilt) return;
    e.preventDefault();
    stage.turn(step ?? 0, tilt ?? 0);
  });
  addEventListener('resize', placeSpecs, { passive: true });
}

export function initHome() {
  $('.hero-specs').replaceChildren(...SPECS.map((s, i) => h('div', { class: `hero-spec${i % 2 ? ' flip' : ''}`, 'data-part': s.part },
    h('span', { class: 'hero-spec-dot' }),
    h('span', { class: 'hero-spec-line' }),
    h('span', { class: 'hero-spec-text' }, h('b', {}, `${String(i + 1).padStart(2, '0')} · ${s.name}`), h('span', {}, s.detail)))));
  $('#room-strip').replaceChildren(...ROOM.map((id, i) => photo(id, { className: `room-ph r${i % 3}`, sizes: '(max-width: 760px) 80vw, 34vw' })));
  $('#teaser-history-media').replaceChildren(photo('h1991-mbv', { className: 'teaser-photo', sizes: '(max-width: 860px) 100vw, 55vw' }));
  $('#teaser-guide-media').replaceChildren(photo('h2016-808', { className: 'teaser-photo', sizes: '(max-width: 860px) 100vw, 55vw' }));
  if (motionReady && !reducedMotion) {
    initHeroScroll();
    globalThis.gsap.to('.room-strip', {
      xPercent: -12, ease: 'none',
      scrollTrigger: { trigger: '.room', start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }
  requestAnimationFrame(ringLoop);
  return initStage().catch((err) => {
    console.error('[hero 3d]', err);
    $('#hero-object').classList.add('no-3d');
  });
}
