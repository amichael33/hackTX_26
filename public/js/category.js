// DOM-free: is this search for clothing? Clothing is shown on hanging rails instead of boxes on shelves.
// The clerk (Gemini) flags it with `is_clothing`; titles are a backup so a missed flag or a replayed old search still works.

// Things that hang on a hanger. Shoes, bags and accessories are deliberately left out: they still sit on shelves.
const APPAREL = /\b(t-?shirts?|tee|tees|shirts?|blouses?|polos?|tank tops?|hoodies?|sweatshirts?|sweaters?|cardigans?|jumpers?|pullovers?|jackets?|coats?|parkas?|blazers?|vests?|jeans|pants|trousers|slacks|chinos|joggers|sweatpants|leggings|shorts|skirts?|dress(?:es)?|gowns?|jumpsuits?|rompers?|pajamas?|pyjamas?|suits?|tuxedos?|scarf|scarves|apparel|clothing|clothes|outerwear|activewear)\b/i;

export const isApparelTitle = (title) => APPAREL.test(String(title ?? ''));

// Share of the products whose title names a garment (0..1). Only the top `n` by relevance count.
export function apparelShare(products, n = 12) {
  const top = [...(products ?? [])].sort((a, b) => a.relevance - b.relevance).slice(0, n);
  if (!top.length) return 0;
  return top.filter((p) => isApparelTitle(p.title)).length / top.length;
}

// `query` is the clerk's query object ({ query, is_clothing }); products may be empty (then only the clerk's word counts).
export function isClothingSearch(query, products) {
  if (query?.is_clothing === true) return true;
  if (query?.is_clothing === false && !products?.length) return false;
  if (products?.length) return apparelShare(products) >= 0.6;
  return isApparelTitle(query?.query);
}
