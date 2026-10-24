// Thin fetch wrappers for the same-origin API. 15 s timeout, throw on non-2xx.

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${path} failed with status ${res.status}`);
  return res.json();
}

export const postChat = (body) => post('/api/chat', body);
export const postGeocode = (body) => post('/api/geocode', body);
export const postSearch = (body) => post('/api/search', body);
export const postStickers = (body) => post('/api/stickers', body);

export const imgUrl = (u) => '/api/img?u=' + encodeURIComponent(u);
