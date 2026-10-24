import test from 'node:test';
import assert from 'node:assert/strict';
await import('../public/js/cutout.js');
const { removeEdgeBackground, alphaBBox } = globalThis.StoreCutout;

function make(w, h, rgb) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = 255; }
  return d;
}
function set(d, w, x, y, rgb) { const i = (y * w + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; }
const alpha = (d, w, x, y) => d[(y * w + x) * 4 + 3];

function redSquare() {
  const d = make(10, 10, [255, 255, 255]);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) set(d, 10, x, y, [255, 0, 0]);
  return d;
}

test('white bg with red square: removed 0.84, red kept, edges feathered', () => {
  const d = redSquare();
  const { removedFraction } = removeEdgeBackground(d, 10, 10);
  assert.equal(removedFraction, 0.84);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const inside = x >= 3 && x < 7 && y >= 3 && y < 7;
    if (!inside) assert.equal(alpha(d, 10, x, y), 0);
    else {
      const edge = x === 3 || x === 6 || y === 3 || y === 6;
      if (edge) assert.ok(alpha(d, 10, x, y) <= 140);
      else assert.equal(alpha(d, 10, x, y), 255);
    }
  }
});

test('enclosed white interior stays opaque', () => {
  const d = make(9, 9, [255, 255, 255]);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) {
    if (x === 2 || x === 6 || y === 2 || y === 6) set(d, 9, x, y, [0, 0, 0]);
  }
  removeEdgeBackground(d, 9, 9);
  assert.equal(alpha(d, 9, 0, 0), 0);
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) assert.ok(alpha(d, 9, x, y) > 0);
  assert.equal(alpha(d, 9, 4, 4), 255); // not adjacent to a removed pixel
});

test('all-dark image unchanged', () => {
  const d = make(6, 6, [20, 20, 20]);
  const copy = Uint8ClampedArray.from(d);
  const { removedFraction } = removeEdgeBackground(d, 6, 6);
  assert.equal(removedFraction, 0);
  assert.deepEqual(d, copy);
});

test('light gray removed, pale pink kept', () => {
  const g = make(4, 4, [240, 240, 240]);
  assert.equal(removeEdgeBackground(g, 4, 4).removedFraction, 1);
  const p = make(4, 4, [250, 200, 220]);
  assert.equal(removeEdgeBackground(p, 4, 4).removedFraction, 0);
});

test('already transparent border pixels count as background', () => {
  const d = make(4, 4, [10, 10, 10]);
  d[3] = 0; // (0,0) transparent
  assert.equal(removeEdgeBackground(d, 4, 4).removedFraction, 1 / 16);
});

test('alphaBBox', () => {
  const d = redSquare();
  removeEdgeBackground(d, 10, 10);
  assert.deepEqual(alphaBBox(d, 10, 10), { x: 3, y: 3, w: 4, h: 4 });
  assert.equal(alphaBBox(new Uint8ClampedArray(10 * 10 * 4), 10, 10), null);
});
