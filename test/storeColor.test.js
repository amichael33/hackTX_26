import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeColor, DEFAULT_BOX_COLOR } from '../public/js/storeColor.js';

test('known retailers get their brand color, case and punctuation insensitive', () => {
  assert.equal(storeColor('Target'), '#cc0000');
  assert.equal(storeColor('WALMART'), '#0071ce');
  assert.equal(storeColor("Lowe's Home Improvement"), '#004990');
  assert.equal(storeColor("Sam's Club"), '#0067a0'); // not caught by a shorter key
  assert.equal(storeColor('Best Buy'), '#0046be');
});

test('unknown stores get a stable color; missing source gets the default', () => {
  const c = storeColor('Keychron');
  assert.match(c, /^#[0-9a-f]{6}$/);
  assert.equal(storeColor('keychron '), c);
  assert.equal(storeColor(''), DEFAULT_BOX_COLOR);
  assert.equal(storeColor(undefined), DEFAULT_BOX_COLOR);
});
