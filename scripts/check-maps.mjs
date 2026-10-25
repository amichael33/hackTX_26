// Browser check: every map in public/js/maps.js must load cleanly in demo mode, in a normal and a clothing search.
// Fails (exit 1) on console errors, page errors, failed same-origin requests, or any request to a non-localhost origin.
// Usage: npm run check:maps   (CHROME_PATH overrides the browser; CHECK_MAPS_OUT sets the screenshot dir)
// Never touches SerpApi: the server runs with demoMode and no keys.
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { MAPS } from '../public/js/maps.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.CHECK_MAPS_OUT || path.join(root, '.check-maps-out');
const MAP_KEY = 'store.map.v1'; // keep in sync with public/js/main.js
const MODES = [
  { name: 'normal', text: 'wireless mouse' },
  { name: 'clothing', text: 'denim jacket' },
];

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) {
  console.log('check:maps SKIPPED: no Chrome/Edge found (set CHROME_PATH to a browser executable).');
  process.exit(0);
}

const { default: puppeteer } = await import('puppeteer-core');
mkdirSync(outDir, { recursive: true });

const app = createApp({ serveStatic: true, demoMode: true });
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const origin = `http://127.0.0.1:${server.address().port}`;
const isLocal = (u) => /^(http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/.test(u);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});

const results = [];
const only = (process.env.CHECK_MAPS_ONLY || '').split(',').filter(Boolean); // e.g. CHECK_MAPS_ONLY=castle
for (const map of MAPS.filter((m) => !only.length || only.includes(m.id))) {
  for (const mode of MODES) {
    const errors = [];
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }, MAP_KEY, map.id);
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()} ${m.location()?.url ?? ''}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => { if (isLocal(r.url())) errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`); });
    page.on('response', (r) => { if (isLocal(r.url()) && r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
    page.on('request', (r) => { if (!isLocal(r.url())) errors.push(`external request: ${r.url()}`); });
    const label = `${map.id}/${mode.name}`;
    try {
      await page.goto(`${origin}/?demo=1`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => document.querySelector('a-scene')?.hasLoaded && window.store, { timeout: 60000 });
      const picked = await page.evaluate(() => document.querySelector('.map-card[aria-checked="true"] strong')?.textContent);
      if (picked !== map.name) errors.push(`map picker shows "${picked}", expected "${map.name}"`);
      await page.screenshot({ path: path.join(outDir, `${map.id}-${mode.name}-0-intro.png`) });
      await page.click('#enter-btn');
      await page.waitForSelector('#skip-loc-btn', { visible: true, timeout: 30000 });
      await page.click('#skip-loc-btn');
      // The clerk must finish greeting (status idle) or the submit is ignored.
      await page.waitForFunction(() => {
        const i = document.getElementById('chat-input');
        const s = window.store.get();
        return i && !i.disabled && s.phase === 'CHATTING' && s.status === 'idle';
      }, { timeout: 60000 });
      await page.type('#chat-input', mode.text);
      await page.click('#send-btn');
      await page.waitForFunction(() => window.store.get().phase === 'BROWSING', { timeout: 120000 });
      const n = await page.evaluate(() => window.store.get().products.length);
      const boxes = await page.evaluate(() => document.querySelectorAll('#products > *').length);
      if (!n || !boxes) errors.push(`no products on shelves (store ${n}, entities ${boxes})`);
      await sleep(4000); // let the opening animation settle
      await page.screenshot({ path: path.join(outDir, `${map.id}-${mode.name}-1-spawn.png`) });
      // Overview from above the middle of the room, looking down the store.
      await page.evaluate((room) => {
        const rig = document.getElementById('rig');
        rig.removeAttribute('bounds');
        rig.setAttribute('position', `0 ${room.height * 0.8} ${room.depth / 2 - 0.8}`);
        rig.components['look-controls'].pitchObject.rotation.x = -0.35;
      }, map.room);
      await sleep(800);
      await page.screenshot({ path: path.join(outDir, `${map.id}-${mode.name}-2-overview.png`) });
    } catch (e) {
      errors.push(`flow: ${e.message}`);
      try { await page.screenshot({ path: path.join(outDir, `${map.id}-${mode.name}-fail.png`) }); } catch (e2) { /* ignore */ }
    }
    const uniq = [...new Set(errors)];
    results.push({ label, errors: uniq });
    console.log(`${uniq.length ? 'FAIL' : 'PASS'} ${label}`);
    for (const e of uniq) console.log(`   ${e}`);
    await page.close();
  }
}

await browser.close();
server.close();
console.log(`Screenshots: ${outDir}`);
const failed = results.filter((r) => r.errors.length);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
