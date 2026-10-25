import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../public/js/collide.js');
const { MAPS, DEFAULT_MAP_ID, getMap, obstaclesFor, boundsFor, ZONE_LABELS, labelFor } = await import('../public/js/maps.js');
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

test('the castle river has two alligators, which keep clear of the bridges', async () => {
  const { riverFor } = await import('../public/js/maps.js');
  assert.equal(riverFor(getMap('castle')).gator, true);
  for (const id of ['classic', 'boutique', 'warehouse']) assert.equal(riverFor(getMap(id)), null);
  // sceneMap hands the bridge positions to the alligator, so it surfaces beside a bridge (not hidden under the deck).
  const src = (await import('node:fs')).readFileSync(new URL('../public/js/sceneMap.js', import.meta.url), 'utf8');
  assert.match(src, /const common = `range:.*avoid:\$\{rv\.bridges\.map/);
  assert.equal((src.match(/alligator: /g) ?? []).length, 2, 'two alligators');
});

for (const map of MAPS) {
  test(`map "${map.id}": windows and the front door sit in the walls, clear of shelves and each other`, async () => {
    const { openingsFor } = await import('../public/js/maps.js');
    const ops = openingsFor(map);
    const hw = map.room.width / 2, hd = map.room.depth / 2, h = map.room.height;
    const doors = ops.filter((o) => o.kind === 'door'), wins = ops.filter((o) => o.kind === 'window');
    assert.equal(doors.length, 1);
    assert.equal(doors[0].wall, 'front');
    assert.equal(doors[0].c, 0);
    assert.equal(doors[0].y0, 0);
    assert.ok(doors[0].y1 <= h - 0.3, 'door fits under the ceiling');
    assert.ok(wins.length >= 4, `${map.id} has ${wins.length} windows`);
    assert.ok(wins.some((o) => o.wall === 'left') && wins.some((o) => o.wall === 'right') && wins.some((o) => o.wall === 'front'));
    for (const o of ops) {
      const len = o.wall === 'left' || o.wall === 'right' ? map.room.depth : map.room.width;
      assert.ok(o.c - o.w / 2 >= -len / 2 + 0.5 && o.c + o.w / 2 <= len / 2 - 0.5, `${o.wall} opening at ${o.c} leaves the wall`);
      assert.ok(o.y1 <= h - 0.3 && o.y1 > o.y0 && o.y0 >= 0, 'opening height');
      assert.ok(o.kind === 'door' || o.y0 >= 0.8 || map.windows.style === 'industrial', 'window sill is not at the floor');
    }
    for (const wall of ['left', 'right', 'front']) {
      const here = ops.filter((o) => o.wall === wall).sort((a, b) => a.c - b.c);
      for (let i = 1; i < here.length; i++) assert.ok(here[i - 1].c + here[i - 1].w / 2 + 0.3 <= here[i].c - here[i].w / 2, `${map.id} ${wall}: openings overlap`);
    }
    // Side windows never face a shelf unit on the same wall.
    for (const o of wins.filter((x) => x.wall === 'left' || x.wall === 'right')) {
      for (const u of map.units.filter((x) => Math.abs(x.rotY) === 90 && Math.sign(x.x) === (o.wall === 'left' ? -1 : 1))) {
        assert.ok(o.c + o.w / 2 <= u.z - 1 || o.c - o.w / 2 >= u.z + 1, `${map.id}: a window faces the shelf unit at z ${u.z}`);
      }
    }
  });
}

test('only the castle board uses parchment notes held by daggers; the others keep sticky notes', () => {
  for (const m of MAPS) assert.ok([undefined, 'postit', 'parchment'].includes(m.board.notes), `${m.id}: ${m.board.notes}`);
  assert.equal(getMap('castle').board.notes, 'parchment');
  for (const id of ['classic', 'boutique', 'warehouse']) assert.notEqual(getMap(id).board.notes, 'parchment');
});

test('boutique: front windows sit where the town outside hangs its awnings and benches (x = +-2.75)', async () => {
  const { openingsFor } = await import('../public/js/maps.js');
  const front = openingsFor(getMap('boutique')).filter((o) => o.wall === 'front' && o.kind === 'window').map((o) => Math.abs(o.c));
  assert.ok(front.includes(2.75), `front window offsets: ${front}`);
  assert.equal(getMap('boutique').outside, 'town');
});

test('warehouse: the personnel door beside the roller shutter clears the windows and the shutter', async () => {
  const { openingsFor } = await import('../public/js/maps.js');
  const map = getMap('warehouse');
  assert.equal(map.room.style, 'warehouse');
  const ops = openingsFor(map);
  const shutter = ops.find((o) => o.kind === 'door');
  const p = shutter.personnel;
  assert.ok(p, 'the shutter carries the personnel door spec');
  const x0 = shutter.c + shutter.w / 2 + p.gap, x1 = x0 + p.width;
  assert.ok(p.gap > 0.2 && p.height < shutter.y1 && p.height > 1.9, 'a normal man-door beside the shutter');
  assert.ok(x1 <= map.room.width / 2 - 0.5, 'inside the front wall');
  for (const o of ops.filter((q) => q.wall === 'front' && q.kind === 'window')) {
    assert.ok(o.c - o.w / 2 >= x1 + 0.2 || o.c + o.w / 2 <= x0 || o.y0 >= p.height + 0.8, 'no window overlaps the personnel door or its exit sign');
  }
  for (const id of ['classic', 'boutique', 'castle']) assert.equal(openingsFor(getMap(id)).find((o) => o.kind === 'door').personnel, undefined);
});

test('every map can style its island table; the castle one is not the shop-white default', () => {
  const hex = /^#[0-9a-f]{6}$/i;
  for (const m of MAPS) {
    const st = m.islandStyle;
    if (!st) continue;
    assert.ok(hex.test(st.base) && hex.test(st.top), `${m.id} island colors`);
    if (st.plinth) assert.ok(hex.test(st.plinth), `${m.id} plinth`);
  }
  const castle = getMap('castle').islandStyle;
  assert.ok(castle && castle.base !== '#f5f5f7' && castle.top !== '#d9bf98', 'the castle table has its own look');
});

test('signs: only the castle uses timber plaques; every map names all its signs; the castle has its own wording', () => {
  for (const m of MAPS) {
    assert.ok([undefined, 'shop', 'castle'].includes(m.signTheme), `${m.id}: ${m.signTheme}`);
    for (const key of ['left', 'right', 'back', 'center', 'island', 'ideas', 'ideasEmpty']) assert.ok(labelFor(m, key), `${m.id} has no "${key}" sign text`);
  }
  assert.equal(getMap('castle').signTheme, 'castle');
  for (const id of ['classic', 'boutique', 'warehouse']) assert.notEqual(getMap(id).signTheme, 'castle');
  assert.equal(labelFor(getMap('classic'), 'island'), 'Best Matches');
  assert.equal(labelFor(getMap('classic'), 'ideas'), 'Try Next');
  assert.notEqual(labelFor(getMap('castle'), 'island'), 'Best Matches');
  assert.notEqual(labelFor(getMap('castle'), 'ideas'), 'Try Next');
});

test('the castle desk uses real wood; the shop desks do not', () => {
  assert.equal(getMap('castle').deskStyle.wood, true);
  for (const id of ['classic', 'boutique', 'warehouse']) assert.notEqual(getMap(id).deskStyle?.wood, true);
});

test('floor textures: Classic, Boutique and Castle have their own; the Warehouse keeps the plain concrete', () => {
  const styles = Object.fromEntries(MAPS.map((m) => [m.id, m.room.floorStyle ?? '']));
  assert.deepEqual(styles, { classic: 'tile', boutique: 'parquet', warehouse: '', castle: 'flagstone' });
});
