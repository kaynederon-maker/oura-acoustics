import { PRODUCTS, CATEGORIES } from './catalog.js';

export const MAX_PICKS = 4;
const MAX_ANSWER = 1200;
const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));
const CATEGORY_WORDS = {
  iems: ['iem', 'in-ear', 'in ear'],
  earbuds: ['earbud', 'true wireless', 'tws'],
  headphones: ['headphone', 'over-ear', 'over ear', 'cans'],
  speakers: ['speaker', 'bookshelf', 'portable'],
  monitors: ['studio monitor', 'mixing', 'monitor speaker'],
  dacs: ['dac', 'amp', 'amplifier'],
  interfaces: ['interface', 'recording', 'podcast'],
  accessories: ['cable', 'accessor', 'stand', 'ear tip'],
};
const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'which', 'best', 'good', 'want', 'need', 'under', 'below', 'less', 'than', 'about', 'have', 'you', 'your', 'can', 'any', 'one', 'that', 'this', 'are', 'buy', 'get', 'should', 'recommend', 'something', 'budget']);

export function catalogDigest(products = PRODUCTS) {
  return products.map((p) => [
    p.id,
    `${p.brand} ${p.name}`,
    LABEL[p.category] ?? p.category,
    `$${p.price}${p.compareAt ? ` (was $${p.compareAt})` : ''}`,
    `${p.rating}/5`,
    Object.entries(p.specs ?? {}).map(([k, v]) => `${k}: ${v}`).join('; '),
    (p.highlights ?? []).join('; '),
  ].join(' | ')).join('\n');
}

export function systemPrompt(focusId = null) {
  const focus = BY_ID.get(focusId);
  return [
    'You are Oura, the shop assistant of Oura Acoustics, an online audio store.',
    'Answer questions about the products listed below, compare them, and recommend the best fit for the customer\'s needs and budget.',
    'Only recommend products from this list and quote its prices in US dollars. If we do not sell what they ask for, say so and suggest the closest product we do sell.',
    'Keep answers under 120 words, friendly and concrete, plain text without markdown. Ratings are demo data. You cannot place orders or see the customer\'s bag.',
    'Reply with JSON only: {"answer": string, "products": [up to 4 product ids from the list, most relevant first]}.',
    focus ? `The customer is looking at ${focus.id} (${focus.brand} ${focus.name}).` : '',
    'Products (id | name | category | price | rating | specs | highlights):',
    catalogDigest(),
  ].filter(Boolean).join('\n');
}

export function parseBudget(text) {
  const m = /(?:under|below|less than|max(?:imum)?|up to|budget(?: of| is)?|<)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i.exec(String(text));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function localMatches(question, products = PRODUCTS) {
  const q = String(question).toLowerCase();
  const budget = parseBudget(q);
  const cats = Object.entries(CATEGORY_WORDS).filter(([, words]) => words.some((w) => q.includes(w))).map(([c]) => c);
  const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+k?$/.test(t));
  return products
    .filter((p) => budget == null || p.price <= budget)
    .filter((p) => !cats.length || cats.includes(p.category))
    .map((p) => {
      const hay = `${p.brand} ${p.name} ${p.category} ${p.blurb ?? ''} ${(p.highlights ?? []).join(' ')} ${Object.values(p.specs ?? {}).join(' ')}`.toLowerCase();
      return { p, score: terms.filter((t) => hay.includes(t)).length + (cats.length ? 1 : 0) };
    })
    .filter(({ score }) => score > 0 || budget != null)
    .sort((a, b) => b.score - a.score || b.p.rating - a.p.rating)
    .slice(0, MAX_PICKS)
    .map(({ p }) => p);
}

export function cleanReply(raw) {
  const answer = String(raw?.answer ?? '').trim().slice(0, MAX_ANSWER);
  const ids = Array.isArray(raw?.products) ? raw.products.map(String) : [];
  const products = [...new Set(ids)].map((id) => BY_ID.get(id)).filter(Boolean).slice(0, MAX_PICKS);
  return { answer, products };
}
