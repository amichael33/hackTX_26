import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linksOf, openAll } from '../public/js/openAll.js';

const items = [{ link: 'https://a.example/1' }, { link: 'https://a.example/1' }, { link: null }, { link: 'javascript:alert(1)' }, { link: ' http://b.example/2 ' }, {}];

test('linksOf keeps only distinct http(s) links', () => {
  assert.deepEqual(linksOf(items), ['https://a.example/1', 'http://b.example/2']);
  assert.deepEqual(linksOf(undefined), []);
});

test('openAll opens each link once, in order, and counts the skipped items', () => {
  const calls = [];
  const res = openAll(items, (...a) => { calls.push(a); return {}; });
  assert.deepEqual(calls.map((c) => c[0]), ['https://a.example/1', 'http://b.example/2']);
  assert.ok(calls.every((c) => c[1] === '_blank'));
  assert.deepEqual(res, { total: 2, opened: 2, skipped: 4 });
});

test('openAll reports blocked tabs (null or a throw) without failing', () => {
  assert.deepEqual(openAll(items, () => null), { total: 2, opened: 0, skipped: 4 });
  assert.deepEqual(openAll(items, () => { throw new Error('blocked'); }), { total: 2, opened: 0, skipped: 4 });
  assert.deepEqual(openAll([], () => ({})), { total: 0, opened: 0, skipped: 0 });
});
