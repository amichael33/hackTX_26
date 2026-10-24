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
