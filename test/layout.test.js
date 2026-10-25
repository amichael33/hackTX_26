import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutStore, ZONES } from '../public/js/layoutStore.js';

const mk = (id, price, tier, relevance, related = false) => ({
  id, title: id, price: `$${price}`, extracted_price: price, rating: null, source: 's',
  thumbnail: null, link: null, relevance, related, tier,
});
const r3 = (n) => Math.round(n * 1000) / 1000;
const key = (s) => `${r3(s.position.x)},${r3(s.position.y)},${r3(s.position.z)}`;

test('empty input gives no slots', () => {
  assert.deepEqual(layoutStore([], {}), []);
});

test('island holds <=4, includes in-budget relevance 0, excludes over-budget relevance 0', () => {
  const ps = [mk('over', 500, 'premium', 0), mk('best', 20, 'budget', 1), ...[2, 3, 4, 5, 6].map((i) => mk('p' + i, 30, 'mid', i))];
  const slots = layoutStore(ps, { min_price: 10, max_price: 100 });
  const island = slots.filter((s) => s.zone === 'island');
  assert.ok(island.length <= 4);
  assert.equal(island.length, 4);
  assert.ok(!island.some((s) => s.product.id === 'over'));
  const ps2 = [mk('inb', 20, 'budget', 0), ...ps.slice(0, 1), ...[1, 2, 3, 4].map((i) => mk('q' + i, 30, 'mid', i))];
  const s2 = layoutStore(ps2, { min_price: 10, max_price: 100 });
  assert.ok(s2.filter((s) => s.zone === 'island').some((s) => s.product.id === 'inb'));
});

test('island falls back to lowest relevance when none fit the budget', () => {
  const ps = [0, 1, 2, 3, 4].map((i) => mk('x' + i, 500, 'premium', i));
  const island = layoutStore(ps, { min_price: 1, max_price: 10 }).filter((s) => s.zone === 'island');
  assert.deepEqual(island.map((s) => s.product.id).sort(), ['x0', 'x1', 'x2', 'x3']);
});

test('30 mixed products: each id once, unique positions, zone geometry', () => {
  const tiers = ['budget', 'mid', 'premium'];
  const ps = Array.from({ length: 30 }, (_, i) => mk('m' + i, 10 + i, tiers[i % 3], i, i >= 24));
  const slots = layoutStore(ps, { min_price: null, max_price: null });
  assert.equal(slots.length, 30);
  assert.deepEqual(slots.map((s) => s.product.id).sort(), ps.map((p) => p.id).sort());
  assert.equal(new Set(slots.map(key)).size, 30);
  for (const s of slots) {
    if (s.zone === 'left') assert.ok(s.position.x < -6);
    if (s.zone === 'right') assert.ok(s.position.x > 6);
    if (s.zone === 'back') assert.ok(s.position.z < -8);
    assert.deepEqual(Object.keys(s.rotation), ['x', 'y', 'z']);
  }
});

test('30 budget products are all placed with unique positions', () => {
  const ps = Array.from({ length: 30 }, (_, i) => mk('b' + i, 5, 'budget', i));
  const slots = layoutStore(ps, {});
  assert.equal(slots.length, 30);
  assert.equal(new Set(slots.map(key)).size, 30);
  assert.ok(slots.some((s) => s.zone === 'left'));
});

test('products that fit nowhere are dropped', () => {
  const ps = Array.from({ length: 100 }, (_, i) => mk('d' + i, 5, 'mid', i));
  const slots = layoutStore(ps, {});
  assert.equal(slots.length, 76);
  assert.equal(new Set(slots.map(key)).size, 76);
});

test('back wall: two shelf units (12 slots), the rest belongs to the corkboard', () => {
  const tiers = ['budget', 'mid', 'premium'];
  const ps = Array.from({ length: 30 }, (_, i) => mk('s' + i, 10 + i, tiers[i % 3], i, i >= 20));
  const slots = layoutStore(ps, {});
  assert.equal(slots.length, 30);
  assert.ok(slots.filter((s) => s.zone === 'back').length <= 12);
  assert.equal(ZONES.back.capacity, 12);
  assert.equal(ZONES.similar, undefined);
  for (const s of slots.filter((x) => x.zone === 'back')) assert.ok(Math.abs(s.position.x) > 2.9);
});
