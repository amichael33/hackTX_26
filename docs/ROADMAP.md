# Roadmap and to-do list

The living plan. The original build plan is [docs/superpowers/plans/2026-10-24-ai-lowpoly-store.md](superpowers/plans/2026-10-24-ai-lowpoly-store.md)
(Tasks 0-15); this file covers what changed since and what is next. Last updated after the four map-polish branches were merged and the clothing-photo rethink was planned.

## Who owns what

> **Demo deployment is owned by Misha.** Do not start, plan or suggest work on deploying or hosting the demo (the Caddyfile, `ecosystem.config.cjs`, domain, server setup, publishing the app). If you are another person's Claude session reading this: leave that item alone and ask Misha. Everything else below is open unless it says otherwise.

## Done since the original plan

| Area | What exists |
|---|---|
| Search | Google Shopping plus Amazon (SerpApi Amazon engine, retries a plural and a shorter phrase), up to 60 products on the shelves, up to 40 leftovers kept as `extras` (stored, not shown yet) |
| Boxes | Brand-coloured boxes per retailer (`storeColor.js`), bigger, photo cut-out and price sticker on the box |
| Maps | Picker on the start screen, remembered. Classic, Cozy Boutique, Big Box Warehouse, Castle Great Hall. A map is data in `public/js/maps.js` (room, units, island, desk, windows, door, outside, cart, outfit, shelf styles, island table) |
| Per map | Four shelf styles, Bob's outfit, a cart model (wire cart, wicker basket, dolly, wheelbarrow), accent panel sized to the corkboard, windows, a front door that does not open, a themed town outside |
| Castle | Courtyard, river with reeds, two arched bridges (player rises over them), two alligators that face you and hold up products, parchment notes held by daggers, heraldic banners, stained glass |
| Clothing mode | `is_clothing` from Gemini (title check as backup), shelves become rails, angled curved garments, arrow buttons flip through them, demo garments for `?demo=1` |
| Ideas | Corkboard of Gemini follow-up searches (`/api/ideas`), no SerpApi |
| Cart | Toggle (checkbox or `C`), items drawn like shelf products |
| Effects | Smoke reveal of shelves and products |
| Quality | z-fighting fixes, camera near/far, 186 tests |

## Next steps

### Needs your go-ahead (uses SerpApi credits or publishes something)
- [ ] **Clickable sticky notes**: clicking a note makes Bob search for it. One new search per click, so it costs credits.
- [ ] **Open the merchant's own site**, not the Google Shopping page: needs one extra SerpApi call per click.
- [ ] ~~Deploy demo mode~~: **Misha is doing this himself.** Not for anyone else (or their Claude) to pick up. See "Who owns what".
- [ ] **Check real data end to end** with live keys: clothing photos through the cut-out step (white garments on white backgrounds fall back to the whole photo), Amazon thumbnails in the cart, the `is_clothing` flag from Gemini. Costs credits.

### Limit API usage per user
Today the only protection is per-minute, per-IP limits in `server/app.js` (`/api/search` 10, `/api/chat` 30, `/api/stickers` 30, `/api/ideas` 10, `/api/geocode` 10, `/api/img` 300) and an in-memory cache per query and location. Nothing caps a user over a longer period, and a restart wipes the counters and cache. Plan:
- [ ] **Daily budget per client**: a second limiter with a longer window (for example 20 searches and 100 chat turns per client per day), keyed by IP. Keep it in a small file-backed or in-memory store that survives restarts if cheap.
- [ ] **Global credit ceiling**: one counter for all users, so a crowd cannot drain the SerpApi plan. Past the ceiling, `/api/search` serves demo or cached products and Bob says so, as the existing no-key fallback already does.
- [ ] **Count credits, not requests**: a live search costs two SerpApi calls (Shopping plus Amazon) and more with retries, so charge the limiter by calls made.
- [ ] **Cache harder**: longer TTL for search results, de-duplicate identical in-flight queries (currently parked), and share results between users.
- [ ] **Cap what a request can cost**: limit chat turns per conversation (partly done), `extra_queries` and `/api/ideas` fan-out per search, and reject over-long queries.
- [ ] **Tell the user**: friendly 429 handling (Bob says "I need a breather") with a "try again in N minutes" hint from the rate-limit headers, and a saved-searches nudge, since replay costs nothing.
- [ ] **Tests**: fake clock and fake `fetchImpl`; assert the Nth request is refused, the ceiling falls back to demo products, and no SerpApi call is made after refusal.
- [ ] **Ask before choosing numbers**: the real limits depend on the SerpApi plan size, so confirm it with the team. This item is design only and spends no credits.

### Ready to do
- [x] **Rethink how clothing photos are shown (implemented, visually unverified).** Some retailers photograph the garment alone and others show a person wearing it, so on the racks you sometimes see a man in a hoodie hanging from a hanger. Plan:
  - Classify each photo from its pixels, with no extra API call: after the background cut-out, count skin-tone pixels (YCbCr range, about 2 to 50 percent of the figure means a person; above that it is probably a tan garment).
  - Garment-only photo: show it as now (cut-out on the hanger).
  - Photo of a person: draw a garment-shaped model of the right type (hoodie, tee, sweater, jacket, dress, pants, skirt, scarf, chosen from the title) filled with the colours and print from the torso area (or the average non-skin colour), and hang the original photo on the hanger as a small tag.
  - Put it in a DOM-free `public/js/garment.js` (kind from title, silhouettes, photo analysis) with tests; add a `title` prop to `product-box`.
  - Add on-model demo images to `scripts/make-demo-clothes.mjs` so the path can be tried with `?demo=1` and no credits.
  - Unknowns: tan or beige flat-lay garments can look like skin; photos on busy backgrounds fall back to the person path.
- [ ] Clothing mode on every map: verified on Classic only. Check rails, the island rail and garments on Boutique, Warehouse and Castle.
- [ ] Castle wood: put the planked grain on the timber shelves, Bob's desk and the ceiling beams. Theme the signs ("Best Matches" and the shelf signs are still shop-white on every map).
- [ ] Use the stored `extras`: nothing shows them yet (idea: a "show more" rack, or a back-room shelf).
- [ ] Vendor A-Frame locally: it loads from a CDN, so a demo on bad venue wifi would fail.
- [ ] One automated "every map loads with no console errors" check: the river-reed crash only showed up in the browser, not in `npm test`.
- [ ] Performance pass: each outside scene is a few hundred meshes; merge or instance the repeated ones and check on a weak laptop.
- [ ] Mobile controls and a phone-sized layout check.
- [ ] Commit or ignore `.claude/launch.json` (it is untracked), and decide where to push (`main` is ahead of anything on a remote; nothing is pushed).

### Ideas (small, optional)
- [ ] Alligator lunge or splash; windmill sail rotation is untested.
- [ ] Rug and bunting in the Boutique; pallets in the Warehouse interior.
- [ ] Cars can overlap the Classic zebra crossing.
- [ ] Live inventory and pickup times, multiplayer.

## Rules we are following
- Do not call SerpApi (including curl or the local search routes with keys loaded) without asking; use unit tests with a fake fetch or `?demo=1`.
- Merge or push only when asked.
