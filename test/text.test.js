import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, formatPrice } from '../public/js/text.js';

test('splitSentences splits after . ! ?', () => {
  assert.deepEqual(splitSentences('Hi there! Want a keyboard? Great.'), ['Hi there!', 'Want a keyboard?', 'Great.']);
});
test('splitSentences handles empty and whitespace', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('   '), []);
  assert.deepEqual(splitSentences(null), []);
});
test('splitSentences keeps text without terminal punctuation and does not split mid-number', () => {
  assert.deepEqual(splitSentences('It costs $9.99 total'), ['It costs $9.99 total']);
  assert.deepEqual(splitSentences('  One.   Two  '), ['One.', 'Two']);
});
test('formatPrice', () => {
  assert.equal(formatPrice(12.5), '$12.50');
  assert.equal(formatPrice(1299), '$1,299');
  assert.equal(formatPrice(99.99), '$99.99');
  assert.equal(formatPrice(25), '$25.00');
  assert.equal(formatPrice(100), '$100');
  assert.equal(formatPrice(1299.5), '$1,299.50');
});
