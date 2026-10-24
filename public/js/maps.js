// DOM-free store maps. A map is plain data: the room, where everything stands, and its colors.
// layoutStore.js places products from it, collide.js gets its footprints from obstaclesFor(),
// and sceneMap.js builds the scene from it. Zones: left = budget, right = premium, back = related, center = the rest.

export const ZONE_LABELS = { left: 'Budget Picks', right: 'Premium', back: 'You Might Also Need', center: 'More Like This' };

const unit = (zone, x, z, rotY) => ({ zone, x, z, rotY });

export const MAPS = [
  {
    id: 'classic',
    name: 'Classic Store',
    blurb: 'The original: a bright showroom with aisles down both walls.',
    room: { width: 16, depth: 20, height: 4, floor: '#e9e7e3', wall: '#f5f5f7', ceiling: '#ffffff', accent: '#d9bf98', tile: '#dcd9d3' },
    spawn: { x: 0, z: 9 },
    desk: { x: 0, z: 6.5 },
    clerk: { x: 0, z: 5.8 },
    island: { x: 0, z: 0 },
    units: [
      ...[-5, 0, 5].map((z) => unit('left', -7.2, z, 90)),
      ...[-5, 0, 5].map((z) => unit('right', 7.2, z, -90)),
      unit('back', -4, -9.2, 0),
      ...[-3, 3].map((x) => unit('center', x, 0, 0)),
    ],
    board: { x: 1, y: 1.55, z: -9.97, width: 6, height: 2.2, bannerY: 3.0 },
  },
  {
    id: 'boutique',
    name: 'Cozy Boutique',
    blurb: 'A small, warm shop. Fewer shelves, everything within reach.',
    room: { width: 12, depth: 14, height: 3.4, floor: '#e8dccb', wall: '#f3e6d8', ceiling: '#fbf4ea', accent: '#c98b5b', tile: '#d9cbb6' },
    spawn: { x: 0, z: 6 },
    desk: { x: 0, z: 4.6 },
    clerk: { x: 0, z: 3.9 },
    island: { x: 1.8, z: -1.2 },
    units: [
      ...[-4.5, -1.5, 1.5].map((z) => unit('left', -5.2, z, 90)),
      ...[-4.5, -1.5, 1.5].map((z) => unit('right', 5.2, z, -90)),
      unit('back', -3.5, -6.2, 0),
      unit('center', -2.5, 1.5, 0),
    ],
    board: { x: 1.5, y: 1.55, z: -6.97, width: 5, height: 2.2, bannerY: 3.0 },
  },
  {
    id: 'warehouse',
    name: 'Big Box Warehouse',
    blurb: 'A huge concrete hall with long aisles and room to roam.',
    room: { width: 24, depth: 30, height: 6, floor: '#bfc1c4', wall: '#d7d9dc', ceiling: '#a9abb0', accent: '#8d9096', tile: '#b0b2b6' },
    spawn: { x: 0, z: 13.5 },
    desk: { x: 0, z: 11 },
    clerk: { x: 0, z: 10.3 },
    island: { x: 0, z: 0 },
    units: [
      ...[-9, -6, -3, 0].map((z) => unit('left', -11.2, z, 90)),
      ...[-9, -6, -3, 0].map((z) => unit('right', 11.2, z, -90)),
      ...[-10, -7].map((x) => unit('back', x, -14.2, 0)),
      ...[[-5, -4], [5, -4], [-5, 4], [5, 4]].map(([x, z]) => unit('center', x, z, 0)),
    ],
    board: { x: 4, y: 1.55, z: -14.97, width: 8, height: 2.2, bannerY: 3.0 },
  },
];

export const DEFAULT_MAP_ID = 'classic';
export const getMap = (id) => MAPS.find((m) => m.id === id) ?? MAPS.find((m) => m.id === DEFAULT_MAP_ID);

// Footprints for collision. Rotated (+-90) shelf units cover x +-0.25 / z +-1; the others x +-1 / z +-0.25.
export function obstaclesFor(map) {
  const out = map.units.map((u) => {
    const quarter = Math.abs(u.rotY) === 90;
    const hx = quarter ? 0.25 : 1, hz = quarter ? 1 : 0.25;
    return { minX: u.x - hx, maxX: u.x + hx, minZ: u.z - hz, maxZ: u.z + hz };
  });
  const { island, desk, clerk } = map;
  out.push({ minX: island.x - 1, maxX: island.x + 1, minZ: island.z - 0.6, maxZ: island.z + 0.6 });          // island
  out.push({ minX: desk.x - 1.65, maxX: desk.x + 1.65, minZ: desk.z - 0.45, maxZ: desk.z + 0.45 });          // desk counter
  out.push({ minX: desk.x + 1.35, maxX: desk.x + 2.25, minZ: desk.z - 1.85, maxZ: desk.z + 0.05 });          // desk return
  out.push({ minX: clerk.x - 0.35, maxX: clerk.x + 0.35, minZ: clerk.z - 0.35, maxZ: clerk.z + 0.35 });      // clerk
  return out;
}

// Where the player may walk: half the room minus a margin (the walls are 0.5 m inside the player bounds).
export const boundsFor = (map) => ({
  minX: -map.room.width / 2 + 0.5, maxX: map.room.width / 2 - 0.5,
  minZ: -map.room.depth / 2 + 0.5, maxZ: map.room.depth / 2 - 0.5,
});
