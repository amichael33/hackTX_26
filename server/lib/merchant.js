// Resolves a Google Shopping result to the merchant's own page. SerpApi's google_immersive_product engine takes the result's
// immersive_product_page_token and returns product_results.stores: one entry per seller, each with its own link.
// One call = one credit, so the route caches by token and the client only asks when the shopper presses Buy.

export async function fetchImmersive({ token }, { apiKey, fetchImpl = fetch }) {
  const url = `https://serpapi.com/search.json?engine=google_immersive_product&page_token=${encodeURIComponent(token)}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`serpapi immersive ${res.status}`);
  return res.json();
}

const isHttp = (s) => typeof s === 'string' && /^https?:\/\//i.test(s.trim());
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// The seller to send the shopper to: the one the shelf product came from (`source`), else the first seller with a link.
// -> { link, store } or null when no seller has a usable link.
export function pickMerchant(json, source) {
  const stores = (json?.product_results?.stores ?? json?.stores ?? []).filter((s) => s && isHttp(s.link));
  if (!stores.length) return null;
  const want = norm(source);
  const match = !want ? undefined : stores.find((s) => { const n = norm(s.name); return n && (n === want || n.includes(want) || want.includes(n)); });
  const pick = match ?? stores[0];
  return { link: pick.link.trim(), store: typeof pick.name === 'string' ? pick.name : null };
}
