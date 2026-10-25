// DOM-free: how the store is arranged. The default sorts by price (budget left, premium right, best matches in the middle);
// the shopper can ask Bob (or press a button) to arrange it by rating, store or brand instead. A plan says which zone each
// product goes to, how a zone is ordered, and what the zone signs read. Related items always stay at the back wall.

export const SORTS = ['price', 'rating', 'store', 'brand'];
export const SORT_LABELS = { price: 'Price', rating: 'Rating', store: 'Store', brand: 'Brand' };
export const normalizeSort = (v) => (SORTS.includes(v) ? v : 'price');

const GENERIC = new Set(['the', 'new', 'a', 'an', 'for', 'pack', 'set', 'pair', 'mens', "men's", 'womens', "women's", 'unisex', 'kids', 'premium', 'classic', 'original', 'best']);

// "Sony WH-1000XM5 Wireless Headphones" -> "Sony". A product's own `brand` wins; otherwise the title's first word, unless that is
// generic or a number, which means the title does not lead with a brand.
export function brandOf(p) {
  if (typeof p?.brand === 'string' && p.brand.trim()) return p.brand.trim();
  const first = String(p?.title ?? '').trim().split(/\s+/)[0]?.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9'&.-]+$/g, '') ?? '';
  if (!first || GENERIC.has(first.toLowerCase()) || /^\d/.test(first)) return 'Other';
  return first;
}
export const storeOf = (p) => (typeof p?.source === 'string' && p.source.trim() ? p.source.trim() : 'Other');

const byRelevance = (a, b) => a.relevance - b.relevance;
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

// Groups ranked biggest first (ties by name): center gets the biggest group, then left, then right. From the fourth group on,
// everything shares the right side, whose sign says so.
function groupPlan(products, keyOf, noun) {
  const counts = new Map();
  for (const p of products) if (!p.related) counts.set(keyOf(p), (counts.get(keyOf(p)) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  const rank = new Map(ranked.map((k, i) => [k, i]));
  const zones = ['center', 'left', 'right'];
  const labels = {};
  ranked.slice(0, 3).forEach((k, i) => { labels[zones[i]] = k; });
  if (ranked.length > 3) labels.right = `Other ${noun}`;
  const group = (p) => rank.get(keyOf(p)) ?? 0;
  return {
    zoneOf: (p) => zones[Math.min(2, group(p))],
    compare: (a, b) => group(a) - group(b) || byRelevance(a, b),
    labels,
  };
}

export function sortPlan(products, sort = 'price') {
  switch (normalizeSort(sort)) {
    case 'rating':
      return {
        zoneOf: (p) => (num(p.rating) >= 4.5 ? 'right' : num(p.rating) >= 4 ? 'center' : 'left'),
        compare: (a, b) => num(b.rating) - num(a.rating) || byRelevance(a, b),
        labels: { right: 'Top Rated', center: 'Well Rated', left: 'Other Picks' },
      };
    case 'store': return groupPlan(products, storeOf, 'Stores');
    case 'brand': return groupPlan(products, brandOf, 'Brands');
    default:
      return {
        zoneOf: (p) => (p.tier === 'budget' ? 'left' : p.tier === 'premium' ? 'right' : 'center'),
        compare: byRelevance,
        labels: null,
      };
  }
}
