import { SYSTEM_PROMPT, RESPONSE_SCHEMA, sanitizeInput, sanitizeOutput } from '../public/js/advice-core.js';

export { sanitizeFilter, sanitizeInput, sanitizeOutput } from '../public/js/advice-core.js';

const endpoint = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const FALLBACK_MODELS = ['gemini-3.7-flash', 'gemini-3.1-flash-lite'];
const RETRYABLE = new Set([429, 500, 503]);
const RETRY_DELAY_MS = 800;
const TIMEOUT_MS = 20000;

export async function getAdvice(body, apiKey = process.env.GEMINI_API_KEY) {
  if (!apiKey) {
    const err = new Error('AI advice is not configured on this server (GEMINI_API_KEY missing).');
    err.status = 503;
    throw err;
  }
  const request = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(sanitizeInput(body)) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.4 },
  });
  const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-3.8-flash', ...FALLBACK_MODELS])];
  let res;
  for (const [i, model] of models.entries()) {
    if (i) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    res = await fetch(endpoint(model), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: request,
    });
    if (!RETRYABLE.has(res.status)) break;
  }
  if (!res.ok) {
    const detail = await res.text();
    const busy = RETRYABLE.has(res.status);
    const err = new Error(busy ? 'Gemini is busy right now. Try again in a minute.' : `Gemini request failed (${res.status})`);
    err.status = busy ? 503 : 502;
    err.detail = detail.slice(0, 500);
    throw err;
  }
  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return sanitizeOutput(JSON.parse(reply));
}

const hits = new Map();
export function rateLimited(ip, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  hits.set(ip, [...recent, now]);
  return recent.length >= limit;
}
