// Thin fetch wrappers for the same-origin API. 15 s timeout, throw on non-2xx.

// ?demo=1 on the page URL forces the server's demo products.
const DEMO = new URLSearchParams(location.search).get('demo') === '1';

async function post(path, body, timeoutMs = 15000) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = new Error(`${path} failed with status ${res.status}`);
    err.status = res.status; // 429 = rate limited
    err.code = (await res.json().catch(() => null))?.error; // 'daily limit' = out of today's allowance, not just too fast
    throw err;
  }
  return res.json();
}

export const isDemoPage = DEMO;
export const postChat = (body) => post('/api/chat', body, 20000); // server Gemini timeout is 15 s
export const postGeocode = (body, timeoutMs = 6000) => post('/api/geocode', body, timeoutMs);
export const postSearch = (body) => post('/api/search', DEMO ? { ...body, demo: true } : body, 25000); // server: main + retry, 8 s each
export const postIdeas = (body) => post('/api/ideas', DEMO ? { ...body, demo: true } : body, 20000); // Gemini only, no SerpApi
export const postMerchant = (body) => post('/api/merchant', DEMO ? { ...body, demo: true } : body, 12000); // one SerpApi credit, cached server-side
export const postStickers = (body) => post('/api/stickers', body);

export const imgUrl = (u) => '/api/img?u=' + encodeURIComponent(u);
