// Cart store. DOM-free. Persists to storage; never throws on storage failure.
import { safeLocalStorage } from './storage.js';

const MAX_ITEMS = 50;
const keyOf = (id) => (typeof id === 'string' ? id : Number.isFinite(id) ? String(id) : null);

function load(storage, key) {
  try {
    const arr = JSON.parse(storage.getItem(key));
    if (!Array.isArray(arr)) return [];
    return arr.filter((i) => i && typeof i === 'object' && typeof i.id === 'string' && Number.isFinite(i.extracted_price));
  } catch (e) {
    return [];
  }
}

export function createCart(storage = safeLocalStorage(), key = 'store.cart.v1') {
  let list = load(storage, key).slice(0, MAX_ITEMS); // newest first
  const listeners = new Set();

  function commit() {
    try { storage.setItem(key, JSON.stringify(list)); } catch (e) { /* in-memory only */ }
    for (const fn of [...listeners]) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  return {
    items: () => list.map((i) => ({ ...i })),
    has: (id) => list.some((i) => i.id === keyOf(id)),
    add(p) {
      if (!p || !Number.isFinite(p.extracted_price)) return false;
      const id = keyOf(p.id); // SerpApi ids can be numbers
      if (id === null || list.length >= MAX_ITEMS || list.some((i) => i.id === id)) return false;
      list = [{
        id, title: p.title ?? '', price: p.price ?? null, extracted_price: p.extracted_price,
        source: p.source ?? null, link: p.link ?? null, thumbnail: p.thumbnail ?? null, savedAt: Date.now(),
      }, ...list];
      commit();
      return true;
    },
    remove(id) {
      const k = keyOf(id);
      const next = list.filter((i) => i.id !== k);
      if (next.length === list.length) return false;
      list = next;
      commit();
      return true;
    },
    clear() {
      if (!list.length) return;
      list = [];
      commit();
    },
    total: () => Math.round(list.reduce((s, i) => s + i.extracted_price * 100, 0)) / 100,
    on(evt, fn) {
      if (evt !== 'change') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
