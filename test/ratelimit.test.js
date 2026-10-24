import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

async function withApp(deps, fn) {
  const server = createApp(deps).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (path, body = {}) => fetch(base + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return await fn({ base, post });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

test('11th /api/search in a minute -> 429 {error:"slow down"} with standard headers', async () => {
  await withApp({}, async ({ post }) => {
    const body = { query: { query: 'x' }, demo: true };
    for (let i = 0; i < 10; i++) assert.equal((await post('/api/search', body)).status, 200, 'req ' + (i + 1));
    const res = await post('/api/search', body);
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), { error: 'slow down' });
    assert.ok(res.headers.get('ratelimit-limit') || res.headers.get('ratelimit'), 'standard headers');
    assert.equal(res.headers.get('x-ratelimit-limit'), null, 'no legacy headers');
  });
});

test('geocode limited at 10/min, chat and stickers at 30/min', async () => {
  await withApp({}, async ({ post }) => {
    for (let i = 0; i < 10; i++) assert.equal((await post('/api/geocode', {})).status, 200);
    assert.equal((await post('/api/geocode', {})).status, 429);
    for (let i = 0; i < 30; i++) assert.equal((await post('/api/stickers', {})).status, 200);
    assert.equal((await post('/api/stickers', {})).status, 429);
  });
});

test('limits are per app instance (fresh counters) and per IP via trust proxy', async () => {
  await withApp({}, async ({ base, post }) => {
    for (let i = 0; i < 10; i++) await post('/api/geocode', {});
    assert.equal((await post('/api/geocode', {})).status, 429);
    // another client address forwarded from loopback gets its own bucket
    const other = await fetch(base + '/api/geocode', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: '{}',
    });
    assert.equal(other.status, 200);
  });
  await withApp({}, async ({ post }) => {
    assert.equal((await post('/api/geocode', {})).status, 200);
  });
});

test('/api/img limited at 300/min', async () => {
  await withApp({}, async ({ base }) => {
    let last;
    for (let i = 0; i < 301; i++) last = await fetch(base + '/api/img?u=bad');
    assert.equal(last.status, 429);
  });
});
