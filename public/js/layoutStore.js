// DOM-free layout: assigns Products to shelf/island slots. Geometry derives from the active map (maps.js).
import { getMap, DEFAULT_MAP_ID } from './maps.js';

const r3 = (n) => Math.round(n * 1000) / 1000;
const ROW_TOPS = [0.05, 0.65, 1.25]; // plank top surfaces, local y
const BOX = 0.45;
const FRONT_Z = 0.05; // local offset toward the open front
const ROW_ORDER = [1, 2, 0]; // eye level first, then top, then bottom

const PER_ROW = { left: 2, right: 2, back: 2, center: 4 };
const ISLAND_SIZE = 0.45;
const ISLAND_Y = 0.8 + ISLAND_SIZE / 2;

// The active map's data, exposed through objects that are mutated in place by setMap, so importers keep
// working references: SHELF_UNITS (zone -> units), ROOM (size) and ZONES (zone -> { capacity, slots }).
export const SHELF_UNITS = {};
export const ROOM = {};
export const ZONES = {};
let activeMap = null;
export const currentMap = () => activeMap;

function shelfSlots(zone, units) {
  const n = PER_ROW[zone];
  const out = [];
  for (const row of ROW_ORDER) {
    for (const u of units) {
      const th = (u.rotY * Math.PI) / 180;
      const c = Math.cos(th), s = Math.sin(th);
      for (let i = 0; i < n; i++) {
        const lx = (i - (n - 1) / 2) * (2 / n);
        const lz = FRONT_Z;
        out.push({
          position: { x: r3(u.x + lx * c + lz * s), y: r3(ROW_TOPS[row] + BOX / 2), z: r3(u.z - lx * s + lz * c) },
          rotation: { x: 0, y: u.rotY, z: 0 },
        });
      }
    }
  }
  return out;
}

export function setMap(map) {
  activeMap = map;
  for (const k of Object.keys(SHELF_UNITS)) delete SHELF_UNITS[k];
  for (const k of Object.keys(ZONES)) delete ZONES[k];
  for (const z of ['left', 'right', 'back', 'center']) SHELF_UNITS[z] = map.units.filter((u) => u.zone === z).map(({ x, z: uz, rotY }) => ({ x, z: uz, rotY }));
  Object.assign(ROOM, { width: map.room.width, depth: map.room.depth, height: map.room.height });
  ZONES.island = {
    capacity: 4,
    slots: [-0.75, -0.25, 0.25, 0.75].map((x) => ({
      position: { x: r3(map.island.x + x), y: r3(ISLAND_Y), z: map.island.z }, rotation: { x: 0, y: 0, z: 0 },
    })),
  };
  for (const z of ['center', 'back', 'left', 'right']) {
    const slots = shelfSlots(z, SHELF_UNITS[z]);
    ZONES[z] = { capacity: slots.length, slots };
  }
}
setMap(getMap(DEFAULT_MAP_ID));

const SPILL_ORDER = ['center', 'back', 'left', 'right'];
const byRelevance = (a, b) => a.relevance - b.relevance;

export function layoutStore(products, { min_price = null, max_price = null } = {}) {
  if (!products?.length) return [];
  const lo = min_price ?? 0, hi = max_price ?? Infinity;
  const sorted = [...products].sort(byRelevance);

  const candidates = sorted.filter((p) => !p.related);
  const inBudget = candidates.filter((p) => p.extracted_price >= lo && p.extracted_price <= hi);
  const island = (inBudget.length ? inBudget : candidates).slice(0, ZONES.island.capacity);
  const islandIds = new Set(island.map((p) => p.id));

  const zoneOf = (p) => (p.related ? 'back' : p.tier === 'budget' ? 'left' : p.tier === 'premium' ? 'right' : 'center');
  const assigned = { center: [], back: [], left: [], right: [] };
  for (const p of sorted) {
    if (islandIds.has(p.id)) continue;
    const own = zoneOf(p);
    const target = [own, ...SPILL_ORDER].find((z) => assigned[z].length < ZONES[z].capacity);
    if (target) assigned[target].push(p);
  }

  const slots = [];
  const place = (zone, list) => list.sort(byRelevance).forEach((product, i) => {
    const s = ZONES[zone].slots[i];
    slots.push({ product, zone, position: { ...s.position }, rotation: { ...s.rotation } });
  });
  place('island', island);
  for (const z of SPILL_ORDER) place(z, assigned[z]);
  return slots;
}
