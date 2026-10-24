import express from 'express';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chatTurn } from './lib/clerk.js';
import { reverseGeocode, DEFAULT_CITY } from './lib/geocode.js';
import { searchShopping, normalizeShoppingResults, assignTiers, NO_RESULTS_MSG } from './lib/serp.js';
import { createCache } from './lib/cache.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');
const demoProducts = JSON.parse(readFileSync(path.join(here, 'data', 'demoProducts.json'), 'utf8'));

const SEARCH_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_PRODUCTS = 30;
const MAX_RELATED = 6;

// deps: { llm?, fetchImpl?, serpApiKey?, demoMode?, serveStatic?, geocodeTimeoutMs? }
export function createApp(deps = {}) {
  const app = express();
  app.use(express.json({ limit: '50kb' }));
  const cache = createCache(SEARCH_TTL_MS);
  const fetchImpl = deps.fetchImpl ?? fetch;

  // One SerpApi query. A failure (error field, non-2xx, network) with a location is retried once without it.
  // "No results" is not a failure: it comes back as an empty shopping_results list.
  async function runQuery(q, location) {
    const attempt = async (loc) => {
      const json = await searchShopping({ q, location: loc }, { apiKey: deps.serpApiKey, fetchImpl });
      if (json?.error && json.error !== NO_RESULTS_MSG) throw new Error(json.error);
      return json ?? {};
    };
    try {
      return await attempt(location);
    } catch (err) {
      if (!location) throw err;
      return attempt(undefined);
    }
  }

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Main query plus up to 2 extra_queries (related). Main failure -> demo products; extra failure is dropped.
  // Empty results return {products: []} so the clerk can say nothing matched.
  app.post('/api/search', async (req, res) => {
    const query = req.body?.query ?? {};
    const city = req.body?.city || undefined;
    if (!query.query) return res.status(400).json({ error: 'missing query' });
    if (deps.demoMode || !deps.serpApiKey) return res.json({ products: demoProducts });

    const key = JSON.stringify([query.query, query.min_price, query.max_price, city]);
    const cached = cache.get(key);
    if (cached !== undefined) return res.json({ products: cached });

    try {
      const extras = (Array.isArray(query.extra_queries) ? query.extra_queries : []).slice(0, 2);
      const [mainJson, ...extraJsons] = await Promise.all([
        runQuery(query.query, city),
        ...extras.map((q) => runQuery(q, city).catch(() => ({}))),
      ]);
      const mainProducts = normalizeShoppingResults(mainJson);
      const seen = new Set();
      const dedupe = (list) => list.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      const main = dedupe(mainProducts); // main first, so a main item wins over a duplicate related one
      // Related relevance continues after the main items, one contiguous run across all extra queries.
      let nextRelevance = mainProducts.length;
      const relatedAll = [];
      for (const j of extraJsons) {
        const r = normalizeShoppingResults(j, { related: true, startRelevance: nextRelevance });
        nextRelevance += r.length;
        relatedAll.push(...r);
      }
      // Reserve up to MAX_RELATED slots for related items; main fills the rest up to MAX_PRODUCTS.
      const relatedKept = dedupe(relatedAll).slice(0, MAX_RELATED);
      const mainKept = main.slice(0, MAX_PRODUCTS - relatedKept.length);
      const products = assignTiers([...mainKept, ...relatedKept]);
      cache.set(key, products);
      res.json({ products });
    } catch {
      res.json({ products: demoProducts });
    }
  });

  app.post('/api/chat', async (req, res) => {
    res.json(await chatTurn(req.body || {}, deps.llm));
  });

  // Privacy: coordinates are rounded to 2 decimals (~1 km) before leaving the server
  // and are NEVER logged (no console.*, no error logging with the request body).
  app.post('/api/geocode', async (req, res) => {
    try {
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('bad coordinates');
      const r2 = (n) => Math.round(n * 100) / 100;
      res.json({ city: await reverseGeocode(r2(lat), r2(lng), fetchImpl, deps.geocodeTimeoutMs) });
    } catch {
      res.json({ city: DEFAULT_CITY });
    }
  });

  // Image proxy: https only, allowlisted hosts (dot boundary), image/* only, <= 2 MB.
  const IMG_HOSTS = ['gstatic.com', 'googleusercontent.com', 'serpapi.com'];
  const IMG_MAX_BYTES = 2 * 1024 * 1024;
  const IMG_TIMEOUT_MS = 8000;
  app.get('/api/img', async (req, res) => {
    let url;
    try { url = new URL(String(req.query.u ?? '')); } catch { return res.status(400).end(); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !IMG_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
      return res.status(400).end();
    }
    try {
      const up = await fetchImpl(url.href, { signal: AbortSignal.timeout(IMG_TIMEOUT_MS), redirect: 'error' });
      const type = up.headers.get('content-type') ?? '';
      const len = Number(up.headers.get('content-length'));
      if (!up.ok || !type.startsWith('image/') || (Number.isFinite(len) && len > IMG_MAX_BYTES)) {
        up.body?.cancel?.().catch(() => {});
        return res.status(502).end();
      }
      const chunks = [];
      let total = 0;
      for await (const chunk of up.body) {
        total += chunk.length;
        if (total > IMG_MAX_BYTES) return res.status(502).end();
        chunks.push(chunk);
      }
      res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
      res.send(Buffer.concat(chunks));
    } catch {
      res.status(502).end();
    }
  });

  if (deps.serveStatic) app.use(express.static(publicDir));

  return app;
}
