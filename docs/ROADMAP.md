# Roadmap and to-do list

The living plan. The original build plan is [docs/superpowers/plans/2026-10-24-ai-lowpoly-store.md](superpowers/plans/2026-10-24-ai-lowpoly-store.md)
(Tasks 0-15); this file covers what changed since and what is next. Last updated after the phone joystick and the castle wood and signs.

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

### Putting the SerpApi key on the server for testing, and taking it off again
The exact commands (add, check, remove, verify it is gone, and what else to revoke) are in `deploy/README.md` on the `deploy-test` branch, under "Live SerpApi: adding the key and taking it off". Short version: the key goes only in `/var/www/store/server/.env` on the server, typed at a hidden prompt (never in chat, a commit or the shell history); `DEMO_MODE=0` turns live search on and `DEMO_MODE=1` plus deleting the key line turns it off; **also regenerate the key in the SerpApi dashboard afterwards, which is the only real revocation.** Only run a version of the server that has the usage budgets (`server/lib/budget.js`), so a crowd cannot drain the plan.

### Needs your go-ahead (uses SerpApi credits or publishes something)
- [x] **Clickable sticky notes**: clicking a note asks "Search for ...?" and then runs a normal search for it (works in a browser on localhost, confirmed by the user after a fix: notes added after the board was built had no `.el`, so the raycaster ignored them; `addNote` now tags them; a live search costs up to 4 credits and counts toward the visitor's daily searches).
- [x] (built, **not yet tried live**) **Open the merchant's own site**: Buy calls `/api/merchant` (SerpApi google_immersive_product by the result's page token, 1 credit, cached 6 h, per-visitor `BUDGET_MERCHANT_PER_DAY` default 40), falls back to the Google link. Written against SerpApi's documented response shape with a fixture; the first live call (about 1 credit) should confirm `product_results.stores` and `immersive_product_page_token` are really what comes back.
- [ ] ~~Deploy demo mode~~: **Misha is doing this himself.** Not for anyone else (or their Claude) to pick up. See "Who owns what".
  - Progress (branch `deploy-test`, see `deploy/README.md`): **deployed in demo mode to https://stor3d.tech and verified** (Path C: the server already had Caddy and a certificate; smoke test 10 passed, rollback tested, no errors in a real browser). Still to do: confirm start-on-boot after a reboot, add `Cache-Control: no-cache` for scripts to the server's Caddyfile, merge the deploy kit into `main` and point the server at `main`, decide whether the public site stays demo-only, vendor A-Frame.
- [ ] **Check real data end to end** with live keys: clothing photos through the cut-out step (white garments on white backgrounds fall back to the whole photo), Amazon thumbnails in the cart, the `is_clothing` flag from Gemini. Costs credits.

### Limit API usage per user (implemented; numbers still need the real SerpApi plan size)
Done in `server/lib/budget.js`: daily per-client allowance (20 searches, 150 chat turns, 40 idea requests) and a shared pool of 400 SerpApi calls a day, all overridable with `BUDGET_*` env vars. Cache misses spend a credit per real call; over a limit, `/api/search` serves showroom stock flagged `limited` (Bob says the back room is closed) and chat/ideas answer 429 `daily limit` with Retry-After. Counters are in memory and reset on restart. The checklist below is what is left or was done.
Today the only protection is per-minute, per-IP limits in `server/app.js` (`/api/search` 10, `/api/chat` 30, `/api/stickers` 30, `/api/ideas` 10, `/api/geocode` 10, `/api/img` 300) and an in-memory cache per query and location. Nothing caps a user over a longer period, and a restart wipes the counters and cache. Plan:
- [x] **Daily budget per client**: a second limiter with a longer window (for example 20 searches and 100 chat turns per client per day), keyed by IP. Keep it in a small file-backed or in-memory store that survives restarts if cheap.
- [x] **Global credit ceiling**: one counter for all users, so a crowd cannot drain the SerpApi plan. Past the ceiling, `/api/search` serves demo or cached products and Bob says so, as the existing no-key fallback already does.
- [x] **Count credits, not requests**: a live search costs two SerpApi calls (Shopping plus Amazon) and more with retries, so charge the limiter by calls made.
- [x] **Cache harder**: search TTL is now 24 h (`SEARCH_CACHE_HOURS`), identical in-flight queries share one SerpApi call (`getOrLoad` in `server/lib/cache.js`, also used by `/api/merchant`), and the cache is already shared between users.
- [x] **Cap what a request can cost**: chat turns capped (`MAX_TURNS`), `extra_queries` max 2 and strings only, `/api/ideas` takes 5 titles, and queries over 120 characters or non-strings are refused with 400 before any SerpApi call.
- [x] **Tell the user**: friendly 429 handling (Bob says "I need a breather") with a "try again in N minutes" hint from the rate-limit headers, and a saved-searches nudge, since replay costs nothing.
- [x] **Tests**: fake clock and fake `fetchImpl`; assert the Nth request is refused, the ceiling falls back to demo products, and no SerpApi call is made after refusal.
- [ ] **Ask before choosing numbers**: the real limits depend on the SerpApi plan size, so confirm it with the team. This item is design only and spends no credits.

### Ready to do
- [x] **Rethink how clothing photos are shown (implemented, visually unverified).** Some retailers photograph the garment alone and others show a person wearing it, so on the racks you sometimes see a man in a hoodie hanging from a hanger. Plan:
  - Classify each photo from its pixels, with no extra API call: after the background cut-out, count skin-tone pixels (YCbCr range, about 2 to 50 percent of the figure means a person; above that it is probably a tan garment).
  - Garment-only photo: show it as now (cut-out on the hanger).
  - Photo of a person: draw a garment-shaped model of the right type (hoodie, tee, sweater, jacket, dress, pants, skirt, scarf, chosen from the title) filled with the colours and print from the torso area (or the average non-skin colour), and hang the original photo on the hanger as a small tag.
  - Put it in a DOM-free `public/js/garment.js` (kind from title, silhouettes, photo analysis) with tests; add a `title` prop to `product-box`.
  - Add on-model demo images to `scripts/make-demo-clothes.mjs` so the path can be tried with `?demo=1` and no credits.
  - Unknowns: tan or beige flat-lay garments can look like skin; photos on busy backgrounds fall back to the person path.
- [x] Clothing mode on every map: unit-tested on all four and looked at in the browser on all four (nearest side rails are empty by design: rails fill only as far as the products need). Still unseen: the garment models from the photo rethink.
- [x] Castle wood and signs: done. `public/js/wood.js` draws the planks and grain (same look as the wheelbarrow); the castle ceiling is planked, the beams and timber shelves and Bob's desk use it. The castle's signs are timber plaques with iron rivets and cream serif lettering (`theme:castle` on `zone-banner`), and a map can reword any sign (`labels` in `maps.js`: the castle says "The Crown Jewels" and "Quest Board"). Seen in a browser. The other maps keep their white shop signs; theming them is optional.
- [x] Use the stored `extras`: done as a "More finds" tab in the right-hand widget (cheapest first, thumbnail, price, source, View link; saved with past searches). No 3D back-room shelf; that is still an option. Not seen in a browser.
- [x] Vendor A-Frame locally: done. A-Frame 1.6.0 and the Bangers/Inter fonts live in `public/vendor/`; `test/offline.test.js` fails if the page references another origin or a missing local file.
- [x] One automated "every map loads with no console errors" check: `scripts/check-maps.mjs` (`npm run check:maps`) exists. **Do not run it on the dev laptop**: it drives Edge with software WebGL and freezes the machine (a full run is 10+ minutes). Run it only on a spare machine or CI.
- [ ] Performance pass: outside scenery now bakes same-colour static meshes together (draw calls: Classic 463→298, Boutique 475→329, Warehouse 674→451, Castle 921→672 with the river's reeds and rocks merged too (`public/js/merge.js`)). Still to do: the gators (animated, 82 meshes), the textured buildings, and a check on a weak laptop.
- [x] Floor textures: Classic polished tile, Boutique parquet, Castle flagstone (`public/js/floor.js`); the Warehouse keeps its concrete.
- [x] Mobile controls: an on-screen joystick (bottom left, only on touch devices while you can walk; `?joystick=1` shows it on a desktop) and one-finger touch look, in `public/js/joystick.js`. The maths is unit-tested, and walking, strafing, turning, collisions and looking while the stick is held were checked with simulated touches in a phone-sized view. **Not tried on a real phone.**
- [ ] A phone-sized layout check of the rest of the interface (chat bar, cards, cart widget) on a real phone.
- [ ] Commit or ignore `.claude/launch.json` (it is untracked), and decide where to push (`main` is ahead of anything on a remote; nothing is pushed).

### Ideas (small, optional)
- [ ] Alligator lunge or splash; windmill sail rotation is untested.
- [ ] Rug and bunting in the Boutique; pallets in the Warehouse interior.
- [ ] Cars can overlap the Classic zebra crossing.
- [ ] Live inventory and pickup times, multiplayer.

## Rules we are following
- Do not call SerpApi (including curl or the local search routes with keys loaded) without asking; use unit tests with a fake fetch or `?demo=1`.
- Merge or push only when asked.

## Added in the last session (not yet pushed)
- [x] Gators offer a product whenever results exist (not only on a bridge).
- [x] Clothing racks hold only what is in view (6); overflow goes on other racks, no paging.
- [x] Star-rating badges on boxes and garments (opposite the price sticker).
- [x] Arrange the store by price / rating / store / brand: Bob sets it from the chat (`sort_by`), buttons at the top re-arrange for free (`public/js/sortMode.js`).
- [x] Bob tells the player about re-arranging and "open all": a button near his desk and one in the cart open every cart link in tabs (`public/js/openAll.js`). Demo products have no links, so the button only appears with live data. Not yet tried with real links or pop-up blockers.
- [x] Warehouse fire-extinguisher z-fighting fixed.

## Second pages of results
- [x] A live search now fetches a second page from both Google Shopping and Amazon for the main query (the related `extra_queries` stay at one page). It follows SerpApi's own `serpapi_pagination.next` link, so a query with no next page costs nothing, and a failed or over-budget second page just leaves the first. **A live search now costs up to 4 credits instead of 2** (more with the Amazon retries), so the shared pool of 400 credits a day is about 100 searches; `SEARCH_PAGES=1` goes back to one page, 3 is the ceiling. Shelves now take up to 70 products (was 60), Amazon's share 30 (was 16) and the "More finds" leftovers 80 (was 40). Fake-fetch tests only; **not yet tried live** (the first live search should confirm that both engines really return a `next` link).

## Start screen (the landing page)
- [x] The start screen is the stor3D landing page from the design handoff, inside `#intro` in `public/index.html` (one page; the app did not move). The four black store tiles pick the store (they are `<a href="?map=<id>">` links with `role=radio`; the chosen one stays full strength and the rest dim). Below them, centred: **Start shopping**, then the phone-only checkboxes **Immersive mode** and **On-screen joystick** (default on, remembered). On a phone the tiles stack one per row. Fonts are vendored (`public/vendor/fonts/landing-fonts.css`), no Google Fonts. `?map=<id>` in the address also picks a store. Tests: `test/landing.test.js`. Not yet seen on a real phone.

## Phone fixes (not yet tried on a real phone)
- [x] Immersive mode is an optional checkbox on the start screen (phones only, default off). Off: drag to look, stick to walk, no motion sensors. On: fullscreen plus motion look; iOS shows its own motion-permission prompt.
- [x] The mic is tap to start, tap again to stop (the hold was being cancelled by the browser's permission prompt, which produced the "just type" message). Needs a real iPhone/Android check: iOS Safari asks for the microphone and Speech Recognition in full-screen prompts, and Dictation must be on in Settings.
- [x] Bob's second line no longer repeats "Hi! Welcome in."
