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

import { allocateGroups, groupingFor } from '../public/js/sortMode.js';
import { layoutStore, setMap } from '../public/js/layoutStore.js';
import { layoutClothes } from '../public/js/clothesLayout.js';
import { MAPS } from '../public/js/maps.js';

const units = (n, cap = 6) => Array.from({ length: n }, (_, i) => ({ i, cap }));
const store = groupingFor('store');

test('allocateGroups: a group takes only the shelves it needs, one group per shelf', () => {
  const ps = [...Array(3).keys()].map((i) => mk('a' + i, { source: 'Best Buy', relevance: i }))
    .concat([...Array(8).keys()].map((i) => mk('b' + i, { source: 'Amazon', relevance: 10 + i })));
  const out = allocateGroups(ps, units(6), store);
  assert.deepEqual(out.map((o) => [o.label, o.items.length]), [['Amazon', 6], ['Amazon', 2], ['Best Buy', 3]]);
  assert.equal(new Set(out.map((o) => o.unit.i)).size, 3, 'no shelf is shared');
});

test('allocateGroups: when there are more groups than shelves the smallest merge into Other', () => {
  const ps = ['A', 'A', 'A', 'B', 'B', 'C', 'D', 'E'].map((s, i) => mk('p' + i, { source: s }));
  const out = allocateGroups(ps, units(3), store);
  assert.deepEqual(out.map((o) => o.label), ['A', 'B', 'Other Stores']);
  assert.equal(out.flatMap((o) => o.items).length, 8);
});

test('store sort on a real map: every product once, a sign per used shelf, no mixed shelves', () => {
  for (const map of MAPS) {
    setMap(map);
    const ps = Array.from({ length: 30 }, (_, i) => mk('p' + i, { source: ['Amazon', 'Target', 'Best Buy', 'Walmart'][i % 4 === 3 ? 2 : i % 3], related: i > 24, relevance: i }));
    for (const layout of [layoutStore(ps, { sort: 'store' }), layoutClothes(ps, { sort: 'store' }, map)]) {
      assert.ok(layout.unitLabels instanceof Map, map.id);
      const items = Array.isArray(layout) && layout[0]?.product ? layout.map((s) => s.product) : layout.flatMap((r) => r.items);
      assert.equal(new Set(items.map((p) => p.id)).size, items.length, map.id);
    }
    const slots = layoutStore(ps, { sort: 'store' });
    assert.ok(slots.unitLabels.size >= 2, map.id);
  }
});
