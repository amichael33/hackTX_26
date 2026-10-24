import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGeminiLlm } from '../server/lib/llm.js';

function fakeFetch(status, body) {
  const fn = async (url, init) => {
    fn.url = url; fn.init = init;
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return fn;
}
const ok = { candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] };

test('makeGeminiLlm builds request and parses result', async () => {
  const f = fakeFetch(200, ok);
  const llm = makeGeminiLlm('SECRET', 'gem-model', f);
  const schema = { type: 'object' };
  const out = await llm({ system: 'sys', messages: [{ role: 'user', text: 'hi' }, { role: 'clerk', text: 'yo' }], schema });
  assert.deepEqual(out, { a: 1 });
  assert.ok(f.url.includes('gem-model:generateContent'));
  assert.ok(!f.url.includes('key='));
  assert.ok(!f.url.includes('SECRET'));
  assert.equal(f.init.headers['x-goog-api-key'], 'SECRET');
  assert.equal(f.init.headers['content-type'], 'application/json');
  assert.equal(f.init.method, 'POST');
  assert.ok(f.init.signal);
  const body = JSON.parse(f.init.body);
  assert.deepEqual(body.systemInstruction, { parts: [{ text: 'sys' }] });
  assert.deepEqual(body.contents.map((m) => m.role), ['user', 'model']);
  assert.deepEqual(body.contents[1].parts, [{ text: 'yo' }]);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseSchema, schema);
});

test('makeGeminiLlm throws on 500 without leaking key', async () => {
  const llm = makeGeminiLlm('SECRET', 'm', fakeFetch(500, { error: 'x' }));
  await assert.rejects(() => llm({ system: 's', messages: [], schema: {} }), (e) => /500/.test(e.message) && !e.message.includes('SECRET'));
});

test('makeGeminiLlm throws immediately without apiKey', async () => {
  const f = fakeFetch(200, ok);
  const llm = makeGeminiLlm('', 'm', f);
  await assert.rejects(() => llm({ system: 's', messages: [], schema: {} }));
  assert.equal(f.url, undefined);
});
