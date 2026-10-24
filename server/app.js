import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatTurn } from './lib/clerk.js';
import { reverseGeocode, DEFAULT_CITY } from './lib/geocode.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// deps: { llm?, fetchImpl?, serpApiKey?, demoMode?, serveStatic? }
export function createApp(deps = {}) {
  const app = express();
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

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
      res.json({ city: await reverseGeocode(r2(lat), r2(lng), deps.fetchImpl ?? fetch, deps.geocodeTimeoutMs) });
    } catch {
      res.json({ city: DEFAULT_CITY });
    }
  });

  if (deps.serveStatic) app.use(express.static(publicDir));

  return app;
}
