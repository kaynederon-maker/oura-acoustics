import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogDigest, systemPrompt, parseBudget, localMatches, cleanReply, MAX_PICKS } from '../public/js/assistant-logic.js';
import { parseJson } from '../public/js/ai.js';
import { PRODUCTS } from '../public/js/catalog.js';

test('the catalog digest lists every product with its id and price', () => {
  const lines = catalogDigest().split('\n');
  assert.equal(lines.length, PRODUCTS.length);
  for (const [i, p] of PRODUCTS.entries()) {
    assert.ok(lines[i].startsWith(`${p.id} | `));
    assert.ok(lines[i].includes(`$${p.price}`));
  }
});

test('the system prompt names the product the customer is viewing', () => {
  const p = PRODUCTS[0];
  assert.ok(systemPrompt(p.id).includes(`looking at ${p.id}`));
  assert.ok(!systemPrompt().includes('looking at'));
});

test('budgets are read from everyday phrasing', () => {
  assert.equal(parseBudget('best IEM under $300'), 300);
  assert.equal(parseBudget('headphones below 1,200 dollars'), 1200);
  assert.equal(parseBudget('budget of 1.5k'), 1500);
  assert.equal(parseBudget('what is the best speaker'), null);
});

test('offline matches respect category and budget', () => {
  const picks = localMatches('a good IEM under $300');
  assert.ok(picks.length > 0 && picks.length <= MAX_PICKS);
  for (const p of picks) {
    assert.equal(p.category, 'iems');
    assert.ok(p.price <= 300);
  }
  assert.deepEqual(localMatches('zzzz qqqq'), []);
});

test('model replies keep only real product ids, deduplicated and capped', () => {
  const ids = PRODUCTS.slice(0, 6).map((p) => p.id);
  const out = cleanReply({ answer: '  Try these.  ', products: [ids[0], 'made-up', ids[0], ...ids.slice(1)] });
  assert.equal(out.answer, 'Try these.');
  assert.deepEqual(out.products.map((p) => p.id), ids.slice(0, MAX_PICKS));
  assert.deepEqual(cleanReply(null), { answer: '', products: [] });
});

test('JSON answers are recovered from fenced or chatty model output', () => {
  assert.deepEqual(parseJson('```json\n{"answer":"hi","products":[]}\n```'), { answer: 'hi', products: [] });
  assert.deepEqual(parseJson('Sure! {"a":1} hope that helps'), { a: 1 });
  assert.throws(() => parseJson('no json here'));
});
