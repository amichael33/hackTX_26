import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from '../public/js/storage.js';
import { createSavedSearches } from '../public/js/savedSearches.js';

const prods = (n = 2) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, title: 't' + i, extracted_price: i + 1 }));
const mk = (q, city = 'Austin') => ({ query: { query: q }, city, products: prods(), stickers: {} });

test('keeps at most 10, oldest dropped', () => {
  const s = createSavedSearches(memoryStorage());
  for (let i = 0; i < 11; i++) s.save(mk('q' + i));
  const l = s.list();
  assert.equal(l.length, 10);
  assert.equal(l[0].query.query, 'q10');
  assert.ok(!l.some((e) => e.query.query === 'q0'));
});

test('same query (case/trim) and city replaces older', () => {
  const s = createSavedSearches(memoryStorage());
  const a = s.save(mk('Apple Watch'));
  const b = s.save(mk('apple watch '));
  assert.equal(s.list().length, 1);
  assert.equal(s.list()[0].id, b.id);
  assert.notEqual(a.id, b.id);
});

test('same query different city keeps both', () => {
  const s = createSavedSearches(memoryStorage());
  s.save(mk('x', 'Austin'));
  s.save(mk('x', 'Dallas'));
  assert.equal(s.list().length, 2);
});

test('products capped at 30', () => {
  const s = createSavedSearches(memoryStorage());
  const e = s.save({ ...mk('x'), products: prods(50) });
  assert.equal(e.products.length, 30);
  assert.equal(s.get(e.id).products.length, 30);
});

test('updateStickers persists across instances', () => {
  const st = memoryStorage();
  const s = createSavedSearches(st);
  const e = s.save(mk('x'));
  s.updateStickers(e.id, { p0: 'joke' });
  assert.deepEqual(createSavedSearches(st).get(e.id).stickers, { p0: 'joke' });
});

test('remove deletes', () => {
  const s = createSavedSearches(memoryStorage());
  const e = s.save(mk('x'));
  s.remove(e.id);
  assert.deepEqual(s.list(), []);
});

test('corrupt storage gives []', () => {
  const st = memoryStorage();
  st.setItem('store.searches.v1', '{not json');
  assert.deepEqual(createSavedSearches(st).list(), []);
  st.setItem('store.searches.v1', JSON.stringify([{ nope: 1 }, 5, null]));
  assert.deepEqual(createSavedSearches(st).list(), []);
});

test('quota error on first write drops oldest and retries', () => {
  const inner = memoryStorage();
  let calls = 0;
  const st = {
    getItem: (k) => inner.getItem(k),
    setItem(k, v) {
      calls++;
      if (calls === 4) { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
      inner.setItem(k, v);
    },
  };
  const s = createSavedSearches(st);
  s.save(mk('a')); s.save(mk('b')); s.save(mk('c'));
  const e = s.save(mk('d')); // 4th write throws once
  assert.ok(e);
  const qs = s.list().map((x) => x.query.query);
  assert.deepEqual(qs, ['d', 'c', 'b']);
  assert.deepEqual(createSavedSearches(st).list().map((x) => x.query.query), ['d', 'c', 'b']);
});

test('always-throwing storage does not throw', () => {
  const st = { getItem: () => null, setItem() { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; } };
  const s = createSavedSearches(st);
  assert.doesNotThrow(() => s.save(mk('a')));
  assert.doesNotThrow(() => s.updateStickers('zzz', {}));
});
