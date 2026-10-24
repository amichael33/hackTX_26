// DOM-free sticker copy helpers, shared by the browser (main.js) and the server (server/lib/stickers.js).
export const FALLBACK_STICKERS = {
  budget: ['BARGAIN BIN!', 'WOW. SO CHEAP.', 'WALLET HAPPY'],
  mid: ['SOLID PICK', 'JUST RIGHT', 'NO REGRETS'],
  premium: ['FANCY PANTS', 'TREAT YO SELF', 'OOH LA LA'],
};

// djb2 string hash, unsigned.
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

export function fallbackSticker(tier, seed) {
  const list = FALLBACK_STICKERS[tier] ?? FALLBACK_STICKERS.mid;
  return list[hash(String(seed ?? '')) % list.length];
}

const MAX_WORDS = 4;
const MAX_CHARS = 24;

export function cleanStickerText(s) {
  if (typeof s !== 'string') return null;
  const words = s.toUpperCase().replace(/[^A-Z0-9 !?.$'&-]/g, '').split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  let out = words.join(' ');
  if (out.length > MAX_CHARS) {
    const cut = out.slice(0, MAX_CHARS + 1);
    const sp = cut.lastIndexOf(' ');
    out = sp > 0 ? cut.slice(0, sp) : out.slice(0, MAX_CHARS);
  }
  out = out.trim();
  return out === '' ? null : out;
}
