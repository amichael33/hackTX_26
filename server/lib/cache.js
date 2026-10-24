// Tiny in-memory TTL cache. Entries expire lazily on get.
export function createCache(ttlMs) {
  const entries = new Map();
  return {
    get(key) {
      const e = entries.get(key);
      if (!e) return undefined;
      if (Date.now() >= e.expires) {
        entries.delete(key);
        return undefined;
      }
      return e.value;
    },
    set(key, value) {
      entries.set(key, { value, expires: Date.now() + ttlMs });
    },
  };
}
