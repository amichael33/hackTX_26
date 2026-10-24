// Pre-warm the in-memory search cache for the demo queries. Costs real SerpApi searches:
// run it by hand against a running server. Usage: npm run prewarm [-- http://host:3000]
const base = process.argv[2] || 'http://localhost:3000';
const city = 'Austin, Texas, United States';
const queries = ['mechanical keyboard creamy sound', 'workout tops pink', 'apple watch'];

for (const query of queries) {
  const body = { query: { query, min_price: null, max_price: null, preferences: [], extra_queries: [] }, city };
  try {
    const res = await fetch(`${base}/api/search`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json();
    console.log(`${query}: ${res.ok ? (json.products?.length ?? 0) : 'HTTP ' + res.status} products`);
  } catch (err) {
    console.log(`${query}: failed (${err.message})`);
  }
}
