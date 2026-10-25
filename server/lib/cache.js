// Tiny in-memory TTL cache. Entries expire lazily on get.
export function createCache(ttlMs) {
  const entries = new Map();
  const pending = new Map(); // key -> promise of a load already running
  const cache = {
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
    // Cached value, or the result of load(). Callers asking for the same key while a load is running share it
    // (one real call, not one each). A failed load is not cached and is shared only by the callers already waiting.
    async getOrLoad(key, load) {
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      let p = pending.get(key);
      if (!p) {
        p = (async () => {
          try {
            const value = await load();
            cache.set(key, value);
            return value;
          } finally {
            pending.delete(key);
          }
        })();
        pending.set(key, p);
      }
      return p;
    },
  };
  return cache;
}
