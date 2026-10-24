import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

async function withApp(fetchImpl, fn) {
  const server = createApp({ fetchImpl }).listen(0);
  try {
    const { port } = server.address();
    return await fn((u) => fetch(`http://127.0.0.1:${port}/api/img?u=${encodeURIComponent(u)}`));
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const okFetch = (type = 'image/png', body = png, headers = {}) => async () =>
  new Response(body, { status: 200, headers: { 'content-type': type, ...headers } });
const neverCalled = async () => { throw new Error('upstream must not be called'); };

test('rejects non-https, private hosts and non-allowlisted hosts with 400', async () => {
  await withApp(neverCalled, async (get) => {
    for (const u of ['http://evil.com/x.png', 'https://169.254.169.254/', 'https://evilserpapi.com/x.png',
      'https://serpapi.com.evil.com/x.png', 'http://serpapi.com/x.png', 'not a url', '']) {
      assert.equal((await get(u)).status, 400, u);
    }
  });
});

test('non-image upstream -> 502', async () => {
  await withApp(okFetch('text/html', 'hi'), async (get) => {
    assert.equal((await get('https://encrypted-tbn1.gstatic.com/shopping?q=tbn:x')).status, 502);
  });
});

test('upstream error status -> 502 without echoing the body', async () => {
  await withApp(async () => new Response('SECRET upstream', { status: 500, headers: { 'content-type': 'image/png' } }), async (get) => {
    const res = await get('https://serpapi.com/images/a.png');
    assert.equal(res.status, 502);
    assert.ok(!(await res.text()).includes('SECRET'));
  });
});

test('allowlisted host + image -> 200 with bytes and cache header', async () => {
  await withApp(okFetch(), async (get) => {
    for (const u of ['https://encrypted-tbn1.gstatic.com/shopping?q=tbn:x', 'https://serpapi.com/images/a.png', 'https://lh3.googleusercontent.com/a']) {
      const res = await get(u);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.equal(res.headers.get('cache-control'), 'public, max-age=86400');
      assert.deepEqual(new Uint8Array(await res.arrayBuffer()), png);
    }
  });
});

test('oversize (content-length or actual bytes) -> 502', async () => {
  await withApp(okFetch('image/png', png, { 'content-length': String(3 * 1024 * 1024) }), async (get) => {
    assert.equal((await get('https://serpapi.com/a.png')).status, 502);
  });
  await withApp(okFetch('image/png', new Uint8Array(2 * 1024 * 1024 + 10)), async (get) => {
    assert.equal((await get('https://serpapi.com/a.png')).status, 502);
  });
});

test('upstream network error -> 502', async () => {
  await withApp(async () => { throw new Error('boom'); }, async (get) => {
    assert.equal((await get('https://serpapi.com/a.png')).status, 502);
  });
});

test('responses carry nosniff and CSP sandbox headers', async () => {
  await withApp(okFetch(), async (get) => {
    const res = await get('https://serpapi.com/images/a.png');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('content-security-policy'), 'sandbox');
  });
});

test('urls with an explicit port are rejected with 400', async () => {
  await withApp(neverCalled, async (get) => {
    assert.equal((await get('https://serpapi.com:8443/a.png')).status, 400);
    assert.equal((await get('https://lh3.googleusercontent.com:22/a')).status, 400);
  });
});
