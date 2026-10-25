// Builds the A-Frame scene for a map (maps.js): room, shelves, island, corkboard, desk, clerk, lights, spawn and collision.
// Everything else in the scene (products, smoke, cart) is independent of the map.
import { labelFor, shelfStyleFor, obstaclesFor, boundsFor, accentPanelFor, riverFor, walkHeight, openingsFor } from './maps.js';
import { setMap as setLayoutMap } from './layoutStore.js';

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, parent) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function buildIsland(map, parent) {
  const { island, room } = map;
  const g = el('a-entity', { id: 'island', position: `${island.x} 0 ${island.z}` }, parent);
  // The table's look comes from the map (islandStyle): a base, a top, and an optional darker plinth around its foot.
  const st = map.islandStyle ?? {};
  const wood = `color:${st.top ?? '#d9bf98'}; flatShading:true; roughness:0.9; metalness:0`;
  const white = `color:${st.base ?? '#f5f5f7'}; flatShading:true; roughness:0.9; metalness:0`;
  el('a-box', { position: '0 0.77 0', width: 2, height: 0.06, depth: 1.2, material: wood }, g);
  el('a-box', { position: '0 0.37 0', width: 1.4, height: 0.74, depth: 0.7, material: white }, g);
  if (st.plinth) el('a-box', { position: '0 0.06 0', width: 1.5, height: 0.12, depth: 0.8, material: `color:${st.plinth}; flatShading:true; roughness:0.9; metalness:0` }, g);
  // Suspended banner: wires from the ceiling to the banner's top corners (y 2.08).
  const wireH = room.height - 2.08, wireY = (room.height + 2.08) / 2;
  for (const x of [-0.78, 0.78]) el('a-cylinder', { position: `${x} ${wireY} 0`, radius: 0.004, height: wireH, material: 'color:#1d1d1f' }, g);
  el('a-entity', { 'zone-banner': `text:${labelFor(map, 'island')}; width:1.6; theme:${map.signTheme ?? 'shop'}`, position: '0 1.95 0' }, g);
}

// Rebuilds the whole map. preview = show the (empty) shelves, e.g. behind the start screen.
export function applyMap(map, { preview = false } = {}) {
  setLayoutMap(map);
  window.StoreCollide?.setMap({ obstacles: obstaclesFor(map), halfW: map.room.width / 2, halfD: map.room.depth / 2, heightAt: map.river ? (x, z) => walkHeight(map, x, z) : null });

  const { room, spawn, desk, clerk, board } = map;
  $('room')?.setAttribute('room', { width: room.width, depth: room.depth, height: room.height, floor: room.floor, wall: room.wall, ceiling: room.ceiling, accent: room.accent, tile: room.tile, style: room.style ?? 'plain', floorStyle: room.floorStyle ?? '', panelX: accentPanelFor(map).x, panelW: accentPanelFor(map).width, openings: JSON.stringify(openingsFor(map)) });

  const rig = $('rig');
  if (rig) {
    rig.setAttribute('position', `${spawn.x} 1.6 ${spawn.z}`);
    rig.setAttribute('bounds', boundsFor(map));
    rig.object3D.position.set(spawn.x, 1.6, spawn.z); // A-Frame applies the attribute a tick later; the bounds clamp must see it now
  }
  $('desk')?.setAttribute('position', `${desk.x} 0 ${desk.z}`);
  $('desk')?.setAttribute('desk', { body: map.deskStyle?.body ?? '#fbfbfd', top: map.deskStyle?.top ?? '#d9bf98', wood: map.deskStyle?.wood === true });
  $('clerk')?.setAttribute('position', `${clerk.x} 0 ${clerk.z}`);
  $('clerk')?.setAttribute('clerk', 'outfit', map.clerkOutfit ?? 'suit');

  // Lights and the disco ball hang from this map's ceiling.
  const hang = room.height - 0.5;
  $('light-a')?.setAttribute('position', `0 ${hang} 0`);
  $('light-b')?.setAttribute('position', `0 ${hang} ${map.lightBz ?? desk.z}`);
  for (const id of ['light-a', 'light-b']) $(id)?.setAttribute('light', 'color', map.light ?? '#fff4e0');
  const oldDisco = $('disco');
  if (oldDisco) {
    const disco = el('a-entity', { id: 'disco', 'disco-ball': `ceiling: ${room.height}`, position: `${map.island.x} ${hang} ${map.island.z}` });
    oldDisco.replaceWith(disco);
  }

  $('cart3d')?.setAttribute('shopping-cart', 'variant', map.cartVariant ?? 'cart');
  $('outside')?.setAttribute('outside', { theme: map.outside ?? 'city', width: room.width, depth: room.depth });
  buildFeatures(map);
  buildShelves(map, { clothes: false, visible: preview });
}

// Map features that are not shelves: today the castle's river and its arched bridges.
function buildFeatures(map) {
  const box = $('features');
  if (!box) return;
  while (box.firstChild) box.removeChild(box.firstChild);
  const rv = riverFor(map);
  if (!rv) return;
  el('a-entity', { river: `length:${rv.halfW * 2}; width:${rv.width}; bank:${rv.bank}`, position: `0 0 ${rv.z}` }, box);
  if (rv.gator) {
    // Two gators: the second is smaller, a bit yellower, swims the other way and keeps its distance from the first.
    const common = `range:${rv.halfW - 2.5}; sway:${Math.max(0.2, rv.width / 2 - 0.5)}; avoid:${rv.bridges.map((b) => b.x).join(',')}; avoidHalf:${rv.bridges[0].width / 2 + 2.3}`;
    el('a-entity', { alligator: common, position: `0 0.04 ${rv.z}` }, box);
    el('a-entity', { alligator: `${common}; slot:1; scale:0.85; tint:#5a6e2a; startDir:-1; speed:0.8`, position: `0 0.04 ${rv.z}` }, box);
  }
  for (const b of rv.bridges) {
    el('a-entity', { bridge: `width:${b.width}; length:${b.zEnd - b.zStart}; arch:${b.arch}`, position: `${b.x} 0 ${(b.zStart + b.zEnd) / 2}` }, box);
  }
}

// (Re)builds everything inside #shelves: shelf units (or clothing rails), signs, the corkboard and the island.
// clothes = every unit becomes a clothing rail; the products then hang on it (see clothes-rail.js).
export function buildShelves(map, { clothes = false, visible = true } = {}) {
  const shelves = $('shelves');
  if (!shelves) return;
  while (shelves.firstChild) shelves.removeChild(shelves.firstChild);
  const { board } = map;
  for (const [ui, u] of map.units.entries()) {
    const style = clothes ? 'rail' : shelfStyleFor(map, u.zone);
    const s = el('a-entity', { shelf: `width:2; rows:3; style:${style}`, position: `${u.x} 0 ${u.z}`, rotation: `0 ${u.rotY} 0` }, shelves);
    // Timber shelves have a lintel on top, so their sign sits a little higher.
    el('a-entity', { 'data-zone': u.zone, 'data-unit': ui, 'zone-banner': `text:${labelFor(map, u.zone)}; width:2; theme:${map.signTheme ?? 'shop'}`, position: `0 ${style === 'timber' ? 2.1 : 2} 0.02` }, s);
  }
  // The rest of the back wall: a corkboard of post-it search ideas, filled when the player walks back.
  el('a-entity', { id: 'corkboard', corkboard: `width:${board.width}; height:${board.height}; notes:${board.notes ?? 'postit'}`, position: `${board.x} ${board.y} ${board.z}` }, shelves);
  el('a-entity', { id: 'banner-ideas', 'zone-banner': `text:${labelFor(map, 'ideas')}; width:2.4; theme:${map.signTheme ?? 'shop'}`, position: `${board.x} ${board.bannerY} ${board.z + 0.07}` }, shelves);
  buildIsland(map, shelves);
  shelves.setAttribute('visible', String(visible));
}
