// Writes server/data/demoClothes.json: demo garments drawn as tiny SVGs (white background, so the store's cutout step
// has something to remove), used by demo mode when the search is for clothing. No network, no credits.
//   node scripts/make-demo-clothes.mjs
import { writeFileSync } from 'node:fs';
import { assignTiers } from '../server/lib/serp.js';

const SHAPES = {
  tee: 'M30 8 L44 8 Q50 18 56 8 L70 8 L96 30 L82 48 L72 40 L72 110 L28 110 L28 40 L18 48 L4 30 Z',
  hoodie: 'M28 12 Q50 -2 72 12 L98 40 L88 98 L74 94 L74 112 L26 112 L26 94 L12 98 L2 40 Z',
  dress: 'M36 6 L44 6 Q50 16 56 6 L64 6 L70 40 L84 112 L16 112 L30 40 Z',
  jacket: 'M24 10 L40 6 L50 16 L60 6 L76 10 L98 36 L92 104 L78 100 L76 112 L24 112 L22 100 L8 104 L2 36 Z',
  pants: 'M26 6 L74 6 L78 112 L56 112 L50 44 L44 112 L22 112 Z',
  skirt: 'M30 6 L70 6 L90 100 L10 100 Z',
  sweater: 'M30 8 L44 8 Q50 16 56 8 L70 8 L98 34 L90 100 L76 96 L76 112 L24 112 L24 96 L10 100 L2 34 Z',
  scarf: 'M20 10 L80 10 L80 28 L60 28 L60 112 L40 112 L40 28 L20 28 Z',
};
const COLORS = ['#c0392b', '#2c5aa0', '#2e8b57', '#e0a526', '#6c4a9e', '#d9d4c7', '#1f2933', '#e07a5f', '#3d85c6', '#8a9a5b'];

const svg = (shape, color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><rect width="100" height="120" fill="#fff"/>` +
  `<path d="${SHAPES[shape]}" fill="${color}" stroke="#0004" stroke-width="1.2"/>` +
  (shape === 'hoodie' ? `<rect x="38" y="76" width="24" height="14" rx="3" fill="#0002"/>` : '') +
  (shape === 'jacket' ? `<path d="M50 16 L50 112" stroke="#0005" stroke-width="2"/>` : '') +
  `</svg>`;
const dataUrl = (shape, color) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(shape, color));

const ITEMS = [
  ['Classic Cotton T-Shirt', 'tee', 'Target', 12.99], ['Relaxed Fit Hoodie', 'hoodie', 'Walmart', 29.99],
  ['Slim Straight Jeans', 'pants', "Levi's", 59.5], ['Summer Wrap Dress', 'dress', 'Macy\'s', 44.0],
  ['Water Resistant Jacket', 'jacket', 'Amazon', 79.99], ['Merino Crew Sweater', 'sweater', "Kohl's", 54.0],
  ['Pleated Midi Skirt', 'skirt', 'Target', 27.5], ['Pocket Tee 3 Pack', 'tee', 'Walmart', 21.99],
  ['Zip Up Fleece Hoodie', 'hoodie', 'Amazon', 36.0], ['Everyday Chino Pants', 'pants', 'Gap', 39.95],
  ['Linen Shirt Dress', 'dress', 'H&M', 34.99], ['Denim Trucker Jacket', 'jacket', "Levi's", 89.0],
  ['Chunky Knit Sweater', 'sweater', 'Macy\'s', 64.0], ['Graphic Tee', 'tee', 'Amazon', 17.99],
  ['Tennis Skirt', 'skirt', 'Walmart', 19.99], ['Heavyweight Hoodie', 'hoodie', 'Nike', 68.0],
  ['Cargo Pants', 'pants', 'Target', 33.0], ['Puffer Jacket', 'jacket', 'Amazon', 119.0],
  ['V-Neck Sweater', 'sweater', 'Uniqlo', 29.9], ['Slip Dress', 'dress', 'H&M', 24.99],
  ['Long Sleeve Tee', 'tee', 'Old Navy', 15.0], ['Quarter Zip Pullover', 'sweater', 'Kohl\'s', 41.0],
  ['Wide Leg Trousers', 'pants', 'Macy\'s', 52.0], ['Bomber Jacket', 'jacket', 'Target', 58.0],
];
const RELATED = [['Wool Scarf', 'scarf', 'Target', 18.0], ['Knit Winter Scarf', 'scarf', 'Walmart', 14.99], ['Plaid Blanket Scarf', 'scarf', 'Macy\'s', 32.0], ['Silk Scarf', 'scarf', 'Amazon', 25.0]];

const build = (list, related, start) => list.map(([title, shape, source, price], i) => ({
  id: `demo-cl-${String(start + i + 1).padStart(2, '0')}`, title,
  price: `$${price.toFixed(2)}`, extracted_price: price, rating: 4 + ((i * 7) % 10) / 10,
  source, thumbnail: dataUrl(shape, COLORS[(start + i * 3) % COLORS.length]), link: null,
  relevance: start + i, related,
}));
const main = build(ITEMS, false, 0);
const related = build(RELATED, true, main.length);
const products = assignTiers([...main, ...related]);
writeFileSync(new URL('../server/data/demoClothes.json', import.meta.url), JSON.stringify(products));
console.log(products.length, 'demo garments written');
