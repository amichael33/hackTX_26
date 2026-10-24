import test from 'node:test';
import assert from 'node:assert/strict';
await import('../public/js/collide.js');
const { OBSTACLES, PLAYER_RADIUS, resolve } = globalThis.StoreCollide;
const { SHELF_UNITS } = await import('../public/js/layoutStore.js');

const near = (a, b) => Math.abs(a - b) < 1e-9;
const RECT = { minX: 0, maxX: 2, minZ: 0, maxZ: 1 };
const R = 0.3;

test('PLAYER_RADIUS is 0.3', () => {
  assert.equal(PLAYER_RADIUS, 0.3);
});

test('outside left edge is pushed out to x = -0.3', () => {
  const p = resolve({ x: -0.1, z: 0.5 }, R, [RECT]);
  assert.ok(near(p.x, -0.3));
  assert.equal(p.z, 0.5);
});

test('outside right edge is pushed out to x = 2.3', () => {
  const p = resolve({ x: 2.1, z: 0.5 }, R, [RECT]);
  assert.ok(near(p.x, 2.3));
  assert.equal(p.z, 0.5);
});

test('outside front edge is pushed out to z = -0.3', () => {
  const p = resolve({ x: 1, z: -0.2 }, R, [RECT]);
  assert.ok(near(p.z, -0.3));
  assert.equal(p.x, 1);
});

test('outside back edge is pushed out to z = 1.3', () => {
  const p = resolve({ x: 1, z: 1.1 }, R, [RECT]);
  assert.ok(near(p.z, 1.3));
  assert.equal(p.x, 1);
});

test('inside near the left edge is pushed out to x = -0.3', () => {
  const p = resolve({ x: 0.1, z: 0.5 }, R, [RECT]);
  assert.ok(near(p.x, -0.3));
  assert.equal(p.z, 0.5);
});

test('corner point ends at least r from the corner', () => {
  const p = resolve({ x: -0.1, z: -0.1 }, R, [RECT]);
  assert.ok(Math.hypot(p.x - 0, p.z - 0) >= R - 1e-9);
});

test('clear point is unchanged', () => {
  const p = resolve({ x: -1, z: -1 }, R, [RECT]);
  assert.deepEqual(p, { x: -1, z: -1 });
});

test('resolve mutates and returns the same object', () => {
  const pos = { x: -0.1, z: 0.5 };
  assert.equal(resolve(pos, R, [RECT]), pos);
});

test('default spawn {x:0, z:9} is unchanged', () => {
  const p = resolve({ x: 0, z: 9 });
  assert.deepEqual(p, { x: 0, z: 9 });
});

test('back-wall trigger line between units stays reachable', () => {
  const p = { x: -2, z: -8.5 };
  resolve(p);
  assert.ok(p.z <= -6.2);
});

test('OBSTACLES holds all 9 shelf footprints, matching SHELF_UNITS, plus the 4 fixtures', () => {
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const units = Object.values(SHELF_UNITS).flat();
  assert.equal(units.length, 9);
  assert.equal(OBSTACLES.length, 9 + 4);
  for (const u of units) {
    const quarter = Math.abs(u.rotY) === 90;
    const hx = quarter ? 0.25 : 1;
    const hz = quarter ? 1 : 0.25;
    const want = { minX: u.x - hx, maxX: u.x + hx, minZ: u.z - hz, maxZ: u.z + hz };
    const found = OBSTACLES.some((o) =>
      ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => r3(o[k]) === r3(want[k])));
    assert.ok(found, `no obstacle for shelf unit ${JSON.stringify(u)}`);
  }
});

test('fixtures are present with the brief footprints', () => {
  const has = (f) => OBSTACLES.some((o) =>
    ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => near(o[k], f[k])));
  assert.ok(has({ minX: -1, maxX: 1, minZ: -0.6, maxZ: 0.6 }), 'island');
  assert.ok(has({ minX: -1.65, maxX: 1.65, minZ: 6.05, maxZ: 6.95 }), 'desk counter');
  assert.ok(has({ minX: 1.35, maxX: 2.25, minZ: 4.65, maxZ: 6.55 }), 'desk return');
  assert.ok(has({ minX: -0.35, maxX: 0.35, minZ: 5.45, maxZ: 6.15 }), 'clerk');
});

test('circleClear: free floor, fixtures, room edge, island margin', () => {
  const { circleClear } = globalThis.StoreCollide;
  assert.equal(circleClear(0, 3, 0.28), true);
  assert.equal(circleClear(3, 0, 0.28), false);
  assert.equal(circleClear(-7.9, 3, 0.28), false);
  assert.equal(circleClear(0, 0.85, 0.28), false);
  assert.equal(circleClear(0, 0.9, 0.28), true);
});
