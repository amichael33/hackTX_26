import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CITY, reverseGeocode, normalizeTypedLocation } from '../server/lib/geocode.js';
import { createApp } from '../server/app.js';

const okFetch = (body) => async (url, opts) => {
  okFetch.url = url; okFetch.opts = opts;
  return { ok: true, json: async () => body };
};

test('reverseGeocode builds city, state, country', async () => {
  const f = okFetch({ address: { city: 'Austin', state: 'Texas', country: 'United States' } });
  assert.equal(await reverseGeocode(30.27, -97.74, f), 'Austin, Texas, United States');
  assert.ok(okFetch.url.startsWith('https://nominatim.openstreetmap.org/reverse?'));
  assert.ok(okFetch.url.includes('format=jsonv2') && okFetch.url.includes('zoom=10'));
  assert.ok(okFetch.url.includes('lat=30.27') && okFetch.url.includes('lon=-97.74'));
  assert.equal(okFetch.opts.headers['User-Agent'], 'hacktx-store/1.0');
});

test('reverseGeocode falls back to town, and throws with no city part', async () => {
  const f = okFetch({ address: { town: 'Smallville', state: 'Kansas', country: 'United States' } });
  assert.equal(await reverseGeocode(1, 2, f), 'Smallville, Kansas, United States');
  await assert.rejects(reverseGeocode(1, 2, okFetch({ address: { state: 'Kansas' } })));
});

test('normalizeTypedLocation trims, collapses, defaults', () => {
  assert.equal(normalizeTypedLocation('  78701 '), '78701');
  assert.equal(normalizeTypedLocation(' New   York  City '), 'New York City');
  assert.equal(normalizeTypedLocation('   '), DEFAULT_CITY);
  assert.equal(DEFAULT_CITY, 'Austin, Texas, United States');
});

async function geocode(fetchImpl, body) {
  const server = createApp({ fetchImpl }).listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/geocode`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

test('route: fetch failure returns default city with 200', async () => {
  const r = await geocode(async () => { throw new Error('down'); }, { lat: 30.2, lng: -97.7 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { city: DEFAULT_CITY });
});

test('route: coordinates are rounded to 2 decimals before fetch', async () => {
  let seen;
  const f = async (url) => { seen = url; return { ok: true, json: async () => ({ address: { city: 'Austin', state: 'Texas', country: 'United States' } }) }; };
  const r = await geocode(f, { lat: 30.26789, lng: -97.74321 });
  assert.deepEqual(r.json, { city: 'Austin, Texas, United States' });
  assert.ok(seen.includes('lat=30.27') && seen.includes('lon=-97.74'));
  assert.ok(!seen.includes('30.26789'));
});

test('route: invalid coordinates return default city', async () => {
  const r = await geocode(async () => { throw new Error('should not be called'); }, { lat: 'x' });
  assert.deepEqual(r.json, { city: DEFAULT_CITY });
});
