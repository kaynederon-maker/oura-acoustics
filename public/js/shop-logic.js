// Pure store logic (no DOM): filtering, sorting, bag and favourites. Unit-tested.

export const FREE_SHIPPING_MIN = 199;
export const SHIPPING_FEE = 9.99;
export const MAX_QTY = 10;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (n) => usd.format(n);
const round2 = (n) => Math.round(n * 100) / 100;

const SORTS = {
  featured: (a, b) => a.rank - b.rank,
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
};

export function filterProducts(products, { category = 'all', query = '', favoritesOnly = false, favorites = [], sort = 'featured' } = {}) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return products
    .map((p, rank) => ({ ...p, rank }))
    .filter((p) => category === 'all' || p.category === category)
    .filter((p) => !favoritesOnly || favorites.includes(p.id))
    .filter((p) => terms.every((t) => `${p.brand} ${p.name} ${p.category}`.toLowerCase().includes(t)))
    .sort(SORTS[sort] ?? SORTS.featured);
}

// bag: [{ id, qty }] — every helper returns a new array.
export function addToBag(bag, id, qty = 1) {
  const line = bag.find((l) => l.id === id);
  if (!line) return [...bag, { id, qty: Math.min(qty, MAX_QTY) }];
  return bag.map((l) => (l.id === id ? { ...l, qty: Math.min(l.qty + qty, MAX_QTY) } : l));
}

export function setQty(bag, id, qty) {
  if (qty <= 0) return bag.filter((l) => l.id !== id);
  return bag.map((l) => (l.id === id ? { ...l, qty: Math.min(qty, MAX_QTY) } : l));
}

export const removeFromBag = (bag, id) => bag.filter((l) => l.id !== id);

export function bagLines(bag, products) {
  return bag
    .map(({ id, qty }) => ({ product: products.find((p) => p.id === id), qty }))
    .filter((l) => l.product)
    .map((l) => ({ ...l, total: round2(l.product.price * l.qty) }));
}

export function bagTotals(lines) {
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const shipping = count === 0 || subtotal >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE;
  return {
    count,
    subtotal,
    shipping,
    total: round2(subtotal + shipping),
    toFreeShipping: round2(Math.max(0, FREE_SHIPPING_MIN - subtotal)),
  };
}

export const toggleFavorite = (favorites, id) =>
  favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Returns { field: message } for every invalid field; empty object means valid.
export function validateCheckout({ name = '', email = '', address = '', city = '', postal = '' }) {
  const errors = {};
  if (name.trim().length < 2) errors.name = 'Enter your full name.';
  if (!EMAIL.test(email.trim())) errors.email = 'Enter an email like name@example.com.';
  if (address.trim().length < 5) errors.address = 'Enter your street address.';
  if (!city.trim()) errors.city = 'Enter your city.';
  if (!/^[A-Za-z0-9 -]{3,10}$/.test(postal.trim())) errors.postal = 'Enter a valid postal code.';
  return errors;
}
