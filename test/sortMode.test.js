import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SORTS, normalizeSort, brandOf, storeOf, sortPlan } from '../public/js/sortMode.js';
import { assignZones, zoneLabelsFor } from '../public/js/layoutStore.js';

const mk = (id, over = {}) => ({ id, title: 'Acme Thing ' + id, extracted_price: 20, rating: null, source: 'Amazon', relevance: Number(id.slice(1)), related: false, tier: 'mid', ...over });
const ids = (l) => l.map((p) => p.id);

test('normalizeSort falls back to price for anything unknown', () => {
  assert.deepEqual(SORTS, ['price', 'rating', 'store', 'brand']);
  for (const s of SORTS) assert.equal(normalizeSort(s), s);
  for (const bad of [undefined, null, '', 'cheapest', 5]) assert.equal(normalizeSort(bad), 'price');
});

test('brandOf: the product\'s own brand, else the title\'s first word, else Other', () => {
  assert.equal(brandOf({ brand: ' Sony ', title: 'x' }), 'Sony');
  assert.equal(brandOf({ title: 'Sony WH-1000XM5 Wireless Headphones' }), 'Sony');
  assert.equal(brandOf({ title: '(Apple) AirPods' }), 'Apple');
  for (const t of ['The Best Headphones', '2-Pack cables', 'New Balance 574', '', undefined]) {
    assert.equal(brandOf({ title: t }), t === 'New Balance 574' ? 'Other' : 'Other', String(t));
  }
  assert.equal(storeOf({ source: ' Target ' }), 'Target');
  assert.equal(storeOf({}), 'Other');
});

test('price (the default) keeps the tier zones and the map\'s own signs', () => {
  const ps = [mk('p0', { tier: 'budget' }), mk('p1', { tier: 'premium' }), mk('p2', { tier: 'mid' })];
  const z = assignZones(ps, { sort: 'price' }, { island: 0 });
  assert.deepEqual([ids(z.left), ids(z.right), ids(z.center)], [['p0'], ['p1'], ['p2']]);
  assert.equal(zoneLabelsFor(ps, 'price'), null);
  assert.deepEqual(assignZones(ps, {}, { island: 0 }), z, 'no sort given = price');
});

test('rating: top rated right, well rated centre, the rest left, best first in each', () => {
  const ps = [mk('p0', { rating: 4.2 }), mk('p1', { rating: 4.9 }), mk('p2', { rating: 3.1 }), mk('p3'), mk('p4', { rating: 4.6 }), mk('p5', { rating: 4.5, related: true })];
  const z = assignZones(ps, { sort: 'rating' }, { island: 0 });
  assert.deepEqual(ids(z.right), ['p1', 'p4']);
  assert.deepEqual(ids(z.center), ['p0']);
  assert.deepEqual(ids(z.left), ['p2', 'p3']);
  assert.deepEqual(ids(z.back), ['p5'], 'related stays at the back wall');
  assert.deepEqual(zoneLabelsFor(ps, 'rating'), { right: 'Top Rated', center: 'Well Rated', left: 'Other Picks' });
});

test('store: the biggest store in the centre, then left, then right; a fourth store shares the right', () => {
  const src = ['Amazon', 'Amazon', 'Amazon', 'Target', 'Target', 'Walmart', 'Best Buy'];
  const ps = src.map((s, i) => mk('p' + i, { source: s }));
  const z = assignZones(ps, { sort: 'store' }, { island: 0 });
  assert.deepEqual(ids(z.center), ['p0', 'p1', 'p2']);
  assert.deepEqual(ids(z.left), ['p3', 'p4']);
  assert.deepEqual(ids(z.right), ['p6', 'p5'], 'equal-sized groups go in name order');
  assert.deepEqual(zoneLabelsFor(ps, 'store'), { center: 'Amazon', left: 'Target', right: 'Other Stores' });
  assert.deepEqual(zoneLabelsFor(ps.slice(0, 6), 'store'), { center: 'Amazon', left: 'Target', right: 'Walmart' });
});

test('brand groups the same way, from the title', () => {
  const ps = ['Sony A', 'Bose B', 'Sony C', 'Sony D', 'Bose E'].map((t, i) => mk('p' + i, { title: t }));
  const z = assignZones(ps, { sort: 'brand' }, { island: 0 });
  assert.deepEqual(ids(z.center), ['p0', 'p2', 'p3']);
  assert.deepEqual(ids(z.left), ['p1', 'p4']);
  assert.deepEqual(zoneLabelsFor(ps, 'brand'), { center: 'Sony', left: 'Bose' });
});

test('every sort places every product exactly once', () => {
  const ps = Array.from({ length: 24 }, (_, i) => mk('p' + i, { rating: (i % 5) + 0.5, source: 'S' + (i % 5), title: 'B' + (i % 6) + ' item', tier: ['budget', 'mid', 'premium'][i % 3], related: i > 19 }));
  for (const sort of SORTS) {
    const z = assignZones(ps, { sort }, {});
    const all = ['island', 'center', 'back', 'left', 'right'].flatMap((k) => ids(z[k]));
    assert.equal(new Set(all).size, all.length, sort);
    assert.equal(all.length, 24, sort);
  }
  assert.ok(sortPlan(ps, 'brand').compare);
});
