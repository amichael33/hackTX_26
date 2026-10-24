import { FALLBACK_STICKERS, fallbackSticker, cleanStickerText } from '../../public/js/stickerText.js';

export { FALLBACK_STICKERS, fallbackSticker, cleanStickerText };

const SYSTEM =
  "You write funny comic price stickers for a low-poly toy store. For each item, write one sticker of at most 4 words that jokes about the item and its price. Keep it clean and family-friendly. Match the tier vibe: budget = bargain jokes, mid = cheerful and plain, premium = fancy jokes. Return every item id exactly once.";

export const STICKERS_SCHEMA = {
  type: 'object',
  properties: {
    stickers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The item id, copied exactly.' },
          sticker_text: { type: 'string', description: 'Clean, family-friendly joke of at most 4 words.' },
        },
        required: ['id', 'sticker_text'],
      },
    },
  },
  required: ['stickers'],
};

export async function generateStickers(items, llm) {
  const list = Array.isArray(items) ? items : [];
  const byId = new Map();
  if (list.length > 0) {
    try {
      if (typeof llm !== 'function') throw new Error('no llm configured');
      const payload = list.map((it) => ({ id: String(it.id), title: it.title, price: it.price, tier: it.tier }));
      const raw = await llm({ system: SYSTEM, messages: [{ role: 'user', text: JSON.stringify(payload) }], schema: STICKERS_SCHEMA });
      const arr = Array.isArray(raw?.stickers) ? raw.stickers : [];
      for (const s of arr) {
        if (!s || typeof s.id !== 'string' || byId.has(s.id)) continue;
        const text = cleanStickerText(s.sticker_text);
        if (text) byId.set(s.id, text);
      }
    } catch (err) {
      console.error('generateStickers failed:', err.message);
    }
  }
  return list.map((it) => {
    const id = String(it.id);
    return { id, sticker_text: byId.get(id) ?? fallbackSticker(it.tier, id) };
  });
}
