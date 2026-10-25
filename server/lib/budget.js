// Long-window usage budgets, on top of the per-minute limiters in app.js.
//   take(client, kind, cost): per-client allowance per window (a day by default), counted per kind.
//   takeSerp(cost): one shared SerpApi credit ceiling for every client, so a crowd cannot drain the plan.
// In memory only: a restart resets the counters (cheap, and the per-minute limits still apply).
export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_LIMITS = { search: 20, chat: 150, ideas: 40, merchant: 40 };
const MAX_CLIENTS = 5000;

export function createBudget({ now = Date.now, windowMs = DAY_MS, perClient = DEFAULT_LIMITS, serpCredits = 400 } = {}) {
  const clients = new Map(); // key -> { start, used: {kind: n} }
  let serp = { start: now(), used: 0 };

  const retryAfterSec = (start) => Math.max(1, Math.ceil((start + windowMs - now()) / 1000));

  function entry(client) {
    const t = now();
    let e = clients.get(client);
    if (!e || t - e.start >= windowMs) {
      if (clients.size >= MAX_CLIENTS) {
        for (const [k, v] of clients) if (t - v.start >= windowMs) clients.delete(k);
        if (clients.size >= MAX_CLIENTS) clients.delete(clients.keys().next().value);
      }
      e = { start: t, used: {} };
      clients.set(client, e);
    }
    return e;
  }

  function rollSerp() {
    if (now() - serp.start >= windowMs) serp = { start: now(), used: 0 };
  }

  return {
    // -> { ok: true } or { ok: false, retryAfterSec }. A kind with no configured limit is unlimited.
    take(client, kind, cost = 1) {
      const limit = perClient[kind];
      if (limit == null) return { ok: true };
      const e = entry(client);
      if ((e.used[kind] ?? 0) + cost > limit) return { ok: false, retryAfterSec: retryAfterSec(e.start) };
      e.used[kind] = (e.used[kind] ?? 0) + cost;
      return { ok: true };
    },
    takeSerp(cost = 1) {
      rollSerp();
      if (serp.used + cost > serpCredits) return { ok: false, retryAfterSec: retryAfterSec(serp.start) };
      serp.used += cost;
      return { ok: true };
    },
    serpLeft() {
      rollSerp();
      return Math.max(0, serpCredits - serp.used);
    },
  };
}
