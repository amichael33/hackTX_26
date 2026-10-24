// Saved searches. DOM-free. Persists to storage; never throws on storage failure.
import { safeLocalStorage } from './storage.js';

const MAX_ENTRIES = 10;
const MAX_PRODUCTS = 30;
const norm = (s) => String(s ?? '').trim().toLowerCase();

function valid(e) {
  return e && typeof e === 'object' && typeof e.id === 'string' && e.query && typeof e.query === 'object'
    && typeof e.query.query === 'string' && Array.isArray(e.products) && Number.isFinite(e.savedAt)
    && e.stickers && typeof e.stickers === 'object';
}

function load(storage, key) {
  try {
    const arr = JSON.parse(storage.getItem(key));
    if (!Array.isArray(arr)) return [];
    return arr.filter(valid);
  } catch (e) {
    return [];
  }
}

export function createSavedSearches(storage = safeLocalStorage(), key = 'store.searches.v1') {
  let list = load(storage, key).sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_ENTRIES); // newest first
  let lastAt = 0;

  // Returns true if persisted. On a failed write, drops the oldest entry and retries once.
  function persist() {
    try { storage.setItem(key, JSON.stringify(list)); return true; } catch (e) { /* retry below */ }
    if (list.length > 1) {
      list = list.slice(0, -1);
      try { storage.setItem(key, JSON.stringify(list)); return true; } catch (e) { /* give up */ }
    }
    return false;
  }

  return {
    list: () => list.map((e) => ({ ...e })),
    get: (id) => { const e = list.find((x) => x.id === id); return e ? { ...e } : null; },
    save({ query, city, products, stickers }) {
      if (!query || typeof query.query !== 'string' || !Array.isArray(products) || !products.length) return null;
      const savedAt = Math.max(Date.now(), lastAt + 1); // strictly increasing: stable newest-first order
      lastAt = savedAt;
      const entry = {
        id: String(savedAt) + Math.random().toString(36).slice(2, 7),
        query, city: city ?? null, products: products.slice(0, MAX_PRODUCTS),
        stickers: stickers && typeof stickers === 'object' ? { ...stickers } : {}, savedAt,
      };
      const prev = list;
      list = [entry, ...list.filter((e) => !(norm(e.query.query) === norm(query.query) && e.city === entry.city))]
        .slice(0, MAX_ENTRIES);
      if (!persist()) { list = prev; return null; }
      return { ...entry };
    },
    updateStickers(id, stickers) {
      const i = list.findIndex((e) => e.id === id);
      if (i < 0 || !stickers || typeof stickers !== 'object') return false;
      const prev = list;
      list = list.map((e, j) => (j === i ? { ...e, stickers: { ...stickers } } : e));
      if (!persist()) { list = prev; return false; }
      return true;
    },
    remove(id) {
      const next = list.filter((e) => e.id !== id);
      if (next.length === list.length) return false;
      list = next;
      persist();
      return true;
    },
  };
}
