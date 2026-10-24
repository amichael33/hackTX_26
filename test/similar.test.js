import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSimilarQueries } from '../server/lib/similar.js';
import { createApp } from '../server/app.js';

const Q = { query: 'mechanical keyboard creamy sound', extra_queries: [] };
const ok = (json) => ({ ok: true, status: 200, json: async () => json });

test('generateSimilarQueries trims, dedupes (also against the query) and caps at 2', async () => {
  const llm = async () => ({ queries: ['Thocky 75% keyboard', 'mechanical keyboard creamy sound', 'GASKET mount keyboard', 'gasket mount keyboard', ''] });
  assert.deepEqual(await generateSimilarQueries({ query: Q, titles: [] }, llm), ['Thocky 75% keyboard', 'GASKET mount keyboard']);
});

test('generateSimilarQueries: throwing llm -> []', async () => {
  assert.deepEqual(await generateSimilarQueries({ query: Q, titles: [] }, async () => { throw new Error('boom'); }), []);
});

async function withApp(deps, fn) {
  const server = createApp(deps).listen(0);
  try {
    const post = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/similar`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return await fn(post);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

const items = (prefix) => ({ shopping_results: Array.from({ length: 10 }, (_, i) => ({
  title: prefix + i, product_id: prefix + i, extracted_price: 10 + i, price: '$' + (10 + i), product_link: 'https://x', source: 's',
})) });

test('route: 2 queries, excluded ids dropped, <=12 products all similar', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(String(url)); return ok(items(calls.length === 1 ? 'a' : 'b')); };
  const llm = async () => ({ queries: ['one', 'two'] });
  await withApp({ llm, fetchImpl, serpApiKey: 'k' }, async (post) => {
    const res = await post({ query: Q, city: 'Austin', exclude: ['a0', 'b1'], titles: ['x'] });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(calls.length, 2);
    assert.ok(json.products.length <= 12 && json.products.length > 0);
    assert.ok(json.products.every((p) => p.similar === true && p.related === false && p.tier));
    assert.ok(!json.products.some((p) => p.id === 'a0' || p.id === 'b1'));
    assert.equal(new Set(json.products.map((p) => p.id)).size, json.products.length);
    assert.deepEqual(json.queries, ['one', 'two']);
  });
});

test('route: llm returns only the main query -> no fetch, empty', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return ok(items('a')); };
  await withApp({ llm: async () => ({ queries: [Q.query] }), fetchImpl, serpApiKey: 'k' }, async (post) => {
    const json = await (await post({ query: Q, city: 'Austin' })).json();
    assert.equal(n, 0);
    assert.deepEqual(json, { products: [], queries: [] });
  });
});

test('route: every query failing falls back to demo stock', async () => {
  await withApp({ llm: async () => ({ queries: ['one', 'two'] }), fetchImpl: async () => { throw new Error('down'); }, serpApiKey: 'k' }, async (post) => {
    const json = await (await post({ query: Q })).json();
    assert.equal(json.demo, true);
    assert.ok(json.products.length > 0 && json.products.every((p) => p.similar === true));
  });
});

test('route: demoMode serves demo items not in exclude, no fetch', async () => {
  let n = 0;
  await withApp({ demoMode: true, fetchImpl: async () => { n++; return ok({}); } }, async (post) => {
    const json = await (await post({ query: Q, exclude: ['demo-kb-01'] })).json();
    assert.equal(n, 0);
    assert.equal(json.demo, true);
    assert.ok(json.products.length > 0 && json.products.length <= 12);
    assert.ok(!json.products.some((p) => p.id === 'demo-kb-01'));
    assert.ok(json.products.every((p) => p.similar === true && p.related === false));
  });
});

test('route: 11th call in a minute -> 429', async () => {
  await withApp({ demoMode: true }, async (post) => {
    for (let i = 0; i < 10; i++) assert.equal((await post({ query: Q })).status, 200);
    assert.equal((await post({ query: Q })).status, 429);
  });
});
