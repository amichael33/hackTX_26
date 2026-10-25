import test from 'node:test';
import assert from 'node:assert/strict';
await import('../public/js/garment.js');
const { kindFromTitle, SILHOUETTES, KINDS, isSkin, analyzePhoto } = globalThis.StoreGarment;

const W = 40, H = 60;
function blank() { return new Uint8ClampedArray(W * H * 4); } // all alpha 0 = nothing
function fill(d, x0, y0, x1, y1, rgb) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
  }
}
const SKIN = [224, 172, 140], RED = [190, 30, 40];

test('kindFromTitle picks the garment kind from the title', () => {
  assert.equal(kindFromTitle('Relaxed Fit Hoodie'), 'hoodie');
  assert.equal(kindFromTitle('Classic Cotton T-Shirt'), 'tee');
  assert.equal(kindFromTitle('Pocket Tee 3 Pack'), 'tee');
  assert.equal(kindFromTitle('Merino Crew Sweater'), 'sweater');
  assert.equal(kindFromTitle('Quarter Zip Pullover'), 'sweater');
  assert.equal(kindFromTitle('Puffer Jacket'), 'jacket');
  assert.equal(kindFromTitle('Slip Dress'), 'dress');
  assert.equal(kindFromTitle('Slim Straight Jeans'), 'pants');
  assert.equal(kindFromTitle('Wide Leg Trousers'), 'pants');
  assert.equal(kindFromTitle('Tennis Skirt'), 'skirt');
  assert.equal(kindFromTitle('Wool Scarf'), 'scarf');
  assert.equal(kindFromTitle('Linen Shirt Dress'), 'dress');
  assert.equal(kindFromTitle('Zip Up Fleece Hoodie'), 'hoodie');
});
test('kindFromTitle defaults to tee', () => {
  assert.equal(kindFromTitle('Mystery item'), 'tee');
  assert.equal(kindFromTitle(''), 'tee');
  assert.equal(kindFromTitle(undefined), 'tee');
});
test('every kind has a silhouette polygon inside the 100x120 box', () => {
  assert.deepEqual([...KINDS].sort(), Object.keys(SILHOUETTES).sort());
  for (const k of KINDS) {
    const pts = SILHOUETTES[k];
    assert.ok(pts.length >= 4, k);
    for (const [x, y] of pts) { assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 120, k); }
  }
});
test('isSkin accepts skin tones and rejects saturated colours and near-black', () => {
  assert.ok(isSkin(...SKIN));
  assert.ok(isSkin(240, 200, 170));
  assert.ok(!isSkin(...RED));
  assert.ok(!isSkin(30, 60, 160));
  assert.ok(!isSkin(10, 10, 10));
});
test('a figure with head and hands in skin is a person; colour is the shirt', () => {
  const d = blank();
  fill(d, 15, 2, 25, 12, SKIN);   // head, 100 px
  fill(d, 10, 14, 30, 40, RED);   // shirt, 520 px
  fill(d, 6, 40, 10, 44, SKIN);   // hand
  fill(d, 30, 40, 34, 44, SKIN);  // hand
  const r = analyzePhoto(d, W, H);
  assert.equal(r.isPerson, true);
  assert.ok(r.skinFraction > 0.1 && r.skinFraction < 0.4, String(r.skinFraction));
  assert.equal(r.color, '#be1e28');
  assert.equal(r.dominantColors[0], '#be1e28');
});
test('a flat tan garment (almost all skin-like) is a garment, not a person', () => {
  const d = blank();
  fill(d, 8, 4, 32, 50, [210, 180, 140]);
  const r = analyzePhoto(d, W, H);
  assert.equal(r.isPerson, false);
  assert.ok(r.skinFraction > 0.5);
});
test('a plain garment with no skin is not a person', () => {
  const d = blank();
  fill(d, 8, 4, 32, 50, RED);
  const r = analyzePhoto(d, W, H);
  assert.equal(r.isPerson, false);
  assert.equal(r.skinFraction, 0);
});
test('an empty cut-out gives no person and no colour', () => {
  const r = analyzePhoto(blank(), W, H);
  assert.equal(r.isPerson, false);
  assert.equal(r.color, null);
  assert.deepEqual(r.dominantColors, []);
  assert.equal(analyzePhoto(new Uint8ClampedArray(0), 0, 0).isPerson, false);
});
