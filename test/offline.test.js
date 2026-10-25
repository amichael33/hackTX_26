import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = readFileSync(join(pub, 'index.html'), 'utf8');
const fontsCss = readFileSync(join(pub, 'vendor/fonts/fonts.css'), 'utf8');

test('page loads no scripts or stylesheets from another origin', () => {
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 5);
  assert.deepEqual(refs.filter((r) => /^(https?:)?\/\//.test(r)), []);
});

test('every local script and stylesheet the page references exists', () => {
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1]).filter((r) => !/^(https?:|data:)/.test(r));
  const missing = refs.filter((r) => !existsSync(join(pub, r)));
  assert.deepEqual(missing, []);
});

test('vendored font css points only at files shipped next to it', () => {
  const urls = [...fontsCss.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''));
  assert.ok(urls.length >= 3);
  for (const u of urls) {
    assert.ok(!/^(https?:)?\/\//.test(u), u);
    assert.ok(existsSync(join(pub, 'vendor/fonts', u)), u);
  }
});
