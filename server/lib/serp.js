// SerpApi Google Shopping: fetch, normalize to Product, and assign price tiers.

const NO_RESULTS_MSG = "Google hasn't returned any results for this query.";

export { NO_RESULTS_MSG };

export async function searchShopping({ q, location }, { apiKey, fetchImpl = fetch }) {
  let url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}`;
  if (location) url += `&location=${encodeURIComponent(location)}`;
  url += `&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`serpapi ${res.status}`);
  return res.json();
}

// Drops items without a numeric extracted_price. relevance = kept position + startRelevance.
export function normalizeShoppingResults(json, { related = false, startRelevance = 0 } = {}) {
  const items = json?.shopping_results ?? [];
  const kept = [];
  items.forEach((item, index) => {
    if (typeof item.extracted_price !== 'number' || !Number.isFinite(item.extracted_price)) return;
    kept.push({
      id: item.product_id ?? `p${index}`,
      title: item.title,
      price: item.price ?? '',
      extracted_price: item.extracted_price,
      rating: item.rating ?? null,
      source: item.source,
      thumbnail: item.thumbnail ?? null,
      link: item.link ?? item.product_link ?? null,
      page_token: item.immersive_product_page_token ?? null, // lets /api/merchant find the seller's own page
      relevance: kept.length + startRelevance,
      related,
    });
  });
  return kept;
}

// Bottom third budget, top third premium, rest mid. Fewer than 3 items: all mid.
// Returns new objects in input order; the input is not mutated.
export function assignTiers(products) {
  const n = products.length;
  const tiers = new Array(n).fill('mid');
  if (n >= 3) {
    const third = Math.floor(n / 3);
    const order = products.map((_, i) => i).sort((a, b) => products[a].extracted_price - products[b].extracted_price);
    order.forEach((idx, rank) => {
      if (rank < third) tiers[idx] = 'budget';
      else if (rank >= n - third) tiers[idx] = 'premium';
    });
  }
  return products.map((p, i) => ({ ...p, tier: tiers[i] }));
}

// SerpApi's Amazon Search API. The search text goes in `k`, not `q`; results are `organic_results`.
export async function searchAmazon({ q }, { apiKey, fetchImpl = fetch }) {
  const url = `https://serpapi.com/search.json?engine=amazon&amazon_domain=amazon.com&k=${encodeURIComponent(q)}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`serpapi amazon ${res.status}`);
  return res.json();
}

// Same Product shape as normalizeShoppingResults. Drops sponsored items and items without a numeric price.
export function normalizeAmazonResults(json) {
  const kept = [];
  for (const item of json?.organic_results ?? []) {
    if (item.sponsored || !item.asin || typeof item.extracted_price !== 'number' || !Number.isFinite(item.extracted_price)) continue;
    kept.push({
      id: `amazon-${item.asin}`,
      title: item.title,
      price: item.price ?? '',
      extracted_price: item.extracted_price,
      rating: item.rating ?? null,
      source: 'Amazon',
      thumbnail: item.thumbnail ?? null,
      link: item.link_clean ?? item.link ?? null,
      relevance: kept.length,
      related: false,
    });
  }
  return kept;
}

// Both engines describe the next page of results in `serpapi_pagination.next` (a serpapi.com URL without the key).
// Following that link instead of guessing offsets means a query with no further page costs nothing.
export function nextPageUrl(json) {
  const next = json?.serpapi_pagination?.next;
  return typeof next === 'string' && next.startsWith('https://serpapi.com/') ? next : null;
}

// One more page for a result already fetched. Returns null when there is no next page.
export async function fetchNextPage(json, { apiKey, fetchImpl = fetch }) {
  const next = nextPageUrl(json);
  if (!next) return null;
  const url = `${next}${next.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`serpapi page ${res.status}`);
  return res.json();
}
