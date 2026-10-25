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

test('route: 40 results -> 40 products, no extras, and an identical second request is cached', async () => {
  const f = fakeFetch(() => ok(forty));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const first = await postSearch(app, { query: Q, city: CITY });
  assert.equal(first.status, 200);
  assert.equal(first.json.products.length, 40);
  assert.deepEqual(first.json.extras, []);
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
  assert.deepEqual(r.json, { products: [], extras: [] });
});

test('route: "no results" error message is EMPTY, not failure', async () => {
  const f = fakeFetch(() => ok({ error: "Google hasn't returned any results for this query." }));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r = await postSearch(app, { query: Q, city: CITY });
  assert.deepEqual(r.json, { products: [], extras: [] });
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

test('route: 40 main + 5 related -> 45 products with 5 related and 40 main', async () => {
  const relatedItems = { shopping_results: Array.from({ length: 5 }, (_, i) => ({
    title: 'R' + i, product_id: 'rel' + i, extracted_price: 15 + i, price: '$' + (15 + i), product_link: 'https://r', source: 's',
  })) };
  const f = fakeFetch((url) => (new URL(url).searchParams.get('q') === 'keycaps' ? ok(relatedItems) : ok(forty)));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r = await postSearch(app, { query: { ...Q, extra_queries: ['keycaps'] }, city: CITY });
  assert.equal(r.json.products.length, 45);
  assert.equal(r.json.products.filter((p) => p.related).length, 5);
  assert.equal(r.json.products.filter((p) => !p.related).length, 40);
  const related = r.json.products.filter((p) => p.related);
  assert.ok(related.every((p) => p.relevance >= 40), 'related relevance continues after main');
});

test('route: more than fits on the shelves -> 40 main + 12 related on the shelves, the rest kept as extras', async () => {
  const items = (prefix, n) => ({ shopping_results: Array.from({ length: n }, (_, i) => ({
    title: prefix + i, product_id: prefix + i, extracted_price: 10 + i, price: '$' + (10 + i), product_link: 'https://r', source: 's',
  })) });
  const f = fakeFetch((url) => ok(new URL(url).searchParams.get('q') === 'keycaps' ? items('rel', 80) : items('m', 40)));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r = await postSearch(app, { query: { ...Q, extra_queries: ['keycaps'] }, city: CITY });
  assert.equal(r.json.products.length, 52);
  assert.equal(r.json.products.filter((p) => p.related).length, 12);
  assert.equal(r.json.extras.length, 68); // 80 related - 12 on the shelves, under the extras cap (80)
  assert.ok(r.json.extras.every((p) => p.related && p.tier));
  const ids = [...r.json.products, ...r.json.extras].map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'no product is on both lists');
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

test('route: cache is per SerpApi query (new extras fetch only the new extra)', async () => {
  const f = fakeFetch(() => ok(forty));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  await postSearch(app, { query: { ...Q, extra_queries: ['hdmi cable'] }, city: CITY });
  assert.equal(f.calls.length, 2);
  await postSearch(app, { query: { ...Q, extra_queries: ['usb hub'] }, city: CITY });
  assert.equal(f.calls.length, 3, 'main is reused; only the new extra is fetched');
  await postSearch(app, { query: { ...Q, extra_queries: ['hdmi cable'] }, city: CITY });
  assert.equal(f.calls.length, 3, 'repeat request makes 0 fetches');
});

test('route: a query warmed as main is reused as an extra', async () => {
  const f = fakeFetch(() => ok(forty));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  await postSearch(app, { query: { ...Q, query: 'keycaps' }, city: CITY });
  assert.equal(f.calls.length, 1);
  await postSearch(app, { query: { ...Q, extra_queries: ['Keycaps '] }, city: CITY });
  assert.equal(f.calls.length, 2, 'only the main query is fetched; keycaps came from cache');
});

test('route: failed queries are not cached', async () => {
  let fail = true;
  const f = fakeFetch(() => (fail ? bad(500) : ok(forty)));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const r1 = await postSearch(app, { query: Q });
  assert.equal(r1.json.demo, true);
  fail = false;
  const r2 = await postSearch(app, { query: Q });
  assert.equal(r2.json.products[0].id, 'id0');
});

test('route: demo products carry demo:true (fetch failure, missing key, demoMode)', async () => {
  const failing = createApp({ fetchImpl: async () => { throw new Error('down'); }, serpApiKey: 'k' });
  assert.equal((await postSearch(failing, { query: Q, city: CITY })).json.demo, true);
  assert.equal((await postSearch(createApp({}), { query: Q })).json.demo, true);
  assert.equal((await postSearch(createApp({ serpApiKey: 'k', demoMode: true }), { query: Q })).json.demo, true);
});

test('route: a clothing demo search serves demo garments with drawn thumbnails; other searches keep the electronics demo', async () => {
  const f = fakeFetch(() => ok(forty));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const clothes = await postSearch(app, { query: { ...Q, query: 'blue hoodie' }, city: CITY, demo: true });
  assert.equal(clothes.json.demo, true);
  assert.ok(clothes.json.products.length >= 24);
  assert.ok(clothes.json.products.every((p) => p.thumbnail.startsWith('data:image/svg+xml') && p.tier && typeof p.extracted_price === 'number'));
  assert.ok(clothes.json.products.some((p) => p.related));
  assert.equal(new Set(clothes.json.products.map((p) => p.id)).size, clothes.json.products.length);
  const flagged = await postSearch(app, { query: { ...Q, query: 'something', is_clothing: true }, city: CITY, demo: true });
  assert.deepEqual(flagged.json.products.map((p) => p.id), clothes.json.products.map((p) => p.id));
  const kb = await postSearch(app, { query: Q, city: CITY, demo: true });
  assert.deepEqual(kb.json.products, demo);
  assert.equal(f.calls.length, 0);
});

// --- cost caps and shared loads ---

test('cache.getOrLoad: concurrent callers share one load; a failed load is not cached', async () => {
  const c = createCache(1000);
  let loads = 0;
  const load = async () => { loads++; await new Promise((r) => setTimeout(r, 10)); return 'v'; };
  const out = await Promise.all([c.getOrLoad('k', load), c.getOrLoad('k', load), c.getOrLoad('k', load)]);
  assert.deepEqual(out, ['v', 'v', 'v']);
  assert.equal(loads, 1);
  assert.equal(await c.getOrLoad('k', load), 'v');
  assert.equal(loads, 1, 'cached afterwards');
  await assert.rejects(c.getOrLoad('bad', async () => { throw new Error('x'); }));
  assert.equal(await c.getOrLoad('bad', async () => 'ok'), 'ok', 'failure was not cached');
});

test('route: two identical searches at the same moment make one SerpApi call', async () => {
  const f = fakeFetch(async () => { await new Promise((r) => setTimeout(r, 20)); return ok(forty); });
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const [a, b] = await Promise.all([postSearch(app, { query: Q, city: CITY }), postSearch(app, { query: Q, city: CITY })]);
  assert.equal(a.status, 200);
  assert.deepEqual(a.json, b.json);
  assert.equal(f.calls.length, 1);
});

test('route: an over-long query is refused with no SerpApi call; junk extra_queries are dropped', async () => {
  const f = fakeFetch(() => ok(forty));
  const app = createApp({ fetchImpl: f, serpApiKey: 'k' });
  const long = await postSearch(app, { query: { ...Q, query: 'x'.repeat(500) }, city: CITY });
  assert.equal(long.status, 400);
  const notString = await postSearch(app, { query: { ...Q, query: { a: 1 } }, city: CITY });
  assert.equal(notString.status, 400);
  assert.equal(f.calls.length, 0);
  const junk = await postSearch(app, { query: { ...Q, extra_queries: [42, '', 'y'.repeat(500)] }, city: CITY });
  assert.equal(junk.status, 200);
  assert.equal(f.calls.length, 1, 'only the main query ran');
});

// --- second pages ---

const NEXT = (engine, n) => ({ next: `https://serpapi.com/search.json?engine=${engine}&q=kb&start=${n}` });
const gPage = (prefix, n, next) => ({
  shopping_results: Array.from({ length: n }, (_, i) => ({ title: prefix + i, product_id: prefix + i, extracted_price: 10 + i, price: '$' + (10 + i), product_link: 'https://x', source: 's' })),
  ...(next ? { serpapi_pagination: next } : {}),
});
const aPage = (prefix, n, next) => ({
  organic_results: Array.from({ length: n }, (_, i) => ({ title: prefix + i, asin: prefix + i, extracted_price: 20 + i, price: '$' + (20 + i), link: 'https://www.amazon.com/dp/' + prefix + i })),
  ...(next ? { serpapi_pagination: next } : {}),
});

function pagedFetch() {
  return fakeFetch((url) => {
    const isAmazon = url.includes('engine=amazon');
    const second = url.includes('start=') ;
    if (isAmazon) return ok(second ? aPage('a2-', 5) : aPage('a1-', 5, NEXT('amazon', 2)));
    return ok(second ? gPage('g2-', 10) : gPage('g1-', 10, NEXT('google_shopping', 10)));
  });
}

test('route: a live search fetches a second page of Google Shopping and of Amazon (4 calls) and merges both', async () => {
  const f = pagedFetch();
  const app = createApp({ fetchImpl: f, serpApiKey: 'k', amazon: true });
  const r = await postSearch(app, { query: Q, city: CITY });
  assert.equal(f.calls.length, 4);
  assert.equal(f.calls.filter((u) => u.includes('start=')).length, 2);
  assert.ok(f.calls.filter((u) => u.includes('start=')).every((u) => u.includes('api_key=k')), 'the key is added to the next-page link');
  const ids = [...r.json.products, ...r.json.extras].map((p) => p.id);
  assert.equal(ids.filter((id) => id.startsWith('g1-')).length, 10);
  assert.equal(ids.filter((id) => id.startsWith('g2-')).length, 10);
  assert.equal(ids.filter((id) => id.startsWith('amazon-a1-')).length, 5);
  assert.equal(ids.filter((id) => id.startsWith('amazon-a2-')).length, 5);
  await postSearch(app, { query: Q, city: CITY });
  assert.equal(f.calls.length, 4, 'the repeat is cached, both pages');
});

test('route: no next-page link means no extra call; a failed second page keeps the first', async () => {
  const none = fakeFetch(() => ok(gPage('g', 5)));
  await postSearch(createApp({ fetchImpl: none, serpApiKey: 'k' }), { query: Q, city: CITY });
  assert.equal(none.calls.length, 1);
  const flaky = fakeFetch((url) => (url.includes('start=') ? bad(500) : ok(gPage('g', 5, NEXT('google_shopping', 10)))));
  const r = await postSearch(createApp({ fetchImpl: flaky, serpApiKey: 'k' }), { query: Q, city: CITY });
  assert.equal(flaky.calls.length, 2);
  assert.equal(r.json.products.length, 5);
  assert.ok(!r.json.demo);
});

test('route: SEARCH_PAGES / deps.pages = 1 goes back to one page each; the related queries never page', async () => {
  const f = pagedFetch();
  await postSearch(createApp({ fetchImpl: f, serpApiKey: 'k', amazon: true, pages: 1 }), { query: Q, city: CITY });
  assert.equal(f.calls.length, 2);
  const g = pagedFetch();
  await postSearch(createApp({ fetchImpl: g, serpApiKey: 'k', amazon: true }), { query: { ...Q, extra_queries: ['keycaps'] }, city: CITY });
  assert.equal(g.calls.length, 5, 'main 2 + amazon 2 + the related query 1');
});

test('route: the credit pool is respected when paging (no page past the ceiling)', async () => {
  const f = pagedFetch();
  const { createBudget } = await import('../server/lib/budget.js');
  const app = createApp({ fetchImpl: f, serpApiKey: 'k', amazon: true, budget: createBudget({ serpCredits: 3 }) });
  const r = await postSearch(app, { query: Q, city: CITY });
  assert.ok(f.calls.length <= 3, `made ${f.calls.length} calls with 3 credits`);
  assert.equal(r.status, 200);
});
