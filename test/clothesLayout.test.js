import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../public/js/maps.js';
import { setMap } from '../public/js/layoutStore.js';
import { layoutClothes, hangerX, inWindow, maxOffset, clampOffset, RAIL_WINDOW, RAIL_PITCH, RAIL_CAPACITY, RAIL_TARGET, ISLAND_RAIL_CAPACITY } from '../public/js/clothesLayout.js';

const mk = (id, price, tier, relevance, related = false) => ({
  id, title: 'T-Shirt ' + id, price: `$${price}`, extracted_price: price, rating: null, source: 's',
  thumbnail: null, link: null, relevance, related, tier,
});
const tiers = ['budget', 'mid', 'premium'];
const many = (n, relatedFrom = Infinity) => Array.from({ length: n }, (_, i) => mk('p' + i, 10 + i, tiers[i % 3], i, i >= relatedFrom));

test('empty input gives no rails', () => {
  assert.deepEqual(layoutClothes([], {}, MAPS[0]), []);
});

for (const map of MAPS) {
  test(`map "${map.id}": every product hangs exactly once, rails are within capacity and sit on a unit`, () => {
    setMap(map);
    const ps = many(60, 50);
    const rails = layoutClothes(ps, {}, map);
    const ids = rails.flatMap((r) => r.items.map((p) => p.id));
    assert.equal(ids.length, 60);
    assert.equal(new Set(ids).size, 60);
    for (const r of rails) {
      assert.ok(r.items.length > 0);
      assert.ok(r.items.length <= (r.kind === 'island' ? ISLAND_RAIL_CAPACITY : RAIL_CAPACITY), r.id);
      if (r.kind === 'wall') assert.ok(map.units.some((u) => u.x === r.position.x && u.z === r.position.z && u.rotY === r.rotation.y), r.id);
      else assert.deepEqual([r.position.x, r.position.z], [map.island.x, map.island.z]);
      for (let i = 1; i < r.items.length; i++) assert.ok(r.items[i - 1].relevance <= r.items[i].relevance, 'best match first');
    }
    assert.equal(new Set(rails.map((r) => r.id)).size, rails.length);
  });
}

test('the island rail takes the best in-budget matches; related items hang at the back', () => {
  setMap(MAPS[0]);
  const ps = [mk('over', 500, 'premium', 0), ...many(20, 15).map((p, i) => ({ ...p, id: 'q' + i, relevance: i + 1 }))];
  const rails = layoutClothes(ps, { min_price: 10, max_price: 100 }, MAPS[0]);
  const island = rails.find((r) => r.kind === 'island');
  assert.equal(island.items.length, 4);
  assert.ok(!island.items.some((p) => p.id === 'over'));
  assert.ok(rails.filter((r) => r.zone === 'back').flatMap((r) => r.items).some((p) => p.related));
});

test('hanger positions: the window is centred, offset slides it, windows clip', () => {
  assert.equal(hangerX(0, 0), -((RAIL_WINDOW - 1) / 2) * RAIL_PITCH);
  assert.equal(hangerX(RAIL_WINDOW - 1, 0), ((RAIL_WINDOW - 1) / 2) * RAIL_PITCH);
  assert.equal(hangerX(3, 3), hangerX(0, 0));
  assert.ok(inWindow(hangerX(0, 0)) && inWindow(hangerX(RAIL_WINDOW - 1, 0)));
  assert.ok(!inWindow(hangerX(RAIL_WINDOW, 0)));
  assert.ok(!inWindow(hangerX(0, 2)));
});

test('scrolling is clamped to the rail', () => {
  assert.equal(maxOffset(3), 0);
  assert.equal(maxOffset(RAIL_WINDOW), 0);
  assert.equal(maxOffset(RAIL_WINDOW + 5), 5);
  assert.equal(clampOffset(-2, 10), 0);
  assert.equal(clampOffset(99, 10), 4);
});

test('rails fill to about RAIL_TARGET, so most hold more than one window to flip through', () => {
  setMap(MAPS[0]);
  const rails = layoutClothes(many(60, 50), {}, MAPS[0]).filter((r) => r.kind === 'wall');
  assert.ok(rails.some((r) => r.items.length > RAIL_WINDOW), 'something to flip through');
  for (const r of rails) assert.ok(r.items.length <= Math.ceil(RAIL_TARGET * 1.5) + 1, `${r.id} has ${r.items.length}`);
  const few = layoutClothes(many(8), {}, MAPS[0]);
  assert.ok(few.every((r) => r.items.length > 0));
});
