// DOM-free: the box color for the retailer a product is sold by (Product.source).
// Known retailers get their brand color; any other store gets a stable color of its own.

export const DEFAULT_BOX_COLOR = '#0071e3';

// Checked in order against the lower-cased source, so more specific names go first.
const BRANDS = [
  ['sam\'s club', '#0067a0'],
  ['walmart', '#0071ce'],
  ['target', '#cc0000'],
  ['best buy', '#0046be'],
  ['bestbuy', '#0046be'],
  ['amazon', '#ff9900'],
  ['home depot', '#f96302'],
  ['lowe', '#004990'],
  ['costco', '#e31837'],
  ['walgreens', '#e31837'],
  ['cvs', '#cc0000'],
  ['macy', '#c8102e'],
  ['kohl', '#7a1f2b'],
  ['ikea', '#0058a3'],
  ['newegg', '#f7882f'],
  ['etsy', '#f1641e'],
  ['ebay', '#e53238'],
  ['kroger', '#134a9b'],
  ['wayfair', '#7b189f'],
  ['nike', '#111111'],
  ["levi", '#c41230'],
  ['h&m', '#e50010'],
  ['uniqlo', '#e60012'],
  ['old navy', '#003a70'],
  ['gap', '#1f2d5a'],
  ['apple', '#6e6e73'],
  ['staples', '#cc0000'],
  ['b&h', '#1b1b1b'],
];

// Distinct, mid-tone colors for stores we have no brand color for.
const PALETTE = ['#2a9d8f', '#8e5bd8', '#d6336c', '#3b82c4', '#6a994e', '#c2410c', '#0d9488', '#9a3412', '#4f46e5', '#b45309'];

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}

export function storeColor(source) {
  const s = String(source ?? '').trim().toLowerCase();
  if (!s) return DEFAULT_BOX_COLOR;
  for (const [key, color] of BRANDS) if (s.includes(key)) return color;
  return PALETTE[hash(s) % PALETTE.length];
}
