import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { makeGeminiLlm } from './lib/llm.js';
import { parseTrustProxy, listenHost } from './lib/env.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env'), quiet: true });

const app = createApp({
  llm: makeGeminiLlm(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'),
  serpApiKey: process.env.SERPAPI_KEY,
  demoMode: process.env.DEMO_MODE === '1',
  amazon: process.env.AMAZON_RESULTS !== '0', // Amazon Search API results; set AMAZON_RESULTS=0 to save SerpApi credits
  serveStatic: process.env.NODE_ENV !== 'production',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY), // TRUST_PROXY=uniquelocal when the proxy is another container
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, listenHost(), () => console.log(`store server listening on :${port}`));
