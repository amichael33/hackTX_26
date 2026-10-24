// Overlay wiring: chat bar, subtitle typewriter, chat log, mute/skip.
import { store } from './store.js';
import { speak, cancelSpeech } from './voice.js';

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
const skipBtn = $('skip-btn');

let current = null; // { text, timer, typeDone, speechDone, resolve }
let submitHandler = null;

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
chatInput.addEventListener('focus', () => store.set({ inputFocused: true }));
chatInput.addEventListener('blur', () => store.set({ inputFocused: false }));
// Typed keys must never reach A-Frame's wasd-controls.
for (const ev of ['keydown', 'keyup', 'keypress']) {
  chatInput.addEventListener(ev, (e) => e.stopPropagation());
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  if (!submitHandler) return;
  // The handler returns false when it rejects the submit (busy / wrong phase): keep the text.
  if (submitHandler(text) !== false) chatInput.value = '';
});

skipBtn.addEventListener('click', skip);

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
  chatInput.disabled = !chatting;
  sendBtn.disabled = !chatting;
}
renderPhase(store.get());
store.on('change', (state) => renderPhase(state));
