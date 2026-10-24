import { store, movementEnabled } from './store.js';
import { postChat, postGeocode } from './api.js';
import { DEFAULT_CITY, normalizeTypedLocation } from './text.js';
import { clerkSay, onPlayerSubmit, addLogLine, onLocationChoice, showLocationPanel, setLocationBusy } from './ui.js';

window.store = store; // console debugging

const ASK_LOCATION = "Hi! Welcome in. Mind if I check what's near you, so I can find stuff in your area?";
const TYPE_INSTEAD = 'No problem, just type your city or ZIP.';
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

// --- Location step: GPS, typed city/ZIP, or the default city ---
let locationBusy = false;

async function finishLocation(location) {
  if (store.get().phase !== 'LOCATION') return;
  store.set({ location });
  addLogLine('system', `\u{1F4CD} ${location.city}`);
  store.setPhase('CHATTING');
  await say(GREETING);
}

let gpsAttempt = 0; // bumped to abandon a pending GPS request (typed escape / new attempt)
const GPS_GIVE_UP_MS = 12000;

function shareLocation() {
  if (locationBusy) return;
  locationBusy = true;
  setLocationBusy(true);
  const attempt = ++gpsAttempt;
  let settled = false;
  const claim = () => {
    if (settled || attempt !== gpsAttempt) return false;
    settled = true;
    clearTimeout(timer);
    return true;
  };
  const typedFallback = () => {
    if (!claim()) return;
    locationBusy = false;
    setLocationBusy(false);
    showLocationPanel({ typed: true });
    say(TYPE_INSTEAD);
  };
  // Browsers may never call back (ignored prompt, Firefox "Not now"), so give up ourselves.
  const timer = setTimeout(typedFallback, GPS_GIVE_UP_MS);
  if (!('geolocation' in navigator) || !window.isSecureContext) return typedFallback();
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      if (!claim()) return;
      // Round to 2 decimals: matches what the server sends out and avoids keeping precise coords.
      const lat = Math.round(pos.coords.latitude * 100) / 100;
      const lng = Math.round(pos.coords.longitude * 100) / 100;
      let location = { city: DEFAULT_CITY, source: 'default' };
      try {
        const res = await postGeocode({ lat, lng });
        // The server answers DEFAULT_CITY when geocoding failed: not a real GPS result.
        if (res?.city && res.city !== DEFAULT_CITY) location = { city: res.city, lat, lng, source: 'gps' };
      } catch (err) {
        console.warn('geocode failed', err);
      }
      await finishLocation(location);
    },
    typedFallback,
    { timeout: 10000 },
  );
}

// The user chose to type: ignore any late GPS result and re-enable the controls.
function abandonGps() {
  gpsAttempt++;
  locationBusy = false;
  setLocationBusy(false);
}

async function typedLocation(raw) {
  if (locationBusy) return;
  locationBusy = true;
  setLocationBusy(true);
  const city = normalizeTypedLocation(raw);
  await finishLocation({ city, source: city === DEFAULT_CITY ? 'default' : 'typed' });
}

onLocationChoice({ onShare: shareLocation, onTyped: typedLocation, onType: abandonGps });

async function startLocationStep() {
  locationBusy = false;
  setLocationBusy(false);
  await say(ASK_LOCATION);
  showLocationPanel();
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
