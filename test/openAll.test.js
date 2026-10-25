import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linksOf, openAll, openAllToSellers } from '../public/js/openAll.js';

const items = [{ link: 'https://a.example/1' }, { link: 'https://a.example/1' }, { link: null }, { link: 'javascript:alert(1)' }, { link: ' http://b.example/2 ' }, {}];
const shop = (t) => 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(t);

test('linksOf keeps only distinct http(s) links', () => {
  assert.deepEqual(linksOf(items), ['https://a.example/1', 'http://b.example/2']);
  assert.deepEqual(linksOf(undefined), []);
});

test('openAll opens each link once, in order, and counts the skipped items', () => {
  const calls = [];
  const res = openAll(items, (...a) => { calls.push(a); return {}; });
  assert.deepEqual(calls.map((c) => c[0]), ['https://a.example/1', 'http://b.example/2']);
  assert.ok(calls.every((c) => c[1] === '_blank'));
  assert.deepEqual(res, { total: 2, opened: 2, skipped: 4 });
});

test('openAll reports blocked tabs (null or a throw) without failing', () => {
  assert.deepEqual(openAll(items, () => null), { total: 2, opened: 0, skipped: 4 });
  assert.deepEqual(openAll(items, () => { throw new Error('blocked'); }), { total: 2, opened: 0, skipped: 4 });
  assert.deepEqual(openAll([], () => ({})), { total: 0, opened: 0, skipped: 0 });
});

test('an item with no usable link falls back to a shopping search for its title', () => {
  assert.deepEqual(linksOf([{ title: 'Red Mug', link: null }, { title: 'Red Mug', link: 'javascript:x' }, { title: 'Blue Cup' }]), [shop('Red Mug'), shop('Blue Cup')]);
});

// --- straight to the sellers ---

function fakeWindow() {
  const calls = [];
  const tabs = [];
  const open = (url, target) => { const tab = { url, target, location: { href: url }, closed: false, close() { this.closed = true; } }; calls.push([url, target]); tabs.push(tab); return tab; };
  return { open, calls, tabs };
}

test('openAllToSellers: items with a page_token open blank now, then go to the seller; the rest open directly', async () => {
  const w = fakeWindow();
  const seen = [];
  const res = openAllToSellers([
    { id: 'a', title: 'A', link: 'https://google.example/a', page_token: 'tok-a', source: 'Shop A' },
    { id: 'b', title: 'B', link: 'https://amazon.example/b' },
  ], { open: w.open, resolve: async (i) => { seen.push(i.id); return 'https://seller-a.example/p'; } });
  assert.deepEqual([res.total, res.opened, res.skipped], [2, 2, 0]);
  assert.deepEqual(w.calls.map((c) => c[0]), ['about:blank', 'https://amazon.example/b'], 'every tab is opened inside the click');
  await res.done;
  assert.deepEqual(seen, ['a']);
  assert.equal(w.tabs[0].location.href, 'https://seller-a.example/p');
  assert.equal(w.tabs[1].location.href, 'https://amazon.example/b');
});

test('openAllToSellers: a failed or empty lookup falls back to the item\'s own link; with no link the blank tab closes', async () => {
  const w = fakeWindow();
  const res = openAllToSellers([
    { id: 'a', link: 'https://google.example/a', page_token: 't1' },
    { id: 'b', link: 'https://google.example/b', page_token: 't2' },
    { id: 'c', link: null, title: '', page_token: 't3' },
  ], { open: w.open, resolve: async (i) => { if (i.id === 'a') throw new Error('down'); return null; } });
  await res.done;
  assert.equal(w.tabs[0].location.href, 'https://google.example/a');
  assert.equal(w.tabs[1].location.href, 'https://google.example/b');
  assert.equal(w.tabs[2].closed, true);
});

test('openAllToSellers: no resolver (demo) means no blank tabs; blocked pop-ups are counted; duplicates and linkless items are skipped', async () => {
  const w = fakeWindow();
  const demo = openAllToSellers([{ id: 'a', link: 'https://x.example/1', page_token: 't' }, { id: 'a2', link: 'https://x.example/1' }, {}], { open: w.open, resolve: null });
  assert.deepEqual(w.calls.map((c) => c[0]), ['https://x.example/1']);
  assert.deepEqual([demo.total, demo.opened, demo.skipped], [1, 1, 1]);
  const blocked = openAllToSellers([{ id: 'a', link: 'https://x.example/1', page_token: 't' }], { open: () => null, resolve: async () => 'https://s.example' });
  assert.deepEqual([blocked.total, blocked.opened], [1, 0]);
  await blocked.done; // nothing to navigate, and no throw
});

test('the cart keeps a product\'s page_token so Open all can find the seller later', async () => {
  const { createCart } = await import('../public/js/cart.js');
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const cart = createCart(storage, 'k');
  cart.add({ id: 'p1', title: 'T', extracted_price: 5, link: 'https://g.example', source: 'S', page_token: 'tok' });
  assert.equal(cart.items()[0].page_token, 'tok');
  assert.equal(createCart(storage, 'k').items()[0].page_token, 'tok', 'survives a reload');
});
