import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RAIL_PITCH, RAIL_WINDOW, hangerX } from '../public/js/clothesLayout.js';

// clothes-rail.js is a classic browser script, so it repeats the layout constants; this keeps the two from drifting.
const src = readFileSync(new URL('../public/js/components/clothes-rail.js', import.meta.url), 'utf8');

test('clothes-rail.js uses the same pitch, window and hanger formula as clothesLayout.js', () => {
  const m = /var PITCH = ([\d.]+), WINDOW = (\d+), STEP = (\d+)/.exec(src);
  assert.ok(m, 'constants line');
  assert.equal(Number(m[1]), RAIL_PITCH);
  assert.equal(Number(m[2]), RAIL_WINDOW);
  assert.ok(Number(m[3]) >= 1 && Number(m[3]) <= RAIL_WINDOW, 'a flip moves at least one hanger, at most a window');
  const f = /function hangerX\(i, offset\) \{ return (.*); \}/.exec(src);
  assert.ok(f, 'hangerX');
  const comp = new Function('i', 'offset', 'PITCH', 'WINDOW', `return ${f[1]};`);
  for (const [i, off] of [[0, 0], [5, 0], [7, 3], [2, 1.5]]) assert.equal(comp(i, off, RAIL_PITCH, RAIL_WINDOW), hangerX(i, off));
});
