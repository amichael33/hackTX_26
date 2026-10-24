import { store, movementEnabled } from './store.js';
import { isDemoPage, postChat, postGeocode, postSearch, postStickers } from './api.js';
import { DEFAULT_CITY, normalizeTypedLocation, formatPrice } from './text.js';
import { fallbackSticker } from './stickerText.js';
import { clerkSay, onPlayerSubmit, addLogLine, onLocationChoice, showLocationPanel, setLocationBusy, showProductCard, hideProductCard, onNewSearch, setCardInCart, onCardCart, renderCart, onCartRemove, peekCart, renderPastSearches, onPastSearchPick, onPastSearchRemove, closeWidget } from './ui.js';
import { createCart } from './cart.js';
import { createSavedSearches } from './savedSearches.js';
import { layoutStore } from './layoutStore.js';

window.store = store; // console debugging

const cart = createCart();
const savedSearches = createSavedSearches();
renderPastSearches(savedSearches.list());
let cardProduct = null; // the product the card is showing, or null
let peeked = false; // the widget auto-expands once per session, on the first add

const ASK_LOCATION = "Hi! Welcome in. Mind if I check what's near you, so I can find stuff in your area?";
const TYPE_INSTEAD = 'No problem, just type your city or ZIP.';
const GREETING = 'Hi! Welcome in. What are you shopping for today?';
const RATE_LIMITED = 'Whoa, one sec! Ask me again in a moment.';
const CHAT_FALLBACK = "Sorry, I didn't catch that. What are you looking for?";

const scene = document.querySelector('a-scene');
const intro = document.getElementById('intro');
const enterBtn = document.getElementById('enter-btn');

function applyState(state) {
  const rig = document.getElementById('rig');
  const clerk = document.getElementById('clerk');
  if (rig) rig.setAttribute('wasd-controls', 'enabled', movementEnabled(state));
  if (clerk) clerk.setAttribute('clerk', 'state', state.status);
  const cart3d = document.getElementById('cart3d');
  if (cart3d) cart3d.setAttribute('shopping-cart', 'enabled', state.phase === 'BROWSING');
}

function boot() {
  applyState(store.get());
  onCartChanged(); // the module-load emit can predate the shopping-cart component; re-send now that the scene is loaded
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
    await say(err?.status === 429 ? RATE_LIMITED : CHAT_FALLBACK);
    return;
  }

  await say(res.reply_to_player);
  if (res.ready) {
    const { query, min_price, max_price, preferences, extra_queries } = res;
    store.set({ query: { query, min_price, max_price, preferences, extra_queries } });
    store.setPhase('SEARCHING');
  }
}

// --- Search: fetch products while the clerk says "checking the back" ---
const SEARCH_WAIT = 'Let me check the back...';
const SEARCH_EMPTY = 'Hmm, nothing matched. Want to try something else?';
const SEARCH_OFFLINE = "Our back room's offline, so here's our showroom stock!";
const SEARCH_FAILED = "Hmm, I couldn't reach the back room. Want to try again?";

let searchWasDemo = false; // demo stock is not worth saving

async function runSearch() {
  try {
    store.set({ status: 'thinking' });
    const { query, location, replay } = store.get();
    if (replay) { // zero-API replay: the saved products go straight to the shelves
      store.set({ products: replay.products, query: replay.query });
      store.setPhase('OPENING');
      return;
    }
    const waiting = clerkSay(SEARCH_WAIT);
    document.getElementById('clerk')?.emit('spin');
    let servedDemo = false;
    searchWasDemo = false;
    let pending = true;
    const searching = postSearch({ query, city: location?.city }).then(
      (res) => { servedDemo = res?.demo === true; return res?.products ?? []; },
      (err) => {
        console.warn('search failed', err);
        return err?.status === 429 ? { limited: true } : null; // null = request failed, distinct from an empty result
      },
    );
    searching.then(() => { pending = false; });
    waiting.then(() => {
      if (pending && store.get().phase === 'SEARCHING') store.set({ status: 'thinking' });
    });
    const [products] = await Promise.all([searching, waiting]);

    if (products && products.limited) {
      store.setPhase('CHATTING'); // keep the conversation so the player can just ask again
      await clerkSay(RATE_LIMITED);
      return;
    }
    if (Array.isArray(products) && products.length) {
      store.set({ products });
      searchWasDemo = servedDemo;
      if (servedDemo && !isDemoPage) await clerkSay(SEARCH_OFFLINE);
      store.setPhase('OPENING');
      return;
    }
    await clerkSay(products === null ? SEARCH_FAILED : SEARCH_EMPTY);
    store.setPhase('CHATTING');
    store.set({ messages: [] }); // next chat starts fresh
  } finally {
    if (store.get().phase !== 'OPENING' && store.get().status !== 'idle') store.set({ status: 'idle' });
  }
}
store.on('phase:SEARCHING', runSearch);

// --- Opening: show the shelves and pop the products in one by one ---
const BOX_COLOR = '#fbfbfd'; // Apple-white packaging; the zone banners carry the zone cue
const SPAWN_MS = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const boxEls = new Map();       // productId -> product-box element, for later sticker updates
const stickerTexts = new Map(); // productId -> Gemini sticker text (applied at spawn if it arrived early)

function spawnBox(container, slot) {
  const p = slot.product;
  const e = document.createElement('a-entity');
  const isIsland = slot.zone === 'island';
  e.setAttribute('product-box', {
    productId: p.id, thumb: p.thumbnail ?? '', color: BOX_COLOR, size: isIsland ? 0.45 : 0.3,
    sticker: stickerTexts.get(p.id) ?? fallbackSticker(p.tier, p.id), price: formatPrice(p.extracted_price),
  });
  boxEls.set(p.id, e);
  e.setAttribute('position', slot.position);
  e.setAttribute('rotation', slot.rotation);
  e.setAttribute('scale', '0.001 0.001 0.001');
  e.setAttribute('animation', 'property: scale; from: 0.001 0.001 0.001; to: 1 1 1; dur: 350; easing: easeOutBack');
  container.appendChild(e);
}

let openingRun = 0; // run token: bumped by every opening and every reset so stale async work bails out

async function runOpening() {
  const run = ++openingRun;
  const live = () => run === openingRun && store.get().phase === 'OPENING';
  const { products, query, replay } = store.get();
  if (replay) store.set({ replay: null });
  const saying = clerkSay('Go take a look!');
  document.getElementById('shelves').setAttribute('visible', 'true');
  const container = document.getElementById('products');
  while (container.firstChild) container.removeChild(container.firstChild);
  boxEls.clear();
  stickerTexts.clear();
  let saved = null;
  if (replay) {
    for (const [id, text] of Object.entries(replay.stickers ?? {})) if (typeof text === 'string' && text) stickerTexts.set(id, text);
  } else if (!searchWasDemo && !isDemoPage) {
    saved = savedSearches.save({ query, city: store.get().location?.city, products, stickers: {} });
    renderPastSearches(savedSearches.list());
  }
  // Fire the batched sticker copy now; boxes spawn with fallback text and are upgraded when it lands.
  if (!replay) postStickers({ items: products.map((p) => ({ id: p.id, title: p.title, price: p.price, tier: p.tier })) })
    .then((res) => {
      if (run !== openingRun) return; // a newer run or a reset owns the maps now
      for (const s of res?.stickers ?? []) {
        if (!s || typeof s.id !== 'string' || typeof s.sticker_text !== 'string' || !s.sticker_text) continue;
        stickerTexts.set(s.id, s.sticker_text);
        const el = boxEls.get(s.id);
        if (el) el.setAttribute('product-box', 'sticker', s.sticker_text);
      }
      if (saved) { savedSearches.updateStickers(saved.id, Object.fromEntries(stickerTexts)); renderPastSearches(savedSearches.list()); }
    })
    .catch(() => { /* keep fallbacks */ });
  try {
    const slots = layoutStore(products, { min_price: query?.min_price ?? null, max_price: query?.max_price ?? null });
    for (const slot of slots) {
      if (!live()) return;
      try { spawnBox(container, slot); } catch (err) { console.error(err); }
      await sleep(SPAWN_MS);
    }
  } finally {
    if (live()) store.setPhase('BROWSING');
  }
  await saying;
}
store.on('phase:OPENING', () => { runOpening().catch((err) => console.error(err)); });

document.querySelector('a-scene').addEventListener('product-selected', (e) => {
  const p = store.get().products.find((x) => x.id === e.detail?.productId);
  if (!p) return;
  cardProduct = p;
  setCardInCart(cart.has(p.id)); // opening the card always refreshes the button
  showProductCard(p);
});

onCardCart(() => {
  const p = cardProduct;
  if (!p) return;
  if (cart.has(p.id)) cart.remove(p.id);
  else if (cart.add(p) && !peeked) { peeked = true; peekCart(); }
  setCardInCart(cart.has(p.id));
});
onCartRemove((id) => { cart.remove(id); });

// Re-render the widget on every change (and once at boot). Task 13's 3D cart listens for cart-changed.
function onCartChanged() {
  renderCart(cart.items(), cart.total());
  if (cardProduct) setCardInCart(cart.has(cardProduct.id));
  scene.emit('cart-changed', { items: cart.items() });
}
cart.on('change', onCartChanged);
onCartChanged();

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

// --- New search: back to chatting with an empty store ---
function resetStore({ silent = false } = {}) {
  openingRun++; // ignore any late sticker results from the previous run
  store.setPhase('CHATTING');
  const container = document.getElementById('products');
  while (container.firstChild) container.removeChild(container.firstChild);
  boxEls.clear();
  stickerTexts.clear();
  document.getElementById('shelves').setAttribute('visible', 'false');
  hideProductCard();
  cardProduct = null;
  store.set({ products: [], query: null, messages: [], replay: null });
  if (!silent) say('What else can I find for you?').catch((err) => console.error(err));
}

onNewSearch(() => {
  if (store.get().phase !== 'BROWSING') return;
  resetStore();
});

// --- Past searches: replay a saved search without any API calls ---
onPastSearchPick((id) => {
  const { phase, status } = store.get();
  if (phase !== 'CHATTING' && phase !== 'BROWSING') return;
  if (status === 'thinking') return; // a chat turn is in flight
  const entry = savedSearches.get(id);
  if (!entry) return;
  if (phase === 'BROWSING') resetStore({ silent: true });
  closeWidget();
  store.set({ replay: entry });
  store.setPhase('SEARCHING');
});
onPastSearchRemove((id) => {
  savedSearches.remove(id);
  renderPastSearches(savedSearches.list());
});
