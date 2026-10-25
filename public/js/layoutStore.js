// DOM-free layout: assigns Products to shelf/island slots. Geometry derives from the active map (maps.js).
import { getMap, DEFAULT_MAP_ID } from './maps.js';
import { sortPlan, groupingFor, allocateGroups } from './sortMode.js';

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

// Decides which zone each product goes to: the island gets the best in-budget matches, then every product goes to the zone
// for its tier (related -> back) and spills into the next zone with room. `capacity` is zone -> how many fit.
// `sort` (sortMode.js) changes which zone a tier-less product lands in and how each zone is ordered; the island and the back wall do not change.
export function assignZones(products, { min_price = null, max_price = null, sort = 'price' } = {}, capacity = {}) {
  const plan = sortPlan(products, sort);
  const lo = min_price ?? 0, hi = max_price ?? Infinity;
  const sorted = [...products].sort(byRelevance);

  const candidates = sorted.filter((p) => !p.related);
  const inBudget = candidates.filter((p) => p.extracted_price >= lo && p.extracted_price <= hi);
  const island = (inBudget.length ? inBudget : candidates).slice(0, capacity.island ?? ZONES.island.capacity);
  const islandIds = new Set(island.map((p) => p.id));

  const zoneOf = (p) => (p.related ? 'back' : plan.zoneOf(p));
  const assigned = { center: [], back: [], left: [], right: [] };
  for (const p of sorted) {
    if (islandIds.has(p.id)) continue;
    const own = zoneOf(p);
    const target = [own, ...SPILL_ORDER].find((z) => assigned[z].length < (capacity[z] ?? ZONES[z].capacity));
    if (target) assigned[target].push(p);
  }
  for (const z of SPILL_ORDER) assigned[z].sort(z === 'back' ? byRelevance : plan.compare);
  island.sort(byRelevance);
  return { island, ...assigned };
}

// Store / brand sorts: the island keeps the best in-budget matches, related items fill the back wall, and every other product group
// gets its own shelf units, only as many as it needs (centre first, then left, right and any spare back units). `perUnit(zone)` = how
// many products one unit holds. Returns { island, placements: [{ unit: { index, zone, x, z, rotY }, items, label }] } or null for the other sorts.
export function layoutGroups(products, opts, islandCap, perUnit, map = activeMap) {
  const grouping = groupingFor(opts?.sort);
  if (!grouping || !products?.length) return null;
  const { min_price = null, max_price = null } = opts;
  const lo = min_price ?? 0, hi = max_price ?? Infinity;
  const sorted = [...products].sort(byRelevance);
  const candidates = sorted.filter((p) => !p.related);
  const inBudget = candidates.filter((p) => p.extracted_price >= lo && p.extracted_price <= hi);
  const island = (inBudget.length ? inBudget : candidates).slice(0, islandCap);
  const islandIds = new Set(island.map((p) => p.id));
  const rest = sorted.filter((p) => !islandIds.has(p.id));
  const units = map.units.map((u, index) => ({ index, zone: u.zone, x: u.x, z: u.z, rotY: u.rotY, cap: perUnit(u.zone) }));
  const placements = [];
  let related = rest.filter((p) => p.related);
  const spareBack = [];
  for (const u of units.filter((x) => x.zone === 'back')) {
    if (!related.length) { spareBack.push(u); continue; }
    placements.push({ unit: u, items: related.slice(0, u.cap), label: null });
    related = related.slice(u.cap);
  }
  const free = ['center', 'left', 'right'].flatMap((z) => units.filter((u) => u.zone === z)).concat(spareBack);
  const main = rest.filter((p) => !p.related).concat(related); // related items that did not fit the back wall join the groups
  placements.push(...allocateGroups(main, free, grouping));
  return { island, placements };
}

export function layoutStore(products, opts = {}) {
  if (!products?.length) return [];
  const grouped = layoutGroups(products, opts, ZONES.island.capacity, (z) => PER_ROW[z] * 3);
  if (grouped) {
    const slots = [];
    grouped.island.forEach((product, i) => { const s = ZONES.island.slots[i]; slots.push({ product, zone: 'island', position: { ...s.position }, rotation: { ...s.rotation } }); });
    const unitLabels = new Map();
    for (const { unit, items, label } of grouped.placements) {
      unitLabels.set(unit.index, label);
      const sl = shelfSlots(unit.zone, [{ x: unit.x, z: unit.z, rotY: unit.rotY }]);
      items.forEach((product, i) => slots.push({ product, zone: unit.zone, position: { ...sl[i].position }, rotation: { ...sl[i].rotation } }));
    }
    slots.unitLabels = unitLabels; // unit index -> its sign text (null = the map's own); units not in it are empty
    return slots;
  }
  const zones = assignZones(products, opts);
  const slots = [];
  const place = (zone, list) => list.forEach((product, i) => {
    const s = ZONES[zone].slots[i];
    slots.push({ product, zone, position: { ...s.position }, rotation: { ...s.rotation } });
  });
  place('island', zones.island);
  for (const z of SPILL_ORDER) place(z, zones[z]);
  return slots;
}

// The zone sign texts for a sort (zone -> text), or null to keep the map's own signs.
export const zoneLabelsFor = (products, sort) => sortPlan(products, sort).labels;
