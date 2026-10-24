import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatTurn, MAX_TURNS } from '../server/lib/clerk.js';
import { createApp } from '../server/app.js';

const FALLBACK = "Sorry, I didn't catch that. What are you looking for?";
const loc = { city: 'Austin, Texas, United States', source: 'default' };
const u = (text) => ({ role: 'user', text });
const c = (text) => ({ role: 'clerk', text });

function fakeLlm(result) {
  const fn = async (arg) => { fn.arg = arg; return result; };
  return fn;
}

test('passes city into system prompt', async () => {
  const llm = fakeLlm({ ready: false, reply_to_player: 'hi' });
  await chatTurn({ messages: [u('hello')], location: loc }, llm);
  assert.ok(llm.arg.system.includes('Austin'));
  assert.ok(llm.arg.system.startsWith("You're a friendly store clerk."));
  assert.deepEqual(llm.arg.messages, [u('hello')]);
  assert.ok(llm.arg.schema);
});

test('forces ready on last turn', async () => {
  assert.equal(MAX_TURNS, 4);
  const llm = fakeLlm({ ready: false, reply_to_player: 'hi' });
  await chatTurn({ messages: [u('a'), c('b'), u('a'), c('b'), u('a'), c('b'), u('a')], location: loc }, llm);
  assert.ok(llm.arg.system.includes('MUST set ready'));
  await chatTurn({ messages: [u('a'), c('b'), u('a'), c('b'), u('a')], location: loc }, llm);
  assert.ok(!llm.arg.system.includes('MUST set ready'));
});

test('ready with empty query is downgraded', async () => {
  const r = await chatTurn({ messages: [u('x')], location: loc }, fakeLlm({ ready: true, query: '  ', reply_to_player: 'ok' }));
  assert.equal(r.ready, false);
});

test('llm throws returns fallback', async () => {
  const llm = async () => { throw new Error('boom'); };
  const r = await chatTurn({ messages: [u('x')], location: loc }, llm);
  assert.deepEqual(r, {
    ready: false, reply_to_player: FALLBACK, query: '',
    min_price: null, max_price: null, preferences: [], extra_queries: [],
  });
});

test('missing llm or non-array messages gives fallback', async () => {
  const r = await chatTurn({ messages: 'nope' }, undefined);
  assert.equal(r.ready, false);
  assert.equal(r.reply_to_player, FALLBACK);
  const llm = fakeLlm({ ready: false, reply_to_player: 'hi' });
  await chatTurn({ messages: null }, llm);
  assert.deepEqual(llm.arg.messages, []);
});

test('normalizes fields', async () => {
  const r = await chatTurn({ messages: [u('x')], location: loc }, fakeLlm({
    ready: true, query: 'keyboard', max_price: '120', min_price: null,
    extra_queries: ['a', 'b', 'c'], reply_to_player: 'ok',
  }));
  assert.equal(r.ready, true);
  assert.deepEqual(r.preferences, []);
  assert.deepEqual(r.extra_queries, ['a', 'b']);
  assert.equal(r.max_price, 120);
  assert.equal(r.min_price, null);
});

test('POST /api/chat returns ClerkResponse', async () => {
  const llm = fakeLlm({ ready: true, query: 'kb', reply_to_player: 'ok' });
  const server = createApp({ llm }).listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [u('kb')], location: loc }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ready, true);
    assert.equal(body.query, 'kb');
    const bad = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(bad.status, 200);
    await bad.json();
    assert.deepEqual(llm.arg.messages, []);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
