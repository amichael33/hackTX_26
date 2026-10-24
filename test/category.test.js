import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isApparelTitle, apparelShare, isClothingSearch } from '../public/js/category.js';

const p = (title, relevance = 0) => ({ title, relevance });

test('garments are apparel; shoes, bags and gadgets are not', () => {
  for (const t of ['Levi\'s 501 Original Fit Jeans', 'Carhartt Men\'s Hooded Sweatshirt', 'Basic Cotton T-Shirt 3 Pack', 'Women\'s Floral Summer Dress', 'North Face Rain Jacket', 'Wool Scarf']) {
    assert.ok(isApparelTitle(t), t);
  }
  for (const t of ['Nike Air Max Running Shoes', 'Leather Tote Bag', 'Keychron K8 Pro Keyboard', 'Suitcase Carry-On', 'Dresser 6 drawer', '']) {
    assert.ok(!isApparelTitle(t), t);
  }
  assert.ok(!isApparelTitle(undefined));
});

test('apparelShare looks at the top results only', () => {
  const ps = [...Array.from({ length: 12 }, (_, i) => p('Cotton T-Shirt ' + i, i)), ...Array.from({ length: 20 }, (_, i) => p('Gaming mouse ' + i, 100 + i))];
  assert.equal(apparelShare(ps), 1);
  assert.equal(apparelShare([]), 0);
});

test('the clerk flag wins, then the titles, then the query text', () => {
  const shirts = Array.from({ length: 10 }, (_, i) => p('Mens hoodie ' + i, i));
  const mice = Array.from({ length: 10 }, (_, i) => p('Gaming mouse ' + i, i));
  assert.equal(isClothingSearch({ query: 'mouse', is_clothing: true }, mice), true);
  assert.equal(isClothingSearch({ query: 'hoodie', is_clothing: false }, shirts), true); // titles catch a missed flag
  assert.equal(isClothingSearch({ query: 'mouse', is_clothing: false }, mice), false);
  assert.equal(isClothingSearch({ query: 'blue jeans' }, []), true);
  assert.equal(isClothingSearch({ query: 'blue jeans', is_clothing: false }, []), false);
  assert.equal(isClothingSearch(null, []), false);
  const mixed = [...shirts.slice(0, 5), ...mice.slice(0, 5).map((m) => ({ ...m, relevance: m.relevance + 50 }))];
  assert.equal(isClothingSearch({ query: 'x' }, mixed), false); // 5 of 10 is under the 60% bar
});
