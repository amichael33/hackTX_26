import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeShoppingResults, assignTiers } from '../server/lib/serp.js';
import { createCache } from '../server/lib/cache.js';
import { createApp } from '../server/app.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/shopping.json', import.meta.url), 'utf8'));
const demo = JSON.parse(readFileSync(new URL('../server/data/demoProducts.json', import.meta.url), 'utf8'));

// --- normalize ---

test('fixture normalizes to 5 products (priceless item dropped)', () => {
  const out = normalizeShoppingResults(fixture, {});
  assert.equal(out.length, 5);
  for (const p of out) {
    assert.ok(p.id, 'id');
    assert.ok(p.title, 'title');
    assert.equal(typeof p.extracted_price, 'number');
  }
  assert.deepEqual(out.map((p) => p.relevance), [0, 1, 2, 3, 4]);
  assert.equal(out[0].id, '4467305735324509371');
  assert.equal(out[0].link, fixture.shopping_results[0].product_link);
  assert.equal(out[0].rating, 4.7);
  assert.equal(out[1].rating, null); // rating missing in the real response
  assert.equal(out[0].related, false);
  assert.equal(out[0].tier, undefined);
});

test('normalize: related flag and startRelevance offset', () => {
  const out = normalizeShoppingResults(fixture, { related: true, startRelevance: 10 });
  assert.ok(out.every((p) => p.related === true));
  assert.deepEqual(out.map((p) => p.relevance), [10, 11, 12, 13, 14]);
});

test('normalize: empty json gives []', () => {
  assert.deepEqual(normalizeShoppingResults({}), []);
});

test('normalize: id falls back to index, link prefers link over product_link', () => {
  const out = normalizeShoppingResults({
    shopping_results: [
      { title: 'A', extracted_price: 5, price: '$5' },
      { title: 'B', extracted_price: 6, price: '$6', link: 'https://l', product_link: 'https://pl' },
    ],
  });
  assert.equal(out[0].id, 'p0');
  assert.equal(out[0].link, null);
  assert.equal(out[1].id, 'p1');
  assert.equal(out[1].link, 'https://l');
});

// --- tiers ---

test('assignTiers on 6 prices: 2 budget, 2 mid, 2 premium, input order kept', () => {
  const input = [50, 10, 60, 20, 30, 40].map((p, i) => ({ id: 'x' + i, extracted_price: p }));
  const snapshot = JSON.stringify(input);
  const out = assignTiers(input);
  assert.deepEqual(out.map((p) => p.tier), ['premium', 'budget', 'premium', 'budget', 'mid', 'mid']);
  assert.equal(JSON.stringify(input), snapshot, 'input not mutated');
  assert.deepEqual(out.map((p) => p.id), input.map((p) => p.id));
});

test('assignTiers on ascending 6 prices', () => {
  const out = assignTiers([10, 20, 30, 40, 50, 60].map((p) => ({ extracted_price: p })));
  assert.deepEqual(out.map((p) => p.tier), ['budget', 'budget', 'mid', 'mid', 'premium', 'premium']);
});

test('assignTiers with fewer than 3 products: all mid', () => {
  const out = assignTiers([{ extracted_price: 1 }, { extracted_price: 900 }]);
  assert.deepEqual(out.map((p) => p.tier), ['mid', 'mid']);
});

// --- cache ---

test('cache returns stored value until ttl expires', async () => {
  const c = createCache(20);
  c.set('k', [1]);
  assert.deepEqual(c.get('k'), [1]);
  assert.equal(c.get('missing'), undefined);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(c.get('k'), undefined);
});

// --- demo file ---

test('demoProducts.json: 30 products, tiers match assignTiers, theme mix', () => {
  assert.equal(demo.length, 30);
  assert.deepEqual(demo.map((p) => p.tier), assignTiers(demo).map((p) => p.tier));
  assert.deepEqual(demo.map((p) => p.relevance), demo.map((_, i) => i));
  assert.equal(new Set(demo.map((p) => p.id)).size, 30);
  for (const p of demo) {
    assert.equal(p.thumbnail, null);
    assert.equal(p.link, null);
    assert.equal(typeof p.extracted_price, 'number');
    assert.ok(['budget', 'mid', 'premium'].includes(p.tier));
  }
  const related = demo.filter((p) => p.related).length;
  assert.ok(related >= 4 && related <= 6, `related count ${related}`);
  for (const tier of ['budget', 'mid', 'premium']) assert.ok(demo.some((p) => p.tier === tier), tier);
});

// --- route ---

async function postSearch(app, body) {
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/search`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

const Q = { query: 'mechanical keyboard creamy sound', min_price: null, max_price: 120, preferences: [], extra_queries: [] };
const CITY = 'Austin, Texas, United States';
const ok = (json) => ({ ok: true, status: 200, json: async () => json });
const bad = (status) => ({ ok: false, status, json: async () => ({}) });

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    return handler(String(url), calls.length);
  };
  fn.calls = calls;
  return fn;
}

const forty = { shopping_results: Array.from({ length: 40 }, (_, i) => ({
  title: 'K' + i, product_id: 'id' + i, extracted_price: 10 + i, price: '$' + (10 + i), product_link: 'https://x', source: 's',
})) };

test('route: 40 results -> 30 products, and an identical second request is cached', async () => {
  const f = fakeFetch(() => ok(forty));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const first = await postSearch(app, { query: Q, city: CITY });
  assert.equal(first.status, 200);
  assert.equal(first.json.products.length, 30);
  assert.equal(first.json.products[0].id, 'id0');
  assert.ok(first.json.products.every((p) => p.tier));
  assert.equal(f.calls.length, 1);
  const second = await postSearch(app, { query: Q, city: CITY });
  assert.deepEqual(second.json, first.json);
  assert.equal(f.calls.length, 1, 'cache hit makes no fetch');
});

test('route: empty shopping_results -> {products: []} (no demo)', async () => {
  const app = createApp({ fetchImpl: fakeFetch(() => ok({ shopping_results: [] })), serpApiKey: 'k' });
  const r = await postSearch(app, { query: Q, city: CITY });
  assert.deepEqual(r.json, { products: [] });
});

test('route: "no results" error message is EMPTY, not failure', async () => {
  const f = fakeFetch(() => ok({ error: "Google hasn't returned any results for this query." }));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r = await postSearch(app, { query: Q, city: CITY });
  assert.deepEqual(r.json, { products: [] });
  assert.equal(f.calls.length, 1, 'no location retry for an empty result');
});

test('route: fetch rejection -> 30 demo products', async () => {
  const app = createApp({ fetchImpl: async () => { throw new Error('down'); }, serpApiKey: 'k' });
  const r = await postSearch(app, { query: Q, city: CITY });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.products, demo);
});

test('route: location retry - error with location, then success without it', async () => {
  const f = fakeFetch((url, n) => (n === 1 ? ok({ error: 'Unsupported location' }) : ok(fixture)));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r = await postSearch(app, { query: Q, city: CITY });
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls[0].includes('location='));
  assert.ok(!f.calls[1].includes('location='));
  assert.equal(r.json.products.length, 5);
});

test('route: non-2xx with location, retry also fails -> demo', async () => {
  const f = fakeFetch(() => bad(500));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r = await postSearch(app, { query: Q, city: CITY });
  assert.equal(f.calls.length, 2);
  assert.deepEqual(r.json.products, demo);
});

test('route: error without location is a failure -> demo, no retry', async () => {
  const f = fakeFetch(() => ok({ error: 'Invalid API key' }));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r = await postSearch(app, { query: Q });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(r.json.products, demo);
});

test('route: missing SERPAPI key -> demo, no fetch', async () => {
  const f = fakeFetch(() => ok(forty));
  const app = createApp({ fetchImpl: f });
  const r = await postSearch(app, { query: Q, city: CITY });
  assert.equal(f.calls.length, 0);
  assert.deepEqual(r.json.products, demo);
});

test('route: demoMode -> demo, no fetch', async () => {
  const f = fakeFetch(() => ok(forty));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k', demoMode: true });
  const r = await postSearch(app, { query: Q, city: CITY });
  assert.equal(f.calls.length, 0);
  assert.deepEqual(r.json.products, demo);
});

test('route: extra_queries fan out, marked related, main results first', async () => {
  const f = fakeFetch((url) => {
    const q = new URL(url).searchParams.get('q');
    return ok({ shopping_results: [{ title: q, product_id: q, extracted_price: 20, product_link: 'u' }] });
  });
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r = await postSearch(app, { query: { ...Q, extra_queries: ['keycaps', 'wrist rest'] }, city: CITY });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(r.json.products.map((p) => p.related), [false, true, true]);
  assert.equal(r.json.products[0].title, Q.query);
});

test('route: 40 main + 5 related -> 30 products with 5 related and 25 main', async () => {
  const relatedItems = { shopping_results: Array.from({ length: 5 }, (_, i) => ({
    title: 'R' + i, product_id: 'rel' + i, extracted_price: 15 + i, price: '$' + (15 + i), product_link: 'https://r', source: 's',
  })) };
  const f = fakeFetch((url) => (new URL(url).searchParams.get('q') === 'keycaps' ? ok(relatedItems) : ok(forty)));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r = await postSearch(app, { query: { ...Q, extra_queries: ['keycaps'] }, city: CITY });
  assert.equal(r.json.products.length, 30);
  assert.equal(r.json.products.filter((p) => p.related).length, 5);
  assert.equal(r.json.products.filter((p) => !p.related).length, 25);
  const related = r.json.products.filter((p) => p.related);
  assert.ok(related.every((p) => p.relevance >= 40), 'related relevance continues after main');
});

test('route: body demo:true -> demo products, no fetch, not cached', async () => {
  const f = fakeFetch(() => ok(forty));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r = await postSearch(app, { query: Q, city: CITY, demo: true });
  assert.equal(f.calls.length, 0);
  assert.deepEqual(r.json.products, demo);
  // a later non-demo request must hit SerpApi (demo result was not cached)
  const live = await postSearch(app, { query: Q, city: CITY });
  assert.equal(f.calls.length, 1);
  assert.equal(live.json.products[0].id, 'id0');
});

test('route: cache key includes extra_queries (different extras -> separate fetch rounds)', async () => {
  const f = fakeFetch(() => ok(forty));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  await postSearch(app, { query: { ...Q, extra_queries: ['hdmi cable'] }, city: CITY });
  assert.equal(f.calls.length, 2);
  await postSearch(app, { query: { ...Q, extra_queries: ['usb hub'] }, city: CITY });
  assert.equal(f.calls.length, 4);
  await postSearch(app, { query: { ...Q, extra_queries: ['hdmi cable'] }, city: CITY });
  assert.equal(f.calls.length, 4, 'same extras are a cache hit');
});
