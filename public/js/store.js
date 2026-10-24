// Client state store + phase machine. Pure JS: no DOM, no bare imports.

export const PHASES = ['INTRO', 'LOCATION', 'CHATTING', 'SEARCHING', 'OPENING', 'BROWSING'];

export function canTransition(from, to) {
  const i = PHASES.indexOf(from);
  const j = PHASES.indexOf(to);
  if (i < 0 || j < 0) return false;
  if (j === i + 1) return true;
  if (from === 'SEARCHING' && to === 'CHATTING') return true;
  if (from === 'BROWSING' && to === 'CHATTING') return true;
  return false;
}

export function movementEnabled(state) {
  return state.phase === 'BROWSING' && !state.inputFocused;
}

function initialState() {
  return {
    phase: 'INTRO',
    status: 'idle',
    location: null,
    voice: { micAvailable: false, ttsMuted: false },
    query: null,
    products: [],
    extras: [], // leftover results that did not fit on the shelves, kept for future features
    messages: [],
    inputFocused: false,
    replay: null,
  };
}

export function createStore(initial = {}) {
  let state = { ...initialState(), ...initial };
  const listeners = new Map();

  function emit(event, ...args) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) fn(...args);
  }

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  }

  function get() {
    return state;
  }

  function set(patch) {
    const changedKeys = Object.keys(patch).filter((k) => state[k] !== patch[k]);
    if (changedKeys.length === 0) return;
    state = { ...state, ...patch };
    emit('change', state, changedKeys);
  }

  function setPhase(p) {
    if (!canTransition(state.phase, p)) {
      throw new Error(`Invalid phase transition: ${state.phase} -> ${p}`);
    }
    set({ phase: p });
    emit(`phase:${p}`, state);
  }

  return { get, set, setPhase, on };
}

export const store = createStore();
