import { store, movementEnabled } from './store.js';
import { isDemoPage, postChat, postGeocode, postSearch, postIdeas, postStickers } from './api.js';
import { DEFAULT_CITY, normalizeTypedLocation, formatPrice } from './text.js';
import { fallbackSticker } from './stickerText.js';
import { clerkSay, onPlayerSubmit, addLogLine, onLocationChoice, showLocationPanel, setLocationBusy, showProductCard, hideProductCard, onNewSearch, setCardInCart, onCardCart, renderCart, onCartRemove, peekCart, renderPastSearches, onPastSearchPick, onPastSearchRemove, closeWidget, showWidgetTab } from './ui.js';
import { createCart } from './cart.js';
import { createSavedSearches } from './savedSearches.js';
import { storeColor } from './storeColor.js';
import { layoutStore, SHELF_UNITS, currentMap } from './layoutStore.js';
import { isClothingSearch } from './category.js';
import { layoutClothes, hangerX, RAIL_Y, RAIL_WINDOW } from './clothesLayout.js';
import { MAPS, DEFAULT_MAP_ID, getMap } from './maps.js';
import { applyMap, buildShelves } from './sceneMap.js';
import { safeLocalStorage } from './storage.js';

window.store = store; // console debugging

const CART_ENABLED = true; // false switches the shopping cart off (Past searches stay)
// The 3D cart that rolls in front of the player can be switched off by the player (checkbox in the cart panel, or the C key).
const CART3D_KEY = 'store.cart3d.v1';
let cart3dOn = (() => { try { return safeLocalStorage().getItem(CART3D_KEY) !== '0'; } catch (e) { return true; } })();
document.body.classList.toggle('cart-off', !CART_ENABLED);
showWidgetTab(CART_ENABLED ? 'cart' : 'searches');
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

// --- Maps: picked on the start screen; the store is built from the chosen map ---
const MAP_KEY = 'store.map.v1';
function savedMapId() {
  try { return getMap(safeLocalStorage().getItem(MAP_KEY)).id; } catch (e) { return DEFAULT_MAP_ID; }
}
let mapId = savedMapId();

const mapPicker = document.getElementById('map-picker');
function renderMapPicker() {
  mapPicker.textContent = '';
  for (const m of MAPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'map-card';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(m.id === mapId));
    const name = document.createElement('strong');
    name.textContent = m.name;
    const blurb = document.createElement('span');
    blurb.textContent = m.blurb;
    b.append(name, blurb);
    b.addEventListener('click', () => selectMap(m.id));
    mapPicker.append(b);
  }
}

// Only on the start screen: rebuild the scene around the new map so it previews behind the overlay.
function selectMap(id) {
  if (store.get().phase !== 'INTRO' || id === mapId) return;
  mapId = id;
  try { safeLocalStorage().setItem(MAP_KEY, id); } catch (e) { /* the pick just is not remembered */ }
  applyMap(getMap(id), { preview: true });
  renderMapPicker();
}
renderMapPicker();

const scene = document.querySelector('a-scene');
const intro = document.getElementById('intro');
const enterBtn = document.getElementById('enter-btn');

function applyState(state) {
  const rig = document.getElementById('rig');
  const clerk = document.getElementById('clerk');
  if (rig) rig.setAttribute('wasd-controls', 'enabled', movementEnabled(state));
  if (clerk) clerk.setAttribute('clerk', 'state', state.status);
  const cart3d = document.getElementById('cart3d');
  if (cart3d) cart3d.setAttribute('shopping-cart', 'enabled', CART_ENABLED && cart3dOn && state.phase === 'BROWSING');
}

function boot() {
  applyMap(getMap(mapId), { preview: true });
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

// Skipping is allowed: the search just uses the default city.
function skipLocation() {
  abandonGps();
  return typedLocation('');
}

onLocationChoice({ onShare: shareLocation, onTyped: typedLocation, onType: abandonGps, onSkip: skipLocation });

async function startLocationStep() {
  locationBusy = false;
  setLocationBusy(false);
  await say(ASK_LOCATION);
  showLocationPanel();
}
store.on('phase:LOCATION', startLocationStep);
store.on('phase:LOCATION', () => document.getElementById('shelves')?.setAttribute('visible', 'false')); // the start-screen preview ends

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
    const { query, min_price, max_price, preferences, extra_queries, is_clothing } = res;
    store.set({ query: { query, min_price, max_price, preferences, extra_queries, is_clothing } });
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
      store.set({ products: replay.products, extras: replay.extras ?? [], query: replay.query });
      store.setPhase('OPENING');
      return;
    }
    const waiting = clerkSay(SEARCH_WAIT);
    document.getElementById('clerk')?.emit('spin');
    let servedDemo = false;
    let extras = [];
    searchWasDemo = false;
    let pending = true;
    const searching = postSearch({ query, city: location?.city }).then(
      (res) => { servedDemo = res?.demo === true; extras = Array.isArray(res?.extras) ? res.extras : []; return res?.products ?? []; },
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
      store.set({ products, extras });
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
const SPAWN_MS = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const boxEls = new Map();       // productId -> product-box element, for later sticker updates
const stickerTexts = new Map(); // productId -> Gemini sticker text (applied at spawn if it arrived early)

// The magic-trick smoke: a burst of puffs at a world position (no-op until the scene has the component).
function puff(x, y, z, opts) {
  document.getElementById('smoke')?.components.smoke?.puff(x, y, z, opts);
}

// A thick cloud over every shelf unit and the island, so the shelves seem to appear out of the smoke.
const SHELVES_SMOKE_MS = 600;
function smokeOverShelves() {
  for (const u of Object.values(SHELF_UNITS).flat()) puff(u.x, 1.0, u.z, { size: 1.8, count: 5, spread: 1.4, life: 1400 });
  const { island } = currentMap();
  puff(island.x, 1.0, island.z, { size: 1.8, count: 5, spread: 1.4, life: 1400 });
}

function spawnBox(container, slot) {
  const p = slot.product;
  const e = document.createElement('a-entity');
  e.setAttribute('product-box', {
    productId: p.id, thumb: p.thumbnail ?? '', color: storeColor(p.source), size: 0.45,
    sticker: stickerTexts.get(p.id) ?? fallbackSticker(p.tier, p.id), price: formatPrice(p.extracted_price),
  });
  boxEls.set(p.id, e);
  puff(slot.position.x, slot.position.y, slot.position.z, { size: 0.9, count: 5, life: 1200 });
  e.setAttribute('position', slot.position);
  e.setAttribute('rotation', slot.rotation);
  e.setAttribute('scale', '0.001 0.001 0.001');
  e.setAttribute('animation', 'property: scale; from: 0.001 0.001 0.001; to: 1 1 1; dur: 350; easing: easeOutBack');
  container.appendChild(e);
}

const IDEAS_TITLE = 'Try Next';
const IDEAS_EMPTY = 'No Ideas Right Now';
const IDEAS_TRIGGER_Z = -6.2; // walking this far back pins the post-its up
const NOTE_MS = 140;
const corkboard = () => document.getElementById('corkboard')?.components.corkboard;
function setIdeasBanner(text) {
  document.getElementById('banner-ideas')?.setAttribute('zone-banner', 'text', text);
}
function resetCorkboard() {
  corkboard()?.clearNotes();
  setIdeasBanner(IDEAS_TITLE);
}
let ideasTriggeredRun = -1; // the openingRun that already pinned its post-its
let ideasPoll = null;
function stopIdeasPoll() { clearInterval(ideasPoll); ideasPoll = null; }

// --- Clothing mode: for a clothing search the shelves become hanging rails and the products hang on them ---
let clothesMode = false;
function setClothesMode(on) {
  if (on === clothesMode) return;
  clothesMode = on;
  buildShelves(getMap(mapId), { clothes: on, visible: true });
}

// World position of a point on a rail (lx along the rail, y up): rails are rotated about y like shelf units.
function railPoint(rail, lx, y) {
  const th = (rail.rotation.y * Math.PI) / 180;
  return { x: rail.position.x + lx * Math.cos(th), y, z: rail.position.z - lx * Math.sin(th) };
}

const GARMENT_ANGLE = -45;
const whenLoaded = (el) => new Promise((r) => (el.hasLoaded ? r() : el.addEventListener('loaded', r, { once: true })));

// Builds every rail with its (hidden) garments, then reveals them wave by wave, a puff of smoke for each.
async function spawnClothes(container, rails, live) {
  const built = [];
  for (const rail of rails) {
    const re = document.createElement('a-entity');
    re.setAttribute('clothes-rail', { kind: rail.kind, count: rail.items.length });
    re.setAttribute('position', `${rail.position.x} ${rail.position.y} ${rail.position.z}`);
    re.setAttribute('rotation', `0 ${rail.rotation.y} 0`);
    container.appendChild(re);
    built.push({ rail, re });
  }
  for (const { re } of built) await whenLoaded(re);
  for (const { rail, re } of built) {
    const comp = re.components['clothes-rail'];
    rail.items.forEach((p, i) => {
      const g = document.createElement('a-entity');
      g.setAttribute('product-box', {
        productId: p.id, thumb: p.thumbnail ?? '', color: storeColor(p.source), size: 0.45, kind: 'garment',
        sticker: stickerTexts.get(p.id) ?? fallbackSticker(p.tier, p.id), price: formatPrice(p.extracted_price),
      });
      g.setAttribute('position', `0 ${RAIL_Y - rail.position.y} 0`);
      g.setAttribute('rotation', `0 ${GARMENT_ANGLE} 0`); // turned like clothes on a real rack, so neighbours do not clip into each other
      re.appendChild(g);
      boxEls.set(p.id, g);
      comp.addGarment(g, i);
    });
    rail.comp = comp;
  }
  // Hangers beyond the first window wait on the rail, ready for the player to flip to them.
  for (const { rail } of built) rail.items.forEach((_, i) => { if (i >= RAIL_WINDOW) rail.comp.reveal(i); });
  for (let w = 0; w < RAIL_WINDOW; w++) {
    if (!live()) return;
    for (const { rail } of built) {
      if (w >= rail.items.length) continue;
      rail.comp.reveal(w);
      const at = railPoint(rail, hangerX(w + (rail.items.length < RAIL_WINDOW ? -(RAIL_WINDOW - rail.items.length) / 2 : 0), 0), RAIL_Y - 0.4);
      puff(at.x, at.y, at.z, { size: 0.8, count: 4, life: 1100 });
    }
    await sleep(150);
  }
}

let openingRun = 0; // run token: bumped by every opening and every reset so stale async work bails out

async function runOpening() {
  const run = ++openingRun;
  stopIdeasPoll();
  resetCorkboard();
  const live = () => run === openingRun && store.get().phase === 'OPENING';
  const { products, query, replay } = store.get();
  if (replay) store.set({ replay: null });
  const saying = clerkSay('Go take a look!');
  document.getElementById('shelves').setAttribute('visible', 'true');
  const container = document.getElementById('products');
  while (container.firstChild) container.removeChild(container.firstChild);
  boxEls.clear();
  stickerTexts.clear();
  const clothes = isClothingSearch(query, products);
  setClothesMode(clothes);
  let saved = null;
  if (replay) {
    for (const [id, text] of Object.entries(replay.stickers ?? {})) if (typeof text === 'string' && text) stickerTexts.set(id, text);
  } else if (!searchWasDemo && !isDemoPage) {
    saved = savedSearches.save({ query, city: store.get().location?.city, products, extras: store.get().extras, stickers: {} });
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
    const opts = { min_price: query?.min_price ?? null, max_price: query?.max_price ?? null };
    smokeOverShelves();
    await sleep(SHELVES_SMOKE_MS); // let the cloud build before the products appear in it
    if (clothes) {
      await spawnClothes(container, layoutClothes(products, opts), live);
    } else {
      for (const slot of layoutStore(products, opts)) {
        if (!live()) return;
        try { spawnBox(container, slot); } catch (err) { console.error(err); }
        await sleep(SPAWN_MS);
      }
    }
  } finally {
    if (live()) store.setPhase('BROWSING');
  }
  await saying;
}
// Once per opening, the first walk to the back wall during BROWSING asks Gemini (never SerpApi) for follow-up search
// ideas and pins them to the corkboard as post-its.
async function triggerIdeas(run) {
  ideasTriggeredRun = run;
  const { query, products, location } = store.get();
  say('Let me pin up a few ideas!').catch((err) => console.error(err));
  let res = null;
  try {
    const titles = [...products].sort((a, b) => a.relevance - b.relevance).slice(0, 5).map((p) => p.title);
    res = await postIdeas({ query, city: location?.city, titles });
  } catch (err) {
    console.warn('ideas failed', err);
  }
  if (run !== openingRun) return; // New search or replay owns the store now
  const ideas = Array.isArray(res?.ideas) ? res.ideas.filter((t) => typeof t === 'string' && t) : [];
  const board = corkboard();
  if (!ideas.length || !board) { setIdeasBanner(IDEAS_EMPTY); return; }
  for (let i = 0; i < ideas.length; i++) {
    if (run !== openingRun) return;
    const at = board.addNote(ideas[i], i);
    puff(at.x, at.y, at.z + 0.1, { size: 0.7, count: 4, life: 1000 });
    await sleep(NOTE_MS);
  }
}

function armIdeasPoll(run) {
  stopIdeasPoll();
  ideasPoll = setInterval(() => {
    if (run !== openingRun || store.get().phase !== 'BROWSING') return stopIdeasPoll();
    const rig = document.getElementById('rig');
    if (ideasTriggeredRun === run || !rig) return;
    if (rig.object3D.position.z < IDEAS_TRIGGER_Z) { stopIdeasPoll(); triggerIdeas(run).catch((err) => console.error(err)); }
  }, 250);
}
store.on('phase:BROWSING', () => armIdeasPoll(openingRun));

store.on('phase:OPENING', () => { runOpening().catch((err) => console.error(err)); });

document.querySelector('a-scene').addEventListener('product-selected', (e) => {
  const p = store.get().products.find((x) => x.id === e.detail?.productId);
  if (!p) return;
  cardProduct = p;
  setCardInCart(cart.has(p.id)); // opening the card always refreshes the button
  showProductCard(p);
});

const cart3dCheck = document.getElementById('cart3d-check');
function setCart3d(on) {
  cart3dOn = on;
  cart3dCheck.checked = on;
  try { safeLocalStorage().setItem(CART3D_KEY, on ? '1' : '0'); } catch (e) { /* not remembered */ }
  applyState(store.get());
}
cart3dCheck.checked = cart3dOn;
cart3dCheck.addEventListener('change', () => setCart3d(cart3dCheck.checked));
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'c' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const s = store.get();
  if (s.inputFocused || s.phase !== 'BROWSING') return;
  setCart3d(!cart3dOn);
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
  stopIdeasPoll();
  resetCorkboard();
  store.setPhase('CHATTING');
  const container = document.getElementById('products');
  while (container.firstChild) container.removeChild(container.firstChild);
  boxEls.clear();
  stickerTexts.clear();
  setClothesMode(false);
  document.getElementById('shelves').setAttribute('visible', 'false');
  hideProductCard();
  cardProduct = null;
  store.set({ products: [], extras: [], query: null, messages: [], replay: null });
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
