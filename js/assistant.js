import { $, h } from './ui.js';
import { money } from './shop-logic.js';
import { PRODUCTS } from './catalog.js';
import { complete, parseJson, AI_CREDIT } from './ai.js';
import { systemPrompt, cleanReply, localMatches } from './assistant-logic.js';

const HISTORY_TURNS = 6;
const SUGGESTIONS = ['Best IEM under $300?', 'Compare the HD 600 with the Blessing 3', 'What do I need for a home studio?', 'Headphones for a noisy commute'];
const chat = { history: [], busy: false, focus: null };

const sheet = () => $('#assistant-sheet');
const log = () => $('#as-log');

function pick(p) {
  return h('a', { class: 'as-pick', href: `#/product/${p.id}`, onclick: () => sheet().close() },
    h('img', { src: `products/${p.id}.webp`, alt: '', width: '96', height: '72', loading: 'lazy', decoding: 'async' }),
    h('span', { class: 'as-pick-text' }, h('strong', {}, `${p.brand} ${p.name}`), h('small', {}, money(p.price))));
}

function message(role, text, products = []) {
  return h('div', { class: `as-msg as-${role}` },
    h('p', {}, text),
    products.length ? h('div', { class: 'as-picks' }, products.map(pick)) : null);
}

function add(el) {
  log().append(el);
  log().scrollTop = log().scrollHeight;
}

function setBusy(busy) {
  chat.busy = busy;
  $('#as-send').disabled = busy;
  $('#as-input').setAttribute('aria-busy', String(busy));
  for (const b of $('#as-suggest').children) b.disabled = busy;
}

async function ask(question) {
  const q = question.trim();
  if (!q || chat.busy) return;
  setBusy(true);
  add(message('user', q));
  const wait = h('small', { class: 'as-wait' });
  const typing = h('div', { class: 'as-msg as-bot as-typing', role: 'status', 'aria-label': 'Oura is typing' }, h('span'), h('span'), h('span'), wait);
  add(typing);
  const onWait = (s) => { wait.textContent = s ? `The free AI allows one reply every 45 s. Answering in ${s} s.` : ''; };
  try {
    const reply = await complete({ system: systemPrompt(chat.focus), messages: [...chat.history, { role: 'user', content: q }], json: true, onWait });
    const { answer, products } = cleanReply(parseJson(reply));
    if (!answer) throw new Error('The AI sent an empty answer.');
    chat.history = [...chat.history, { role: 'user', content: q }, { role: 'assistant', content: answer }].slice(-HISTORY_TURNS * 2);
    typing.replaceWith(message('bot', answer, products));
  } catch (err) {
    const reason = err instanceof SyntaxError ? 'its answer came back garbled' : err.message.replace(/\.$/, '');
    const picks = localMatches(q);
    typing.replaceWith(message('bot', picks.length
      ? `I could not reach the AI just now (${reason}), but these products match what you asked:`
      : `I could not reach the AI just now (${reason}). Try again in a moment, or browse the store categories.`, picks));
  } finally {
    setBusy(false);
    log().scrollTop = log().scrollHeight;
  }
}

export function openAssistant(product = null) {
  chat.focus = product?.id ?? null;
  $('#as-context').textContent = product ? `About the ${product.brand} ${product.name}` : 'Store assistant';
  if (!log().children.length) {
    add(message('bot', `Hi, I am Oura. Ask me about any of our ${PRODUCTS.length} products: what fits your budget, how two models compare, or what to buy for a setup.`));
  }
  sheet().showModal();
  $('#as-input').focus();
}

export function initAssistant() {
  $('#as-credit').textContent = AI_CREDIT;
  $('#as-suggest').replaceChildren(...SUGGESTIONS.map((s) => h('button', { type: 'button', class: 'chip-btn', onclick: () => ask(s) }, s)));
  $('#as-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#as-input');
    const q = input.value;
    input.value = '';
    ask(q);
  });
  $('#assistant-fab').addEventListener('click', () => openAssistant());
}
