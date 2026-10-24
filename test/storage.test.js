import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, safeLocalStorage } from '../public/js/storage.js';

test('memoryStorage round-trips and removes', () => {
  const s = memoryStorage();
  assert.equal(s.getItem('k'), null);
  s.setItem('k', 'v');
  assert.equal(s.getItem('k'), 'v');
  s.removeItem('k');
  assert.equal(s.getItem('k'), null);
});

test('safeLocalStorage under Node (no window) returns working memory storage', () => {
  const s = safeLocalStorage();
  s.setItem('a', '1');
  assert.equal(s.getItem('a'), '1');
  s.removeItem('a');
  assert.equal(s.getItem('a'), null);
});
