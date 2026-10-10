// Store: product grid, product pages, favourites + bag sheets, demo checkout.
// Sheets are native <dialog>s (focus trap, Esc and inert page for free), styled after shadcn's Sheet.
import { PRODUCTS, CATEGORIES, findProduct } from './catalog.js';
import {
  filterProducts, addToBag, setQty, bagLines, bagTotals, toggleFavorite, validateCheckout,
  money, FREE_SHIPPING_MIN, MAX_QTY,
} from './shop-logic.js';
import { $, $$, h, icon, toast, store } from './ui.js';
import { tuneFor } from './lab.js';

const ADDED_FEEDBACK_MS = 1400;
const CHECKOUT_DELAY_MS = 1100; // demo "processing" so the loading state is visible
const RELATED_COUNT = 4;
const STAGGER_CAP = 8;
const FEATURED_IDS = ['edifier-r1280t', 'sony-wh-1000xm5', 'airpods-pro-2', 'moondrop-blessing-3'];

const state = {
  bag: store.get('aura.bag', []),
  favorites: store.get('aura.favorites', []),
  filters: { category: 'all', query: '', sort: 'featured', favoritesOnly: false },
};

const fmtCount = (n) => n.toLocaleString('en-US');
const imgSrc = (p) => `/products/${p.id}.webp`;

function save() {
  store.set('aura.bag', state.bag);
  store.set('aura.favorites', state.favorites);
  renderCounts();
}

// ---------- shared pieces ----------

function media(p, { eager = false } = {}) {
  return h('img', {
    src: imgSrc(p), alt: `${p.brand} ${p.name}`, loading: eager ? 'eager' : 'lazy', decoding: 'async',
    width: '1200', height: '900', // every product image is reframed to 4:3 (see products/sources.json)
  });
}

function rating(p) {
  return h('p', { class: 'rating', 'aria-label': `Rated ${p.rating} out of 5 from ${fmtCount(p.reviews)} reviews` },
    icon('star'), h('span', {}, p.rating.toFixed(1)), h('small', {}, `(${fmtCount(p.reviews)})`));
}

function price(p) {
  return h('p', { class: 'price-row' },
    h('span', { class: 'price' }, money(p.price)),
    p.compareAt ? h('s', { class: 'compare', 'aria-label': `was ${money(p.compareAt)}` }, money(p.compareAt)) : null,
    p.compareAt ? h('span', { class: 'save' }, `Save ${money(p.compareAt - p.price)}`) : null);
}

const favLabel = (p, on) => `${on ? 'Remove' : 'Save'} ${p.brand} ${p.name} ${on ? 'from' : 'to'} favourites`;

function favButton(p, extraClass = '') {
  const on = state.favorites.includes(p.id);
  return h('button', {
    type: 'button', class: `fav-btn ${extraClass}`, 'data-fav': p.id, 'aria-pressed': String(on),
    'aria-label': favLabel(p, on), onclick: () => toggleFav(p),
  }, icon('heart'));
}

// Grid cards get a quiet button; the product page keeps the accent for its single primary action.
function addButton(p, qtyFn = () => 1, { primary = false, label = 'Add to bag' } = {}) {
  const btn = h('button', { type: 'button', class: `btn add-btn${primary ? ' primary' : ''}` }, icon('bag'), h('span', {}, label));
  btn.addEventListener('click', () => {
    addAndAnnounce(p, qtyFn());
    btn.classList.add('added');
    btn.replaceChildren(icon('check'), h('span', {}, 'Added'));
    setTimeout(() => {
      btn.classList.remove('added');
      btn.replaceChildren(icon('bag'), h('span', {}, label));
    }, ADDED_FEEDBACK_MS);
  });
  return btn;
}

function addAndAnnounce(p, qty = 1) {
  state.bag = addToBag(state.bag, p.id, qty);
  save();
  bumpBag();
  toast(`${p.name} added to your bag.`);
}

function toggleFav(p) {
  state.favorites = toggleFavorite(state.favorites, p.id);
  save();
  const on = state.favorites.includes(p.id);
  for (const b of $$(`[data-fav="${p.id}"]`)) {
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', favLabel(p, on));
  }
  if (state.filters.favoritesOnly) renderGrid();
  if ($('#fav-sheet').open) renderFavorites();
}

function card(p, index) {
  const href = `#/product/${p.id}`;
  const el = h('article', { class: 'product-card vng-spot' },
    h('span', { class: 'vng-beam', 'aria-hidden': 'true' }),
    h('a', { class: `product-media fit-${p.fit}`, href, tabindex: '-1', 'aria-hidden': 'true' }, media(p)),
    p.badge ? h('span', { class: 'badge' }, p.badge) : null,
    favButton(p),
    h('div', { class: 'product-info' },
      h('p', { class: 'product-brand' }, p.brand),
      h('h3', { class: 'product-name' }, h('a', { href }, p.name)),
      rating(p),
      price(p),
      addButton(p)),
    h('button', { type: 'button', class: 'qv-btn', 'aria-label': `Quick view: ${p.brand} ${p.name}`, onclick: () => quickView(p) },
      icon('search'), h('span', {}, 'Quick view')));
  el.style.setProperty('--i', String(Math.min(index, STAGGER_CAP)));
  return el;
}

// Quick view: the essentials and full spec sheet without leaving the grid.
function quickView(p) {
  const href = `#/product/${p.id}`;
  $('#qv-body').replaceChildren(
    h('div', { class: `qv-media fit-${p.fit}` }, media(p, { eager: true }), p.badge ? h('span', { class: 'badge' }, p.badge) : null),
    h('div', { class: 'qv-info' },
      h('p', { class: 'product-brand' }, `${p.brand} · ${CATEGORIES.find((c) => c.id === p.category).label}`),
      h('h2', { id: 'qv-title' }, p.name),
      rating(p),
      price(p),
      h('p', { class: 'qv-blurb' }, p.blurb),
      h('ul', { class: 'highlights' }, p.highlights.map((x) => h('li', {}, icon('check'), x))),
      h('h3', { class: 'qv-spec-title' }, 'Spec sheet'),
      h('dl', { class: 'spec-list' }, Object.entries(p.specs).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('div', { class: 'buy-row' },
        addButton(p, () => 1, { primary: true }),
        favButton(p, 'large'),
        h('a', { class: 'btn', href, onclick: closeSheets }, 'Full details'))));
  $('#quick-view').showModal();
}

// ---------- store grid ----------

function renderGrid() {
  const list = filterProducts(PRODUCTS, { ...state.filters, favorites: state.favorites });
  $('#store-count').textContent = `${list.length} ${list.length === 1 ? 'product' : 'products'}`;
  $('#store-grid').replaceChildren(...(list.length
    ? list.map(card)
    : [h('div', { class: 'store-empty' },
      h('h3', {}, state.filters.favoritesOnly ? 'No favourites here yet' : 'Nothing matches that search'),
      h('p', {}, state.filters.favoritesOnly ? 'Tap the heart on any product to save it.' : 'Try a brand like "Sony" or a type like "speakers".'),
      h('button', { type: 'button', class: 'btn', onclick: resetFilters }, 'Show everything'))]));
}

function resetFilters() {
  state.filters = { category: 'all', query: '', sort: 'featured', favoritesOnly: false };
  $('#store-search').value = '';
  $('#store-sort').value = 'featured';
  $('#store-favs-only').checked = false;
  syncChips();
  renderGrid();
}

function syncChips() {
  for (const chip of $$('[data-category]')) chip.setAttribute('aria-pressed', String(chip.dataset.category === state.filters.category));
}

function initFilters() {
  $('#store-chips').replaceChildren(...CATEGORIES.map((c) =>
    h('button', {
      type: 'button', class: 'filter-chip', 'data-category': c.id, 'aria-pressed': 'false',
      onclick: () => { state.filters = { ...state.filters, category: c.id }; syncChips(); renderGrid(); },
    }, c.label)));
  syncChips();
  let debounce;
  $('#store-search').addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.filters = { ...state.filters, query: e.target.value }; renderGrid(); }, 120);
  });
  $('#store-sort').addEventListener('change', (e) => { state.filters = { ...state.filters, sort: e.target.value }; renderGrid(); });
  $('#store-favs-only').addEventListener('change', (e) => { state.filters = { ...state.filters, favoritesOnly: e.target.checked }; renderGrid(); });
}

// ---------- product page ----------

// Renders #view-product and returns the page title.
export function showProduct(id) {
  const p = findProduct(id);
  const view = $('#view-product');
  if (!p) {
    view.replaceChildren(h('div', { class: 'page-head' },
      h('h1', { tabindex: '-1' }, 'We could not find that product'),
      h('a', { class: 'btn primary', href: '#/store' }, 'Back to the store')));
    return 'Not found';
  }
  let qty = 1;
  const qtyOut = h('output', { 'aria-live': 'polite' }, '1');
  const step = (d) => { qty = Math.max(1, Math.min(MAX_QTY, qty + d)); qtyOut.textContent = String(qty); };
  const related = PRODUCTS.filter((x) => x.category === p.category && x.id !== p.id).slice(0, RELATED_COUNT);

  view.replaceChildren(
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
      h('a', { href: '#/store' }, 'Store'), h('span', { 'aria-hidden': 'true' }, '/'),
      h('span', {}, CATEGORIES.find((c) => c.id === p.category).label)),
    h('div', { class: 'product-page' },
      h('div', { class: `product-hero card fit-${p.fit}` }, media(p, { eager: true }), p.badge ? h('span', { class: 'badge' }, p.badge) : null),
      h('div', { class: 'product-detail' },
        h('p', { class: 'product-brand' }, p.brand),
        h('h1', { tabindex: '-1' }, p.name),
        rating(p),
        price(p),
        h('p', { class: 'lede' }, p.blurb),
        h('div', { class: 'buy-row' },
          h('div', { class: 'qty', role: 'group', 'aria-label': 'Quantity' },
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Decrease quantity', onclick: () => step(-1) }, icon('minus')),
            qtyOut,
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Increase quantity', onclick: () => step(1) }, icon('plus'))),
          addButton(p, () => qty, { primary: true }),
          favButton(p, 'large')),
        h('p', { class: 'ship-note' }, icon('truck'), `Free shipping over ${money(FREE_SHIPPING_MIN)} · 30-day returns`),
        p.autoeq ? h('a', {
          class: 'tune-link', href: '#/lab',
          onclick: () => requestAnimationFrame(() => tuneFor(p.autoeq)),
        }, icon('wave'), h('span', {}, h('strong', {}, 'Tune it in the Lab'), h('small', {}, 'Load the measured correction for this model'))) : null,
        h('ul', { class: 'highlights' }, p.highlights.map((x) => h('li', {}, icon('check'), x))),
        h('dl', { class: 'spec-list' }, Object.entries(p.specs).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])))),
    related.length ? h('section', { class: 'related' },
      h('h2', {}, 'You might also like'),
      h('div', { class: 'product-grid' }, related.map(card))) : null);
  return `${p.brand} ${p.name}`;
}

// ---------- favourites + bag sheets ----------

function closeSheets() {
  for (const d of $$('dialog.sheet[open], dialog.qv[open]')) d.close();
}

function lineItem(p, { qty, total } = {}) {
  const inBag = qty != null;
  return h('li', { class: 'line' },
    h('a', { class: `line-media fit-${p.fit}`, href: `#/product/${p.id}`, onclick: closeSheets, tabindex: '-1', 'aria-hidden': 'true' }, media(p)),
    h('div', { class: 'line-info' },
      h('a', { class: 'line-name', href: `#/product/${p.id}`, onclick: closeSheets }, `${p.brand} ${p.name}`),
      inBag
        ? h('div', { class: 'qty small', role: 'group', 'aria-label': `Quantity of ${p.name}` },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Decrease quantity', onclick: () => updateQty(p.id, qty - 1) }, icon('minus')),
          h('output', {}, String(qty)),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Increase quantity', disabled: qty >= MAX_QTY, onclick: () => updateQty(p.id, qty + 1) }, icon('plus')))
        : h('span', { class: 'price' }, money(p.price))),
    h('div', { class: 'line-end' },
      inBag ? h('span', { class: 'price' }, money(total))
        : h('button', { type: 'button', class: 'btn small', onclick: () => addAndAnnounce(p) }, 'Add to bag'),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Remove ${p.name}`,
        onclick: () => (inBag ? updateQty(p.id, 0) : toggleFav(p)),
      }, icon('x'))));
}

function updateQty(id, qty) {
  state.bag = setQty(state.bag, id, qty);
  save();
  renderBag();
}

function emptyState(title, text) {
  return h('div', { class: 'sheet-empty' },
    h('h3', {}, title), h('p', {}, text),
    h('a', { class: 'btn primary', href: '#/store', onclick: closeSheets }, 'Browse the store'));
}

function renderFavorites() {
  const items = state.favorites.map(findProduct).filter(Boolean);
  $('#fav-title').textContent = `Favourites (${items.length})`;
  $('#fav-body').replaceChildren(items.length
    ? h('ul', { class: 'lines' }, items.map((p) => lineItem(p)))
    : emptyState('No favourites yet', 'Tap the heart on anything you like and it will wait for you here.'));
}

function renderBag() {
  const lines = bagLines(state.bag, PRODUCTS);
  const totals = bagTotals(lines);
  $('#bag-title').textContent = `Your bag (${totals.count})`;
  if (!lines.length) {
    $('#bag-body').replaceChildren(emptyState('Your bag is empty', 'Speakers, headphones and IEMs are a click away.'));
    $('#bag-foot').replaceChildren();
    return;
  }
  const progress = Math.min(1, totals.subtotal / FREE_SHIPPING_MIN);
  const fill = h('i');
  fill.style.setProperty('--p', String(progress));
  $('#bag-body').replaceChildren(
    h('div', { class: 'ship-progress' },
      h('p', {}, totals.toFreeShipping > 0
        ? `You are ${money(totals.toFreeShipping)} away from free shipping.`
        : 'Free shipping unlocked.'),
      h('div', {
        class: 'bar', role: 'progressbar', 'aria-label': 'Progress to free shipping',
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(progress * 100)),
      }, fill)),
    h('ul', { class: 'lines' }, lines.map(({ product, qty, total }) => lineItem(product, { qty, total }))));
  $('#bag-foot').replaceChildren(totalsList(totals),
    h('button', { type: 'button', class: 'btn primary block', onclick: renderCheckout }, 'Checkout', icon('arrow')));
}

function totalsList(t) {
  return h('dl', { class: 'totals' },
    h('dt', {}, 'Subtotal'), h('dd', {}, money(t.subtotal)),
    h('dt', {}, 'Shipping'), h('dd', {}, t.shipping ? money(t.shipping) : 'Free'),
    h('dt', { class: 'grand' }, 'Total'), h('dd', { class: 'grand' }, money(t.total)));
}

const FIELDS = [
  { name: 'name', label: 'Full name', autocomplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email' },
  { name: 'address', label: 'Street address', autocomplete: 'street-address' },
  { name: 'city', label: 'City', autocomplete: 'address-level2', half: true },
  { name: 'postal', label: 'Postal code', autocomplete: 'postal-code', half: true },
];

function renderCheckout() {
  const totals = bagTotals(bagLines(state.bag, PRODUCTS));
  const form = h('form', { id: 'checkout-form', class: 'checkout', novalidate: true },
    h('button', { type: 'button', class: 'text-link back', onclick: renderBag }, 'Back to bag'),
    h('h3', {}, 'Shipping details'),
    h('div', { class: 'fields' }, FIELDS.map((f) => h('div', { class: `field${f.half ? ' half' : ''}` },
      h('label', { for: `co-${f.name}` }, f.label),
      h('input', {
        id: `co-${f.name}`, name: f.name, type: f.type ?? 'text', autocomplete: f.autocomplete,
        inputmode: f.inputmode, required: true, 'aria-describedby': `co-${f.name}-err`,
      }),
      h('p', { class: 'field-error', id: `co-${f.name}-err` })))),
    h('p', { class: 'demo-note' }, icon('lock'), 'Demo store: no payment is taken and nothing is sent anywhere.'));
  form.addEventListener('submit', (e) => { e.preventDefault(); placeOrder(form); });
  $('#bag-title').textContent = 'Checkout';
  $('#bag-body').replaceChildren(form);
  $('#bag-foot').replaceChildren(totalsList(totals),
    h('button', { type: 'submit', form: 'checkout-form', class: 'btn primary block', id: 'place-order' }, `Place order · ${money(totals.total)}`));
  $('#co-name').focus();
}

async function placeOrder(form) {
  const values = Object.fromEntries(new FormData(form));
  const errors = validateCheckout(values);
  for (const f of FIELDS) {
    $(`#co-${f.name}`).setAttribute('aria-invalid', String(Boolean(errors[f.name])));
    $(`#co-${f.name}-err`).textContent = errors[f.name] ?? '';
  }
  const firstBad = FIELDS.find((f) => errors[f.name]);
  if (firstBad) return $(`#co-${firstBad.name}`).focus();

  const button = $('#place-order');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Placing order…');
  await new Promise((r) => setTimeout(r, CHECKOUT_DELAY_MS));

  const orderNo = `AU-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const first = values.name.trim().split(/\s+/)[0];
  state.bag = [];
  save();
  $('#bag-title').textContent = 'Order placed';
  $('#bag-body').replaceChildren(h('div', { class: 'sheet-empty success' },
    h('span', { class: 'success-mark' }, icon('check')),
    h('h3', {}, `Thank you, ${first}.`),
    h('p', {}, `Order ${orderNo} is confirmed. In a real store a receipt would go to ${values.email.trim()}.`),
    h('a', { class: 'btn primary', href: '#/store', onclick: closeSheets }, 'Keep browsing')));
  $('#bag-foot').replaceChildren();
}

// ---------- header counts ----------

function renderCounts() {
  const count = bagTotals(bagLines(state.bag, PRODUCTS)).count;
  const bagBadge = $('#bag-count');
  bagBadge.textContent = String(count);
  bagBadge.hidden = count === 0;
  $('#bag-open').setAttribute('aria-label', `Bag, ${count} ${count === 1 ? 'item' : 'items'}`);
  const favBadge = $('#fav-count');
  favBadge.textContent = String(state.favorites.length);
  favBadge.hidden = state.favorites.length === 0;
  $('#fav-open').setAttribute('aria-label', `Favourites, ${state.favorites.length} saved`);
}

function bumpBag() {
  const badge = $('#bag-count');
  badge.classList.remove('bump');
  void badge.offsetWidth; // restart the keyframe
  badge.classList.add('bump');
}

// ---------- wiring ----------

export function initStore() {
  initFilters();
  renderGrid();
  renderCounts();
  $('#home-featured').replaceChildren(...FEATURED_IDS.map(findProduct).map(card));
  $('#bag-open').addEventListener('click', () => { renderBag(); $('#bag-sheet').showModal(); });
  $('#fav-open').addEventListener('click', () => { renderFavorites(); $('#fav-sheet').showModal(); });
  for (const dialog of $$('dialog.sheet, dialog.qv')) {
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return dialog.close();
      const r = dialog.getBoundingClientRect(); // clicks on ::backdrop land on the dialog itself
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (e.target === dialog && outside) dialog.close();
    });
  }
  // Another tab changed the bag or favourites: stay in sync.
  addEventListener('storage', (e) => {
    if (e.key !== 'aura.bag' && e.key !== 'aura.favorites') return;
    state.bag = store.get('aura.bag', []);
    state.favorites = store.get('aura.favorites', []);
    renderCounts();
  });
}
