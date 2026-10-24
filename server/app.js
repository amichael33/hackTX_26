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
      const merged = [];
      const add = (p) => { if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); } };
      mainProducts.forEach(add);
      extraJsons.forEach((j) => normalizeShoppingResults(j, { related: true, startRelevance: mainProducts.length }).forEach(add));
      const products = assignTiers(merged.slice(0, MAX_PRODUCTS));
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

  if (deps.serveStatic) app.use(express.static(publicDir));

  return app;
}
