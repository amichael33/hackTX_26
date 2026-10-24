import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanIdeas, generateIdeas } from '../server/lib/ideas.js';
import { createApp } from '../server/app.js';

const Q = { query: 'gaming mouse', extra_queries: ['mouse pad'] };

test('cleanIdeas trims, dedupes (also against the query and extra queries), caps to 8 and 40 chars', () => {
  const raw = ['  Mouse   bungee ', 'gaming MOUSE', 'mouse pad', 'Wrist rest', 'wrist rest', '', 42, 'x'.repeat(60),
    'a', 'b', 'c', 'd', 'e', 'f'];
  const out = cleanIdeas(raw, Q);
  assert.equal(out[0], 'Mouse bungee');
  assert.deepEqual(out.slice(1, 3), ['Wrist rest', 'x'.repeat(40)]);
  assert.equal(out.length, 8);
  assert.deepEqual(cleanIdeas('nope', Q), []);
});

test('generateIdeas: one llm call, failures give []', async () => {
  let calls = 0;
  const llm = async ({ schema }) => { calls++; assert.ok(schema.properties.ideas); return { ideas: ['Keyboard', 'Headset'] }; };
  assert.deepEqual(await generateIdeas({ query: Q, titles: ['t'] }, llm), ['Keyboard', 'Headset']);
  assert.equal(calls, 1);
  assert.deepEqual(await generateIdeas({ query: Q }, async () => { throw new Error('boom'); }), []);
  assert.deepEqual(await generateIdeas({ query: Q }, undefined), []);
});

async function withApp(deps, fn) {
  const server = createApp(deps).listen(0);
  try {
    const post = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/ideas`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return await fn(post);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

test('route: Gemini ideas, and never a SerpApi fetch', async () => {
  let fetched = 0;
  const fetchImpl = async () => { fetched++; return { ok: true, json: async () => ({}) }; };
  const llm = async () => ({ ideas: ['Mouse bungee', 'Keyboard'] });
  await withApp({ llm, fetchImpl, serpApiKey: 'k' }, async (post) => {
    const res = await post({ query: Q, titles: ['x'], city: 'Austin' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ideas: ['Mouse bungee', 'Keyboard'] });
    assert.equal(fetched, 0);
  });
});

test('route: demo mode and missing llm serve canned ideas without calling the llm', async () => {
  let called = 0;
  const llm = async () => { called++; return { ideas: [] }; };
  await withApp({ llm, demoMode: true }, async (post) => {
    const json = await (await post({ query: Q })).json();
    assert.equal(json.demo, true);
    assert.ok(json.ideas.length > 0);
    assert.equal(called, 0);
  });
  await withApp({}, async (post) => assert.equal((await (await post({ query: Q })).json()).demo, true));
});

test('route: missing query -> 400; 11th call in a minute -> 429', async () => {
  await withApp({ demoMode: true }, async (post) => {
    assert.equal((await post({})).status, 400);
    for (let i = 0; i < 9; i++) assert.equal((await post({ query: Q })).status, 200);
    assert.equal((await post({ query: Q })).status, 429);
  });
});
