import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAPS } from '../public/js/maps.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const builder = readFileSync(new URL('../public/js/sceneMap.js', import.meta.url), 'utf8');

test('index.html no longer hard-codes the store; sceneMap.js builds it from the chosen map', () => {
  assert.ok(!/\sshelf="/.test(html), 'shelves must come from the map');
  assert.match(html, /id="room"/);
  assert.match(html, /id="shelves"/);
  assert.match(html, /id="map-picker"/);
});

test('every shelf is width 2, rows 3 (the layout geometry assumes it)', () => {
  assert.match(builder, /shelf: `width:2; rows:3; style:\$\{style\}`/);
});

test('island tabletop surface is at y 0.80', () => {
  const m = /el\('a-box', \{ position: '0 (0\.77) 0', width: 2, height: (0\.06)/.exec(builder);
  assert.ok(m, 'island top box');
  assert.ok(Math.abs(Number(m[1]) + Number(m[2]) / 2 - 0.8) < 1e-9);
});

test('every map has the zones the layout needs and a picker blurb', () => {
  for (const m of MAPS) {
    assert.ok(m.name && m.blurb, m.id);
    for (const z of ['left', 'right', 'back', 'center']) assert.ok(m.units.some((u) => u.zone === z), `${m.id} has no ${z} unit`);
  }
});
