import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPS } from '../public/js/maps.js';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = readFileSync(join(pub, 'index.html'), 'utf8');
const fontsCss = readFileSync(join(pub, 'vendor/fonts/landing-fonts.css'), 'utf8');

test('landing page loads nothing from another origin (its fonts are vendored)', () => {
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 1);
  assert.deepEqual(refs.filter((r) => /^(https?:)?\/\//.test(r)), []);
  for (const r of refs.filter((x) => !x.startsWith('data:'))) assert.ok(existsSync(join(pub, r)), r);
});

test('every font file the landing css points at ships next to it', () => {
  const urls = [...fontsCss.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''));
  assert.ok(urls.length >= 7);
  for (const u of urls) {
    assert.ok(!/^(https?:)?\/\//.test(u), u);
    assert.ok(existsSync(join(pub, 'vendor/fonts', u)), u);
  }
  for (const family of ['Cinzel', 'Playfair Display', 'Pacifico', 'Anton', 'Space Grotesk', 'JetBrains Mono']) {
    assert.ok(fontsCss.includes(`font-family: '${family}'`), family);
  }
});

test('the four tiles are real links that pick the stores, in the designed order', () => {
  const tiles = [...html.matchAll(/<a class="tile" href="([^"]+)" data-map="([^"]+)"[^>]*aria-label="([^"]+)"/g)].map((m) => ({ href: m[1], id: m[2], label: m[3] }));
  assert.deepEqual(tiles.map((t) => t.label), ['Castle Great Hall', 'Classic Store', 'Cozy Boutique', 'Big Box Warehouse']);
  assert.deepEqual(tiles.map((t) => t.href), ['castle', 'classic', 'boutique', 'warehouse'].map((id) => `?map=${id}`));
  for (const t of tiles) {
    const id = new URL(t.href, 'http://x/').searchParams.get('map');
    assert.equal(id, t.id);
    const map = MAPS.find((m) => m.id === id);
    assert.ok(map, `${t.href} names no map`);
    assert.equal(map.name, t.label);
  }
});

test('start screen: "Start shopping" sits below the tiles, then the two phone options (hidden until a touch device)', () => {
  const at = (s) => { const i = html.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at('id="intro-tiles"') < at('id="enter-btn"'));
  assert.ok(at('id="enter-btn"') < at('id="immersive-check"'));
  assert.ok(at('id="immersive-check"') < at('id="joystick-check"'));
  assert.match(html, /<button id="enter-btn"[^>]*>Start shopping<\/button>/);
  assert.match(html, /id="immersive-row"[^>]*hidden/);
  assert.match(html, /id="joystick-row"[^>]*hidden/);
});

test('start screen never scrolls: fixed to the viewport, overflow hidden, tiles flex into the leftover height', () => {
  const css = readFileSync(join(pub, 'css/ui.css'), 'utf8');
  const block = (sel) => { const m = css.match(new RegExp(`${sel.replace(/[#.]/g, '\$&')} \{([^}]*)\}`)); assert.ok(m, sel); return m[1]; };
  assert.match(block('#intro'), /position: fixed; inset: 0/);
  assert.match(block('#intro'), /overflow: hidden/);
  assert.doesNotMatch(block('#intro'), /overflow-y: auto|overflow: auto|overflow: scroll/);
  assert.match(block('#intro-main'), /height: 100%/);
  assert.doesNotMatch(block('#intro-main'), /min-height/);
  assert.match(block('#intro-tiles'), /flex: 1 1 0; min-height: 0/);
  assert.match(html, /<h1 class="intro-title">/);
  assert.ok(!/id="intro-main"[\s\S]{0,400}style="/.test(html.split('<div id="intro-tiles"')[0]), 'header sizing must live in the css, where media queries can reach it');
});

test('the page has a favicon and the file ships', () => {
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="favicon\.svg">/);
  const svg = readFileSync(join(pub, 'favicon.svg'), 'utf8');
  assert.match(svg, /^<svg[^>]*viewBox="0 0 100 100"/);
});
