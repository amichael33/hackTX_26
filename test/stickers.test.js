import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_STICKERS, fallbackSticker, cleanStickerText, generateStickers } from '../server/lib/stickers.js';
import { createApp } from '../server/app.js';

const items = [
  { id: 'a', title: 'Cheap Keyboard', price: '$39', tier: 'budget' },
  { id: 'b', title: 'Pink Top', price: '$59', tier: 'mid' },
  { id: 'c', title: 'Apple Watch', price: '$799', tier: 'premium' },
];

test('fallbackSticker is deterministic and in tier list; unknown tier uses mid', () => {
  assert.equal(fallbackSticker('budget', 'abc'), fallbackSticker('budget', 'abc'));
  assert.ok(FALLBACK_STICKERS.budget.includes(fallbackSticker('budget', 'abc')));
  assert.ok(FALLBACK_STICKERS.mid.includes(fallbackSticker('weird', 'abc')));
});

test('cleanStickerText', () => {
  assert.equal(cleanStickerText('so very very cheap wow'), 'SO VERY VERY CHEAP');
  assert.equal(cleanStickerText('<script>'), 'SCRIPT');
  assert.equal(cleanStickerText('   '), null);
  assert.equal(cleanStickerText(42), null);
  assert.equal(cleanStickerText('Wow!  so   cheap'), 'WOW! SO CHEAP');
  const long = cleanStickerText('supercalifragilistic expialidocious');
  assert.ok(long.length <= 24);
  assert.equal(cleanStickerText('abcdefghij klmnopqrst uvwxyz'), 'ABCDEFGHIJ KLMNOPQRST');
});

test('generateStickers: one call, schema, partial model output falls back', async () => {
  let calls = 0, arg;
  const llm = async (a) => { calls++; arg = a; return { stickers: [{ id: 'b', sticker_text: 'nice top!' }, { id: 'zzz', sticker_text: 'ghost' }] }; };
  const out = await generateStickers(items, llm);
  assert.equal(calls, 1);
  assert.ok(arg.schema.properties.stickers);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((s) => s.id), ['a', 'b', 'c']);
  assert.equal(out[1].sticker_text, 'NICE TOP!');
  assert.ok(FALLBACK_STICKERS.budget.includes(out[0].sticker_text));
  assert.ok(FALLBACK_STICKERS.premium.includes(out[2].sticker_text));
});

test('generateStickers: throwing llm or junk output falls back for all', async () => {
  const out = await generateStickers(items, async () => { throw new Error('boom'); });
  assert.equal(out.length, 3);
  assert.equal(out[0].sticker_text, fallbackSticker('budget', 'a'));
  const out2 = await generateStickers(items, async () => 'junk');
  assert.equal(out2.length, 3);
  assert.deepEqual(await generateStickers([], async () => ({})), []);
});

async function post(deps, body) {
  const server = createApp(deps).listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/stickers`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: r.status, json: await r.json() };
  } finally { server.closeAllConnections(); server.close(); }
}

test('POST /api/stickers', async () => {
  const llm = async () => ({ stickers: [{ id: 'a', sticker_text: 'cheap!' }] });
  const r = await post({ llm }, { items });
  assert.equal(r.status, 200);
  assert.equal(r.json.stickers.length, 3);
  assert.equal(r.json.stickers[0].sticker_text, 'CHEAP!');
  assert.deepEqual((await post({ llm }, {})).json, { stickers: [] });
  assert.deepEqual((await post({ llm }, { items: 'x' })).json, { stickers: [] });
  const many = Array.from({ length: 70 }, (_, i) => ({ id: 'i' + i, title: 't', price: '$1', tier: 'mid' }));
  assert.equal((await post({ llm: async () => ({}) }, { items: many })).json.stickers.length, 60);
});
