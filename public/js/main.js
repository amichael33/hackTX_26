import { store, movementEnabled } from './store.js';
import { postChat } from './api.js';
import { clerkSay, onPlayerSubmit, addLogLine } from './ui.js';

window.store = store; // console debugging

const DEFAULT_CITY = 'Austin, Texas, United States';
const GREETING = 'Hi! Welcome in. What are you shopping for today?';
const CHAT_FALLBACK = "Sorry, I didn't catch that. What are you looking for?";

const scene = document.querySelector('a-scene');
const intro = document.getElementById('intro');
const enterBtn = document.getElementById('enter-btn');

function applyState(state) {
  const rig = document.getElementById('rig');
  const clerk = document.getElementById('clerk');
  if (rig) rig.setAttribute('wasd-controls', 'enabled', movementEnabled(state));
  if (clerk) clerk.setAttribute('clerk', 'state', state.status);
}

function boot() {
  applyState(store.get());
  store.on('change', (state) => applyState(state));
}

if (scene.hasLoaded) boot();
else scene.addEventListener('loaded', boot, { once: true });

// Say a line as the clerk and record it in the conversation history.
async function say(text) {
  store.set({ messages: [...store.get().messages, { role: 'clerk', text }] });
  await clerkSay(text);
  if (store.get().status !== 'idle') store.set({ status: 'idle' });
}

// TEMPORARY BRIDGE (ruling R2): Task 5 replaces this with the real location step
// (geolocation / typed city). Must end in CHATTING with store.location set.
function startLocationStep() {
  store.set({ location: { city: DEFAULT_CITY, source: 'default' } });
  store.setPhase('CHATTING');
  say(GREETING);
}
store.on('phase:LOCATION', startLocationStep);

async function runTurn(text) {
  const messages = [...store.get().messages, { role: 'user', text }];
  store.set({ messages, status: 'thinking' });
  addLogLine('user', text);

  let res;
  try {
    res = await postChat({ messages, location: store.get().location });
  } catch (err) {
    console.warn('chat failed', err);
    await say(CHAT_FALLBACK);
    return;
  }

  await say(res.reply_to_player);
  if (res.ready) {
    const { query, min_price, max_price, preferences, extra_queries } = res;
    store.set({ query: { query, min_price, max_price, preferences, extra_queries } });
    store.setPhase('SEARCHING'); // Task 6 handles phase:SEARCHING
  }
}

// Returns false when the submit is ignored so the UI keeps the typed text.
function handlePlayerSubmit(raw) {
  const text = String(raw ?? '').trim();
  const s = store.get();
  if (!text) return false;
  if (s.phase !== 'CHATTING' || s.status === 'thinking' || s.status === 'speaking') return false;
  runTurn(text).catch((err) => {
    console.error(err);
    if (store.get().status !== 'idle') store.set({ status: 'idle' });
  });
  return true;
}
onPlayerSubmit(handlePlayerSubmit);

enterBtn.addEventListener('click', () => {
  try { window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* unsupported */ }
  intro.classList.add('hidden');
  store.setPhase('LOCATION');
});
