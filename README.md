# Low-Poly Store

**Talk to a clerk named Bob, then walk through a 3D store stocked with real products.**

You tell Bob what you want ("a keyboard that sounds creamy, under $120"). He asks a question or two, searches Google Shopping and Amazon, and the store's shelves fill up with the results. Every product is a box with a funny price sticker on it.

Built at hackTX 26.

## What it does

- **Chat with Bob.** Text or push-to-talk mic. Bob talks back with browser text-to-speech and subtitles. Gemini works out what you want and when to search.
- **Live results.** Google Shopping (biased to your city) plus Amazon, up to 60 products per search on the shelves. Up to 40 more are kept back as extras for later features.
- **A low-poly store in 3D.** Walk around with WASD. The best matches sit on the island, budget picks on the left wall, premium on the right, and related items on the back wall.
- **Retailer-colored boxes.** Target is red, Walmart is blue, Amazon is orange, and so on. Unknown stores get a color of their own. Product photos have their background removed and sit on the box.
- **Funny price stickers.** Gemini writes a 4-word joke for each price, stuck on the box.
- **Try Next corkboard.** Walk to the back wall and post-it notes pop onto a corkboard with follow-up searches Gemini suggests (a gaming mouse gets "mouse pad", "keyboard", "wrist rest"...). It only calls Gemini, never SerpApi.
- **Past searches.** Your last 10 searches are saved in the browser. Replaying one makes no API calls.
- **Clothing mode.** Search for clothes and the shelves turn into hanging rails: each product is a garment on a hanger (hanger color = the retailer), photo backgrounds removed, price sticker on the garment. A rail holds more than fits in view, so arrow buttons at its ends slide the hangers along. Gemini flags clothing searches (`is_clothing`), with garment words in the product titles as a backup; no extra API calls. Try `?demo=1` and ask for a hoodie: demo mode serves drawn demo garments (`scripts/make-demo-clothes.mjs`).
- **Pick your store.** The start screen has a map picker (Classic Store, Cozy Boutique, Big Box Warehouse, Castle Great Hall). Each map has its own shelf styles and Bob wears a different outfit in each. The choice is remembered. Each map is just data in `public/js/maps.js`: add an entry and it shows up in the picker.
- **Skippable location.** Share GPS, type a city or ZIP, or skip (Austin is the default).

## Run it in 60 seconds

```bash
npm install
npm start
```

Open http://localhost:3000.

**No API keys?** Open http://localhost:3000/?demo=1 for built-in demo products. Chat won't be smart without a Gemini key, but the store, boxes and stickers all work.

**With keys**, create `server/.env`:

```
GEMINI_API_KEY=...        # chat, stickers, Try Next post-its
GEMINI_MODEL=...          # optional, default gemini-3.5-flash-lite
SERPAPI_KEY=...           # Google Shopping + Amazon
DEMO_MODE=0               # 1 = always serve demo products
PORT=3000                 # optional
AMAZON_RESULTS=0          # optional: 0 turns Amazon off to save SerpApi credits
```

The server reads `.env` only when it starts, so restart it after any change.

## Controls

| Input | Action |
| --- | --- |
| WASD | Walk (during browsing) |
| Drag | Look around |
| Click a box | Open its product card (price, store, link) |
| Esc | Close the card |
| Hold Mic | Talk to Bob; the text fills the box, you press Send |
| New search | Clear the store and start over |
| Searches (top right) | Replay a past search |

## How it works

```
 browser (A-Frame / three.js)                    Express server                  outside
 ┌──────────────────────────┐                  ┌───────────────┐
 │ chat UI, mic, TTS        │ ── /api/chat ──▶ │ clerk (LLM)   │ ──────────────▶ Gemini
 │ state machine            │ ── /api/search ─▶│ search + cache│ ──────────────▶ SerpApi (Google Shopping + Amazon)
 │ 3D store + product boxes │ ── /api/stickers▶│ sticker copy  │ ──────────────▶ Gemini
 │ corkboard, replay        │ ── /api/ideas ──▶│ search ideas  │ ──────────────▶ Gemini
 └──────────────────────────┘ ── /api/geocode ▶│ geocode, img  │ ──────────────▶ OpenStreetMap Nominatim
                              ── /api/img ────▶└───────────────┘
```

The page moves through phases: `INTRO → LOCATION → CHATTING → SEARCHING → OPENING → BROWSING`.

1. Bob chats until Gemini says it has a query (`ready: true`), with optional price limits and up to 2 related searches.
2. The server runs the searches in parallel, merges them (one Amazon item after every three Google items, max 8 from Amazon), and assigns budget, mid or premium tiers by price.
3. A pure layout function (`public/js/layoutStore.js`) puts each product in a slot of the chosen map's shelves (`maps.js` describes the room; `sceneMap.js` builds it; `collide.js` gets its footprints from it). The boxes pop in one by one.
4. Stickers arrive from Gemini a moment later. Fallback stickers show first.
5. All API keys stay on the server. The frontend and API share one origin, and the server rate-limits every route.

## API routes

| Route | Purpose | Limit / min |
| --- | --- | --- |
| `GET /api/health` | Liveness check | none |
| `POST /api/chat` | One clerk turn: reply plus search query when ready | 30 |
| `POST /api/search` | Google Shopping + Amazon products for a query | 10 |
| `POST /api/stickers` | Funny sticker text for a list of products | 30 |
| `POST /api/ideas` | Follow-up search ideas for the corkboard (Gemini only) | 10 |
| `POST /api/geocode` | GPS coordinates to a city name | 10 |
| `GET /api/img?u=` | Image proxy for product thumbnails (allowlisted hosts only) | 300 |

## Tech stack

- **Frontend:** A-Frame 1.6 (three.js), plain ES modules, Web Speech API and SpeechSynthesis. No build step.
- **Backend:** Node 18+, Express, `express-rate-limit`, `dotenv`.
- **AI:** Google Gemini (structured JSON output).
- **Data:** SerpApi `google_shopping` and `amazon` engines, OpenStreetMap Nominatim for reverse geocoding.

## Project layout

```
public/            static site (index.html, css/ui.css)
  js/              state store, layout, UI, voice, saved searches, store colors
  js/components/   A-Frame components: shelf, clerk, product-box, zone-banner, ...
server/
  index.js         entry: loads .env, wires keys into the app
  app.js           Express app and all routes
  lib/             clerk, serp, ideas, stickers, geocode, llm, cache
  data/            demo products
test/              node:test suites
scripts/prewarm.js caches the demo queries (uses real SerpApi credits)
docs/superpowers/  design specs and the build plan
```

## Tests

```bash
npm test
```

Pure logic (state, layout, tiers, cutouts, saved searches, store colors) and every API route are covered. The 3D scene and browser APIs are checked by hand.

## Deploy

`Caddyfile` serves `public/` and proxies `/api/*` to the Node server on port 3000, and `ecosystem.config.cjs` runs the server under pm2 with `NODE_ENV=production`. In that mode Express binds to `127.0.0.1` and no longer serves static files, so Caddy has to be in front. Replace `yourname.tech` in the Caddyfile with the real domain.

## Known limitations

- **Shopping cart.** Add to cart on a product card; a wire cart rolls along in front of you with your items in it. `CART_ENABLED` in `public/js/main.js` switches it off (the Past searches tab stays).
- **Google Shopping has very little Amazon.** That's why Amazon comes from its own SerpApi engine.
- **Only Bob's search uses SerpApi** (the corkboard and everything else is Gemini or free). Each search uses 2 credits (Google Shopping plus Amazon), and more with related searches. Results are cached for 6 hours. Set `AMAZON_RESULTS=0` to save credits.
- **Demo stock fallback.** With no `SERPAPI_KEY`, in `DEMO_MODE`, or if SerpApi fails, you get built-in demo products, and Bob says so.
- **"Near you" means location-biased search results,** not live store inventory.
- **Desktop only.** No mobile controls.
- Saved searches keep product links but their photos can expire, which shows white boxes.

## What we'd do next

- Live store inventory and pickup times.
- Mobile controls.
- Make the post-its clickable so Bob searches for them.
- Multiplayer: browse the store with a friend.
- More brand colors and logos on the boxes.
