const ENDPOINT = 'https://text.pollinations.ai/openai';
const TIMEOUT_MS = 45000;
const COOLDOWN_S = 46;
const MAX_WAIT_S = 60;
const NEXT_KEY = 'aura.ai.next';

export const AI_CREDIT = 'Answers come from Pollinations, a free AI service that allows about one reply every 45 seconds. Do not share personal details.';

const now = () => Date.now();
const readNext = () => Number(sessionStorage.getItem(NEXT_KEY)) || 0;
const writeNext = (t) => sessionStorage.setItem(NEXT_KEY, String(t));

async function countdown(seconds, onWait) {
  for (let s = Math.ceil(seconds); s > 0; s--) {
    onWait?.(s);
    await new Promise((r) => setTimeout(r, 1000));
  }
  onWait?.(0);
}

function retryAfter(body) {
  const m = /retry after (\d+)\s*s/i.exec(body);
  return m ? Number(m[1]) + 1 : COOLDOWN_S;
}

async function post(payload) {
  try {
    return await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'The AI took too long to answer.' : 'The AI service could not be reached.');
  }
}

export async function complete({ system, messages, json = false, onWait = null }) {
  const payload = {
    model: 'openai',
    private: true,
    messages: [{ role: 'system', content: system }, ...messages],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };
  const ahead = (readNext() - now()) / 1000;
  if (ahead > 0) await countdown(Math.min(ahead, MAX_WAIT_S), onWait);
  let res = await post(payload);
  if (res.status === 402 || res.status === 429) {
    const wait = retryAfter(await res.text());
    if (wait > MAX_WAIT_S) throw new Error('The free AI service is busy. Try again in a minute.');
    await countdown(wait, onWait);
    res = await post(payload);
  }
  writeNext(now() + COOLDOWN_S * 1000);
  if (res.status === 403) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    throw new Error(local ? 'The free AI only answers on the published site, not on localhost.' : 'The free AI service refused the request.');
  }
  if (res.status === 402 || res.status === 429) throw new Error('The free AI service is busy. Try again in a minute.');
  if (!res.ok) throw new Error(`The AI service answered with an error (${res.status}).`);
  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('The AI sent an empty answer.');
  return text;
}

export function parseJson(text) {
  const body = String(text).replace(/^```(?:json)?\s*|\s*```$/g, '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI answer was not in the expected format.');
  return JSON.parse(body.slice(start, end + 1));
}
