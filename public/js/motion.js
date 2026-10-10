// Motion layer: Lenis smooth scrolling driven by the GSAP ticker, plus declarative scroll effects.
//   [data-split]        heading whose lines rise out of a mask (SplitText)
//   [data-clip]         image/card that opens from an inset clip-path
//   [data-speed="0.2"]  parallax drift (fraction of its own height)
//   [data-velocity]     skews with scroll velocity (kinetic type, marquees)
// Effects are built the first time each view is shown (hidden views have no layout to measure).
const { gsap, ScrollTrigger, SplitText, Lenis } = globalThis;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_SKEW_DEG = 6;

let lenis = null;
const built = new WeakSet();

export const motionReady = Boolean(gsap && ScrollTrigger);
export const reducedMotion = REDUCED;

export function initMotion() {
  if (!motionReady) return;
  gsap.registerPlugin(ScrollTrigger, ...(SplitText ? [SplitText] : []));
  document.documentElement.classList.add('gsap');
  if (REDUCED || !Lenis) return;
  lenis = new Lenis({
    lerp: 0.085,
    wheelMultiplier: 0.95,
    // Let nested scrollers, dialogs and the EQ graphs (wheel = Q) handle their own wheel.
    prevent: (node) => Boolean(node.closest?.('dialog, [data-lenis-prevent], .theme-panel, .peq-graph')),
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  initVelocitySkew();
}

// Jump to the top on navigation, without easing through the old page.
export function scrollTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else scrollTo(0, 0);
}

export function scrollToY(y) {
  if (lenis) lenis.scrollTo(y, { duration: 1.4 });
  else scrollTo({ top: y, behavior: REDUCED ? 'auto' : 'smooth' });
}

// Called after a view becomes visible.
export function showView(view) {
  if (!motionReady) return;
  if (!built.has(view)) {
    built.add(view);
    if (!REDUCED) buildEffects(view);
  }
  requestAnimationFrame(() => ScrollTrigger.refresh());
}

function buildEffects(root) {
  for (const el of root.querySelectorAll('[data-split]')) splitReveal(el);
  for (const el of root.querySelectorAll('[data-clip]')) {
    gsap.fromTo(el, { clipPath: 'inset(14% 9% 14% 9% round 36px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 28px)', ease: 'none',
      scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 40%', scrub: 0.6 },
    });
  }
  for (const el of root.querySelectorAll('[data-speed]')) {
    const speed = Number(el.dataset.speed) || 0.15;
    gsap.fromTo(el, { yPercent: -speed * 100 }, {
      yPercent: speed * 100, ease: 'none',
      scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }
}

function splitReveal(el) {
  if (!SplitText) return;
  SplitText.create(el, {
    type: 'lines', mask: 'lines', linesClass: 'split-line', autoSplit: true,
    onSplit: (self) => gsap.from(self.lines, {
      yPercent: 115, rotate: 2.5, duration: 1.2, ease: 'expo.out', stagger: 0.09,
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    }),
  });
}

// Kinetic type: anything marked [data-velocity] leans into the scroll and springs back.
function initVelocitySkew() {
  const setters = new Map();
  const setter = (el) => {
    if (!setters.has(el)) setters.set(el, gsap.quickTo(el, 'skewY', { duration: 0.7, ease: 'power3.out' }));
    return setters.get(el);
  };
  let leaning = false;
  lenis.on('scroll', ({ velocity }) => {
    leaning = true;
    const skew = gsap.utils.clamp(-MAX_SKEW_DEG, MAX_SKEW_DEG, velocity * -0.22);
    for (const el of document.querySelectorAll('.view:not([hidden]) [data-velocity]')) setter(el)(skew);
  });
  // Settle back to upright once scrolling stops.
  gsap.ticker.add(() => {
    if (lenis.isScrolling || !leaning) return;
    leaning = false;
    for (const set of setters.values()) set(0);
  });
}
