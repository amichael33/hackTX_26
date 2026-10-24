import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAmazonResults } from '../server/lib/serp.js';
import { createApp } from '../server/app.js';

const ok = (json) => ({ ok: true, status: 200, json: async () => json });
const google = (n) => ({ shopping_results: Array.from({ length: n }, (_, i) => ({
  title: 'G' + i, product_id: 'g' + i, extracted_price: 10 + i, price: '$' + (10 + i), product_link: 'https://x', source: 'Target',
})) });
const amazonJson = (n) => ({ organic_results: Array.from({ length: n }, (_, i) => ({
  asin: 'A' + i, title: 'Az' + i, extracted_price: 20 + i, price: '$' + (20 + i), rating: 4.5,
  link: 'https://www.amazon.com/dp/A' + i + '?ref=x', link_clean: 'https://www.amazon.com/dp/A' + i, thumbnail: 'https://m.media-amazon.com/i.jpg',
})) });

test('normalizeAmazonResults: Product shape, drops sponsored and priceless items', () => {
  const json = amazonJson(2);
  json.organic_results.push({ asin: 'S', title: 's', extracted_price: 5, sponsored: true });
  json.organic_results.push({ asin: 'N', title: 'no price' });
  const out = normalizeAmazonResults(json);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    id: 'amazon-A0', title: 'Az0', price: '$20', extracted_price: 20, rating: 4.5, source: 'Amazon',
    thumbnail: 'https://m.media-amazon.com/i.jpg', link: 'https://www.amazon.com/dp/A0', relevance: 0, related: false,
  });
});

async function search(deps, body) {
  const server = createApp(deps).listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/search`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return await res.json();
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
const Q = { query: 'wireless mouse', extra_queries: [] };

test('route: Amazon items are merged (max 16, one per 3 Google items) with contiguous relevance', async () => {
  const urls = [];
  const fetchImpl = async (u) => { urls.push(String(u)); return ok(String(u).includes('engine=amazon') ? amazonJson(16) : google(12)); };
  const { products } = await search({ fetchImpl, serpApiKey: 'k', amazon: true }, { query: Q });
  assert.equal(urls.filter((u) => u.includes('engine=amazon')).length, 1);
  assert.ok(urls.find((u) => u.includes('engine=amazon')).includes('k=wireless%20mouse'));
  const az = products.filter((p) => p.source === 'Amazon');
  assert.equal(az.length, 16);
  assert.equal(products.length, 28);
  assert.deepEqual(products.map((p) => p.relevance), products.map((_, i) => i));
  assert.equal(products[3].source, 'Amazon'); // after the first three Google items
  assert.equal(new Set(products.map((p) => p.id)).size, products.length);
  assert.ok(products.every((p) => p.tier));
});

test('route: an Amazon failure leaves the Google results intact', async () => {
  const fetchImpl = async (u) => {
    if (String(u).includes('engine=amazon')) throw new Error('down');
    return ok(google(5));
  };
  const { products, demo } = await search({ fetchImpl, serpApiKey: 'k', amazon: true }, { query: Q });
  assert.equal(demo, undefined);
  assert.equal(products.length, 5);
  assert.ok(products.every((p) => p.source === 'Target'));
});

test('route: Amazon is off unless enabled (no extra fetch)', async () => {
  const urls = [];
  const fetchImpl = async (u) => { urls.push(String(u)); return ok(google(3)); };
  await search({ fetchImpl, serpApiKey: 'k' }, { query: Q });
  assert.equal(urls.length, 1);
});

test('route: a query Amazon has no results for is retried pluralized, then without its first word', async () => {
  const run = async (works) => {
    const amazonQs = [];
    const fetchImpl = async (u) => {
      const url = new URL(String(u));
      if (url.searchParams.get('engine') !== 'amazon') return ok(google(3));
      const k = url.searchParams.get('k');
      amazonQs.push(k);
      return ok(k === works ? amazonJson(4) : { error: "Amazon hasn't returned any results for this query." });
    };
    const { products } = await search({ fetchImpl, serpApiKey: 'k', amazon: true }, { query: { query: 'gaming keyboard', extra_queries: [] } });
    return { amazonQs, n: products.filter((p) => p.source === 'Amazon').length };
  };
  assert.deepEqual(await run('gaming keyboards'), { amazonQs: ['gaming keyboard', 'gaming keyboards'], n: 4 });
  assert.deepEqual(await run('keyboard'), { amazonQs: ['gaming keyboard', 'gaming keyboards', 'keyboard'], n: 4 });
  assert.deepEqual(await run('never'), { amazonQs: ['gaming keyboard', 'gaming keyboards', 'keyboard'], n: 0 });
});
