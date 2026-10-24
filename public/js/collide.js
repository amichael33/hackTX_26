/* Classic script (also parses as an ES module under Node): circle-vs-rectangle collision on the x/z floor plane.
   Exposes globalThis.StoreCollide = { OBSTACLES, PLAYER_RADIUS, resolve }.
   Shelf footprints mirror SHELF_UNITS in layoutStore.js (guarded by test/collide.test.js). */
(function (root) {
  var PLAYER_RADIUS = 0.3;

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
    { minX: -1, maxX: 1, minZ: -9.45, maxZ: -8.95 },
    { minX: 3, maxX: 5, minZ: -9.45, maxZ: -8.95 },
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

  root.StoreCollide = { OBSTACLES: OBSTACLES, PLAYER_RADIUS: PLAYER_RADIUS, resolve: resolve };
})(globalThis);
