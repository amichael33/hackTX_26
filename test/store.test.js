import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASES, canTransition, createStore, movementEnabled, store } from '../public/js/store.js';

test('PHASES order', () => {
  assert.deepEqual(PHASES, ['INTRO', 'LOCATION', 'CHATTING', 'SEARCHING', 'OPENING', 'BROWSING']);
});

test('canTransition', () => {
  assert.equal(canTransition('INTRO', 'LOCATION'), true);
  assert.equal(canTransition('INTRO', 'BROWSING'), false);
  assert.equal(canTransition('SEARCHING', 'CHATTING'), true);
  assert.equal(canTransition('BROWSING', 'CHATTING'), true);
  assert.equal(canTransition('CHATTING', 'INTRO'), false);
  assert.equal(canTransition('BROWSING', 'INTRO'), false);
});

test('initial state and singleton', () => {
  const s = createStore();
  assert.deepEqual(s.get(), {
    phase: 'INTRO', status: 'idle', location: null,
    voice: { micAvailable: false, ttsMuted: false },
    query: null, products: [], messages: [], inputFocused: false,
  });
  assert.equal(typeof store.get, 'function');
});

test('setPhase throws on invalid transition', () => {
  const s = createStore();
  assert.throws(() => s.setPhase('BROWSING'));
  assert.equal(s.get().phase, 'INTRO');
});

test('phase event fires once and unsubscribe works', () => {
  const s = createStore();
  let n = 0;
  const off = s.on('phase:LOCATION', () => n++);
  s.setPhase('LOCATION');
  assert.equal(n, 1);
  off();
  s.setPhase('CHATTING');
  s.setPhase('SEARCHING');
  s.setPhase('CHATTING');
  s.setPhase('SEARCHING');
  assert.equal(n, 1);
});

test('setPhase emits change with phase key', () => {
  const s = createStore();
  const calls = [];
  s.on('change', (st, keys) => calls.push([st.phase, keys]));
  s.setPhase('LOCATION');
  assert.deepEqual(calls, [['LOCATION', ['phase']]]);
});

test('set emits change with changedKeys only for changed values', () => {
  const s = createStore();
  const calls = [];
  s.on('change', (st, keys) => calls.push(keys));
  s.set({ status: 'thinking' });
  assert.deepEqual(calls, [['status']]);
  s.set({ status: 'thinking' });
  assert.equal(calls.length, 1);
  s.set({ status: 'thinking', inputFocused: true });
  assert.deepEqual(calls[1], ['inputFocused']);
  assert.equal(s.get().status, 'thinking');
});

test('movementEnabled', () => {
  assert.equal(movementEnabled({ phase: 'BROWSING', inputFocused: true }), false);
  assert.equal(movementEnabled({ phase: 'CHATTING', inputFocused: false }), false);
  assert.equal(movementEnabled({ phase: 'BROWSING', inputFocused: false }), true);
});
