# stor3D

**Talk to a clerk named Bob, then walk through a 3D store stocked with real products.**

You tell Bob what you want ("a keyboard that sounds clicky, under $120"). He asks a question or two, searches Google Shopping and Amazon, and the store's shelves fill up with the results. Every product is a box with a funny price sticker on it.

Built at hackTX 26. Try it at [stor3d.tech](https://stor3d.tech) and see our [Devpost submission](https://devpost.com/software/hacktx-2026-uh2tvs).

## What it does

- **Pick a store, start shopping.** The start screen is the stor3D home page: four tiles (Castle Great Hall, Classic Store, Cozy Boutique, Big Box Warehouse), then **Start shopping**. It fits one screen and never scrolls, on a laptop or a phone. On a phone two extra checkboxes appear: immersive mode (fullscreen, look by moving the phone) and the on-screen joystick. The choice is remembered, and `?map=castle` (or `classic`, `boutique`, `warehouse`) links straight to a store.
- **Chat with Bob.** Text or mic (tap to start, tap to stop). Bob talks back with browser text-to-speech and subtitles. Gemini works out what you want and when to search.
- **Live results, two pages deep.** Google Shopping (biased to your city) plus Amazon, two pages of each for your main query. Up to 70 products go on the shelves and up to 80 more wait in a "More finds" tab. A live search costs up to 4 SerpApi credits (see Known limitations).
- **A low-poly store in 3D.** Walk around with WASD (or the joystick on a phone). The best matches sit on the island, budget picks on the left wall, premium on the right, and related items on the back wall.
- **Arrange it your way.** Buttons at the top re-arrange the whole store by price, rating, store or brand, for free. You can also ask Bob.
- **Retailer-colored boxes.** Target is red, Walmart is blue, Amazon is orange, and so on. Unknown stores get a color of their own. Product photos have their background removed and sit on the box, with a star rating badge.
- **Funny price stickers.** Gemini writes a 4-word joke for each price, stuck on the box.
- **Try Next corkboard.** Walk to the back wall and post-it notes pop onto a corkboard with follow-up searches Gemini suggests (a gaming mouse gets "mouse pad", "keyboard", "wrist rest"...). **Click a note** and Bob asks "Search for ...?"; say yes and it runs as a new search. Suggesting the notes only calls Gemini; the search you confirm uses SerpApi.
- **Buy goes to the seller.** The Buy button on a product card finds the seller's own page and opens it instead of Google Shopping. **Open all** (at Bob's desk and in the cart panel) opens every cart item in its own tab, also straight at the sellers.
- **Shopping cart.** Add to cart on a product card; a cart rolls along in front of you with your items in it, drawn like they are on the shelves. The cart stays when you start a new search.
- **New search.** Walk back up to Bob and start typing. Past searches (top right) are saved in the browser, and replaying one makes no API calls.
- **Clothing mode.** Search for clothes and the shelves turn into hanging rails: each product is a garment on a hanger (hanger color = the retailer), photo backgrounds removed, price sticker on the garment. A rail holds more than fits in view, so arrow buttons at its ends slide the hangers along. Gemini flags clothing searches (`is_clothing`), with garment words in the product titles as a backup; no extra API calls. Try `?demo=1` and ask for a hoodie: demo mode serves drawn demo garments (`scripts/make-demo-clothes.mjs`).
- **Four stores, each with its own character.** Shelf styles, floor, Bob's outfit, a cart (wire cart, wicker basket, warehouse dolly, castle wheelbarrow), windows, a front door that never opens, and a town outside that fits (a city street, a cobbled village, an industrial yard, a medieval village). The castle has a courtyard with a river you cross by one of two arched bridges, and two alligators that turn to watch you and, once there are results, open wide and hold up products. Each map is just data in `public/js/maps.js`: add an entry and it shows up on the start screen.
- **Skippable location.** Share GPS, type a city or ZIP, or skip (Austin is the default).

## Run it in 60 seconds

```bash
npm install
npm start
```

Open http://localhost:3000.

**No API keys?** Open http://localhost:3000/?demo=1 for built-in demo products. Chat won't be smart without a Gemini key, but the store, boxes and stickers all work, and nothing spends credits.

**With keys**, create `server/.env` (copy `server/.env.example`):

```
GEMINI_API_KEY=...        # chat, stickers, Try Next post-its
GEMINI_MODEL=...          # optional, default gemini-3.5-flash-lite
SERPAPI_KEY=...           # Google Shopping + Amazon + seller lookups
DEMO_MODE=0               # 1 = always serve demo products
PORT=3000                 # optional
AMAZON_RESULTS=0          # optional: 0 turns Amazon off to save SerpApi credits
SEARCH_PAGES=2            # optional: pages per engine for the main query (1-3)
SEARCH_CACHE_HOURS=24     # optional: how long a search result is cached
```

Usage budgets (per visitor per day, plus a shared pool of SerpApi credits) are set with the `BUDGET_*` variables listed in `server/.env.example`.

The server reads `.env` only when it starts, so restart it after any change.

## Controls

| Input                   | Action                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WASD                    | Walk (during browsing)                                                                                                                                                      |
| Joystick (phones)       | Drag the on-screen stick to walk; it only shows on touch devices while you can walk, and can be turned off on the start screen. Add `?joystick=1` to see it on a desktop. |
| Drag                    | Look around (works with a finger too, while a thumb holds the stick). A tap still selects a product                                                                         |
| Click a box             | Open its product card (price, store, rating, Buy, add to cart)                                                                                                              |
| Click a sticky note     | Search for that idea (asks first)                                                                                                                                           |
| Esc                     | Close the card                                                                                                                                                              |
| Mic button              | Tap to talk to Bob, tap again to stop; the text fills the box, you press Send                                                                                               |
| C                       | Show or hide the 3D cart                                                                                                                                                    |
| Walk up to Bob and type | Start a new search (your cart stays)                                                                                                                                        |
| Buttons at the top      | Arrange the store by price, rating, store or brand                                                                                                                          |
| Searches (top right)    | Replay a past search; the cart tab lists your items                                                                                                                         |

## How it works

```
 browser (A-Frame / three.js)                    Express server                  outside
 ┌──────────────────────────┐                  ┌───────────────┐
 │ chat UI, mic, TTS        │ ── /api/chat ──▶ │ clerk (LLM)   │ ──────────────▶ Gemini
 │ state machine            │ ── /api/search ─▶│ search + cache│ ──────────────▶ SerpApi (Google Shopping + Amazon)
 │ 3D store + product boxes │ ── /api/merchant▶│ seller lookup │ ──────────────▶ SerpApi (immersive product)
 │ corkboard, replay        │ ── /api/stickers▶│ sticker copy  │ ──────────────▶ Gemini
 └──────────────────────────┘ ── /api/ideas ──▶│ search ideas  │ ──────────────▶ Gemini
                              ── /api/geocode ▶│ geocode, img  │ ──────────────▶ OpenStreetMap Nominatim
                              ── /api/img ────▶└───────────────┘
```

The page moves through phases: `INTRO → LOCATION → CHATTING → SEARCHING → OPENING → BROWSING`.

1. Bob chats until Gemini says it has a query (`ready: true`), with optional price limits and up to 2 related searches.
2. The server runs the searches in parallel. The main query gets a second page from each engine (by following SerpApi's own next-page link; no link, no extra credit). Results are merged (one Amazon item after every three Google items, up to 30 from Amazon), and budget, mid or premium tiers are assigned by price.
3. A pure layout function (`public/js/layoutStore.js`) puts each product in a slot of the chosen map's shelves (`maps.js` describes the room; `sceneMap.js` builds it; `collide.js` gets its footprints from it). The boxes pop in one by one.
4. Stickers arrive from Gemini a moment later. Fallback stickers show first.
5. All API keys stay on the server. The frontend and API share one origin, the server rate-limits every route, and a per-visitor daily budget plus a shared credit pool keep a crowd from draining the SerpApi plan (over a limit, Bob serves showroom stock and says the back room is closed).

## API routes

| Route                  | Purpose                                                                | Limit / min |
| ---------------------- | ---------------------------------------------------------------------- | ----------- |
| `GET /api/health`    | Liveness check                                                         | none        |
| `POST /api/chat`     | One clerk turn: reply plus search query when ready                     | 30          |
| `POST /api/search`   | Google Shopping + Amazon products for a query                          | 10          |
| `POST /api/merchant` | The seller's own page for a Google Shopping product (1 credit, cached) | 15          |
| `POST /api/stickers` | Funny sticker text for a list of products                              | 30          |
| `POST /api/ideas`    | Follow-up search ideas for the corkboard (Gemini only)                 | 10          |
| `POST /api/geocode`  | GPS coordinates to a city name                                         | 10          |
| `GET /api/img?u=`    | Image proxy for product thumbnails (allowlisted hosts only)            | 300         |

## Tech stack

- **Frontend:** A-Frame 1.6 (three.js, vendored in `public/vendor/`), plain ES modules, Web Speech API and SpeechSynthesis. No build step, and no outside scripts or fonts, so it works on bad venue Wi-Fi.
- **Backend:** Node 18+, Express, `express-rate-limit`, `dotenv`.
- **AI:** Google Gemini (structured JSON output).
- **Data:** SerpApi `google_shopping`, `amazon` and `google_immersive_product` engines, OpenStreetMap Nominatim for reverse geocoding.

## Project layout

```
public/            static site: index.html (start screen + the 3D scene), favicon.svg, css/ui.css
  js/              state store, layout, maps, UI, voice, cart, saved searches, store colors
  js/components/   A-Frame components: shelf, clerk, product-box, corkboard, alligator, ...
  vendor/          A-Frame and the fonts, served locally
server/
  index.js         entry: loads .env, wires keys into the app
  app.js           Express app and all routes
  lib/             clerk, serp, merchant, ideas, stickers, geocode, llm, cache, budget, env
  data/            demo products and demo garments
test/              node:test suites (npm test)
scripts/           prewarm.js (caches the demo queries, uses real SerpApi credits), make-demo-clothes.mjs, check-maps.mjs
deploy/            deployment kit (see deploy/README.md)
docs/              ROADMAP.md (the current to-do list), superpowers/ (design specs and the build plan)
```

## Tests

```bash
npm test
```

Pure logic (state, layout, maps, tiers, cutouts, cart, saved searches, store colors) and every API route are covered, with a fake `fetch` so no test spends SerpApi credits. The 3D scene and browser APIs are checked by hand. `npm run check:maps` drives a browser through every map; it is slow, so run it on a spare machine or CI, not a dev laptop.

## Deploy

`Caddyfile` serves `public/` and proxies `/api/*` to the Node server on port 3000, and `ecosystem.config.cjs` runs the server under pm2 with `NODE_ENV=production`. In that mode Express binds to `127.0.0.1` and no longer serves static files, so Caddy has to be in front. Replace `yourname.tech` in the Caddyfile with the real domain.

## Known limitations

- **Credits.** A live search is up to 4 SerpApi credits (two pages each of Google Shopping and Amazon), more with the Amazon retries and related searches, and each Buy or Open-all seller lookup is 1 more. Results are cached for 24 hours. Set `SEARCH_PAGES=1` or `AMAZON_RESULTS=0` to spend less. Gemini calls are separate.
- **Google Shopping has very little Amazon.** That's why Amazon comes from its own SerpApi engine.
- **Demo stock fallback.** With no `SERPAPI_KEY`, in `DEMO_MODE`, past a daily limit, or if SerpApi fails, you get built-in demo products, and Bob says so.
- **"Near you" means location-biased search results,** not live store inventory.
- **Phones.** The joystick, touch look, mic and immersive mode are built but have not been tried on a real phone yet.
- **Clothing photos** that show a person wearing the item are shown as they are, so a model may hang on a hanger.
- Saved searches keep product links but their photos can expire, which shows white boxes.
