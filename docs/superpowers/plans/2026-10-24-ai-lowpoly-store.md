# AI Low-Poly Store Implementation Plan

> **Status (read this first).** The checkboxes below were never ticked; use this table instead. Tasks 0-14 are built and merged. **Task 15 was
> replaced**: "Similar Finds" shelves that called SerpApi were swapped for a corkboard of Gemini-suggested follow-up searches (`/api/ideas`, no
> SerpApi). Everything built after this plan (maps, clothing mode, castle, windows and outside scenes, cart models, Amazon results, smoke reveal)
> is in [docs/ROADMAP.md](../../ROADMAP.md), which is the living plan and to-do list.
>
> | Tasks | State |
> |---|---|
> | 0-11 (scaffold, state, scene, chat, location, search, layout, stickers, cutouts, mic, hardening, redesign) | done |
> | 12, 12b, 13 (cart, player collision, 3D cart) | done; the 3D cart is now a toggle with a model per map |
> | 14 (saved searches + replay) | done |
> | 15 (Similar Finds) | **superseded** by the Try Next corkboard, see ROADMAP |


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

### Task 8b: Background-removed cutout standees (user request; spec §10b Stage 2 option 1, flood-fill instead of rembg)

**Files:** Create `public/js/cutout.js`. Modify `public/js/components/product-box.js`, `public/index.html`. Test `test/cutout.test.js`.

**Interfaces:**
- Consumes: `product-box` with `{productId, thumb, color, size, sticker, price}` (Tasks 7-8), and the `/api/img` proxy (Task 7). Thumbnails are same-origin through the proxy, so the canvas is not tainted.
- Produces:
  - `public/js/cutout.js` is a **classic script** (R7) with no import/export. It assigns `globalThis.StoreCutout = { removeEdgeBackground, alphaBBox }`. Load it in `<head>` before `product-box.js`. Tests load it with `await import('../public/js/cutout.js')` and read from `globalThis.StoreCutout`, so the same file works in both places.
  - `removeEdgeBackground(data: Uint8ClampedArray, w, h, { minLight = 232, maxChroma = 24 } = {}) -> { removedFraction: number }`. Mutates `data` in place.
    - A pixel is "background-like" when `min(r,g,b) >= minLight && max(r,g,b) - min(r,g,b) <= maxChroma`, or when it's already transparent (`a < 16`).
    - Run a 4-connected flood fill (iterative, with a typed-array queue; no recursion) seeded from every border pixel that is background-like. Set the alpha of every reached pixel to 0.
    - Feather: any kept pixel 4-adjacent to a removed one gets `a = min(a, 140)`.
    - `removedFraction` = removed / (w*h).
  - `alphaBBox(data, w, h, alphaMin = 16) -> {x, y, w, h} | null`: the tight box around pixels with `a >= alphaMin`. Returns null when every pixel is transparent.
- `product-box` behavior when `thumb` is set and the image loads:
  1. Draw it to a canvas no bigger than 256 px on the long side and get the ImageData. Run `removeEdgeBackground`.
  2. If `removedFraction < 0.04` (a busy photo with no plain background), skip the cutout and keep the Task 7 look: tier box plus front thumbnail. Otherwise crop to `alphaBBox` plus 2 px of padding and use it as a **standee**:
     - **Hide the tier box.** Keep it in the scene with `visible = false` so it stays clickable through the raycaster. Better: put the `clickable` class on the standee instead.
     - **Standee plane:** a vertical `PlaneGeometry` sized to fit the cropped aspect ratio inside a `size × size` square, using the box's own `size` (0.3 on shelves, 0.45 on the island).
     - **Placement:** the bottom edge sits on the same surface the box sat on, i.e. the plane's local y center is `-size/2 + planeH/2`. It faces local +z like the thumbnail did.
     - **Material:** `MeshBasicMaterial({ map: CanvasTexture, transparent: true, alphaTest: 0.1, side: DoubleSide })`.
     - **Cardboard edge:** a thin flat-shaded `#c8a165` box, 0.012 deep, 90% of the plane's width, `planeH*0.25` tall, placed behind the plane at its base as a little stand.
     - **Sticker:** move it so it sits relative to the standee's top. Its center goes at `-size/2 + planeH + side/2 + 0.02`, which keeps R20's clearance under the shelf above.
  3. If the image fails, or `thumb` is null, keep the tier box (the spec's fallback).
- `product-selected` still fires on click.
- In `remove()`, dispose the canvas texture, the material, and the geometry.

- [ ] **Step 1: Failing tests** (`test/cutout.test.js`, using small synthetic RGBA buffers):
  - A 10×10 white image with a 4×4 red square in the center ends with `removedFraction` = 0.84, every white pixel alpha 0, and the red pixels at alpha 255 except feathered edge pixels, which are ≤ 140.
  - A white ring around a white interior, separated by a closed black border, keeps the interior white pixels opaque, because they are unreachable from the edge.
  - An all-dark image ends with `removedFraction` = 0, unchanged.
  - Light gray at (240,240,240) is removed, and pale pink at (250,200,220) is kept (chroma 50 > 24).
  - `alphaBBox` on the red-square result returns `{x:3, y:3, w:4, h:4}`. A fully transparent buffer returns `null`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `cutout.js`, then the standee path in `product-box`.
- [ ] **Step 4:** `npm test` passes. **Manual check:**
  - Products on white backgrounds appear as cutouts standing on the shelves.
  - Lifestyle photos stay as boxes with the photo on the front.
  - Products with no photo stay as tier-colored boxes.
  - Stickers sit right above each cutout without touching the shelf above.
  - Clicking a cutout opens its card.
- [ ] **Step 5: Commit** `feat: background-removed cutout standees`

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

---

### Task 11: Apple-store visual redesign + banner signs (user request)

**Files:** Create `public/js/components/zone-banner.js`, `test/scene-geometry.test.js`. Modify `public/index.html`, `public/js/components/{room,shelf,desk}.js`, `public/js/main.js` (remove the old `a-text` zone signs; change the box colors), `public/css/ui.css`.

**Interfaces:**
- Consumes: `SHELF_UNITS` and the slot geometry in `public/js/layoutStore.js` (R17). Those numbers must not change.
- Produces: `zone-banner` component (a classic script, R7), with schema `{ text: string, width: number (default 2), height: number (default 0.26) }`.
  - It builds a slim panel box `width × height × 0.04`, colored `#fbfbfd`, with a 0.012 dark edge strip `#1d1d1f` along its bottom.
  - On the panel's +z face it puts a canvas-texture plane at `z = 0.021`. The canvas is 1024×128, with `text` centered in `600 28px "Inter", -apple-system, "Segoe UI", sans-serif`, scaled to fill about 60% of the height, letter-spacing about 0.5px, color `#1d1d1f`. It is drawn after `document.fonts.load('600 28px Inter')`, raced with a 2 s timeout.
  - The texture uses `SRGBColorSpace` and anisotropy 8.
  - `remove()` disposes everything.

**Design (exact values):**

| Element | Material / color |
|---|---|
| Floor | `#e9e7e3` matte, with a subtle large-tile look: thin `#dcd9d3` lines every 2 m (planes 0.002 above the floor, 0.01 wide) |
| Walls | `#f5f5f7`. The back wall gets a feature panel of light oak `#d9bf98`, 12 × 2.6, centered behind the back shelves at y 1.5, 0.02 in front of the wall |
| Ceiling | `#ffffff`, with 3 long emissive light-panel strips: planes 12 × 0.5, `emissive #ffffff`, `emissiveIntensity 0.8`, at y = height − 0.01 and x = −4, 0, 4, running along z (visual only, **no new light entities**) |
| Shelf units | uprights and back panel `#f5f5f7` matte; planks light oak `#d9bf98`; uprights 0.03 thick (was 0.05). **Keep** width 2, rows 3, rowHeight 0.6, depth 0.5, plank thickness 0.05, and the plank-top heights 0.05 / 0.65 / 1.25 |
| Island | tabletop light oak `#d9bf98`, 2 × 0.06 × 1.2, top surface stays at y **0.80**; base `#f5f5f7`, slimmer (1.4 × 0.74 × 0.7) |
| Desk | light oak top `#d9bf98`, white `#fbfbfd` front panels, a dark `#1d1d1f` slim register screen |
| Rack | removed from the scene (the component file stays) |
| Product fallback boxes | all tiers `#fbfbfd` (Apple-white packaging); `TIER_COLORS` becomes one constant. The banners carry the zone cue |
| Lights | the three light entities and the disco ball stay **unchanged** (R25) |

**Banners:**
- **Wall units:** every wall unit gets a `zone-banner` mounted on its top, centered at unit-local `(0, 2.0, 0.02)`, width 2, facing out with the unit. Make it a child entity of the shelf unit in `index.html`, inside `#shelves`, so it appears when the store opens.
  - Left: `Budget Picks`. Right: `Premium`. Back: `You Might Also Need`. The two center units: `More Like This`.
- **Island:** one suspended banner, `Best Matches`, width 1.6, at world `(0, 1.75, 0)` facing +z. Hang it with two thin `#1d1d1f` wires (cylinders, radius 0.004) from y 4.0 down to the banner's top corners.
- `main.js` stops creating `a-text` zone signs. Remove the creation and cleanup code; banners show and hide with `#shelves`.
- Index.html adds the Google Font `Inter:wght@500;600`.

**Overlays (`ui.css`, Apple style):**
- Font stack `"Inter", -apple-system, "Segoe UI", sans-serif`, text `#1d1d1f`.
- Panels (chat bar, subtitle, chat log, card, location panel, intro card) use `rgba(255,255,255,0.78)` with `backdrop-filter: blur(20px) saturate(180%)`, `border-radius: 18px`, `box-shadow: 0 8px 30px rgba(0,0,0,0.12)`, and no hard borders.
- Primary buttons are `#0071e3` with white text, a 980px radius (pill), and `#0077ed` on hover. Secondary buttons are `#e8e8ed` with `#1d1d1f` text.
- The intro title is 600 weight with tight letter-spacing, `-0.02em`.
- Keep every existing id, `hidden` behavior, and layout position.

- [ ] **Step 1: Failing test** `test/scene-geometry.test.js`: read `public/index.html` as text and extract every `shelf="..."` entity's `position` and `rotation`. Assert that the set of `{x, z, rotY}` deep-equals `SHELF_UNITS` from `layoutStore.js` (same positions and rotations, any order), and that every shelf has `width:2; rows:3`. Also assert that `#island`'s top surface is at y 0.80. Parse the tabletop box's `position.y + height/2`.
- [ ] **Step 2:** Run `npm test`. Expected: PASS for geometry already (this is a guard test, so seeing it pass first is expected). Then temporarily change one shelf x in a scratch copy to confirm it would FAIL. Report that.
- [ ] **Step 3:** Implement the design, the banners, and the overlays.
- [ ] **Step 4:** `npm test` passes, `node --check` passes on the changed browser files, and the assets curl 200. **Manual check:**
  - the store reads as bright white/oak/stone;
  - the banners are crisp and readable from mid-room, sitting on top of each shelf unit, with the island banner hanging;
  - products still sit on the planks;
  - stickers and the disco ball are unchanged;
  - the overlays look like frosted Apple panels.
- [ ] **Step 5: Commit** `feat: apple-store look and banner signs`

---

# Part 2: Cart, Saved Searches, Similar Finds (Tasks 12-15)

**Spec:** [docs/superpowers/specs/2026-10-24-cart-saved-searches-similar-design.md](../specs/2026-10-24-cart-saved-searches-similar-design.md). The user approved it. Read it before working on Tasks 12-15.

**Goal:** Shoppers can save products to a cart, which shows in a right-side widget and in a 3D cart that follows them. They can reopen past searches with zero API calls. Walking to the back fills a "Similar Finds" shelf once per store.

**Prerequisite:** Task 11 and the final-review fix wave are merged. These tasks modify `main.js`, `ui.js` and `ui.css` after those changes.

## Global Constraints (Part 2)
- Data is device-only, in browser `localStorage`. No accounts, no server storage. Keys: `store.cart.v1` and `store.searches.v1`.
- Caps:
  - cart: **50** items;
  - 3D cart: shows the newest **12**;
  - saved searches: **10**;
  - Similar Finds: **12** products from **2** generated queries;
  - `/api/similar`: **10/min** per IP, with a **25 s** client timeout.
- The back-wall trigger fires when rig z < **-6.2**, only in BROWSING, once per opened store.
- **No new npm dependencies.** Earlier rulings still bind:
  - R7: components are classic scripts.
  - R8: the rig carries look-controls.
  - R17/R26: shelf geometry is frozen and `SHELF_UNITS` is unchanged. The geometry guard test must keep passing.
- All user-visible text that comes from data uses `textContent`.

## Review Focus (Part 2)
1. **Storage blocked, full or corrupt.** The app keeps working in memory and never throws. Tests in Task 12 and Task 14.
2. **The same product added twice, or add/remove spam.** Exactly one entry, and the widget and the 3D cart stay in sync. Test in Task 12.
3. **New search or replay while Similar Finds is still loading.** No late products may appear in the new store. Handled by the opening run token in Task 15, plus a manual check.
4. **Walking to the back before the store has finished opening (OPENING).** Nothing fires until BROWSING. Handled by Task 15's trigger guard, plus a manual check.
5. **A replayed search whose thumbnail URLs have expired.** The products fall back to tier boxes through the existing product-box path. Manual check in Task 14.

## File Structure (Part 2)
```
public/js/storage.js          safeLocalStorage(), memoryStorage()   (DOM-free; Task 12)
public/js/cart.js             createCart()                          (DOM-free; Task 12)
public/js/savedSearches.js    createSavedSearches()                 (DOM-free; Task 14)
public/js/components/shopping-cart.js   3D cart (classic script; Task 13)
server/lib/similar.js         generateSimilarQueries()              (Task 15)
test/{storage,cart,savedSearches,similar}.test.js
```

---

### Task 12: Cart store + card button + right-side widget

**Files:**
- Create: `public/js/storage.js`, `public/js/cart.js`, `test/storage.test.js`, `test/cart.test.js`.
- Modify: `public/js/ui.js`, `public/js/main.js`, `public/index.html`, `public/css/ui.css`.

**Interfaces:**
- Consumes:
  - `showProductCard(p)` and `hideProductCard()` from ui.js;
  - the `product-selected` handler in main.js;
  - `formatPrice` from text.js;
  - `imgUrl` from api.js.
- Produces:
  - `storage.js`:
    - `memoryStorage() -> {getItem, setItem, removeItem}`.
    - `safeLocalStorage() -> same shape`. It returns `window.localStorage` if a test write and remove of the key `__probe__` succeeds; otherwise it returns `memoryStorage()`. It never throws, even when `window` is undefined.
  - `cart.js`:
    - `createCart(storage = safeLocalStorage(), key = 'store.cart.v1') -> { items(), add(product), remove(id), has(id), clear(), total(), on('change', fn) -> unsubscribe }`.
    - Items are `CartItem = {id, title, price, extracted_price, source, link, thumbnail, savedAt}`.
    - `items()` returns a copy, newest first.
    - `add` returns false when the id is already in the cart or the cart is full (50).
    - `total()` rounds to cents.
    - Every change is saved to storage. If `setItem` throws, the error is swallowed.
    - On load, drop invalid JSON, non-array data, and items without a string `id` or a finite `extracted_price`.
  - `ui.js` additions:
    - `setCardInCart(inCart: boolean)`: the card button reads "Add to cart" or "In cart ✓ · Remove".
    - `onCardCart(fn: () => void)`.
    - `renderCart(items: CartItem[], total: number)`.
    - `onCartRemove(fn: (id) => void)`.
    - `showWidgetTab('cart'|'searches')`.
  - Widget DOM:
    - `#cart-widget`: a frosted panel on the right edge, with collapse tab `#cart-tab` and count badge `#cart-count`.
    - Tab buttons `#tab-cart` and `#tab-searches`.
    - Panes `#cart-pane` and `#searches-pane`. `#searches-pane` shows "No past searches yet." until Task 14.
  - The chat log (`#chat-log` and its toggle) moves to the **left** edge.
  - `main.js`:
    - holds a module-level `cart = createCart()`;
    - remembers which product the card is showing;
    - on every cart change, re-renders the widget and calls `scene.emit('cart-changed', { items: cart.items() })` (Task 13 listens for this). It also does both once at boot.

- [ ] **Step 1: Failing tests.**
  - `storage.test.js`:
    - `memoryStorage` round-trips a value.
    - `safeLocalStorage()` under Node, where there is no `window`, returns a working memory storage.
  - `cart.test.js`, using a `memoryStorage()` fake:
    - `add` then `has` → true, and `items()[0].id` matches.
    - Adding the same id twice keeps 1 item, and the second `add` returns false.
    - The 51st distinct add returns false, and length stays 50.
    - `remove` and `clear` work.
    - `total()` of 19.99 + 0.01 + 5.5 === 25.5.
    - Persistence: a second `createCart` on the same storage sees the items.
    - Storage seeded with `'{bad'` → `items()` is `[]`.
    - Storage seeded with `[{"id":1},{"id":"a","extracted_price":3,"title":"t"}]` → only `'a'` survives.
    - With a storage whose `setItem` throws, `add` still returns true and `has` is true.
    - `on('change')` fires once per successful change and not on a rejected duplicate.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement `storage.js` and `cart.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Implement the card button, the widget, the log move, and the main.js wiring.
  - Widget rows show:
    - a 40 px thumbnail, or a white swatch when there is none;
    - the title, clamped to 2 lines;
    - the price;
    - a **Buy** link (`target=_blank rel=noopener`, hidden when the link is null);
    - a remove ×.
  - The footer reads `"N items · $total"`. The empty state reads "Click a product and press Add to cart."
  - The widget is visible from CHATTING onward and hidden in INTRO and LOCATION. Its list scrolls when it overflows.
- [ ] **Step 6:** Run `npm test` and `node --check` on the changed browser files, and curl the assets from port 3000 (expect 200).
  - **Manual check:**
    - Adding from the card works, and the button toggles.
    - The badge and total update.
    - × removes an item.
    - Reloading keeps the cart.
    - The log sits on the left and the widget on the right, and neither overlaps New search.
- [ ] **Step 7: Commit** `feat: cart with right-side widget`

---

### Task 12b: Player collision with fixtures (user request: "walking through things")

**Files:**
- Create: `public/js/collide.js`, `test/collide.test.js`.
- Modify: `public/js/components/bounds.js`, and `public/index.html` (one script tag).

**Interfaces:**
- **Consumes:** `SHELF_UNITS` from `layoutStore.js`. The test uses it only as a guard.
- **Produces:**
  - `public/js/collide.js` is a **classic script** (R7) with no import/export. It assigns `globalThis.StoreCollide = { OBSTACLES, PLAYER_RADIUS, resolve }`.
  - Load it in `<head>` before `bounds.js`.
  - Tests load it with `await import('../public/js/collide.js')` and then read `globalThis.StoreCollide`, the same pattern as `cutout.js`.
  - `PLAYER_RADIUS = 0.3`.
  - `OBSTACLES: {minX, maxX, minZ, maxZ}[]` holds axis-aligned footprints in world x/z:
    - **11 shelf units.** Each is 2 wide × 0.5 deep, centered on its unit position. A unit with rotY ±90 swaps its extents (0.5 in x, 2 in z).
    - **Island:** x −1..1, z −0.6..0.6.
    - **Desk counter:** x −1.65..1.65, z 6.05..6.95.
    - **Desk return:** x 1.35..2.25, z 4.65..6.55.
    - **Clerk:** x −0.35..0.35, z 5.45..6.15.
  - `resolve(pos: {x, z}, r = PLAYER_RADIUS, obstacles = OBSTACLES) -> pos` mutates `pos` and returns it. It allocates nothing. It runs two passes over the obstacles:
    - Outside a rectangle: find the closest point on it. If the distance is less than `r`, push out along the vector from that point by `r − distance`.
    - Center inside a rectangle: push out along the axis of least penetration to that side's edge plus `r`.
- `bounds` component: after its existing room clamp, call `StoreCollide.resolve(this.el.object3D.position)`. object3D.position has `x`/`z`, so pass it directly. Room bounds are unchanged.

- [ ] **Step 1: Failing tests** (`test/collide.test.js`), using a single test rectangle `{minX:0,maxX:2,minZ:0,maxZ:1}` and r 0.3:
  - `{x:-0.1, z:0.5}` → x === -0.3 (pushed out to the left), z unchanged.
  - `{x:2.1, z:0.5}` → x === 2.3.
  - `{x:1, z:-0.2}` → z === -0.3.
  - `{x:1, z:1.1}` → z === 1.3.
  - Inside, near the left edge, `{x:0.1, z:0.5}` → x === -0.3.
  - Corner `{x:-0.1, z:-0.1}` → the distance to (0,0) is ≥ 0.3 − 1e-9.
  - Clear `{x:-1, z:-1}` → unchanged.
  - Guard: for every unit in `SHELF_UNITS` (flattened), `OBSTACLES` contains a rectangle with the expected footprint, compared to 3 decimals.
  - The default spawn `{x:0, z:9}` is unchanged by `resolve`.
  - A point at the back-wall trigger line, `{x:-2, z:-8.5}` (between units), stays reachable: its z ends up ≤ -6.2.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `collide.js` and wire it into `bounds`.
- [ ] **Step 4:** Run `npm test` (expected: PASS), `node --check` on both files, and curl the assets (expected: 200).
  - **Manual check:**
    - You can't walk through any shelf, the island, the desk or the clerk.
    - Walking diagonally into a shelf slides along it.
    - You can still walk around the desk into the store.
    - You can reach the back wall and trigger Similar Finds once Task 15 lands.
- [ ] **Step 5: Commit** `feat: player collides with shelves, island, desk`

---

### Task 13: 3D shopping cart

**Files:**
- Create: `public/js/components/shopping-cart.js`.
- Modify:
  - `public/index.html`: add the script tag, and `<a-entity id="cart3d" shopping-cart>` as a child of the scene, **not** inside `#rig`.
  - `public/js/main.js`: visibility.

**Interfaces:**
- Consumes:
  - the scene event `cart-changed` with `{items: CartItem[]}` (Task 12);
  - `#rig`, which carries look-controls (R8).
- Produces the `shopping-cart` component, schema `{ rig: selector (default '#rig'), max: number (default 12) }`.
  - **Model:**
    - a basket of thin `#c7c7cc` boxes, 0.55 wide × 0.35 tall × 0.4 deep, open on top;
    - a handle bar;
    - 4 wheels in `#1d1d1f`;
    - flat-shaded, with geometries and materials shared inside the component.
  - **Following the player:**
    - Each tick, copy the rig's world x/z and the rig's **yaw only** (rig `object3D.rotation.y`).
    - Place the cart 0.9 m ahead along that yaw, with the basket bottom at world y 0.45.
    - Use preallocated vectors and allocate nothing per frame.
  - **Contents:**
    - On `cart-changed`, rebuild the contents from the newest `max` items.
    - Each item is a 0.12 cube in a 4×3 grid on the basket floor.
    - The cube's top face shows the thumbnail (`'/api/img?u='+encodeURIComponent(thumb)`, crossOrigin anonymous). Items without a thumbnail stay white `#fbfbfd`.
    - An item that is new since the last render pops in with a scale animation, 0 → 1 over 250 ms.
    - Dispose old textures, materials and geometries. A build token drops stale texture callbacks.
  - **Not `.clickable`.**
  - `main.js` makes `#cart3d` visible only when `phase === 'BROWSING'`, inside its existing `applyState`.

- [ ] **Step 1:** Implement the component and the wiring.
- [ ] **Step 2:** Run `npm test` (the existing suite must still pass), `node --check` on the new file, and curl (expect 200).
  - **Manual check:**
    - The cart rolls ahead as you walk and turns with you.
    - It does **not** tilt when you look up or down.
    - Items appear in the basket, and new ones pop in.
    - It is hidden outside BROWSING.
    - It never blocks clicks on low-shelf products.
- [ ] **Step 3: Commit** `feat: 3d shopping cart follows the player`

---

### Task 14: Saved searches + Past searches tab + replay

**Files:**
- Create: `public/js/savedSearches.js`, `test/savedSearches.test.js`.
- Modify:
  - `public/js/store.js`: the initial state gains `replay: null`;
  - `public/js/main.js`;
  - `public/js/ui.js`.

**Interfaces:**
- Consumes:
  - `safeLocalStorage` and `memoryStorage` (Task 12);
  - `#searches-pane` and `showWidgetTab` (Task 12);
  - `runSearch`, `runOpening`, `stickerTexts` and the New-search reset (main.js).
- Produces:
  - `savedSearches.js`:
    - `createSavedSearches(storage = safeLocalStorage(), key = 'store.searches.v1') -> { list(), save({query, city, products, stickers}), updateStickers(id, stickers), get(id), remove(id) }`.
    - Entries are `SavedSearch = {id, query, city, products, stickers, savedAt}`, where:
      - `products` is capped at 30;
      - `stickers` is `{[productId]: text}`;
      - `id` is `String(savedAt)` plus a random suffix.
    - `list()` is newest first.
    - `save` keeps at most 10 entries. A new entry with the same `query.query` (case-insensitive, trimmed) and the same `city` replaces the older one.
    - If a write throws a quota error, drop the oldest entry and retry once. If that fails too, skip saving. It never throws.
    - Corrupt data is dropped on load.
  - `ui.js`:
    - `renderPastSearches(list: SavedSearch[])`: rows of `"query · city · N items · <relative time>"`.
    - `onPastSearchPick(fn: (id) => void)`.
  - `main.js`:
    - **Refactor** the New-search handler body into `resetStore({ silent = false })`. When `silent` is true it skips the line "What else can I find for you?". Behavior is otherwise unchanged.
    - **Saving:** when an opening starts with real products and no `replay`, call `savedSearches.save({query, city: location.city, products, stickers: {}})`. When `/api/stickers` resolves for that run, call `updateStickers(entry.id, map)`.
    - **Replay:** on `onPastSearchPick(id)`:
      - It is allowed only in CHATTING or BROWSING; otherwise ignore it.
      - If in BROWSING, call `resetStore({silent:true})` first.
      - Then `store.set({ replay: entry })` and `setPhase('SEARCHING')`.
    - When `store.get().replay` is set, `runSearch`:
      - skips `/api/search`, the wait line and the spin;
      - sets `products = replay.products` and `query = replay.query`;
      - calls `setPhase('OPENING')`.
    - `runOpening` with a replay:
      - reads `replay` at its start, then clears `store.replay` to null;
      - seeds `stickerTexts` from `replay.stickers`;
      - **skips `postStickers`**;
      - does not save the search again.

- [ ] **Step 1: Failing tests** (`savedSearches.test.js`, using `memoryStorage`):
  - After 11 saves of distinct queries, `list().length === 10` and the oldest is gone.
  - Saving "Apple Watch" and then "apple watch " with the same city leaves 1 entry, the newer one.
  - The same query with a different city keeps 2 entries.
  - Products are capped at 30.
  - `updateStickers` persists, and a new instance sees the change.
  - Corrupt storage → `list()` is `[]`.
  - A storage whose `setItem` throws `{name:'QuotaExceededError'}` on the first call and succeeds on the second: `save` succeeds and the oldest entry is dropped.
  - A storage that always throws: `save` does not throw.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `savedSearches.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Implement the tab, the `resetStore` refactor, saving, and the replay wiring.
- [ ] **Step 6:** Run `npm test` and `node --check`, and curl.
  - **Manual check:**
    - A finished search appears in Past searches.
    - Picking it from CHATTING or BROWSING rebuilds the store, and the DevTools Network tab shows **no** `/api/search` or `/api/stickers` calls.
    - Stickers show the saved jokes.
    - Reloading keeps the list.
    - An old replay with dead thumbnails shows white boxes.
- [ ] **Step 7: Commit** `feat: saved searches with zero-api replay`

---

### Task 15: Similar Finds at the back wall  *(SUPERSEDED: built differently; see the status table at the top)*

**Files:**
- Create: `server/lib/similar.js`, `test/similar.test.js`.
- Modify:
  - `public/js/layoutStore.js` and `test/layout.test.js`;
  - `server/app.js`;
  - `public/js/api.js`;
  - `public/js/main.js`;
  - `public/index.html`: change the banners on the back-middle (x=0) and back-right (x=4) units to `Similar Finds`, with ids `banner-similar-1` and `banner-similar-2`.

**Interfaces:**
- Consumes:
  - `SHELF_UNITS` (unchanged);
  - the per-query cache `runQuery(q, location)` in app.js;
  - `normalizeShoppingResults` and `assignTiers` (serp.js);
  - `demoProducts`;
  - `llm` (llm.js);
  - `spawnBox`, `openingRun` and `stickerTexts` (main.js);
  - `postStickers`;
  - the `zone-banner` `text` property.
- Produces:
  - `layoutStore.js`:
    - `ZONES.back` is built from `SHELF_UNITS.back[0]` only: the x=-4 unit, 6 slots.
    - New `ZONES.similar` is built from `SHELF_UNITS.back[1]` and `[2]`: 12 slots.
    - `similar` is **not** in `SPILL_ORDER`, and `layoutStore` never places products there.
    - New export `layoutSimilar(products) -> Slot[]`: at most 12 products, in `relevance` order, with `zone: 'similar'`.
  - `similar.js`: `generateSimilarQueries({ query: Query, titles: string[] }, llm) -> Promise<string[]>`.
    - It makes one llm call with schema `{queries: string[]}`. The prompt asks for exactly 2 shopping searches that are similar to the main query but not the same product, for example a different style, brand or form factor.
    - Normalize the result:
      - trim and drop empties;
      - drop case-insensitive duplicates of each other and of `query.query` and `query.extra_queries`;
      - cap at 2.
    - If llm throws, return `[]`.
  - Route `POST /api/similar`:
    - Body: `{query, city, exclude, titles}`. Caps: `exclude` 100, `titles` 5, each title 120 characters.
    - Rate limit: `limit(10)`.
    - When `demoMode` is on, `body.demo === true`, or the key is missing, return `{products: <up to 12 demoProducts whose ids ∉ exclude, mapped to similar:true, related:false>, queries: [], demo: true}`.
    - Otherwise:
      1. `queries = await generateSimilarQueries(...)`. If it is empty, return `{products: [], queries: []}`.
      2. Run the queries in parallel through `runQuery(q, city)`, catching each one's error separately.
      3. `normalizeShoppingResults` the results, map them to `similar: true, related: false`, drop excluded ids, dedupe by id, cap at 12, then `assignTiers`.
      4. Return `{products, queries}`.
    - If every query fails, return demo products as above, with `demo: true`.
    - The response is always 200, except 429.
  - `api.js`: `postSimilar(body)` with a 25000 ms timeout. It forwards `demo: true` the same way `postSearch` does when the page was loaded with `?demo=1`.
  - `main.js`:
    - While in BROWSING, poll every 250 ms. When `rig.object3D.position.z < -6.2` and this opening's run hasn't triggered yet, call `triggerSimilar(run)`.
      - Clear the poll when the phase leaves BROWSING.
      - Track "triggered" per `openingRun`, so replay and New search re-arm it.
    - `triggerSimilar`:
      1. The clerk says "More like this coming up!".
      2. Call `postSimilar({ query, city: location.city, exclude: products.map(p => p.id), titles: top 5 titles by relevance })`.
      3. If `run !== openingRun`, drop the result.
      4. Otherwise, spawn the `layoutSimilar(products)` slots into `#products` 60 ms apart, using the same path as `spawnBox`.
      5. Then make one `postStickers` call for them, gated on the token.
    - If the result is empty, failed or a 429, set both banners' `zone-banner` `text` to `Nothing Similar Right Now`.
    - Every reset and opening sets both banner texts back to `Similar Finds`.
  - `Product` gains an optional `similar?: boolean`.

- [ ] **Step 1: Failing tests:**
  - `test/layout.test.js` (added to the existing tests):
    - With 30 mixed products, no slot has zone `similar`, the `back` zone holds at most 6, and all 30 are still placed.
    - `layoutSimilar` of 15 products returns 12 slots, all with `zone === 'similar'`, `position.x > -1` and `position.z < -8`, at unique positions.
    - `layoutSimilar([])` → `[]`.
  - `test/similar.test.js`:
    - `generateSimilarQueries` with a fake llm returning `['Thocky 75% keyboard', 'mechanical keyboard creamy sound', 'GASKET mount keyboard', 'gasket mount keyboard', '']`, for the query `'mechanical keyboard creamy sound'` → `['Thocky 75% keyboard', 'GASKET mount keyboard']`.
    - A throwing llm → `[]`.
    - The route, with a fake llm returning 2 queries and a fake fetch returning 10 items each:
      - exactly 2 fetch calls;
      - excluded ids are absent;
      - `products.length <= 12`;
      - every product has `similar === true`.
    - The llm returns only the main query → 0 fetch calls and `{products: []}`.
    - `demoMode` → demo items not in `exclude`, with `demo === true` and no fetch.
    - The 11th call in a minute → 429.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the layout changes, `similar.js` and the route.
- [ ] **Step 4:** Run `npm test`. Expected: PASS, including the R26 geometry guard.
- [ ] **Step 5:** Implement `postSimilar`, the trigger, the spawning and the banner text updates, and add the banner ids to index.html.
- [ ] **Step 6:** Run `npm test` and `node --check`, and curl.
  - **Manual check:**
    - The back-middle and back-right shelves start empty under "Similar Finds".
    - Walking to the back during OPENING does nothing.
    - In BROWSING, walking back triggers once: the clerk line plays, then up to 12 items pop in with stickers.
    - Walking away and back again does not trigger it a second time.
    - New search while it is loading leaves no leftovers.
    - `?demo=1` fills from demo stock.
    - Removing the SerpApi key falls back to demo stock.
- [ ] **Step 7: Commit** `feat: similar finds load at the back wall`
