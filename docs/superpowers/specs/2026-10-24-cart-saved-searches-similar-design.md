# Cart, Saved Searches and Similar Finds: Design

> **Note:** the cart and saved searches below are built as specified (the 3D cart is now a toggle, with a different model per map). The "Similar Finds" part was **replaced** by a corkboard of Gemini-suggested follow-up searches that never calls SerpApi. See docs/ROADMAP.md.

**Date:** 2026-10-24
**Builds on:** `plan.md`, which is the product spec, and `docs/superpowers/plans/2026-10-24-ai-lowpoly-store.md`, which covers Tasks 0-11.
**Status:** approved in conversation; waiting on the user's review of this written spec.

## Intent

The user is building a hackathon demo of an AI low-poly store. They want shoppers to keep what they find and to keep exploring:

1. Clicking a product and pressing a cart button saves the item.
   - Saved items appear in a widget on the right side of the screen.
   - Saved items also appear in a 3D shopping cart in front of the player.
2. The user said "Lists of products". This means saved searches: each finished search can be reopened later.
3. Walking to the back of the store loads more options that are similar to the search but not exact matches.

## Decisions the user made

| Question | Choice |
|---|---|
| Accounts | **Device-only, no accounts.** Data goes to browser `localStorage`. No sign-in, no server storage. |
| Lists | **One cart plus saved searches.** There are no multiple named lists. |
| Back of store | **The back wall fills once.** It happens once per search and costs 2 SerpApi searches plus 1 Gemini call. |

## Out of scope

- Accounts, sign-in, and server-side storage.
- Multiple named lists.
- Checkout. The cart only saves items, and Buy links open the seller's page.
- Syncing across devices.

---

## 1. Cart and right-side widget

### `public/js/cart.js` (ES module, DOM-free, unit-tested)

`createCart(storage = safeLocalStorage(), key = 'store.cart.v1') -> Cart`

| Method | Behavior |
|---|---|
| `items() -> CartItem[]` | Returns a copy, newest first. |
| `add(product) -> boolean` | Stores a `CartItem`. Returns false if the id is already saved, or if the cart is full at **50**. |
| `remove(id) -> boolean` | Removes the item with that id. |
| `has(id) -> boolean` | Reports whether the id is saved. |
| `clear()` | Removes everything. |
| `total() -> number` | Sum of `extracted_price`, rounded to cents. |
| `on('change', fn) -> unsubscribe` | Subscribes to cart changes. |

- **Item shape:** `CartItem = { id, title, price, extracted_price, source, link, thumbnail, savedAt }`.
- **Persistence:** every change writes JSON to storage.
- **Bad data on load:** corrupt JSON, a non-array, or malformed items are dropped. The cart starts empty or keeps only the valid items. It never throws.
- **`safeLocalStorage()`:** returns `window.localStorage` when reading and writing it works. Otherwise it returns an in-memory stand-in, for example in private mode or when storage is blocked. The cart still works for that visit.

### Product card

- The card has an **Add to cart** button: a blue pill using the Task 11 primary style.
- When `cart.has(id)` is true, the button reads **In cart ✓ · Remove**, and clicking it removes the item.

### Cart widget (`ui.js` + `index.html` + `ui.css`)

- **Placement:** a frosted panel on the **right** edge.
  - It can be collapsed to a tab, and the tab shows a count badge.
  - The chat log moves to the **left** edge.
- **Tabs:** **Cart** and **Past searches**. Past searches is covered in §3.
- **Each cart row shows:** the thumbnail from `/api/img`, or a white swatch when there is none; the title, cut to 2 lines; the formatted price; a **Buy** link (`rel=noopener`, hidden when there is no link); and a remove ×.
- **Footer:** "N items · $total".
- **Empty state:** "Click a product and press Add to cart."
- **Safety:** all text is set with `textContent`.
- **Visibility:** the widget is visible from CHATTING onward and hidden in INTRO and LOCATION.

## 2. 3D shopping cart

### `public/js/components/shopping-cart.js` (classic script, R7)

**Model.** The cart is low-poly:
- a wire basket built from thin `#c7c7cc` boxes, about 0.55 wide × 0.35 tall × 0.4 deep;
- a handle bar;
- 4 small dark wheels.

**Following the player.** The cart is a scene-level entity, **not** a child of the rig. The rig carries `look-controls`, so a child would pitch with the view (R8).
- Every tick it copies the rig's x/z position and yaw.
- It sits 0.9 m in front of the player, with the basket bottom at world y 0.45.
- It allocates nothing per frame.

**Contents.**
- Up to **12** saved items, the newest ones, sit in the basket as 0.12 mini boxes in a 4×3 grid. Each one has its thumbnail on top.
- When an item is added, it pops in with a scale animation.
- The cart listens to the cart's `change` event and rebuilds its contents. It disposes the old textures and geometry when it does.

**Visibility and clicks.**
- The cart is visible only in BROWSING.
- It is **not** `.clickable`, so it never blocks clicks on shelf items.

## 3. Saved searches

### `public/js/savedSearches.js` (ES module, DOM-free, unit-tested)

`createSavedSearches(storage = safeLocalStorage(), key = 'store.searches.v1') -> SavedSearches`

| Method | Behavior |
|---|---|
| `list() -> SavedSearch[]` | Newest first. |
| `save({query, city, products, stickers}) -> SavedSearch` | Keeps at most **10** searches and drops the oldest. Saving the same `query.query` + city again replaces the older entry. |
| `get(id) -> SavedSearch \| null` | Looks up one entry. |
| `remove(id)` | Deletes one entry. |

- **Entry shape:** `SavedSearch = { id, query, city, products (≤30), stickers: {[productId]: text}, savedAt }`.
- **Bad data on load:** handled the same way as the cart.
- **Storage full:** if a write throws a quota error, drop the oldest entry and retry once. If it fails again, skip saving.

### When a search is saved

A search is saved when the store **opens**, which is the OPENING phase with real products. The sticker texts are added once `/api/stickers` returns.

### Replay

- **The tab:** Past searches lists entries as "query · city · N items · time ago". Clicking one replays it.
- **Phase rules:**
  - From BROWSING, replay first runs the same reset as New search.
  - Replay is allowed only in CHATTING or BROWSING.
- **How replay runs:**
  - It sets `store.replay = entry`, then calls `setPhase('SEARCHING')`.
  - `runSearch` sees `store.replay`. It skips `/api/search` and the "check the back" line and spin, uses `entry.products`, and moves to OPENING.
  - `runOpening` sees replay sticker texts and skips `/api/stickers`.
  - The result is **zero API calls**.
  - `store.replay` is cleared when OPENING begins.

## 4. Similar Finds at the back wall

### Layout change (`layoutStore.js`, tested)

- **Back-left unit** (x=-4) becomes the `back` zone, "You Might Also Need". It holds related accessories in 6 slots.
- **Back-middle and back-right units** (x=0 and x=4) become a new zone, **`similar`**, with 12 slots.
  - The initial search never fills them. They are excluded from spill.
  - Their banners read **Similar Finds**.
- **Capacity of the other zones:** 4 island + 24 center + 18 left + 18 right + 6 back = 70. That is still at least the 30-product cap.
- **New export:** `layoutSimilar(products) -> Slot[]` places up to 12 products into the `similar` slots, in relevance order.
- **Geometry is frozen.** Same units, plank heights, and guard test as R17/R26.

### Trigger (client)

- **When it fires:**
  - while in BROWSING;
  - the first time the rig's z goes below **-6.2**, which is within about 3 m of the back shelves;
  - once per opened store.
- **Guards:** it uses the opening run token, so New search or replay cancels it.
- **What the clerk says:** a subtitle and voice line, "More like this coming up!"
- **The request:** the client calls `postSimilar({ query, city, exclude: [ids on shelves], titles: [top 5 titles] })` with a 25 s timeout.
- **Success:** each slot spawns into `#products`, 60 ms apart with a pop-in, using the normal sticker path. Fallback sticker text comes first, then one `/api/stickers` call.
- **No products (empty or failure):** a small "Nothing similar right now" line appears under the Similar Finds banners. The clerk says nothing and the player is never blocked.
- **Replay:** replayed searches also trigger Similar Finds (it's a live feature).

### `POST /api/similar` (server, tested)

**Request.** The body is `{ query: Query, city, exclude: string[], titles: string[] }`.
- Cap `exclude` at 100 entries and `titles` at 5.
- Cap each title at 120 characters.

**Step 1: invent the searches.** One `llm` call returns `{ queries: string[] }`.
- The prompt asks for **2** shopping searches that are similar to the main query but **not the same product**. Examples: different style, brand, or form factor.
- The queries must never repeat the main query or its extras.
- Normalize: trim, drop empties, drop duplicates (case-insensitive, also against `query.query` and `extra_queries`), and cap at 2.

**Step 2: run them.** Use the existing per-query SerpApi path and its cache, with the fix-wave cache rework and the location retry.
- Run the searches in parallel.
- `normalizeShoppingResults` marks them with `similar: true` and `related: false`.
- Drop ids that are in `exclude`.
- Dedupe, cap at **12**, and `assignTiers`.

**Response.** `{ products, queries }`.

**Failure and limits.**
- If the LLM fails or returns nothing usable, `queries = []` and `products = []`, still with a 200 status.
- Demo mode, a missing key, or a SerpApi failure returns up to 12 demo products whose ids aren't excluded, with `demo: true`.
- Rate limit: **10/min per IP**, the same as search.

### Product type

`Product` gains an optional field, `similar?: boolean`.

## Error handling summary

| Failure | Behavior |
|---|---|
| Storage blocked or full | The cart and saved searches still work in memory for the visit. Writes are skipped quietly. |
| Corrupt saved data | Invalid entries are dropped on load, and the app never crashes. |
| `/api/similar` fails or is empty | A "Nothing similar right now" line appears, and browsing continues. |
| New search or replay while Similar Finds is loading | The run token drops the late result. |
| Replay of a search whose thumbnails have expired | Product boxes fall back to the existing tier-box path. |

## Testing

- **`test/cart.test.js`:**
  - add, has, remove, and clear;
  - adding the same id twice keeps one entry;
  - the 50-item cap;
  - total rounding;
  - items survive a reload into a new `createCart` with the same fake storage;
  - corrupt JSON and garbage items are dropped;
  - a storage `setItem` that throws doesn't throw out of `add`.
- **`test/savedSearches.test.js`:**
  - the 10-entry cap drops the oldest;
  - the same query and city replaces the older entry;
  - corrupt data is handled;
  - on a quota error the oldest entry is dropped and the write retried.
- **`test/layout.test.js` (updated):**
  - initial layout never uses `similar` slots;
  - `back` holds at most 6;
  - 30 mixed products are still all placed;
  - `layoutSimilar` places at most 12 products into back-middle and back-right slots only (x ≥ -1, z < -8);
  - no positions repeat.
- **`test/similar.test.js`:**
  - the fake llm returns 2 queries, the fake fetch runs exactly 2 SerpApi calls, excluded ids are dropped, and results are capped at 12;
  - llm junk (the main query repeated, or empty) leads to no fetch and `{products: []}`;
  - demo mode returns non-excluded demo items;
  - the 11th call in a minute returns 429.
- **Manual (browser):**
  - add and remove from the card;
  - the widget badge and total;
  - the cart persists after reload;
  - the 3D cart follows you and doesn't tilt when you look down;
  - items pop into the basket;
  - Past searches replay with no network calls (check the DevTools Network tab);
  - walking to the back fills Similar Finds once;
  - New search during Similar Finds loading leaves no leftovers.

## Build order

These run after Task 11 and the final-review fix wave, because they touch `main.js`, `ui.js` and `ui.css`.

| Task | Contents |
|---|---|
| **12** | `cart.js` + the card button + the right widget (Cart tab) + moving the chat log left |
| **13** | The 3D `shopping-cart` component |
| **14** | `savedSearches.js` + the Past searches tab + replay |
| **15** | The `similar` zone in the layout + `/api/similar` + the back-wall trigger + the Similar Finds banners |
