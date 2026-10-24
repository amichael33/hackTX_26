// DOM-free layout for clothing: garments hang on rails (one per shelf unit, plus a small one on the island) instead of
// sitting in shelf slots. A rail holds more garments than fit in view; the player flips through them with arrow buttons.
import { assignZones, currentMap } from './layoutStore.js';

export const RAIL_PITCH = 0.32;     // distance between hangers along a rail
export const RAIL_WINDOW = 6;       // hangers in view at once (2 m rail)
export const RAIL_CAPACITY = 18;    // garments a rail holds (three windows' worth)
export const RAIL_TARGET = 10;      // a zone fills rails to about this many, so there is something to flip through
export const ISLAND_RAIL_CAPACITY = 4;
export const RAIL_Y = 1.6;          // hanger height above the floor

// Rails in the active map: every shelf unit becomes a rail, the island gets a short one. Zones keep their meaning.
export function layoutClothes(products, opts = {}, map = currentMap()) {
  if (!products?.length) return [];
  const units = { left: [], right: [], back: [], center: [] };
  for (const u of map.units) units[u.zone].push(u);
  const capacity = { island: ISLAND_RAIL_CAPACITY };
  for (const z of Object.keys(units)) capacity[z] = units[z].length * RAIL_CAPACITY;
  const zones = assignZones(products, opts, capacity);

  const rails = [];
  if (zones.island.length) {
    rails.push({ id: 'island', zone: 'island', kind: 'island', position: { x: map.island.x, y: 0.8, z: map.island.z }, rotation: { x: 0, y: 0, z: 0 }, items: zones.island });
  }
  for (const z of Object.keys(units)) {
    const list = zones[z];
    if (!list.length) continue;
    // Deal the zone's products round-robin over as few rails as holds them at about RAIL_TARGET each (the rest stay bare),
    // so a rail is long enough to flip through but the best matches are still spread over a few rails.
    const used = Math.min(units[z].length, Math.max(1, Math.ceil(list.length / RAIL_TARGET)));
    const buckets = units[z].map(() => []);
    list.forEach((p, i) => buckets[i % used].push(p));
    units[z].forEach((u, i) => {
      if (!buckets[i].length) return;
      rails.push({ id: `${z}-${i}`, zone: z, kind: 'wall', position: { x: u.x, y: 0, z: u.z }, rotation: { x: 0, y: u.rotY, z: 0 }, items: buckets[i] });
    });
  }
  return rails;
}

// Local x of the hanger at `index` when the rail is scrolled to `offset` (in hangers): the window is centred on the rail.
export const hangerX = (index, offset) => (index - offset - (RAIL_WINDOW - 1) / 2) * RAIL_PITCH;

// Is the hanger inside the window (fully in view, or sliding in by less than one pitch)?
export const inWindow = (x) => Math.abs(x) <= (RAIL_WINDOW / 2) * RAIL_PITCH + 1e-9;

// Largest sensible offset: scrolling stops when the last hanger reaches the right end of the window.
export const maxOffset = (n) => Math.max(0, n - RAIL_WINDOW);
export const clampOffset = (offset, n) => Math.max(0, Math.min(maxOffset(n), offset));
