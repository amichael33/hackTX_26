// Reads deployment settings from environment variables. DOM-free.

// Express's `trust proxy` accepts a number of hops, a boolean, or a list of address ranges ('loopback', 'uniquelocal', ...).
// It decides whose X-Forwarded-For the server believes, which is what makes the rate limits per visitor instead of per proxy.
export function parseTrustProxy(raw, fallback = 'loopback') {
  const v = String(raw ?? '').trim();
  if (!v) return fallback;
  if (/^\d+$/.test(v)) return Number(v);
  if (v.toLowerCase() === 'true') return true;
  if (v.toLowerCase() === 'false') return false;
  return v;
}

// Where to listen. In production the default is the local machine only (a reverse proxy on the same host is in front);
// inside a container set HOST=0.0.0.0 so the proxy container can reach it.
export function listenHost(env = process.env) {
  if (env.HOST) return env.HOST;
  return env.NODE_ENV === 'production' ? '127.0.0.1' : undefined;
}
