import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { createBudget } from '../server/lib/budget.js';
import { pickMerchant, fetchImmersive } from '../server/lib/merchant.js';
import { normalizeShoppingResults } from '../server/lib/serp.js';

// A response shaped like SerpApi's google_immersive_product (product_results.stores). Fixture only: no live call has been made.
const immersive = {
  product_results: {
    title: 'Keychron K8',
    stores: [
      { name: 'Best Buy', link: 'https://www.bestbuy.com/k8', price: '$89.99' },
      { name: 'Amazon.com', link: 'https://www.amazon.com/dp/K8', price: '$84.99' },
      { name: 'No link store', price: '$80' },
      { name: 'Weird', link: 'javascript:alert(1)' },
    ],
  },
};
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fakeFetch = (fn) => { const f = async (url, o) => { f.calls.push(url); return fn(url, o); }; f.calls = []; return f; };
const post = async (app, path, body) => {
  const server = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json() };
  } finally { server.closeAllConnections(); await new Promise((res) => server.close(res)); }
};

test('pickMerchant prefers the seller the shelf product came from, else the first with a usable link', () => {
  assert.deepEqual(pickMerchant(immersive, 'Amazon'), { link: 'https://www.amazon.com/dp/K8', store: 'Amazon.com' });
  assert.deepEqual(pickMerchant(immersive, 'best buy'), { link: 'https://www.bestbuy.com/k8', store: 'Best Buy' });
  assert.deepEqual(pickMerchant(immersive, 'Target'), { link: 'https://www.bestbuy.com/k8', store: 'Best Buy' });
  assert.equal(pickMerchant({ product_results: { stores: [{ name: 'x', link: 'ftp://x' }] } }, ''), null);
  for (const bad of [null, {}, { product_results: {} }]) assert.equal(pickMerchant(bad, 'x'), null);
});

test('fetchImmersive builds the engine URL from the page token', async () => {
  const f = fakeFetch(() => ok(immersive));
  await fetchImmersive({ token: 'tok en' }, { apiKey: 'K', fetchImpl: f });
  const u = new URL(f.calls[0]);
  assert.equal(u.searchParams.get('engine'), 'google_immersive_product');
  assert.equal(u.searchParams.get('page_token'), 'tok en');
  assert.equal(u.searchParams.get('api_key'), 'K');
  await assert.rejects(fetchImmersive({ token: 't' }, { apiKey: 'K', fetchImpl: async () => ({ ok: false, status: 429 }) }));
});

test('normalize keeps the immersive page token on each product', () => {
  const out = normalizeShoppingResults({ shopping_results: [{ title: 'A', extracted_price: 5, immersive_product_page_token: 'T1' }, { title: 'B', extracted_price: 6 }] });
  assert.deepEqual(out.map((p) => p.page_token), ['T1', null]);
});

test('route: no key, demo mode, or no token -> link null, no fetch', async () => {
  const f = fakeFetch(() => ok(immersive));
  assert.deepEqual((await post(createApp({ fetchImpl: f }), '/api/merchant', { page_token: 't' })).json, { link: null, demo: true });
  assert.deepEqual((await post(createApp({ fetchImpl: f, serpApiKey: 'k', demoMode: true }), '/api/merchant', { page_token: 't' })).json, { link: null, demo: true });
  assert.deepEqual((await post(createApp({ fetchImpl: f, serpApiKey: 'k' }), '/api/merchant', {})).json, { link: null });
  assert.equal(f.calls.length, 0);
});

test('route: one call finds the seller, the repeat is cached (one credit)', async () => {
  const f = fakeFetch(() => ok(immersive));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const a = await post(app, '/api/merchant', { page_token: 'T', source: 'Amazon' });
  const b = await post(app, '/api/merchant', { page_token: 'T', source: 'Amazon' });
  assert.deepEqual(a.json, { link: 'https://www.amazon.com/dp/K8', store: 'Amazon.com' });
  assert.deepEqual(b.json, a.json);
  assert.equal(f.calls.length, 1);
});

test('route: an upstream failure or an empty seller list answers link null', async () => {
  const bad = createApp({ fetchImpl: async () => { throw new Error('down'); }, serpApiKey: 'k' });
  assert.deepEqual((await post(bad, '/api/merchant', { page_token: 'T' })).json, { link: null });
  const empty = createApp({ fetchImpl: async () => ok({ product_results: { stores: [] } }), serpApiKey: 'k' });
  assert.deepEqual((await post(empty, '/api/merchant', { page_token: 'T' })).json, { link: null });
});

test('route: the daily merchant allowance and the shared credit ceiling stop the call', async () => {
  const f = fakeFetch(() => ok(immersive));
  const one = createApp({ fetchImpl: f, serpApiKey: 'k', budget: createBudget({ perClient: { merchant: 1 } }) });
  assert.equal((await post(one, '/api/merchant', { page_token: 'A' })).json.link != null, true);
  assert.deepEqual((await post(one, '/api/merchant', { page_token: 'B' })).json, { link: null, limited: true });
  const none = createApp({ fetchImpl: f, serpApiKey: 'k', budget: createBudget({ serpCredits: 0 }) });
  assert.deepEqual((await post(none, '/api/merchant', { page_token: 'C' })).json, { link: null, limited: true });
  assert.equal(f.calls.length, 1);
});

test('pickMerchant with no source falls back to the first usable seller', () => {
  assert.equal(pickMerchant(immersive, '').store, 'Best Buy');
  assert.equal(pickMerchant(immersive, undefined).store, 'Best Buy');
});
