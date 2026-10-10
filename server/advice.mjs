// Gemini-backed tuning advice. The API key never leaves the server.

const endpoint = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
// Tried in order when the main model is overloaded (Google returns 503 "high demand" per model).
const FALLBACK_MODELS = ['gemini-3.7-flash', 'gemini-3.1-flash-lite'];
const RETRYABLE = new Set([429, 500, 503]);
const RETRY_DELAY_MS = 800;
const MAX_ADJUSTMENTS = 5;
const MAX_GAIN_DB = 4;
const TIMEOUT_MS = 20000;
const TYPES = new Set(['PK', 'LSC', 'HSC']);

const SYSTEM_PROMPT = `You are the tuning assistant of Oura Acoustics, an audiophile store.
You receive: a headphone model, its measured AutoEq correction, the user's bass/treble taste,
a third-octave long-term spectrum of what they actually listen to (dB, relative), clipping stats,
and optional hearing-check deviations (dB later than expected; positive = heard later).
Return at most ${MAX_ADJUSTMENTS} small EQ adjustments to add ON TOP of the correction, and up to 5
short non-EQ tips (ANC/transparency mode, ear tips and fit, player normalization, codec, volume).
Rules: prefer cuts over boosts; keep every gain within ±${MAX_GAIN_DB} dB; Q between 0.5 and 6;
explain each change in plain words in at most 25 words; never invent measurements.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    adjustments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: [...TYPES] },
          fc: { type: 'NUMBER' },
          gain: { type: 'NUMBER' },
          q: { type: 'NUMBER' },
          reason: { type: 'STRING' },
        },
        required: ['type', 'fc', 'gain', 'q', 'reason'],
      },
    },
    tips: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'adjustments', 'tips'],
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
const text = (v, max) => String(v ?? '').slice(0, max);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

export function sanitizeFilter(f, maxGain = 20) {
  if (!f || !TYPES.has(f.type)) return null;
  return {
    type: f.type,
    fc: Math.round(clamp(f.fc, 20, 20000)),
    gain: Math.round(clamp(f.gain, -maxGain, maxGain) * 10) / 10,
    q: Math.round(clamp(f.q, 0.3, 10) * 100) / 100,
  };
}

// Whitelist the client's summary; anything else is dropped.
export function sanitizeInput(body) {
  const b = body && typeof body === 'object' ? body : {};
  return {
    device: text(b.device, 120) || 'unknown',
    correction: list(b.correction?.filters, 20).map((f) => sanitizeFilter(f)).filter(Boolean),
    taste: { bass: clamp(b.taste?.bass, -6, 6), treble: clamp(b.taste?.treble, -6, 6) },
    content: b.content && {
      bass: clamp(b.content.bass, -60, 60),
      treble: clamp(b.content.treble, -60, 60),
      rmsDb: clamp(b.content.rmsDb, -120, 0),
      clipFrames: clamp(b.content.clipFrames, 0, 1e6),
      bands: list(b.content.bands, 30).map((x) => ({ f: clamp(x?.f, 20, 20000), db: Math.round(clamp(x?.db, -150, 20)) })),
    },
    hearing: list(b.hearing, 8).map((h) => ({ f: clamp(h?.f, 20, 20000), deviation: Math.round(clamp(h?.deviation, -40, 40)) })),
  };
}

export function sanitizeOutput(raw) {
  return {
    summary: text(raw?.summary, 400),
    adjustments: list(raw?.adjustments, MAX_ADJUSTMENTS)
      .map((a) => {
        const f = sanitizeFilter(a, MAX_GAIN_DB);
        return f && { ...f, q: clamp(f.q, 0.5, 6), reason: text(a.reason, 200) };
      })
      .filter(Boolean),
    tips: list(raw?.tips, 5).map((t) => text(t, 200)),
  };
}

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
  // Read at call time: server.mjs loads .env after this module is imported.
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

// ponytail: in-memory per-IP limiter, resets on restart; use a shared store if this runs on several instances.
const hits = new Map();
export function rateLimited(ip, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  hits.set(ip, [...recent, now]);
  return recent.length >= limit;
}
