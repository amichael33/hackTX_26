import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatTurn } from './lib/clerk.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// deps: { llm?, fetchImpl?, serpApiKey?, demoMode?, serveStatic? }
export function createApp(deps = {}) {
  const app = express();
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.post('/api/chat', async (req, res) => {
    res.json(await chatTurn(req.body || {}, deps.llm));
  });

  if (deps.serveStatic) app.use(express.static(publicDir));

  return app;
}
