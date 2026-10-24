// DOM-free store maps. A map is plain data: the room, where everything stands, and its colors.
// layoutStore.js places products from it, collide.js gets its footprints from obstaclesFor(),
// and sceneMap.js builds the scene from it. Zones: left = budget, right = premium, back = related, center = the rest.

export const ZONE_LABELS = { left: 'Budget Picks', right: 'Premium', back: 'You Might Also Need', center: 'More Like This' };

// Optional per-map styling (all have defaults, see the helpers below):
//   shelfStyles: zone -> shelf style (oak | cubby | rack | timber); labels: zone -> sign text;
//   clerkOutfit: suit | apron | hivis | tabard (what Bob wears); cartVariant: cart | basket | dolly | wheelbarrow;
//   river: { z, width, bank, bridges: [x...], bridgeWidth, arch, approach } (see riverFor) and lightBz (z of the second light);
//   light: color of the two ceiling point lights; deskStyle: { body, top } colors.
export const DEFAULT_SHELF_STYLE = 'oak';
export const shelfStyleFor = (map, zone) => map.shelfStyles?.[zone] ?? DEFAULT_SHELF_STYLE;
export const labelFor = (map, zone) => map.labels?.[zone] ?? ZONE_LABELS[zone];

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
    shelfStyles: { center: 'cubby' },
    clerkOutfit: 'suit',
    cartVariant: 'cart',
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
    shelfStyles: { left: 'cubby', right: 'cubby', back: 'cubby' },
    clerkOutfit: 'apron',
    cartVariant: 'basket',
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
    shelfStyles: { left: 'rack', right: 'rack', back: 'rack', center: 'rack' },
    clerkOutfit: 'hivis',
    cartVariant: 'dolly',
  },
  {
    id: 'castle',
    name: 'Castle Great Hall',
    blurb: 'A torch-lit stone hall with timber racks, and a river to cross at the door.',
    room: { width: 18, depth: 32, height: 5.5, floor: '#8b8780', wall: '#a8a299', ceiling: '#4a3b2c', accent: '#7a1f2b', tile: '#74716b', style: 'castle' },
    spawn: { x: 0, z: 14.5 },
    desk: { x: 0, z: 2.5 },
    clerk: { x: 0, z: 1.8 },
    island: { x: 0, z: -8.5 },
    units: [
      ...[-13, -10, -7, -4].map((z) => unit('left', -8.2, z, 90)),
      ...[-13, -10, -7, -4].map((z) => unit('right', 8.2, z, -90)),
      ...[-6.5, -3.5].map((x) => unit('back', x, -15.2, 0)),
      ...[-3.5, 3.5].map((x) => unit('center', x, -3.5, 0)),
    ],
    board: { x: 3.5, y: 1.55, z: -15.97, width: 7, height: 2.2, bannerY: 3.0 },
    // A courtyard between the desk and the spawn, with a river across the hall and an arched bridge on each side of the desk.
    river: { z: 8, width: 2.6, bank: 0.2, bridges: [-5.2, 5.2], bridgeWidth: 2.4, arch: 0.8, approach: 1.6 },
    shelfStyles: { left: 'timber', right: 'timber', back: 'timber', center: 'timber' },
    labels: { left: 'Squire\'s Bargains', right: 'Royal Treasury', back: 'Also in the Armory', center: 'More Like This' },
    light: '#ffc98a',
    lightBz: 8,
    clerkOutfit: 'tabard',
    cartVariant: 'wheelbarrow',
    deskStyle: { body: '#5a3d24', top: '#8a6a45' },
  },
];

export const DEFAULT_MAP_ID = 'classic';
export const getMap = (id) => MAPS.find((m) => m.id === id) ?? MAPS.find((m) => m.id === DEFAULT_MAP_ID);

// The river across the hall and the arched bridges over it, in world coordinates. Water and its two stone banks form one
// band (zMin..zMax) across the whole room; each bridge spans the band plus an approach ramp on both sides.
export function riverFor(map) {
  const r = map.river;
  if (!r) return null;
  const half = r.width / 2 + r.bank;
  const zMin = r.z - half, zMax = r.z + half;
  const bridges = r.bridges.map((x) => ({ x, width: r.bridgeWidth, zStart: zMin - r.approach, zEnd: zMax + r.approach, arch: r.arch }));
  return { z: r.z, width: r.width, bank: r.bank, zMin, zMax, bridges, halfW: map.room.width / 2 };
}

// Ground height under (x, z): the arch of a bridge deck, 0 everywhere else. No allocations (runs every frame).
export function walkHeight(map, x, z) {
  const r = map.river;
  if (!r) return 0;
  const half = r.width / 2 + r.bank, zStart = r.z - half - r.approach, zEnd = r.z + half + r.approach;
  if (z <= zStart || z >= zEnd) return 0;
  for (let i = 0; i < r.bridges.length; i++) {
    if (Math.abs(x - r.bridges[i]) <= r.bridgeWidth / 2) return r.arch * Math.sin(Math.PI * (z - zStart) / (zEnd - zStart));
  }
  return 0;
}

// Footprints for collision. Rotated (+-90) shelf units cover x +-0.25 / z +-1; the others x +-1 / z +-0.25.
export function obstaclesFor(map) {
  const out = map.units.map((u) => {
    const quarter = Math.abs(u.rotY) === 90;
    const hx = quarter ? 0.25 : 1, hz = quarter ? 1 : 0.25;
    return { minX: u.x - hx, maxX: u.x + hx, minZ: u.z - hz, maxZ: u.z + hz };
  });
  // The river is a wall of water except under the bridges, whose stone sides (0.2 m) keep the player on the deck.
  const rv = riverFor(map);
  if (rv) {
    const edges = [-rv.halfW];
    rv.bridges.slice().sort((a, b) => a.x - b.x).forEach((b) => edges.push(b.x - b.width / 2, b.x + b.width / 2));
    edges.push(rv.halfW);
    for (let i = 0; i < edges.length; i += 2) out.push({ minX: edges[i], maxX: edges[i + 1], minZ: rv.zMin, maxZ: rv.zMax });
    for (const b of rv.bridges) {
      out.push({ minX: b.x - b.width / 2, maxX: b.x - b.width / 2 + 0.2, minZ: b.zStart, maxZ: b.zEnd });
      out.push({ minX: b.x + b.width / 2 - 0.2, maxX: b.x + b.width / 2, minZ: b.zStart, maxZ: b.zEnd });
    }
  }
  const { island, desk, clerk } = map;
  out.push({ minX: island.x - 1, maxX: island.x + 1, minZ: island.z - 0.6, maxZ: island.z + 0.6 });          // island
  out.push({ minX: desk.x - 1.65, maxX: desk.x + 1.65, minZ: desk.z - 0.45, maxZ: desk.z + 0.45 });          // desk counter
  out.push({ minX: desk.x + 1.35, maxX: desk.x + 2.25, minZ: desk.z - 1.85, maxZ: desk.z + 0.05 });          // desk return
  out.push({ minX: clerk.x - 0.35, maxX: clerk.x + 0.35, minZ: clerk.z - 0.35, maxZ: clerk.z + 0.35 });      // clerk
  return out;
}

// The accent panel on the back wall (oak, tapestry...) sits behind the back shelves and the corkboard: it spans both with a
// margin and never runs past the side walls. Returns its center x and width.
export function accentPanelFor(map, margin = 1) {
  const { board, room } = map;
  const FRAME = 0.08;
  let left = board.x - board.width / 2 - FRAME, right = board.x + board.width / 2 + FRAME;
  for (const u of map.units) if (u.zone === 'back') { left = Math.min(left, u.x - 1); right = Math.max(right, u.x + 1); }
  const wall = room.width / 2 - 0.2;
  left = Math.max(-wall, left - margin);
  right = Math.min(wall, right + margin);
  return { x: (left + right) / 2, width: right - left };
}

// Where the player may walk: half the room minus a margin (the walls are 0.5 m inside the player bounds).
export const boundsFor = (map) => ({
  minX: -map.room.width / 2 + 0.5, maxX: map.room.width / 2 - 0.5,
  minZ: -map.room.depth / 2 + 0.5, maxZ: map.room.depth / 2 - 0.5,
});
