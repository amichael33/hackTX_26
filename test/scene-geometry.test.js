import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHELF_UNITS } from '../public/js/layoutStore.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function shelfEntities(src) {
  const out = [];
  const re = /<a-entity\b[^>]*\bshelf="([^"]*)"[^>]*>/g;
  let m;
  while ((m = re.exec(src))) {
    const tag = m[0];
    const attr = (n) => {
      const a = new RegExp('\\s' + n + '="([^"]*)"').exec(tag);
      return a ? a[1].trim().split(/\s+/).map(Number) : [0, 0, 0];
    };
    const [x, , z] = attr('position');
    const [, rotY] = attr('rotation');
    out.push({ x, z, rotY, cfg: m[1] });
  }
  return out;
}

const key = (u) => `${u.x},${u.z},${u.rotY}`;

test('shelf units in index.html match SHELF_UNITS exactly', () => {
  const found = shelfEntities(html);
  const expected = Object.values(SHELF_UNITS).flat();
  assert.equal(found.length, expected.length);
  assert.deepEqual(found.map(key).sort(), expected.map(key).sort());
});

test('every shelf is width 2, rows 3', () => {
  for (const s of shelfEntities(html)) {
    assert.match(s.cfg, /width:\s*2\b/);
    assert.match(s.cfg, /rows:\s*3\b/);
  }
});

test('island tabletop surface is at y 0.80', () => {
  const island = /<a-entity\b[^>]*id="island"[^>]*>([\s\S]*?)<\/a-entity>/.exec(html);
  assert.ok(island, 'island entity exists');
  const boxes = [...island[1].matchAll(/<a-box\b[^>]*>/g)].map((m) => m[0]);
  const tops = boxes.map((b) => {
    const pos = /position="([^"]*)"/.exec(b);
    const h = /height="([^"]*)"/.exec(b);
    return Number(pos[1].trim().split(/\s+/)[1]) + Number(h[1]) / 2;
  });
  assert.ok(tops.some((t) => Math.abs(t - 0.8) < 1e-9), `tops: ${tops}`);
  assert.ok(Math.max(...tops) <= 0.8 + 1e-9);
});
