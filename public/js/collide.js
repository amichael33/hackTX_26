/* Classic script (also parses as an ES module under Node): circle-vs-rectangle collision on the x/z floor plane.
   Exposes globalThis.StoreCollide = { OBSTACLES, PLAYER_RADIUS, resolve, circleClear }.
   Shelf footprints mirror SHELF_UNITS in layoutStore.js (guarded by test/collide.test.js). */
(function (root) {
  var PLAYER_RADIUS = 0.3;
  var HALF_W = 8, HALF_D = 10; // room interior half-extents (the classic map); setMap changes them
  var heightFn = null;         // ground height under (x, z) for maps with bridges; null = flat

  // Axis-aligned footprints in world x/z.
  var OBSTACLES = [
    // Shelves: rotY ±90 units cover x ±0.25 and z ±1; rotY 0 units cover x ±1 and z ±0.25.
    // left (x -7.2, rotY 90)
    { minX: -7.45, maxX: -6.95, minZ: -6, maxZ: -4 },
    { minX: -7.45, maxX: -6.95, minZ: -1, maxZ: 1 },
    { minX: -7.45, maxX: -6.95, minZ: 4, maxZ: 6 },
    // right (x 7.2, rotY -90)
    { minX: 6.95, maxX: 7.45, minZ: -6, maxZ: -4 },
    { minX: 6.95, maxX: 7.45, minZ: -1, maxZ: 1 },
    { minX: 6.95, maxX: 7.45, minZ: 4, maxZ: 6 },
    // back (z -9.2, rotY 0)
    { minX: -5, maxX: -3, minZ: -9.45, maxZ: -8.95 },
    // center (z 0, rotY 0)
    { minX: -4, maxX: -2, minZ: -0.25, maxZ: 0.25 },
    { minX: 2, maxX: 4, minZ: -0.25, maxZ: 0.25 },
    // Fixtures
    { minX: -1, maxX: 1, minZ: -0.6, maxZ: 0.6 },           // island
    { minX: -1.65, maxX: 1.65, minZ: 6.05, maxZ: 6.95 },    // desk counter
    { minX: 1.35, maxX: 2.25, minZ: 4.65, maxZ: 6.55 },     // desk return
    { minX: -0.35, maxX: 0.35, minZ: 5.45, maxZ: 6.15 }     // clerk
  ];

  // Pushes pos (mutated in place) out of every obstacle, twice so that a push from one can be fixed by the next.
  // Allocates nothing: no arrays, objects or closures per call.
  function resolve(pos, r, obstacles) {
    if (r === undefined) r = PLAYER_RADIUS;
    if (obstacles === undefined) obstacles = OBSTACLES;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        // Closest point on the rectangle to the player centre.
        var cx = pos.x < o.minX ? o.minX : (pos.x > o.maxX ? o.maxX : pos.x);
        var cz = pos.z < o.minZ ? o.minZ : (pos.z > o.maxZ ? o.maxZ : pos.z);
        var dx = pos.x - cx, dz = pos.z - cz;
        var d2 = dx * dx + dz * dz;
        if (d2 > 0) {
          // Centre outside the rectangle: push along the vector from the closest point.
          if (d2 < r * r) {
            var d = Math.sqrt(d2);
            pos.x = cx + (dx / d) * r;
            pos.z = cz + (dz / d) * r;
          }
        } else {
          // Centre inside (or on an edge): push out along the axis of least penetration.
          var left = pos.x - o.minX, right = o.maxX - pos.x;
          var down = pos.z - o.minZ, up = o.maxZ - pos.z;
          var m = left;
          if (right < m) m = right;
          if (down < m) m = down;
          if (up < m) m = up;
          if (m === left) pos.x = o.minX - r;
          else if (m === right) pos.x = o.maxX + r;
          else if (m === down) pos.z = o.minZ - r;
          else pos.z = o.maxZ + r;
        }
      }
    }
    return pos;
  }

  // Swaps in another map's footprints and room size. OBSTACLES keeps its identity (it is edited in place), so
  // anything holding a reference to it sees the new map.
  function setMap(map) {
    OBSTACLES.length = 0;
    for (var i = 0; i < map.obstacles.length; i++) OBSTACLES.push(map.obstacles[i]);
    HALF_W = map.halfW;
    HALF_D = map.halfD;
    heightFn = typeof map.heightAt === 'function' ? map.heightAt : null;
  }

  // Height of the walkable ground at (x, z): 0 on the floor, up on a bridge's arch. Allocates nothing.
  function heightAt(x, z) {
    return heightFn ? heightFn(x, z) : 0;
  }

  // True when a circle at (x, z) overlaps no obstacle and stays inside the room interior (x +-HALF_W, z +-HALF_D).
  // Allocates nothing.
  function circleClear(x, z, r, obstacles) {
    if (obstacles === undefined) obstacles = OBSTACLES;
    if (x < -(HALF_W - r) || x > HALF_W - r || z < -(HALF_D - r) || z > HALF_D - r) return false;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var cx = x < o.minX ? o.minX : (x > o.maxX ? o.maxX : x);
      var cz = z < o.minZ ? o.minZ : (z > o.maxZ ? o.maxZ : z);
      var dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  }

  root.StoreCollide = { OBSTACLES: OBSTACLES, PLAYER_RADIUS: PLAYER_RADIUS, resolve: resolve, circleClear: circleClear, setMap: setMap, heightAt: heightAt };
})(globalThis);
