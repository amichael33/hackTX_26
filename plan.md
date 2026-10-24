# Hackathon Plan: AI Low-Poly Shopping Store (A-Frame)

A low-poly 3D store interior hosted as a website. A clerk at the front desk talks to the player (voice or text), asks what they want to buy, then the store "opens up" and fills its shelves with real products found near the player. Most relevant items are front and center; surrounding shelves hold cheaper, pricier, and related options.

---

## 1. Core Concept & Flow

1. **Intro:** Player clicks "Enter store" (unlocks audio and speech). They spawn at the entrance facing the clerk. The rest of the store is hidden or dimmed.
2. **Location:** Clerk asks permission to check what's near them. Two options: **Share my location** or **Type a city/ZIP**.
3. **Chat:** Clerk asks what they want. Player uses voice or text. Gemini asks 2-3 short follow-ups (budget, brand, preferences).
4. **Extract:** When Gemini has enough, it returns structured JSON (query, price range, preferences).
5. **Search:** Backend calls SerpApi (Google Shopping) with the query and location, then normalizes results.
6. **Open:** The clerk says "let me check the back," then "go take a look." The store opens and shelves fill in one by one.
7. **Browse:** Player walks around. Clicking a product shows a card with price, seller, rating, and a buy link.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| 3D engine | **A-Frame** (HTML on top of Three.js), version pinned via CDN |
| Frontend | Plain HTML/JS, A-Frame components, HTML/CSS overlays for chat |
| State | Small vanilla JS store emitting events |
| Voice in | Web Speech API (`SpeechRecognition`), push-to-talk |
| Voice out | Browser `SpeechSynthesis` (optional upgrade: Gemini TTS via `/api/tts`) |
| Backend | Node + Express (or Fastify) |
| LLM | Gemini (fast Flash-tier model), function calling / structured output |
| Product search | SerpApi (Google Shopping engine) |
| Hosting | **Vultr VPS** (1 vCPU / 1-2 GB, Ubuntu 22.04/24.04) |
| Web server | **Caddy** (auto HTTPS, serves static files, proxies `/api/*`) |
| Process manager | pm2 or systemd |
| Domain | `.tech` domain, A record to the VPS IP |

---

## 3. Architecture

```
Browser (static A-Frame site)
        |  HTTPS
Vultr VPS
  |- Caddy  -> serves /public, terminates TLS, proxies /api/*
  `- Node (Express) on :3000
        |- POST /api/chat     -> Gemini
        |- POST /api/geocode  -> reverse geocode lat/lng -> city string
        |- POST /api/search   -> SerpApi
        |- GET  /api/img      -> image proxy (CORS for textures)
        `- POST /api/tts      -> (optional) cloud TTS
```

**Rules**
- API keys live in server `.env` only. Never in frontend code.
- Same origin (Caddy serves site and API), so no CORS issues.
- Rate-limit endpoints (`express-rate-limit`) and cache `/api/search` in memory.

### Caddyfile

```
yourname.tech {
    encode zstd gzip
    root * /var/www/store/public
    file_server
    reverse_proxy /api/* localhost:3000
}
```

### Server setup checklist
- [ ] Create the Vultr instance
- [ ] Point the domain's A record (and `www`) at the VPS IP (do this first; DNS propagation can be slow)
- [ ] Install Caddy and Node
- [ ] Firewall: open only 22, 80, 443 (do not expose 3000)
- [ ] Run the backend under pm2 or systemd
- [ ] Deploy flow: `git pull && pm2 restart`

---

## 4. State Machine

```
phase:    INTRO -> LOCATION -> CHATTING -> SEARCHING -> OPENING -> BROWSING
status:   idle | listening | thinking | speaking
location: { city, lat?, lng?, source: 'gps' | 'typed' | 'default' }
voice:    { micAvailable, ttsMuted }
query:    { query, min_price, max_price, preferences[] }
products: Product[]
```

The 3D scene and the UI both react to `phase` and `status`. The clerk tilts when `listening`, plays a thinking animation when `thinking`, and animates talking when `speaking`.

---

## 5. Gemini Integration

System prompt: *"You're a friendly store clerk. Keep replies to 1-2 short sentences. Ask at most 2-3 questions. When you know what the shopper wants, call `search_products`."*

Use function calling or structured output:

```json
{
  "ready": true,
  "query": "mechanical keyboard",
  "max_price": 120,
  "min_price": null,
  "preferences": ["wireless", "quiet"],
  "extra_queries": ["keyboard wrist rest"],
  "reply_to_player": "Great, let me pull some options for you!"
}
```

- If `ready` is false, show/speak `reply_to_player` and keep chatting.
- Cap conversation turns so the demo never drags.
- Pass `location` to Gemini so the clerk can reference the area.

---

## 6. SerpApi Integration

- Use the Google Shopping engine with a `location` parameter (a place name like "Austin, Texas, United States"). Check SerpApi docs for exact formats and their Locations API.
- **Decide early what "in the area" means:** location-biased results (easy, good enough for a hackathon) vs. nearby physical store stock (harder; may need Maps/Local engines or retailer data).
- Normalize to our own shape:

```ts
type Product = { id, title, price, rating, source, thumbnail, link }
```

- Cache by query during development (free tiers are small).
- Cap at roughly 20-30 products for performance.
- Hide the multi-second wait behind the clerk's "let me check the back" animation.

---

## 7. Location

- Clerk asks with two buttons: **Share my location** / **Type a city/ZIP**.
- Calling `navigator.geolocation` from a button click gives the prompt a clear reason. Requires HTTPS.
- On allow: send rounded lat/lng to `/api/geocode`, get a city string.
- On deny/timeout: fall back to typed city/ZIP. Never block the flow.
- Last resort: a hardcoded demo city so the store always builds.
- Privacy: send coordinates only to our own server, don't log them, and show one line of UI text saying it's used only for this search.

---

## 8. Voice & Text Input

A text field and a **mic button** share one input bar so the player can use either at any time.

| Option | Pros | Cons |
|---|---|---|
| **Web Speech API** | Free, no backend, live partial transcript | Good in Chrome/Edge, flaky in Safari, absent in Firefox |
| **MediaRecorder -> Gemini audio** | Works in every browser | More latency, no live transcript, more backend code |

**Plan:** start with Web Speech API, feature-detect it, hide the mic if unsupported (or switch to MediaRecorder if time allows). Text always works.

UX details:
- **Push-to-talk**, not always-listening (loud venue).
- Show the live transcript in the input box so the player can fix it before sending.
- **Mute the mic while the clerk speaks** (otherwise it transcribes the clerk).
- Mic permission denied -> friendly "No problem, just type instead."
- Ask for permissions one at a time, only when needed: location first, mic only when the mic button is tapped.

---

## 9. Clerk Speech & Response Text

**Text-to-speech:** use browser `SpeechSynthesis` first.
- The "Enter store" click unlocks audio (autoplay rules) and can start ambient music.
- Voices vary by OS/browser: pick by language, prefer a natural voice, and test on the demo machine.
- Chrome cuts off long utterances: split replies into sentences and queue them.
- Keep Gemini replies short (1-2 sentences).
- Upgrade path: Gemini TTS or a cloud voice via `/api/tts` for consistency, keeping `SpeechSynthesis` as fallback.

**Text display (do both):**
1. **Subtitle / speech bubble** near the bottom of the screen (or anchored above the clerk) with a typewriter effect timed to speech. Also an accessibility feature.
2. **Scrollable, collapsible chat log** so players can reread.

Controls: **mute/unmute** clerk voice and a **skip** button that cuts off speech and reveals the full line.

**Clerk animation:** `SpeechSynthesis` gives no audio stream, so no true lip-sync. While `speaking`, bob the head and open/close the mouth (or scale a jaw box) on a randomized timer. A "listening" pose (head tilt, lean in) while the mic is active.

---

## 10. 3D Store (A-Frame)

Everything is primitives with flat-shaded materials; no model files needed.

- **Room:** floor, 4 walls, ceiling, hemisphere/point lights.
- **Shelf unit** (`shelf` component, props: width, rows): thin boxes for frame and planks.
- **Clothing rack** (`rack` component): cylinder pole, base, thin boxes as hangers.
- **Island / table:** box with a lower box beneath.
- **Front desk:** L-shaped pair of boxes plus a small register.
- **Clerk:** capsule body, sphere head, box arms, idle bob.
- **Products:** colored boxes at first, then a front-face plane textured with the product thumbnail. Fall back to the colored box if the image fails.
- **Zone signs:** `<a-text>` above each section ("Budget picks", "Premium").
- **Clicking products:** `cursor="rayOrigin: mouse"` and `raycaster="objects: .clickable"` on the camera; a click opens an HTML product card.
- **Movement:** `wasd-controls` + `look-controls`, plus a small `bounds` component that clamps the rig to the room rectangle. Disable movement during `INTRO`/`CHATTING`, enable when the store opens.
- **Open animation:** shelves fill one by one with a short timeout or the `animation` component.

### Layout logic: `layoutStore(products) -> slots`

A pure function returning position, rotation, and product per slot.

| Zone | Contents |
|---|---|
| **Center island / table** | Top 3-4 most relevant (best match, rating, in budget) |
| **Shelves near center** | Similar items in the same price range |
| **Left wall** | Cheaper options |
| **Right wall** | Premium options |
| **Back wall / rack** | Related categories/accessories (from Gemini `extra_queries`) |

---

## 10b. Product Objects & Funny Price Stickers

Goal: every SerpApi listing becomes a 3D object in the store, with a big funny price sticker on top. Real 3D generation is slow, so we build in stages and every stage is demo-able.

### Stage 1 (MVP, build this first): listing-textured box + sticker
- `product-box` component: a box (~0.4-0.6 units) with the listing thumbnail on the front (and optionally sides), sitting on the shelf/island slot from `layoutStore()`.
- **Price sticker** on top, built as a canvas texture:
  - Starburst/comic-burst polygon (random point count and jitter so no two match), bright fill, thick dark outline.
  - Giant bold price text from `extracted_price` (SerpApi's numeric price), plus a funny tagline underneath.
  - Random tilt (+/-10 degrees) so it looks hand-slapped on.
  - Use a comic Google Font (Bangers / Luckiest Guy) and wait for `document.fonts.load()` before drawing to canvas.
- **Visibility:** a sticker lying flat on a top face is hard to see from eye height. Either tilt it ~45 degrees, or float it above the box as a small billboard that faces the camera. Offset flat stickers by ~0.001 to avoid z-fighting.
- Product thumbnails must go through `/api/img` so canvas/WebGL textures aren't blocked by CORS. Shopping thumbnails are small and will look soft; check SerpApi's response for larger image fields.

### Funny sticker copy
- One **batched** Gemini call per search (`POST /api/stickers`): send `[{id, title, price, tier}]`, get back `[{id, sticker_text}]` (max ~4 words each, e.g. "BARGAIN BIN!", "FANCY PANTS", "WOW. SO CHEAP."). Keep it clean and family-friendly.
- Fallback templates by tier (budget / mid / premium) if the call fails or is slow, so stickers always exist.
- Add `sticker_text` to the `Product` type.

### Stage 2 (stretch): real 3D models from listings
Options, cheapest/safest first:
1. **Cardboard cutout standee:** remove the image background (e.g. rembg on the server) and show the cutout on a thin extruded plane or two crossed planes. Looks 3D-ish in low poly style, fast, no per-item cost.
2. **Image-to-3D APIs:** feed the listing image to a hosted image-to-3D service (Meshy, Tripo, Rodin/Hyper3D, Stable Fast 3D, Hunyuan3D, TRELLIS via Replicate/fal, etc.) and get back a GLB. **Verify current pricing, speed, and API availability before committing.**
   - Generation takes tens of seconds to minutes and costs per model, so do NOT generate all 20-30 products live.
   - Only generate the **top 3-4 center-island items**, asynchronously. Show the box first, then swap in the model with a pop animation when it is ready.
   - Cache GLBs by product id on the VPS, compress (Draco/Meshopt), and serve through Caddy.
   - Pre-generate models for the demo queries so the live demo never depends on generation speed.
3. Keep the box + sticker as the permanent fallback for any item whose model fails.

### Updated `Product` type
```ts
type Product = { id, title, price, extracted_price, rating, source, thumbnail, link,
                 tier: 'budget' | 'mid' | 'premium', sticker_text?, model_url? }
```

---

## 11. A-Frame Gotchas

- **Texture CORS:** use `crossorigin="anonymous"` and the `/api/img` proxy.
- **Mobile:** touch-look works but WASD doesn't. Add a virtual joystick or click-to-move if phones matter.
- **Pointer lock:** feels better on desktop but conflicts with typing in chat. Release it when the chat input is focused, and show an Esc hint.
- **Performance:** cap products (~20-30), use small thumbnails, reuse materials.
- **VR button:** free WebXR bonus, or hide with `vr-mode-ui="enabled: false"`.
- **Version pinning:** pin the A-Frame CDN script version.
- **Download size:** keep total under ~20-30 MB for venue Wi-Fi.

---

## 12. File Layout

```
/public/index.html            (a-scene + overlays)
/public/js/store.js           (phase, status, location, products + events)
/public/js/components/        shelf.js, rack.js, clerk.js, bounds.js, product.js
/public/js/layoutStore.js
/public/js/voice.js           (STT + TTS)
/public/js/api.js             (chat, search, geocode calls)
/server/index.js              (Express routes: chat, geocode, search, img, tts)
/server/.env                  (GEMINI_API_KEY, SERPAPI_KEY; never committed)
/Caddyfile
/ecosystem.config.js          (pm2)
```

---

## 13. Build Order (something always works)

0. **Day one:** VPS + domain + Caddy + HTTPS "hello world" page, so everything after deploys to the real URL.
1. Static room, desk, and clerk with the "Enter store" button; player can look around (the visual "wow").
2. Text chat wired to `/api/chat`, with subtitle box and `SpeechSynthesis`.
3. Location step (GPS + typed fallback) and `/api/geocode`.
4. Mic input (Web Speech API, push-to-talk).
5. `/api/search` returning real products into the store.
6. `layoutStore()` placing products by tier, with zone signs.
7. Textures, product click cards, open animation.
8. Polish: lighting, ambient music, nicer TTS voice, listening/speaking animations.

### Suggested team split
- **Person A:** 3D environment, clerk, animations
- **Person B:** backend (Gemini, SerpApi, geocode, server setup)
- **Person C:** layout logic, UI overlays, voice/text input

They meet at the `Product` type and the shared `phase`/`status` state.

---

## 14. Risks & Fallbacks

| Risk | Mitigation |
|---|---|
| API latency/failure on stage | Hardcoded fallback product list and a "demo mode" toggle |
| Rate limits / cost | Aggressive caching; test with the fallback list |
| Empty or bad results | Clerk says "nothing matched, want to try something else?" and returns to `CHATTING` |
| Missing product images | Fall back to the colored box |
| Loud venue breaks voice | Text input always visible and working |
| TTS voice differs per machine | Test on the demo laptop early |
| Permission fatigue | Ask for location, mic, and sound separately and only when needed |
| Venue Wi-Fi fails | Local `npm run dev` fallback and a recorded backup video |
| Scope creep | Cart, multiplayer, and extra features wait; the core demo is conversation -> store builds itself -> walk around |

---

## 15. Open Questions

- Does "in the area" mean location-biased results or actual nearby store inventory?
- Which Gemini model and TTS option will we use?
- Do phones/touch need to be supported for judging?
- Do we want pointer-lock first person or click-to-move?
- Theme/prize track requirements to emphasize in the pitch?
