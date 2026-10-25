import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrustProxy, listenHost } from '../server/lib/env.js';
import { createApp } from '../server/app.js';

test('parseTrustProxy: default is loopback; numbers, booleans and range lists are understood', () => {
  assert.equal(parseTrustProxy(undefined), 'loopback');
  assert.equal(parseTrustProxy(''), 'loopback');
  assert.equal(parseTrustProxy('2'), 2);
  assert.equal(parseTrustProxy('TRUE'), true);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('loopback, uniquelocal'), 'loopback, uniquelocal');
  assert.equal(parseTrustProxy(undefined, 'uniquelocal'), 'uniquelocal');
});

test('listenHost: local only in production unless HOST says otherwise; unrestricted in development', () => {
  assert.equal(listenHost({ NODE_ENV: 'production' }), '127.0.0.1');
  assert.equal(listenHost({ NODE_ENV: 'production', HOST: '0.0.0.0' }), '0.0.0.0');
  assert.equal(listenHost({}), undefined);
  assert.equal(listenHost({ HOST: '::1' }), '::1');
});

async function hit(deps, headersFor, n) {
  const server = createApp(deps).listen(0);
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/search`;
    const codes = [];
    for (let i = 0; i < n; i++) {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headersFor(i) }, body: JSON.stringify({ query: { query: 'x' }, demo: true }) });
      codes.push(res.status);
    }
    return codes;
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

test('trustProxy decides whose X-Forwarded-For counts: a trusted proxy gives every visitor their own rate limit, an untrusted one does not', async () => {
  // Default (loopback): the test client is on loopback, so its X-Forwarded-For is believed: 11 different visitors, none limited.
  const believed = await hit({}, (i) => ({ 'x-forwarded-for': `203.0.113.${i + 1}` }), 11);
  assert.ok(believed.every((c) => c === 200), `believed: ${believed}`);
  // uniquelocal only trusts private ranges, and loopback is not one: the header is ignored and all 11 share one client, so the 11th is limited.
  const ignored = await hit({ trustProxy: 'uniquelocal' }, (i) => ({ 'x-forwarded-for': `203.0.113.${i + 1}` }), 11);
  assert.equal(ignored[10], 429, `ignored: ${ignored}`);
});
