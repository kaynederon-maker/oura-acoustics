import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  filterProducts, addToBag, setQty, removeFromBag, bagLines, bagTotals, toggleFavorite, validateCheckout,
  FREE_SHIPPING_MIN, SHIPPING_FEE, MAX_QTY,
} from '../public/js/shop-logic.js';
import { PRODUCTS, CATEGORIES } from '../public/js/catalog.js';

const P = [
  { id: 'a', brand: 'Edifier', name: 'R1280T', category: 'speakers', price: 129.99, rating: 4.7, reviews: 10 },
  { id: 'b', brand: 'Sony', name: 'WH-1000XM5', category: 'headphones', price: 399.99, rating: 4.7, reviews: 99 },
  { id: 'c', brand: 'Apple', name: 'AirPods 4', category: 'earbuds', price: 129, rating: 4.5, reviews: 5 },
];

test('every catalogue product has a unique id, valid category and an image on disk', () => {
  const ids = new Set(PRODUCTS.map((p) => p.id));
  assert.equal(ids.size, PRODUCTS.length);
  const categories = new Set(CATEGORIES.map((c) => c.id));
  for (const p of PRODUCTS) {
    assert.ok(categories.has(p.category), `${p.id} category`);
    assert.ok(p.price > 0, `${p.id} price`);
    assert.ok(!p.compareAt || p.compareAt > p.price, `${p.id} compareAt must be higher than price`);
    assert.ok(existsSync(new URL(`../public/products/${p.id}.webp`, import.meta.url)), `${p.id} image`);
  }
});

test('filterProducts combines category, search, favourites and sort', () => {
  assert.deepEqual(filterProducts(P, { category: 'speakers' }).map((p) => p.id), ['a']);
  assert.deepEqual(filterProducts(P, { query: 'sony xm5' }).map((p) => p.id), ['b']);
  assert.deepEqual(filterProducts(P, { favoritesOnly: true, favorites: ['c'] }).map((p) => p.id), ['c']);
  assert.deepEqual(filterProducts(P, { sort: 'price-asc' }).map((p) => p.id), ['c', 'a', 'b']);
  assert.deepEqual(filterProducts(P, { sort: 'rating' }).map((p) => p.id), ['b', 'a', 'c']);
});

test('bag helpers are immutable and cap quantity', () => {
  const empty = [];
  const one = addToBag(empty, 'a');
  assert.deepEqual(empty, []);
  assert.deepEqual(addToBag(one, 'a', 2), [{ id: 'a', qty: 3 }]);
  assert.equal(addToBag(one, 'a', 50)[0].qty, MAX_QTY);
  assert.deepEqual(setQty(one, 'a', 0), []);
  assert.deepEqual(removeFromBag([{ id: 'a', qty: 1 }, { id: 'b', qty: 1 }], 'a'), [{ id: 'b', qty: 1 }]);
});

test('totals add shipping below the free-shipping line only', () => {
  const small = bagTotals(bagLines([{ id: 'c', qty: 1 }], P));
  assert.equal(small.shipping, SHIPPING_FEE);
  assert.equal(small.total, 129 + SHIPPING_FEE);
  assert.equal(small.toFreeShipping, FREE_SHIPPING_MIN - 129);
  const big = bagTotals(bagLines([{ id: 'a', qty: 2 }], P));
  assert.equal(big.subtotal, 259.98);
  assert.equal(big.shipping, 0);
  assert.equal(bagTotals([]).shipping, 0);
  assert.equal(bagLines([{ id: 'gone', qty: 1 }], P).length, 0);
});

test('favourites toggle and checkout validation', () => {
  assert.deepEqual(toggleFavorite(['a'], 'a'), []);
  assert.deepEqual(toggleFavorite([], 'a'), ['a']);
  assert.deepEqual(Object.keys(validateCheckout({})).sort(), ['address', 'city', 'email', 'name', 'postal']);
  assert.deepEqual(validateCheckout({ name: 'Rin Okafor', email: 'rin@example.com', address: '12 Harbour St', city: 'Manila', postal: '1000' }), {});
});
