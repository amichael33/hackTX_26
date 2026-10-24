// DOM-free layout: assigns Products to shelf/island slots. Geometry derives from the shelf units in index.html (R17).

const r3 = (n) => Math.round(n * 1000) / 1000;
const ROW_TOPS = [0.05, 0.65, 1.25]; // plank top surfaces, local y
const BOX = 0.45;
const FRONT_Z = 0.05; // local offset toward the open front
const ROW_ORDER = [1, 2, 0]; // eye level first, then top, then bottom

export const SHELF_UNITS = {
  left: [-5, 0, 5].map((z) => ({ x: -7.2, z, rotY: 90 })),
  right: [-5, 0, 5].map((z) => ({ x: 7.2, z, rotY: -90 })),
  back: [-4].map((x) => ({ x, z: -9.2, rotY: 0 })), // the rest of the back wall is the "Try Next" corkboard
  center: [-3, 3].map((x) => ({ x, z: 0, rotY: 0 })),
};
const PER_ROW = { left: 2, right: 2, back: 2, center: 4 };
export const ROOM = { width: 16, depth: 20, height: 4 };
const ISLAND_SIZE = 0.45;
const ISLAND_Y = 0.8 + ISLAND_SIZE / 2;

function shelfSlots(zone, units = SHELF_UNITS[zone]) {
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

export const ZONES = {
  island: {
    capacity: 4,
    slots: [-0.75, -0.25, 0.25, 0.75].map((x) => ({ position: { x, y: r3(ISLAND_Y), z: 0 }, rotation: { x: 0, y: 0, z: 0 } })),
  },
};
for (const z of ['center', 'back', 'left', 'right']) {
  const slots = shelfSlots(z);
  ZONES[z] = { capacity: slots.length, slots };
}

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
