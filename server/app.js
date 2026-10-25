import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chatTurn } from './lib/clerk.js';
import { reverseGeocode, DEFAULT_CITY } from './lib/geocode.js';
import { searchShopping, searchAmazon, normalizeAmazonResults, normalizeShoppingResults, assignTiers, NO_RESULTS_MSG } from './lib/serp.js';
import { generateStickers } from './lib/stickers.js';
import { generateIdeas } from './lib/ideas.js';
import { isApparelTitle } from '../public/js/category.js';
import { createCache } from './lib/cache.js';
import { createBudget } from './lib/budget.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');
const demoProducts = JSON.parse(readFileSync(path.join(here, 'data', 'demoProducts.json'), 'utf8'));
// Demo garments (drawn SVGs, see scripts/make-demo-clothes.mjs) for a clothing search, so clothing mode can be shown without credits.
const demoClothes = JSON.parse(readFileSync(path.join(here, 'data', 'demoClothes.json'), 'utf8'));
const isClothingQuery = (q) => q?.is_clothing === true || isApparelTitle(q?.query);
const demoFor = (q) => (isClothingQuery(q) ? demoClothes : demoProducts);

const SEARCH_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_PRODUCTS = 60; // what goes on the shelves (the store holds 70)
const MAX_RELATED = 12;
const MAX_EXTRAS = 40;   // leftovers kept back for future features, never shown on the shelves
const MAX_AMAZON = 16; // Amazon's share of a search, so it cannot crowd out the Google Shopping retailers

function pluralize(w) {
  if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(w)) return w + 'es';
  return w + 's';
}

// deps: { llm?, fetchImpl?, serpApiKey?, demoMode?, amazon?, serveStatic?, geocodeTimeoutMs?, budget? }
export function createApp(deps = {}) {
  const app = express();
  app.set('trust proxy', 'loopback'); // Caddy on localhost: honor X-Forwarded-For so limits are per client
  // Limiters live inside createApp so every app (and test) gets fresh counters.
  const limit = (max) => rateLimit({
    windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'slow down' }),
  });
  const chatLimit = limit(30);
  const stickersLimit = limit(30);
  const searchLimit = limit(10);
  const ideasLimit = limit(10);
  const geocodeLimit = limit(10);
  const imgLimit = limit(300);
  app.use(express.json({ limit: '50kb' }));
  const cache = createCache(SEARCH_TTL_MS);
  // Daily per-client allowance and a shared SerpApi credit ceiling (see lib/budget.js). Tests inject their own.
  const budget = deps.budget ?? createBudget({
    perClient: {
      search: Number(process.env.BUDGET_SEARCHES_PER_DAY) || undefined,
      chat: Number(process.env.BUDGET_CHATS_PER_DAY) || undefined,
      ideas: Number(process.env.BUDGET_IDEAS_PER_DAY) || undefined,
    },
    serpCredits: Number(process.env.BUDGET_SERP_CREDITS_PER_DAY) || undefined,
  });
  // Every real SerpApi call (a cache miss) spends a credit. Throwing here means "treat as a failed call".
  const spendSerp = () => { if (!budget.takeSerp(1).ok) throw new Error('serpapi credit ceiling reached'); };
  const dailyLimited = (res, kind, req) => {
    const r = budget.take(req.ip, kind);
    if (r.ok) return false;
    res.set('Retry-After', String(r.retryAfterSec));
    res.status(429).json({ error: 'daily limit', retryAfterSec: r.retryAfterSec });
    return true;
  };
  const fetchImpl = deps.fetchImpl ?? fetch;

  // One SerpApi query. A failure (error field, non-2xx, network) with a location is retried once without it.
  // "No results" is not a failure: it comes back as an empty shopping_results list.
  // Successful JSON is cached per (query, location) so prewarm and overlapping requests share work.
  async function runQuery(q, location) {
    const ckey = JSON.stringify([q.trim().toLowerCase(), location ?? '']);
    const hit = cache.get(ckey);
    if (hit !== undefined) return hit;
    const json = await fetchQuery(q, location);
    cache.set(ckey, json);
    return json;
  }

  // Amazon Search API, cached like the others. Any failure just means no Amazon items.
  // Amazon sometimes answers "no results" for an exact phrase that a close variant finds ("gaming keyboard" fails,
  // "gaming keyboards" works), so a failed query is retried with its last word pluralized, then without its first word.
  async function runAmazonOnce(q) {
    const ckey = JSON.stringify(['amazon', q.trim().toLowerCase()]);
    const hit = cache.get(ckey);
    if (hit !== undefined) return hit;
    spendSerp();
    const json = await searchAmazon({ q }, { apiKey: deps.serpApiKey, fetchImpl });
    if (json?.error) throw new Error(json.error);
    cache.set(ckey, json);
    return json;
  }

  async function runAmazon(q) {
    const words = q.trim().split(/\s+/);
    const variants = [];
    const last = words[words.length - 1];
    if (!/s$/i.test(last)) variants.push([...words.slice(0, -1), pluralize(last)].join(' '));
    if (words.length > 1) variants.push(words.slice(1).join(' '));
    let err;
    for (const v of [q, ...variants]) {
      try { return await runAmazonOnce(v); } catch (e) { err ??= e; }
    }
    throw err;
  }

  async function fetchQuery(q, location) {
    const attempt = async (loc) => {
      spendSerp();
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
  app.post('/api/search', searchLimit, async (req, res) => {
    const query = req.body?.query ?? {};
    const city = req.body?.city || undefined;
    if (!query.query) return res.status(400).json({ error: 'missing query' });
    if (deps.demoMode || req.body?.demo === true || !deps.serpApiKey) return res.json({ products: demoFor(query), demo: true });
    // Over this client's daily searches, or the shared credit pool is empty: serve showroom stock, no SerpApi call.
    // Counted per search request (a cache hit still counts, to keep the rule simple to explain).
    const need = budget.take(req.ip, 'search');
    if (!need.ok || budget.serpLeft() < 1) {
      return res.json({ products: demoFor(query), demo: true, limited: true, retryAfterSec: need.retryAfterSec });
    }

    try {
      const extras = (Array.isArray(query.extra_queries) ? query.extra_queries : []).slice(0, 2);
      const [amazonJson, mainJson, ...extraJsons] = await Promise.all([
        deps.amazon ? runAmazon(query.query).catch((err) => { console.warn('amazon failed:', err.message); return {}; }) : {},
        runQuery(query.query, city),
        ...extras.map((q) => runQuery(q, city).catch(() => ({}))),
      ]);
      const mainProducts = normalizeShoppingResults(mainJson);
      const seen = new Set();
      const dedupe = (list) => list.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      const googleMain = dedupe(mainProducts); // main first, so a main item wins over a duplicate related one
      const amazon = dedupe(normalizeAmazonResults(amazonJson)).slice(0, MAX_AMAZON);
      // One Amazon item after every 3 Google Shopping items; leftovers go at the end.
      const main = [];
      let ai = 0;
      googleMain.forEach((p, i) => {
        main.push(p);
        if ((i + 1) % 3 === 0 && ai < amazon.length) main.push(amazon[ai++]);
      });
      main.push(...amazon.slice(ai));
      main.forEach((p, i) => { p.relevance = i; });
      // Related relevance continues after the main items, one contiguous run across all extra queries.
      let nextRelevance = main.length;
      const relatedAll = [];
      for (const j of extraJsons) {
        const r = normalizeShoppingResults(j, { related: true, startRelevance: nextRelevance });
        nextRelevance += r.length;
        relatedAll.push(...r);
      }
      // Reserve up to MAX_RELATED slots for related items; main fills the rest up to MAX_PRODUCTS.
      const relatedDeduped = dedupe(relatedAll);
      const relatedKept = relatedDeduped.slice(0, MAX_RELATED);
      const mainKept = main.slice(0, MAX_PRODUCTS - relatedKept.length);
      const products = assignTiers([...mainKept, ...relatedKept]);
      // Everything that did not fit on the shelves is kept (tiered on its own) for later features.
      const leftovers = assignTiers([...main.slice(mainKept.length), ...relatedDeduped.slice(MAX_RELATED)].slice(0, MAX_EXTRAS));
      res.json({ products, extras: leftovers });
    } catch (err) {
      console.warn('search failed:', err.message);
      res.json({ products: demoFor(query), demo: true });
    }
  });

  // "Try Next" post-its on the back wall: follow-up search ideas from Gemini. Never touches SerpApi.
  const DEMO_IDEAS = ['Mouse pad', 'Wrist rest', 'Keyboard', 'Headset', 'Webcam', 'Laptop stand', 'USB hub', 'Desk lamp'];
  const DEMO_IDEAS_CLOTHES = ['Belt', 'Scarf', 'Beanie', 'Socks', 'Sunglasses', 'Tote bag', 'Gloves', 'Watch'];
  app.post('/api/ideas', ideasLimit, async (req, res) => {
    const query = req.body?.query ?? {};
    if (!query.query) return res.status(400).json({ error: 'missing query' });
    if (deps.demoMode || req.body?.demo === true || !deps.llm) return res.json({ ideas: isClothingQuery(query) ? DEMO_IDEAS_CLOTHES : DEMO_IDEAS, demo: true });
    if (dailyLimited(res, 'ideas', req)) return;
    const titles = (Array.isArray(req.body?.titles) ? req.body.titles : []).slice(0, 5)
      .filter((t) => typeof t === 'string').map((t) => t.slice(0, 120));
    res.json({ ideas: await generateIdeas({ query, titles }, deps.llm) });
  });

  app.post('/api/chat', chatLimit, async (req, res) => {
    if (dailyLimited(res, 'chat', req)) return;
    res.json(await chatTurn(req.body || {}, deps.llm));
  });

  const MAX_STICKER_ITEMS = 60;
  app.post('/api/stickers', stickersLimit, async (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items)) return res.json({ stickers: [] });
    const valid = items.filter((it) => it && typeof it === 'object' && it.id != null).slice(0, MAX_STICKER_ITEMS);
    res.json({ stickers: await generateStickers(valid, deps.llm) });
  });

  // Privacy: coordinates are rounded to 2 decimals (~1 km) before leaving the server
  // and are NEVER logged (no console.*, no error logging with the request body).
  app.post('/api/geocode', geocodeLimit, async (req, res) => {
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
  const IMG_HOSTS = ['gstatic.com', 'googleusercontent.com', 'serpapi.com', 'media-amazon.com'];
  const IMG_MAX_BYTES = 2 * 1024 * 1024;
  const IMG_TIMEOUT_MS = 8000;
  app.get('/api/img', imgLimit, async (req, res) => {
    let url;
    try { url = new URL(String(req.query.u ?? '')); } catch { return res.status(400).end(); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.port !== '' || !IMG_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
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
      res.set({
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': 'sandbox',
      });
      res.send(Buffer.concat(chunks));
    } catch {
      res.status(502).end();
    }
  });

  if (deps.serveStatic) app.use(express.static(publicDir));

  return app;
}
