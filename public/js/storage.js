// Storage helpers. DOM-free: safe to import under Node (no window).

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// window.localStorage if a write+remove probe works; otherwise memory. Never throws.
export function safeLocalStorage() {
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (!ls) return memoryStorage();
    ls.setItem('__probe__', '1');
    ls.removeItem('__probe__');
    return ls;
  } catch (e) {
    return memoryStorage();
  }
}
