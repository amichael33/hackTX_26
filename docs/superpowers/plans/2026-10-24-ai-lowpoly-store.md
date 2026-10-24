# AI Low-Poly Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A website with a low-poly A-Frame store. A clerk chats with the player (text or voice), works out what they want, then fills the shelves with real nearby Google Shopping listings, each one a box with a funny price sticker.

**Architecture:** A static frontend (`public/`, plain ES modules + A-Frame components) talks to one Express server (`server/`) that holds every API key and wraps Gemini, SerpApi, Nominatim, and an image proxy. Pure logic (state store, layout, normalization, tiering, sticker text) lives in DOM-free modules covered by `node:test`. 3D and browser-API code gets checked by hand in Chrome. Caddy on a Vultr VPS serves `public/` and proxies `/api/*`. In local dev, Express serves `public/` itself, so `npm run dev` is also the fallback if the venue Wi-Fi fails.

**Tech Stack:** Node 22 (ESM), Express 4, express-rate-limit, @google/genai, A-Frame 1.6.0 (CDN), Web Speech API, SpeechSynthesis, SerpApi `google_shopping`, OpenStreetMap Nominatim, Caddy, pm2.

**Spec:** [plan.md](../../../plan.md). Read it before starting any task. Section numbers below (§N) refer to it.

## Global Constraints

- API keys (`GEMINI_API_KEY`, `SERPAPI_KEY`) live only in `server/.env`, never in `public/`. `.env` is in `.gitignore`.
- A-Frame is pinned: `https://aframe.io/releases/1.6.0/aframe.min.js`. Never load an unpinned URL.
- Frontend and API share one origin. There is no CORS middleware.
- Products are capped at **30** per search (§6).
- Clerk replies are 1-2 short sentences, with at most 2-3 follow-up questions (§5). Hard cap: `MAX_TURNS = 4` player messages.
- Sticker text: at most 4 words, uppercase, family-friendly (§10b).
- Decisions on the open questions in §15 (change them here if the team disagrees):
  - "In the area" means **location-biased results** through SerpApi's `location` param, not live store stock.
  - Model comes from `GEMINI_MODEL`, default `gemini-2.5-flash`. TTS is browser `SpeechSynthesis` only. `/api/tts` is out of scope.
  - Desktop-first. Look uses drag, not pointer lock (`look-controls="pointerLockEnabled: false"`). No mobile joystick.
- Last-resort city: `"Austin, Texas, United States"`.
- Out of scope for this plan: §10b Stage 2 (image-to-3D / cutouts), cart, multiplayer.
- Test command for the whole repo: `npm test` (`node --test`). Test files live in `test/` as `*.test.js`.

## Review Focus

1. **Gemini returns junk** (invalid JSON, `ready: true` with an empty `query`, or a thrown error). The clerk should keep chatting with a safe line. The flow never goes into SEARCHING with no query. Covered by tests in Task 3.
2. **SerpApi returns zero usable results** (empty array, or items with no `extracted_price`). Priceless items are dropped. With nothing left, the clerk says "nothing matched" and phase goes back to CHATTING. Covered by tests in Tasks 1 and 6.
3. **Location is denied, times out, or the typed box is left blank.** The flow must continue: typed city, then the default city. It never blocks. Covered by tests in Task 5.
4. **Typing W/A/S/D in the chat box moves the player.** Movement must be off while any input is focused and in every phase before BROWSING. Covered by the test in Task 1 (`movementEnabled`).
5. **`/api/img` used as an open proxy** (non-allowlisted host, `http:`, or a non-image response). Answer 400/502 and never stream the body. Covered by tests in Task 7.

---

## File Structure

```
package.json                    scripts + deps (root)
.gitignore                      node_modules, server/.env
Caddyfile                       §3 verbatim, with the real domain
ecosystem.config.js             pm2 app "store" -> server/index.js
server/index.js                 load env, createApp(realDeps), listen :3000
server/app.js                   createApp(deps) -> express app (all routes, rate limit, static in dev)
server/lib/llm.js               makeGeminiLlm(apiKey, model) -> llm(fn)
server/lib/clerk.js             chatTurn(): system prompt, schema, turn cap, validation
server/lib/serp.js              searchShopping(), normalizeShoppingResults(), assignTiers()
server/lib/stickers.js          fallbackSticker(), cleanStickerText(), generateStickers()
server/lib/geocode.js           reverseGeocode(), normalizeTypedLocation()
server/lib/cache.js             createCache(ttlMs) -> { get, set }
server/data/demoProducts.json   30 hardcoded Products (fallback / DEMO_MODE)
public/index.html               a-scene + overlays (intro, location, chat bar, subtitle, log, card)
public/css/ui.css
public/js/store.js              createStore, PHASES, canTransition, movementEnabled
public/js/text.js               splitSentences, formatPrice
public/js/layoutStore.js        layoutStore, ROOM, ZONES
public/js/api.js                postChat, postGeocode, postSearch, postStickers, imgUrl
public/js/voice.js              speak, cancelSpeech, createRecognizer
public/js/ui.js                 overlay wiring: chat bar, subtitle typewriter, log, mute/skip, card
public/js/main.js               boot: registers components, connects store <-> ui <-> scene
public/js/sticker.js            drawSticker(canvas, {price, text, seed})
public/js/components/           room.js shelf.js rack.js desk.js clerk.js bounds.js product-box.js
test/*.test.js
```

## Shared Types (all tasks)

```ts
type Product = { id: string, title: string, price: string, extracted_price: number,
                 rating: number|null, source: string, thumbnail: string|null, link: string|null,
                 relevance: number,            // 0 = best match (SerpApi order)
                 related: boolean,             // came from an extra_query
                 tier: 'budget'|'mid'|'premium', sticker_text?: string }
type Query = { query: string, min_price: number|null, max_price: number|null,
               preferences: string[], extra_queries: string[] }
type ClerkResponse = Query & { ready: boolean, reply_to_player: string }
type Location = { city: string, lat?: number, lng?: number, source: 'gps'|'typed'|'default' }
type Slot = { product: Product, zone: 'island'|'center'|'left'|'right'|'back',
              position: {x,y,z}, rotation: {x,y,z} }
```

API contracts (JSON in, JSON out):

| Route | Request | Response |
|---|---|---|
| `POST /api/chat` | `{ messages: [{role:'user'\|'clerk', text}], location: Location }` | `ClerkResponse` |
| `POST /api/geocode` | `{ lat, lng }` | `{ city }` |
| `POST /api/search` | `{ query: Query, city }` | `{ products: Product[] }` |
| `POST /api/stickers` | `{ items: [{id,title,price,tier}] }` | `{ stickers: [{id, sticker_text}] }` |
| `GET /api/img?u=<https url>` | | image bytes |

---

### Task 0: Repo scaffold + live HTTPS hello world (§13 step 0)

**Files:**
- Create: `package.json`, `.gitignore`, `server/index.js`, `server/app.js`, `public/index.html` (placeholder), `Caddyfile`, `ecosystem.config.js`, `server/.env.example`, `test/app.test.js`

**Interfaces:**
- Produces: `createApp(deps: { llm?, fetchImpl?, serpApiKey?, demoMode?: boolean, serveStatic?: boolean }) -> express.Application`. Every later server task adds routes inside `createApp`, and fakes come in through `deps`. `GET /api/health -> { ok: true }`.

- [ ] **Step 1:** `package.json`: `"type": "module"`, `"engines": {"node": ">=22"}`, scripts `start: node server/index.js`, `dev: node --watch --env-file=server/.env server/index.js`, `test: node --test`. Deps: `express@4`, `express-rate-limit`, `@google/genai`. Run `npm install`.
- [ ] **Step 2: Failing test** `test/app.test.js` › `health returns ok`: start `createApp({}).listen(0)`, `fetch('/api/health')` → status 200, body `{ ok: true }`.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (cannot find `server/app.js`).
- [ ] **Step 4:** Implement `createApp` with `express.json({ limit: '50kb' })`, the health route, and `express.static('public')` when `serveStatic` is true. `server/index.js` builds real deps from `process.env` (`serveStatic: process.env.NODE_ENV !== 'production'`, `demoMode: process.env.DEMO_MODE === '1'`) and listens on `PORT || 3000`.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6: Deploy (manual, follow the §3 checklist).** Create the Vultr Ubuntu 24.04 instance. Point the `.tech` A and `www` records at it. Install Caddy and Node 22. Run `ufw allow 22,80,443/tcp`. Clone to `/var/www/store`. Run `pm2 start ecosystem.config.js` with `NODE_ENV=production`. Copy the §3 Caddyfile with the real domain. Check: `curl https://<domain>/api/health` → `{"ok":true}`, and the placeholder page loads over HTTPS.
- [ ] **Step 7: Commit** `chore: scaffold server, caddy, pm2`

---

### Task 1: Client state store (§4)

**Files:** Create `public/js/store.js`. Test `test/store.test.js`.

**Interfaces:**
- Produces:
  - `PHASES = ['INTRO','LOCATION','CHATTING','SEARCHING','OPENING','BROWSING']`
  - `canTransition(from, to) -> boolean`. Allowed: each phase to the next one, plus `SEARCHING→CHATTING` (empty results) and `BROWSING→CHATTING` (new search).
  - `createStore(initial?) -> { get(): State, set(patch: Partial<State>): void, setPhase(p): void (throws on invalid), on(event, fn) -> unsubscribe }`. Events: `'change'` gets `(state, changedKeys: string[])`, and `` `phase:${P}` `` fires on entering P.
  - Initial state: `{ phase:'INTRO', status:'idle', location:null, voice:{micAvailable:false, ttsMuted:false}, query:null, products:[], messages:[], inputFocused:false }`.
  - `movementEnabled(state) -> boolean`: true only when `phase === 'BROWSING' && !state.inputFocused`.
  - `export const store = createStore()` (app singleton).

- [ ] **Step 1: Failing tests:**
  - `canTransition('INTRO','LOCATION') === true`, `canTransition('INTRO','BROWSING') === false`, `canTransition('SEARCHING','CHATTING') === true`.
  - `setPhase('BROWSING')` from INTRO throws.
  - `on('phase:LOCATION', fn)` fires exactly once after `setPhase('LOCATION')`. The unsubscribe function stops further calls.
  - `set({status:'thinking'})` emits `'change'` with `changedKeys` deep-equal to `['status']`.
  - `movementEnabled({phase:'BROWSING', inputFocused:true}) === false`, `movementEnabled({phase:'CHATTING', inputFocused:false}) === false`, `movementEnabled({phase:'BROWSING', inputFocused:false}) === true`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. No DOM APIs (it must import under Node).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: client state store with phase machine`

---

### Task 2: Static store scene + intro (§10, §13 step 1)

**Files:** Create `public/js/components/{room,shelf,rack,desk,clerk,bounds}.js`, `public/js/main.js`, `public/css/ui.css`. Modify `public/index.html`.

**Interfaces:**
- Consumes: `store`, `movementEnabled` (Task 1).
- Produces (A-Frame components, all flat-shaded primitives):
  - `room="width:16; depth:20; height:4"`: floor, 4 walls, ceiling. Origin at floor center. Entrance at +z.
  - `shelf="width:2; rows:3"`, `rack="width:1.5"`, `desk` (L-shape + register).
  - `clerk="state: idle"`: capsule body, sphere head, box arms, and a child `.jaw` box. Reacts to `state` ∈ `idle|listening|thinking|speaking`: listening = head tilt 15° + lean; thinking = slow head turn; speaking = jaw scale-y randomized every 80-160 ms + head bob; idle = gentle bob.
  - `bounds="minX:-7.5; maxX:7.5; minZ:-9.5; maxZ:9.5"`: clamps the rig position every `tick`.
  - Scene coordinates other tasks rely on: rig spawn `(0, 0, 9)` with camera at y 1.6 facing -z; desk at `(0,0,6.5)`; clerk at `(0,0,5.8)` facing +z; island at `(0,0,0)`.
  - `main.js`: subscribes to `store`. Sets `wasd-controls.enabled = movementEnabled(state)`, and the clerk `state` = `store.status`. Store items that are not open yet start hidden (`visible:false` on `#shelves`).
- [ ] **Step 1:** Build `index.html`: a pinned A-Frame script, `<a-scene vr-mode-ui="enabled:false" renderer="colorManagement:true">`, hemisphere + point lights, a rig with `wasd-controls look-controls="pointerLockEnabled:false" bounds`, and the camera with `cursor="rayOrigin: mouse" raycaster="objects: .clickable"`. Add an `#intro` overlay with an **Enter store** button. Clicking it calls `speechSynthesis.speak(new SpeechSynthesisUtterance(''))` to unlock audio, hides the overlay, and calls `store.setPhase('LOCATION')`.
- [ ] **Step 2: Manual check:** run `npm run dev` and open `http://localhost:3000`. The room, desk, clerk, empty shelf placeholders, and an idle bob are visible. WASD does nothing before BROWSING. In the console, `store.set({status:'speaking'})` moves the jaw and `store.set({status:'listening'})` tilts the head. No console errors.
- [ ] **Step 3: Commit** `feat: low-poly store scene, clerk, intro overlay`

---

### Task 3: Clerk chat backend (§5)

**Files:** Create `server/lib/llm.js`, `server/lib/clerk.js`. Modify `server/app.js`. Test `test/clerk.test.js`.

**Interfaces:**
- Produces:
  - `makeGeminiLlm(apiKey, model) -> llm`, where `llm({ system: string, messages: [{role, text}], schema: object }) -> Promise<object>`. Uses `@google/genai` `ai.models.generateContent` with `systemInstruction`, `responseMimeType: 'application/json'`, `responseSchema: schema`. Role `clerk` maps to Gemini's `model`. Parse with `JSON.parse`.
  - `MAX_TURNS = 4`; `CLERK_SCHEMA` (ClerkResponse fields; `reply_to_player` and `ready` required).
  - `chatTurn({ messages, location }, llm) -> Promise<ClerkResponse>`.
  - Route `POST /api/chat` → `chatTurn(req.body, deps.llm)`.
- System prompt, starting with this exact copy: *"You're a friendly store clerk. Keep replies to 1-2 short sentences. Ask at most 2-3 questions. When you know what the shopper wants, set ready to true."* Then add the shopper's city, plus `"This is the last turn: you MUST set ready to true and fill query."` when the user-message count ≥ `MAX_TURNS`.
- [ ] **Step 1: Failing tests** (fake `llm` records its argument and returns a canned object):
  - `passes city into system prompt`: `location.city = 'Austin, Texas, United States'` → `system` includes `'Austin'`.
  - `forces ready on last turn`: 4 user messages → `system` includes `'MUST set ready'`. 3 user messages → it does not.
  - `ready with empty query is downgraded`: llm returns `{ready:true, query:'  ', reply_to_player:'ok'}` → result `ready === false`.
  - `llm throws`: result is `{ ready:false, reply_to_player:"Sorry, I didn't catch that. What are you looking for?" }` with the other fields defaulted (`preferences:[]`, `extra_queries:[]`, prices `null`).
  - `normalizes fields`: missing `preferences` → `[]`, `extra_queries` truncated to 2, string `max_price: "120"` → `120`.
  - Route test: `POST /api/chat` with a fake llm returns 200 and the ClerkResponse.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `chatTurn` and the route. Wire `makeGeminiLlm(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || 'gemini-2.5-flash')` in `server/index.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Then a live smoke test: `curl -XPOST localhost:3000/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","text":"a cheap mechanical keyboard under 80 bucks"}],"location":{"city":"Austin, Texas, United States","source":"default"}}'` returns valid JSON.
- [ ] **Step 5: Commit** `feat: /api/chat clerk with Gemini structured output`

---

### Task 4: Chat UI, subtitles, TTS (§8 text side, §9, §13 step 2)

**Files:** Create `public/js/text.js`, `public/js/api.js`, `public/js/voice.js` (TTS half), `public/js/ui.js`. Modify `public/index.html`, `public/css/ui.css`, `public/js/main.js`. Test `test/text.test.js`.

**Interfaces:**
- Consumes: `store` (Task 1), `POST /api/chat` (Task 3).
- Produces:
  - `splitSentences(text) -> string[]`: splits after `.`, `!`, `?` followed by whitespace, trims, drops empties.
  - `formatPrice(n) -> string`: `12.5 → "$12.50"`, `1299 → "$1,299"`. Whole numbers ≥ 100 get no cents.
  - `api.js`: `postChat(body)`, `postGeocode(body)`, `postSearch(body)`, `postStickers(body)`. Each calls `fetch` with a 15 s `AbortSignal.timeout` and throws on a non-2xx response. `imgUrl(u) -> '/api/img?u=' + encodeURIComponent(u)`.
  - `voice.js`: `speak(text, { onStart, onEnd }) -> void`. Queues `splitSentences` chunks, prefers an `en-*` voice with name matching `/natural|google|samantha/i`, skips audio when `store.get().voice.ttsMuted` (still calls `onEnd` after the typewriter finishes). `cancelSpeech()`.
  - `ui.js`: `clerkSay(text) -> Promise<void>`. Sets status `speaking`, runs the subtitle typewriter (~35 ms/char), appends to the chat log, and resolves when speech and typewriter are both done (status → `idle`). `onPlayerSubmit(handler)`. The input `focus`/`blur` handlers set `store.inputFocused`. The mute toggle flips `voice.ttsMuted`. **Skip** calls `cancelSpeech()` and shows the full line at once.
  - Chat loop in `main.js`: on submit, push the user message, set status `thinking`, `postChat`, push the clerk message, `clerkSay(reply)`. If `ready`, store `query` and `setPhase('SEARCHING')`.
- [ ] **Step 1: Failing tests:** `splitSentences('Hi there! Want a keyboard? Great.')` deep-equals `['Hi there!','Want a keyboard?','Great.']`. `splitSentences('')` → `[]`. `formatPrice(12.5) === '$12.50'`. `formatPrice(1299) === '$1,299'`. `formatPrice(99.99) === '$99.99'`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `text.js`, then the browser modules and overlays: a bottom input bar (text field + send + mic placeholder), a subtitle box above it, a collapsible chat log on the right, and mute/skip buttons.
- [ ] **Step 4:** `npm test` passes. **Manual check (Chrome):** the clerk speaks and the subtitle types along. The clerk jaw moves while speaking. Typing "wasd" in the box during CHATTING does not move the player. Skip cuts speech and shows the full text. Mute silences audio but subtitles still appear. After a couple of turns, phase becomes SEARCHING (check with `store.get().phase` in the console).
- [ ] **Step 5: Commit** `feat: chat bar, subtitles, chat log, speech synthesis`

---

### Task 5: Location step (§7, §13 step 3)

**Files:** Create `server/lib/geocode.js`. Modify `server/app.js`, `public/js/ui.js`, `public/js/main.js`, `public/index.html`. Test `test/geocode.test.js`.

**Interfaces:**
- Produces:
  - `DEFAULT_CITY = 'Austin, Texas, United States'`
  - `reverseGeocode(lat, lng, fetchImpl) -> Promise<string>`. Calls Nominatim `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=..&lon=..` with header `User-Agent: hacktx-store/1.0`. Builds the city from `address.city ?? town ?? village ?? county`, then `state`, then `country`, joined by `', '`. Throws if no city part.
  - `normalizeTypedLocation(s) -> string`: trims and collapses whitespace. Empty → `DEFAULT_CITY`.
  - Route `POST /api/geocode {lat,lng}`. Rounds to 2 decimals before calling out and never logs coordinates. Returns `{city}`. On failure returns `{ city: DEFAULT_CITY }` with 200.
  - Client: on `phase:LOCATION`, the clerk says the ask line, and two buttons appear with one privacy line: *"Your location is only used for this search."* **Share my location** calls `navigator.geolocation.getCurrentPosition` (`timeout: 10000`). Success → `/api/geocode` → `store.location = {city, lat, lng, source:'gps'}`. Error or timeout → the typed field shows with the clerk line "No problem, just type your city or ZIP." Typed submit → `{city: normalizeTypedLocation(v), source: normalizeTypedLocation(v) === DEFAULT_CITY ? 'default' : 'typed'}`. Then `setPhase('CHATTING')` and the clerk asks what they want.
- [ ] **Step 1: Failing tests:**
  - `reverseGeocode` with fake fetch returning `{address:{city:'Austin',state:'Texas',country:'United States'}}` → `'Austin, Texas, United States'`. Town-only address uses the town.
  - `normalizeTypedLocation('  78701 ')` → `'78701'`. `normalizeTypedLocation('   ')` → `DEFAULT_CITY`.
  - Route: fetchImpl rejects → 200 `{city: DEFAULT_CITY}`. Route: lat `30.26789` reaches fetch as `lat=30.27`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the server side, then the client buttons.
- [ ] **Step 4:** `npm test` passes. **Manual check:** allow → a city appears in the chat log. Block in browser settings → the typed field appears right away. Blank submit → continues with Austin.
- [ ] **Step 5: Commit** `feat: location step with GPS, typed, and default fallback`

---

### Task 6: Product search backend (§6, §10b tiers, §13 step 5)

**Files:** Create `server/lib/serp.js`, `server/lib/cache.js`, `server/data/demoProducts.json`. Modify `server/app.js`. Test `test/serp.test.js`, fixture `test/fixtures/shopping.json` (a trimmed real SerpApi response, saved once from a live call).

**Interfaces:**
- Produces:
  - `normalizeShoppingResults(json, { related=false, startRelevance=0 }) -> Product[]`. Reads `json.shopping_results ?? []`. Drops items without numeric `extracted_price`. `id = product_id ?? 'p' + index`. `link = link ?? product_link ?? null`. `rating ?? null`. `relevance` = position in the kept list + `startRelevance`. `tier` is left unset.
  - `assignTiers(products) -> Product[]`: sort a copy by `extracted_price`. Bottom third → `budget`, top third → `premium`, the rest → `mid`. With < 3 products, all are `mid`. Order of the returned array = input order.
  - `searchShopping({ q, location }, { apiKey, fetchImpl }) -> Promise<json>`: `GET https://serpapi.com/search.json?engine=google_shopping&q=..&location=..&api_key=..`.
  - `createCache(ttlMs) -> { get(key), set(key, value) }`. Key = `JSON.stringify([query.query, query.min_price, query.max_price, city])`, TTL 6 h.
  - Route `POST /api/search {query, city}`: the main query plus up to 2 `extra_queries` (marked `related: true`), fetched in parallel → normalize → main results that are out of budget stay (layout needs cheaper/pricier) → dedupe by id → cap at **30** (main results first) → `assignTiers` → `{products}`. If `deps.demoMode` or SerpApi fails → `demoProducts.json`. An empty result is returned as `{products: []}` (no demo substitution, so the clerk can say nothing matched).
  - Client (`main.js`): on `phase:SEARCHING`, `clerkSay("Let me check the back...")` runs in parallel with `postSearch`. Empty → `clerkSay("Hmm, nothing matched. Want to try something else?")` + `setPhase('CHATTING')`. Otherwise set `products` + `setPhase('OPENING')`.
- [ ] **Step 1:** Save the fixture: run one live SerpApi call for "mechanical keyboard" and keep 6 items, at least one with `extracted_price` removed by hand.
- [ ] **Step 2: Failing tests:**
  - The fixture normalizes to 5 products (the priceless one dropped), and each has `id`, `title`, numeric `extracted_price`, and `relevance` 0..4 in order.
  - `normalizeShoppingResults({})` → `[]`.
  - `assignTiers` on prices `[10,20,30,40,50,60]` → tiers `['budget','budget','mid','mid','premium','premium']` in input order. It does not mutate the input.
  - `assignTiers` with 2 items → both `mid`.
  - Route with fake fetch returning 40 items → 30 products. A second identical request makes **no** fetch call (cache). Fake fetch returning `{shopping_results: []}` → `{products: []}`. Fake fetch rejecting → 30 demo products.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL.
- [ ] **Step 4:** Implement, and write `demoProducts.json` (30 keyboard-ish Products with tiers and real-looking prices, `thumbnail: null`).
- [ ] **Step 5:** `npm test` passes. **Manual check:** a full chat in the browser ends with `store.get().products.length > 0` and phase `OPENING`.
- [ ] **Step 6: Commit** `feat: /api/search via SerpApi with tiers, cache, demo fallback`

---

### Task 7: Layout + product boxes + click cards + open animation (§10 layout, §10b Stage 1 box, §13 steps 6-7)

**Files:** Create `public/js/layoutStore.js`, `public/js/components/product-box.js`. Modify `server/app.js` (image proxy), `public/js/main.js`, `public/js/ui.js`, `public/index.html`. Test `test/layout.test.js`, `test/img.test.js`.

**Interfaces:**
- Consumes: `Product` with `tier`, `relevance`, `related` (Task 6). Scene coordinates (Task 2).
- Produces:
  - `ZONES`: capacity and geometry per zone. `island`: 4 slots on top of the island at y 1.0, around (0,0). `center`: two shelf units at x = ±3, z = 0, 3 rows × 4 = 24 slots. `left`: wall at x = -7.2, facing +x, 3 rows × 5 = 15. `right`: x = +7.2, facing -x, 15. `back`: z = -9.2, facing +z, 15. Shelf row heights y = 0.5, 1.1, 1.7.
  - `layoutStore(products, { min_price, max_price }) -> Slot[]`:
    1. **island** = the 4 lowest-`relevance`, non-`related` products whose price is within `[min_price ?? 0, max_price ?? ∞]` (if none fit the budget, use the 4 lowest relevance).
    2. Remaining: `related` → back. `budget` → left. `premium` → right. `mid` → center.
    3. When a zone is full, spill into the next zone in the order `center, back, left, right` that still has room. Products that fit nowhere are dropped.
    4. Within a zone, fill slots in order of `relevance`.
  - `product-box` component, schema `{ productId: string, thumb: string, color: color }`: a 0.45 box in the tier color (budget `#4caf50`, mid `#2196f3`, premium `#9c27b0`) with class `clickable`. If `thumb` is set, the front face plane loads `imgUrl(thumb)` with `crossorigin="anonymous"`. On texture error it keeps the colored box. Click emits `product-selected` with `{ productId }`.
  - `GET /api/img?u=`: only `https:` URLs whose hostname ends in `gstatic.com`, `googleusercontent.com`, or `serpapi.com`. Otherwise 400. Upstream `content-type` must start with `image/` and the body must be ≤ 2 MB, otherwise 502. Sends `Cache-Control: public, max-age=86400`.
  - Open sequence on `phase:OPENING`: `clerkSay("Go take a look!")`, show `#shelves` and zone signs (`<a-text>` "Best matches" / "Budget picks" / "Premium" / "More like this" / "You might also need"), spawn slots one by one 60 ms apart with a scale 0→1 `animation`, then `setPhase('BROWSING')`.
  - Product card overlay: title, `formatPrice`, source, rating, a **Buy** link (`target=_blank rel=noopener`, hidden when `link` is null), and a close button. Esc closes it.
- [ ] **Step 1: Failing tests** (`layout.test.js`, built with a `mk(id, price, tier, relevance, related=false)` helper):
  - The island holds ≤ 4 slots, includes the in-budget product with relevance 0, and excludes a relevance-0 product priced above `max_price`.
  - With 30 mixed products, every product id appears exactly once and no two slots share a position (compare `x,y,z` rounded to 3 decimals).
  - Every `left` slot has `position.x < -6`. Every `right` slot has `position.x > 6`. Every `back` slot has `position.z < -8`.
  - 30 `budget` products → all 30 placed (left fills, the rest spill).
  - `layoutStore([], {})` → `[]`.
- [ ] **Step 2: Failing tests** (`img.test.js`): `u=http://evil.com/x.png` → 400. `u=https://169.254.169.254/` → 400. Allowlisted host with a fake upstream `content-type: text/html` → 502. Allowlisted host + `image/png` → 200 with the bytes.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL.
- [ ] **Step 4:** Implement `layoutStore`, the image route, `product-box`, the open sequence, and the card.
- [ ] **Step 5:** `npm test` passes. **Manual check:** after the chat, shelves pop in one by one, thumbnails show (or colored boxes where they fail), WASD works, the player can't leave the room, clicking a box opens the card, and Buy opens the listing.
- [ ] **Step 6: Commit** `feat: store layout, product boxes, image proxy, open animation`

---

### Task 8: Funny price stickers (§10b Stage 1 sticker + copy)

**Files:** Create `server/lib/stickers.js`, `public/js/sticker.js`. Modify `server/app.js`, `public/js/components/product-box.js`, `public/js/main.js`, `public/index.html` (Bangers Google Font). Test `test/stickers.test.js`.

**Interfaces:**
- Produces:
  - `FALLBACK_STICKERS = { budget: ['BARGAIN BIN!','WOW. SO CHEAP.','WALLET HAPPY'], mid: ['SOLID PICK','JUST RIGHT','NO REGRETS'], premium: ['FANCY PANTS','TREAT YO SELF','OOH LA LA'] }`
  - `fallbackSticker(tier, seed: string) -> string`: deterministic pick using a string hash of `seed` mod the list length.
  - `cleanStickerText(s) -> string|null`: uppercase, trimmed, at most 4 words, at most 24 chars, only `[A-Z0-9 !?.$'&-]`. Returns null if empty after cleaning.
  - `generateStickers(items, llm) -> Promise<[{id, sticker_text}]>`: one batched llm call (schema: array of `{id, sticker_text}`; the prompt asks for clean, family-friendly jokes of max 4 words about the price/item). Every input id gets an output. Missing or invalid entries use `fallbackSticker(tier, id)`. If llm throws, everything falls back.
  - Route `POST /api/stickers {items}` (cap 30 items) → `{stickers}`.
  - `drawSticker(canvas, { price: string, text: string, seed: string }) -> void`: a 256×256 starburst. Point count 12-18 and radius jitter ±12% come from a seeded RNG. Bright fill from a fixed palette, 8px dark outline, the price in Bangers at ~64px, and the text below at ~28px. Call only after `document.fonts.load('64px Bangers')`.
  - `product-box` gains `sticker: string` and `price: string`. A billboard plane (0.35 × 0.35) floats 0.35 above the box, faces the camera each tick, and has a random ±10° z-tilt.
  - Client: fire `postStickers` when OPENING starts. Spawn boxes with `fallbackSticker` text right away and update each box's `sticker` when the response arrives, so stickers never wait on the LLM.
- [ ] **Step 1: Failing tests:** `fallbackSticker('budget','abc') === fallbackSticker('budget','abc')` and is in `FALLBACK_STICKERS.budget`. `cleanStickerText('so very very cheap wow')` → `'SO VERY VERY CHEAP'`. `cleanStickerText('<script>')` → `'SCRIPT'`. `cleanStickerText('   ')` → `null`. A `generateStickers` fake llm that returns only 1 of 3 ids → 3 results, with 2 from fallback. A throwing llm → 3 fallback results.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the server side, then `drawSticker` and the billboard.
- [ ] **Step 4:** `npm test` passes. **Manual check:** each box has a readable, tilted starburst with the price, no two look identical, the text changes from fallback to Gemini copy within a few seconds, and there's no z-fighting.
- [ ] **Step 5: Commit** `feat: funny price stickers with batched Gemini copy and fallbacks`

---

### Task 9: Push-to-talk mic (§8, §13 step 4)

**Files:** Modify `public/js/voice.js`, `public/js/ui.js`, `public/js/main.js`.

**Interfaces:**
- Produces: `createRecognizer({ onPartial(text), onFinal(text), onError(code) }) -> { start(), stop() } | null`. Returns null when neither `SpeechRecognition` nor `webkitSpeechRecognition` exists. Uses `interimResults: true`, `lang: 'en-US'`, `continuous: false`.
- Behavior: at boot, `voice.micAvailable = createRecognizer(...) !== null`, and the mic button is hidden when that's false. Holding the mic button (pointerdown → start, pointerup/leave → stop) sets status `listening`, so the clerk tilts. Partials fill the text input. Final text fills the input but does **not** auto-send, so the player can fix it. The mic button is disabled while `status === 'speaking'`, and `start()` is never called during speech. `onError('not-allowed')` → `clerkSay("No problem, just type instead.")` and the mic is hidden.
- [ ] **Step 1:** Implement.
- [ ] **Step 2: Manual check (Chrome + Firefox):** in Chrome, hold to talk, the transcript appears live, release, edit, send. The mic can't be pressed while the clerk talks. Denying mic permission gives the friendly line. In Firefox the mic button is absent and text works.
- [ ] **Step 3: Commit** `feat: push-to-talk speech recognition`

---

### Task 10: Hardening, polish, deploy (§3 rules, §11, §13 step 8, §14)

**Files:** Modify `server/app.js`, `public/index.html`, `public/js/main.js`. Test `test/app.test.js`.

**Interfaces:**
- Rate limits (express-rate-limit, per IP): `/api/chat` and `/api/stickers` 30/min, `/api/search` 10/min, `/api/geocode` 10/min, `/api/img` 300/min. Over the limit → 429 JSON `{error:'slow down'}`. The client shows the clerk line "Whoa, one sec!"
- Demo mode: `?demo=1` in the page URL makes the client send `demo: true` to `/api/search`, which forces `demoProducts.json`.
- Re-search: a "New search" button while BROWSING calls `setPhase('CHATTING')`, clears products and the shelves, and resets the message history.
- [ ] **Step 1: Failing test:** the 11th `/api/search` in a minute from one IP → 429. `/api/search` with body `demo: true` → demo products without calling fetchImpl.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL. Implement. Run again. Expected: PASS.
- [ ] **Step 3: Polish:** ambient loop (≤ 1 MB, starts on Enter, follows the mute toggle), a warmer lighting pass, and an Esc hint. Check that the total page weight is < 20 MB in DevTools Network.
- [ ] **Step 4: Deploy:** `git pull && npm ci && pm2 restart store` on the VPS. Then run the full flow on the real domain on the **demo laptop**: GPS prompt over HTTPS, voice picked, mic works, stickers show. Record a backup video of a full run.
- [ ] **Step 5: Commit** `feat: rate limits, demo mode, re-search, polish`
