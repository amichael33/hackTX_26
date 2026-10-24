import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from '../public/js/storage.js';
import { createCart } from '../public/js/cart.js';

const prod = (id, price = 1) => ({ id, title: 't' + id, price: '$' + price, extracted_price: price, source: 's', link: 'https://x.test', thumbnail: null, extra: 'dropped' });

test('add then has, items()[0] matches, extra fields dropped', () => {
  const c = createCart(memoryStorage());
  assert.equal(c.add(prod('a')), true);
  assert.equal(c.has('a'), true);
  assert.equal(c.items()[0].id, 'a');
  assert.equal('extra' in c.items()[0], false);
  assert.equal(typeof c.items()[0].savedAt, 'number');
});

test('newest first and items() is a copy', () => {
  const c = createCart(memoryStorage());
  c.add(prod('a')); c.add(prod('b'));
  assert.deepEqual(c.items().map((i) => i.id), ['b', 'a']);
  c.items().pop();
  assert.equal(c.items().length, 2);
});

test('duplicate add keeps 1 item and returns false', () => {
  const c = createCart(memoryStorage());
  assert.equal(c.add(prod('a')), true);
  assert.equal(c.add(prod('a')), false);
  assert.equal(c.items().length, 1);
});

test('51st distinct add is rejected', () => {
  const c = createCart(memoryStorage());
  for (let i = 0; i < 50; i++) assert.equal(c.add(prod('p' + i)), true);
  assert.equal(c.add(prod('p50')), false);
  assert.equal(c.items().length, 50);
});

test('remove and clear', () => {
  const c = createCart(memoryStorage());
  c.add(prod('a')); c.add(prod('b'));
  assert.equal(c.remove('a'), true);
  assert.equal(c.remove('a'), false);
  assert.equal(c.has('a'), false);
  c.clear();
  assert.equal(c.items().length, 0);
});

test('total rounds to cents', () => {
  const c = createCart(memoryStorage());
  c.add(prod('a', 19.99)); c.add(prod('b', 0.01)); c.add(prod('c', 5.5));
  assert.equal(c.total(), 25.5);
});

test('persists across carts on the same storage', () => {
  const s = memoryStorage();
  createCart(s).add(prod('a'));
  assert.equal(createCart(s).has('a'), true);
});

test('bad JSON, non-array, and invalid items are dropped on load', () => {
  const s = memoryStorage();
  s.setItem('store.cart.v1', '{bad');
  assert.deepEqual(createCart(s).items(), []);
  s.setItem('store.cart.v1', '{"a":1}');
  assert.deepEqual(createCart(s).items(), []);
  s.setItem('store.cart.v1', '[{"id":1},{"id":"a","extracted_price":3,"title":"t"}]');
  assert.deepEqual(createCart(s).items().map((i) => i.id), ['a']);
});

test('throwing setItem is swallowed; cart works in memory', () => {
  const s = { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} };
  const c = createCart(s);
  assert.equal(c.add(prod('a')), true);
  assert.equal(c.has('a'), true);
});

test('throwing getItem is swallowed', () => {
  const s = { getItem() { throw new Error('blocked'); }, setItem() {}, removeItem() {} };
  assert.deepEqual(createCart(s).items(), []);
});

test('change fires once per successful change, after the write, not on rejects', () => {
  const s = memoryStorage();
  const c = createCart(s);
  let n = 0; let seen;
  const off = c.on('change', () => { n++; seen = s.getItem('store.cart.v1'); });
  c.add(prod('a'));
  assert.equal(n, 1);
  assert.match(seen, /"a"/);
  c.add(prod('a'));
  assert.equal(n, 1);
  c.remove('zzz');
  assert.equal(n, 1);
  c.remove('a');
  assert.equal(n, 2);
  off();
  c.add(prod('b'));
  assert.equal(n, 2);
});
