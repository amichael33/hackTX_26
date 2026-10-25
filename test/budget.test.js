import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBudget, DAY_MS } from '../server/lib/budget.js';
import { createApp } from '../server/app.js';

const clock = (t = 1_000_000) => { const c = { t, now: () => c.t }; return c; };

test('per-client allowance: Nth+1 is refused, other clients and kinds are unaffected', () => {
  const c = clock();
  const b = createBudget({ now: c.now, perClient: { search: 2, chat: 1 } });
  assert.ok(b.take('a', 'search').ok);
  assert.ok(b.take('a', 'search').ok);
  const r = b.take('a', 'search');
  assert.equal(r.ok, false);
  assert.ok(r.retryAfterSec > 0 && r.retryAfterSec <= DAY_MS / 1000);
  assert.ok(b.take('b', 'search').ok, 'other client');
  assert.ok(b.take('a', 'chat').ok, 'other kind');
  assert.ok(b.take('a', 'unlisted').ok, 'kind without a limit is unlimited');
});

test('allowance resets after the window and retryAfter counts down', () => {
  const c = clock();
  const b = createBudget({ now: c.now, perClient: { search: 1 }, windowMs: 1000 });
  assert.ok(b.take('a', 'search').ok);
  c.t += 400;
  assert.equal(b.take('a', 'search').retryAfterSec, 1);
  c.t += 700;
  assert.ok(b.take('a', 'search').ok);
});

test('shared SerpApi ceiling is spent by everyone and refills with the window', () => {
  const c = clock();
  const b = createBudget({ now: c.now, serpCredits: 3, windowMs: 1000 });
  assert.ok(b.takeSerp(2).ok);
  assert.equal(b.takeSerp(2).ok, false, 'a charge that would overshoot is refused whole');
  assert.equal(b.serpLeft(), 1);
  assert.ok(b.takeSerp(1).ok);
  assert.equal(b.serpLeft(), 0);
  c.t += 1001;
  assert.equal(b.serpLeft(), 3);
});

async function withApp(deps, fn) {
  const server = createApp(deps).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (path, body = {}) => fetch(base + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return await fn({ post });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

const counting = () => {
  const f = async () => { f.calls++; return { ok: true, json: async () => ({ shopping_results: [] }) }; };
  f.calls = 0;
  return f;
};
const search = (post, q = 'mouse') => post('/api/search', { query: { query: q } }).then((r) => r.json());

test('over the daily search allowance: showroom stock, flagged limited, no SerpApi call', async () => {
  const fetchImpl = counting();
  const budget = createBudget({ perClient: { search: 1 }, serpCredits: 100 });
  await withApp({ serpApiKey: 'k', fetchImpl, budget }, async ({ post }) => {
    const first = await search(post, 'mouse');
    assert.equal(first.limited, undefined);
    const callsAfterFirst = fetchImpl.calls;
    assert.ok(callsAfterFirst >= 1);
    const second = await search(post, 'keyboard');
    assert.equal(second.limited, true);
    assert.equal(second.demo, true);
    assert.ok(second.products.length > 0);
    assert.ok(second.retryAfterSec > 0);
    assert.equal(fetchImpl.calls, callsAfterFirst, 'no SerpApi call after the refusal');
  });
});

test('shared credit ceiling reached: later searches get showroom stock and make no calls', async () => {
  const fetchImpl = counting();
  const budget = createBudget({ serpCredits: 1 }); // one credit: the first search can make one call
  await withApp({ serpApiKey: 'k', fetchImpl, budget }, async ({ post }) => {
    await search(post, 'mouse');
    assert.equal(fetchImpl.calls, 1, 'extra calls were stopped by the ceiling');
    const next = await search(post, 'keyboard');
    assert.equal(next.limited, true);
    assert.equal(fetchImpl.calls, 1);
  });
});

test('a cached query spends no credit', async () => {
  const fetchImpl = counting();
  const budget = createBudget({ serpCredits: 10 });
  await withApp({ serpApiKey: 'k', fetchImpl, budget }, async ({ post }) => {
    await search(post, 'mouse');
    const left = budget.serpLeft();
    await search(post, 'mouse');
    assert.equal(budget.serpLeft(), left);
  });
});

test('demo searches never touch the budget', async () => {
  const budget = createBudget({ perClient: { search: 1 }, serpCredits: 1 });
  await withApp({ budget }, async ({ post }) => {
    for (let i = 0; i < 5; i++) {
      const r = await post('/api/search', { query: { query: 'x' }, demo: true }).then((x) => x.json());
      assert.equal(r.limited, undefined);
    }
    assert.equal(budget.serpLeft(), 1);
  });
});

test('chat over the daily allowance -> 429 "daily limit" with Retry-After', async () => {
  const budget = createBudget({ perClient: { chat: 1 } });
  await withApp({ budget }, async ({ post }) => {
    assert.equal((await post('/api/chat', { messages: [{ role: 'user', text: 'hi' }] })).status, 200);
    const res = await post('/api/chat', { messages: [{ role: 'user', text: 'hi' }] });
    assert.equal(res.status, 429);
    assert.equal((await res.json()).error, 'daily limit');
    assert.ok(Number(res.headers.get('retry-after')) > 0);
  });
});
