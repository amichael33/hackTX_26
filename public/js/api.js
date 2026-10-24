// Thin fetch wrappers for the same-origin API. 15 s timeout, throw on non-2xx.

async function post(path, body, timeoutMs = 15000) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${path} failed with status ${res.status}`);
  return res.json();
}

export const postChat = (body) => post('/api/chat', body);
export const postGeocode = (body, timeoutMs = 6000) => post('/api/geocode', body, timeoutMs);
export const postSearch = (body) => post('/api/search', body);
export const postStickers = (body) => post('/api/stickers', body);

export const imgUrl = (u) => '/api/img?u=' + encodeURIComponent(u);
