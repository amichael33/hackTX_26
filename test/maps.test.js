import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../public/js/collide.js');
const { MAPS, DEFAULT_MAP_ID, getMap, obstaclesFor, boundsFor, ZONE_LABELS } = await import('../public/js/maps.js');
const L = await import('../public/js/layoutStore.js');
const C = globalThis.StoreCollide;
const DEFAULT_OBSTACLES = C.OBSTACLES.map((o) => ({ ...o })); // collide.js's built-in (classic) footprints, before any setMap

const key = (p) => `${p.x},${p.y},${p.z}`;
const mk = (id, price, tier, relevance, related = false) => ({
  id, title: id, price: `$${price}`, extracted_price: price, rating: null, source: 's',
  thumbnail: null, link: null, relevance, related, tier,
});
const overlap = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

test('maps: unique ids, default exists, unknown id falls back to the default', () => {
  assert.equal(new Set(MAPS.map((m) => m.id)).size, MAPS.length);
  assert.equal(getMap(DEFAULT_MAP_ID).id, DEFAULT_MAP_ID);
  assert.equal(getMap('nope').id, DEFAULT_MAP_ID);
  assert.equal(getMap(null).id, DEFAULT_MAP_ID);
  assert.ok(MAPS.length >= 3);
});

for (const map of MAPS) {
  test(`map "${map.id}": everything is inside the room and nothing overlaps`, () => {
    const hw = map.room.width / 2, hd = map.room.depth / 2;
    const obs = obstaclesFor(map);
    for (const o of obs) {
      assert.ok(o.minX >= -hw - 0.3 && o.maxX <= hw + 0.3 && o.minZ >= -hd - 0.3 && o.maxZ <= hd + 0.3, `outside room: ${JSON.stringify(o)}`);
    }
    const deskGroup = obs.length - 3; // counter, return and clerk are the last three; they overlap each other by design
    for (let i = 0; i < obs.length; i++) for (let j = i + 1; j < obs.length; j++) {
      if (i >= deskGroup && j >= deskGroup) continue;
      assert.ok(!overlap(obs[i], obs[j]), `obstacles ${i} and ${j} overlap`);
    }
    for (const u of map.units) assert.ok(ZONE_LABELS[u.zone], `unit zone ${u.zone}`);
    // The player starts inside the walkable bounds and not inside any obstacle.
    const b = boundsFor(map);
    assert.ok(map.spawn.x >= b.minX && map.spawn.x <= b.maxX && map.spawn.z >= b.minZ && map.spawn.z <= b.maxZ);
    C.setMap({ obstacles: obs, halfW: hw, halfD: hd });
    assert.ok(C.circleClear(map.spawn.x, map.spawn.z, C.PLAYER_RADIUS), 'spawn is blocked');
    // The corkboard sits on the back wall, clear of the back shelves, and the back wall is walkable in front of it.
    const bd = map.board;
    assert.ok(bd.x - bd.width / 2 >= -hw && bd.x + bd.width / 2 <= hw, 'board wider than the wall');
    assert.ok(Math.abs(bd.z) > hd - 0.1);
    for (const u of map.units.filter((x) => x.zone === 'back')) assert.ok(u.x + 1 <= bd.x - bd.width / 2 + 1e-9, 'back shelf overlaps the board');
    assert.ok(C.circleClear(bd.x, -hd + 1.5, C.PLAYER_RADIUS), 'cannot stand in front of the board');
    assert.ok(bd.bannerY + 0.15 <= map.room.height, 'sign above the ceiling');
  });

  test(`map "${map.id}": every product slot is unique, in the room, and clear of obstacles`, () => {
    L.setMap(map);
    const hw = map.room.width / 2, hd = map.room.depth / 2;
    const slots = Object.values(L.ZONES).flatMap((z) => z.slots);
    assert.equal(new Set(slots.map((s) => key(s.position))).size, slots.length);
    assert.equal(slots.length, Object.values(L.ZONES).reduce((n, z) => n + z.capacity, 0));
    for (const s of slots) {
      assert.ok(Math.abs(s.position.x) < hw && Math.abs(s.position.z) < hd, `slot outside the room: ${key(s.position)}`);
    }
    // 60 mixed products fit or are dropped without error, with unique positions.
    const tiers = ['budget', 'mid', 'premium'];
    const ps = Array.from({ length: 60 }, (_, i) => mk('p' + i, 10 + i, tiers[i % 3], i, i >= 50));
    const placed = L.layoutStore(ps, {});
    assert.ok(placed.length > 0 && placed.length <= 60);
    assert.equal(new Set(placed.map((s) => key(s.position))).size, placed.length);
    assert.equal(new Set(placed.map((s) => s.product.id)).size, placed.length);
  });
}

test('the classic map reproduces collide.js\'s built-in footprints', () => {
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const norm = (o) => `${r3(o.minX)},${r3(o.maxX)},${r3(o.minZ)},${r3(o.maxZ)}`;
  assert.deepEqual(obstaclesFor(getMap('classic')).map(norm).sort(), DEFAULT_OBSTACLES.map(norm).sort());
});

test('setMap swaps footprints in place and changes the room size', () => {
  const ref = C.OBSTACLES;
  C.setMap({ obstacles: [{ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }], halfW: 3, halfD: 4 });
  assert.equal(C.OBSTACLES, ref);
  assert.equal(C.OBSTACLES.length, 1);
  assert.equal(C.circleClear(2.9, 0, 0.3), false); // outside the 3 m half-width
  assert.equal(C.circleClear(-2, -2, 0.3), true);
  assert.equal(C.circleClear(0.5, 0.5, 0.3), false);
});

test('every map uses known shelf styles and a known clerk outfit', () => {
  const styles = ['oak', 'cubby', 'rack', 'timber'], outfits = ['suit', 'apron', 'hivis', 'tabard'];
  for (const m of MAPS) {
    for (const [zone, style] of Object.entries(m.shelfStyles ?? {})) {
      assert.ok(styles.includes(style), `${m.id}.${zone}: ${style}`);
      assert.ok(ZONE_LABELS[zone], `${m.id}: unknown zone ${zone}`);
    }
    assert.ok(outfits.includes(m.clerkOutfit), `${m.id} outfit ${m.clerkOutfit}`);
    assert.ok(!m.desk.body, `${m.id}: desk is the position; colors live in deskStyle`);
  }
  assert.ok(new Set(MAPS.map((m) => m.clerkOutfit)).size === MAPS.length, 'each map has its own outfit');
});

for (const map of MAPS) {
  test(`map "${map.id}": the back-wall accent panel sits behind the whole corkboard and the back shelves`, async () => {
    const { accentPanelFor } = await import('../public/js/maps.js');
    const p = accentPanelFor(map);
    const left = p.x - p.width / 2, right = p.x + p.width / 2, hw = map.room.width / 2;
    const b = map.board;
    assert.ok(left <= b.x - b.width / 2 - 0.08 + 1e-9 && right >= b.x + b.width / 2 + 0.08 - 1e-9, `${map.id}: board sticks out of the panel (${left}..${right})`);
    for (const u of map.units.filter((x) => x.zone === 'back')) assert.ok(left <= u.x - 1 && right >= u.x + 1, `${map.id}: back shelf outside the panel`);
    assert.ok(left >= -hw && right <= hw, `${map.id}: panel past the walls`);
    // The board's height fits the panel (0.2..2.8) too, frame included.
    assert.ok(b.y - b.height / 2 - 0.08 >= 0.2 && b.y + b.height / 2 + 0.08 <= 2.8, `${map.id}: board taller than the panel`);
  });
}

test('every map names a known cart; each map has its own', async () => {
  const known = ['cart', 'basket', 'dolly', 'wheelbarrow'];
  for (const m of MAPS) assert.ok(known.includes(m.cartVariant), `${m.id}: ${m.cartVariant}`);
  assert.equal(new Set(MAPS.map((m) => m.cartVariant)).size, MAPS.length);
  const src = (await import('node:fs')).readFileSync(new URL('../public/js/components/shopping-cart.js', import.meta.url), 'utf8');
  for (const v of known) assert.ok(new RegExp(`\\b${v}:\\s+\\{ build:`).test(src), `shopping-cart.js has no ${v} model`);
});

test('the castle: a courtyard between the desk and the spawn, a river across the hall, a bridge each side of the desk', async () => {
  const { riverFor, walkHeight } = await import('../public/js/maps.js');
  const castle = getMap('castle');
  const rv = riverFor(castle);
  assert.ok(rv, 'castle has a river');
  assert.equal(riverFor(getMap('classic')), null);
  // The river lies between the desk and the spawn, with open floor on both sides of it.
  assert.ok(castle.desk.z + 1 < rv.bridges[0].zStart, 'room in front of the desk before the bridges');
  assert.ok(rv.bridges[0].zEnd + 2 < castle.spawn.z, 'a courtyard between the bridges and the spawn');
  // Two bridges, one each side of the desk.
  assert.equal(rv.bridges.length, 2);
  assert.ok(rv.bridges[0].x < castle.desk.x - 2 && rv.bridges[1].x > castle.desk.x + 2);
  const obs = obstaclesFor(castle), hw = castle.room.width / 2;
  C.setMap({ obstacles: obs, halfW: hw, halfD: castle.room.depth / 2 });
  // The water is a wall (not under a bridge), and a player can walk each bridge's centre line from the spawn to the desk.
  for (const x of [-9 + 0.5, -2, 0, 2, 9 - 0.5]) assert.ok(!C.circleClear(x, rv.z, C.PLAYER_RADIUS), `water at x ${x}`);
  for (const b of rv.bridges) {
    for (let z = castle.spawn.z; z >= castle.desk.z + 1.5; z -= 0.25) assert.ok(C.circleClear(b.x, z, C.PLAYER_RADIUS), `bridge at x ${b.x} blocked at z ${z}`);
    assert.ok(!C.circleClear(b.x - b.width / 2, rv.z, C.PLAYER_RADIUS), 'the stone side of the bridge holds the player in');
  }
  // The deck arches: flat on the floor outside the bridge, highest in the middle, never negative.
  const b = rv.bridges[0], mid = (b.zStart + b.zEnd) / 2;
  assert.equal(walkHeight(castle, b.x, b.zStart - 0.5), 0);
  assert.equal(walkHeight(castle, 0, mid), 0, 'no height between the bridges');
  assert.ok(Math.abs(walkHeight(castle, b.x, mid) - castle.river.arch) < 1e-9);
  assert.ok(walkHeight(castle, b.x, rv.zMin) > 0.3, 'the deck clears the water');
  for (let z = b.zStart; z <= b.zEnd; z += 0.1) assert.ok(walkHeight(castle, b.x, z) >= 0);
  assert.equal(walkHeight(getMap('classic'), 0, 5), 0);
});
