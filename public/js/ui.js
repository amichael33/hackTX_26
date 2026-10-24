// Overlay wiring: chat bar, subtitle typewriter, chat log, mute/skip.
import { store } from './store.js';
import { speak, cancelSpeech, createRecognizer } from './voice.js';
import { formatPrice } from './text.js';

const CHAR_MS = 35;

const $ = (id) => document.getElementById(id);
const subtitle = $('subtitle');
const subtitleText = $('subtitle-text');
const logEl = $('chat-log');
const logList = $('chat-log-list');
const logToggle = $('chat-log-toggle');
const chatBar = $('chat-bar');
const chatForm = $('chat-form');
const chatInput = $('chat-input');
const sendBtn = $('send-btn');
const muteBtn = $('mute-btn');
const micBtn = $('mic-btn');
const skipBtn = $('skip-btn');
const locPanel = $('location-panel');
const shareBtn = $('share-loc-btn');
const typeBtn = $('type-loc-btn');
const locForm = $('location-form');
const locInput = $('location-input');
const locSubmit = $('location-submit');

let current = null; // { text, timer, typeDone, speechDone, resolve }
let submitHandler = null;
let locationHandlers = null; // { onShare(), onTyped(text) }
let locationShown = false;

export function addLogLine(role, text) {
  const li = document.createElement('li');
  li.className = role === 'user' ? 'log-user' : 'log-clerk';
  li.textContent = text;
  logList.appendChild(li);
  logList.scrollTop = logList.scrollHeight;
}

function finish(c) {
  if (current !== c || !(c.typeDone && c.speechDone)) return;
  clearInterval(c.timer);
  current = null;
  store.set({ status: 'idle' });
  skipBtn.hidden = true;
  c.resolve();
}

function skip() {
  const c = current;
  if (!c) return;
  cancelSpeech();
  clearInterval(c.timer);
  subtitleText.textContent = c.text;
  c.typeDone = true;
  c.speechDone = true;
  finish(c);
}

// Resolves when speech and typewriter are both done.
export function clerkSay(text) {
  skip(); // finish any line still in progress
  text = String(text ?? '').trim();
  if (!text) return Promise.resolve();

  addLogLine('clerk', text);
  return new Promise((resolve) => {
    const c = { text, timer: null, typeDone: false, speechDone: false, resolve };
    current = c;
    store.set({ status: 'speaking' });
    subtitle.hidden = false;
    skipBtn.hidden = false;
    subtitleText.textContent = '';
    let n = 0;
    c.timer = setInterval(() => {
      n++;
      subtitleText.textContent = text.slice(0, n);
      if (n >= text.length) { clearInterval(c.timer); c.typeDone = true; finish(c); }
    }, CHAR_MS);
    speak(text, { onEnd: () => { c.speechDone = true; finish(c); } });
  });
}

export function onPlayerSubmit(handler) {
  submitHandler = handler;
}

// --- DOM wiring ---
// A text input that must never drive the avatar: tracks focus in the store and keeps
// typed keys away from A-Frame's wasd-controls.
function guardTypedInput(input) {
  input.addEventListener('focus', () => store.set({ inputFocused: true }));
  input.addEventListener('blur', () => store.set({ inputFocused: false }));
  for (const ev of ['keydown', 'keypress']) {
    input.addEventListener(ev, (e) => e.stopPropagation());
  }
}
guardTypedInput(chatInput);
guardTypedInput(locInput);

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  if (!submitHandler) return;
  // The handler returns false when it rejects the submit (busy / wrong phase): keep the text.
  if (submitHandler(text) !== false) chatInput.value = '';
});

skipBtn.addEventListener('click', skip);

// --- Location panel ---
export function onLocationChoice(handlers) {
  locationHandlers = handlers;
}

// Reveals the panel (only takes effect while phase is LOCATION). typed: show the field now.
export function showLocationPanel({ typed = false } = {}) {
  locationShown = true;
  if (typed) showTypedField();
  renderPhase(store.get());
}

export function showTypedField() {
  locForm.hidden = false;
  typeBtn.hidden = true;
  locInput.focus();
}

// Disable Share and the typed submit ('Type a city' stays enabled as an escape) while a request is in flight.
export function setLocationBusy(busy) {
  shareBtn.disabled = busy;
  locSubmit.disabled = busy;
}

shareBtn.addEventListener('click', () => locationHandlers?.onShare());
typeBtn.addEventListener('click', () => {
  locationHandlers?.onType?.(); // abandons any pending GPS request
  showTypedField();
});
locForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (locSubmit.disabled) return;
  locationHandlers?.onTyped(locInput.value);
});

function renderMute() {
  const muted = store.get().voice.ttsMuted;
  muteBtn.textContent = muted ? 'Unmute' : 'Mute';
  muteBtn.setAttribute('aria-pressed', String(muted));
}
muteBtn.addEventListener('click', () => {
  const voice = store.get().voice;
  const ttsMuted = !voice.ttsMuted;
  store.set({ voice: { ...voice, ttsMuted } });
  if (ttsMuted && current) {
    cancelSpeech();
    current.speechDone = true;
    finish(current);
  }
  renderMute();
});
renderMute();

logToggle.addEventListener('click', () => {
  const collapsed = logEl.classList.toggle('collapsed');
  logToggle.setAttribute('aria-expanded', String(!collapsed));
  logToggle.textContent = collapsed ? 'Chat log' : 'Hide log';
});

function renderPhase(state) {
  const chatting = state.phase === 'CHATTING';
  chatBar.hidden = state.phase === 'INTRO';
  logEl.hidden = state.phase === 'INTRO';
  if (!chatting && document.activeElement === chatInput) chatInput.blur(); // disabled inputs may not fire blur
  locPanel.hidden = !(state.phase === 'LOCATION' && locationShown);
  if (state.phase !== 'LOCATION' && document.activeElement === locInput) locInput.blur();
  chatInput.disabled = !chatting;
  sendBtn.disabled = !chatting;
  renderMic(state);
}
// --- Push-to-talk mic (hold to talk; fills the input, never auto-sends) ---
let recognizer = null;
let micBase = ''; // what the player had typed when they pressed the mic

function renderMic(state) {
  const busy = state.status === 'speaking' || state.status === 'thinking' || state.phase !== 'CHATTING';
  micBtn.disabled = busy;
  micBtn.classList.toggle('listening', state.status === 'listening');
  if (state.status === 'speaking' && recognizer) recognizer.stop();
}

function micFill(text) {
  chatInput.value = micBase && text ? `${micBase} ${text}` : (micBase || text);
}

function micIdle() {
  if (store.get().status === 'listening') store.set({ status: 'idle' });
}

function hideMic() {
  micBtn.hidden = true;
  const voice = store.get().voice;
  store.set({ voice: { ...voice, micAvailable: false } });
}

recognizer = createRecognizer({
  onPartial: micFill,
  onFinal: micFill,
  onEnd: micIdle,
  onError(code) {
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      micIdle();
      hideMic();
      clerkSay("No problem, just type instead.");
    } else {
      if (code === 'network') console.warn('speech recognition network error');
      micIdle(); // no-speech, aborted, network, others: back to idle silently
    }
  },
});
{
  const voice = store.get().voice;
  store.set({ voice: { ...voice, micAvailable: recognizer !== null } });
  micBtn.hidden = recognizer === null;
}

micBtn.addEventListener('pointerdown', (e) => {
  if (!recognizer || micBtn.disabled || e.button > 0) return;
  const s = store.get();
  if (s.status !== 'idle' || s.phase !== 'CHATTING') return;
  micBase = chatInput.value.trim();
  cancelSpeech(); // nothing should be speaking, but never let TTS feed the mic
  if (recognizer.start()) store.set({ status: 'listening' });
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
  micBtn.addEventListener(ev, () => recognizer?.stop());
}
micBtn.addEventListener('contextmenu', (e) => e.preventDefault());

renderPhase(store.get());
store.on('change', (state) => renderPhase(state));

// --- Product card ---
const card = $('product-card');
const cardTitle = $('card-title');
const cardPrice = $('card-price');
const cardSource = $('card-source');
const cardRating = $('card-rating');
const cardBuy = $('card-buy');

export function showProductCard(p) {
  cardTitle.textContent = p.title ?? '';
  cardPrice.textContent = Number.isFinite(p.extracted_price) ? formatPrice(p.extracted_price) : (p.price ?? '');
  cardSource.textContent = p.source ?? '';
  cardRating.textContent = p.rating != null ? `Rating: ${p.rating} / 5` : '';
  cardRating.hidden = p.rating == null;
  // Only real http(s) links are offered; anything else hides the button.
  const link = typeof p.link === 'string' && /^https?:\/\//i.test(p.link) ? p.link : null;
  if (link) cardBuy.setAttribute('href', link);
  else cardBuy.removeAttribute('href');
  cardBuy.hidden = !link;
  card.hidden = false;
  store.set({ inputFocused: true }); // keeps WASD from moving the player while the card is open
}

export function hideProductCard() {
  if (card.hidden) return;
  card.hidden = true;
  store.set({ inputFocused: false });
}

$('card-close').addEventListener('click', hideProductCard);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideProductCard(); });
