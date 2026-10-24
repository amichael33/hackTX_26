/* Classic script: registers the `room` A-Frame component (floor, walls, ceiling). */
(function () {
  AFRAME.registerComponent('room', {
    schema: {
      width: { default: 16 }, depth: { default: 20 }, height: { default: 4 },
      floor: { default: '#e9e7e3' }, wall: { default: '#f5f5f7' }, ceiling: { default: '#ffffff' },
      accent: { default: '#d9bf98' }, tile: { default: '#dcd9d3' },
      panelX: { default: 0 }, panelW: { default: 0 }, // the back-wall accent panel (0 width = the old default); the map sizes it to the corkboard
      openings: { default: '' }, // JSON: windows and the front door [{ wall, kind, style, c, w, y0, y1 }] (maps.js openingsFor)
      style: { default: 'plain', oneOf: ['plain', 'castle', 'warehouse'] } // castle: timber ceiling beams, stone pillars and wall torches; warehouse: steel trusses, pendant lamps, floor lines, wall safety gear
    },
    init: function () {
      this.built = [];
      this.build();
    },
    update: function (old) {
      if (!old || Object.keys(old).length === 0) return; // init already built
      this.clear();
      this.build();
    },
    remove: function () { this.clear(); },
    clear: function () {
      this.built.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
      this.built = [];
    },
    box: function (pos, size, color, extra) {
      var e = document.createElement('a-box');
      e.setAttribute('position', pos.join(' '));
      e.setAttribute('width', size[0]);
      e.setAttribute('height', size[1]);
      e.setAttribute('depth', size[2]);
      e.setAttribute('material', Object.assign({ color: color, flatShading: true, roughness: 1, metalness: 0 }, extra || {}));
      this.el.appendChild(e);
      this.built.push(e);
    },
    plane: function (pos, rot, size, color, extra) {
      var e = document.createElement('a-plane');
      e.setAttribute('position', pos.join(' '));
      e.setAttribute('rotation', rot.join(' '));
      e.setAttribute('width', size[0]);
      e.setAttribute('height', size[1]);
      e.setAttribute('material', Object.assign({ color: color, roughness: 1, metalness: 0, side: 'double' }, extra || {}));
      this.el.appendChild(e);
      this.built.push(e);
    },
    build: function () {
      var d = this.data, t = 0.2, hw = d.width / 2, hd = d.depth / 2, h = d.height, i;
      this.box([0, -t / 2, 0], [d.width, t, d.depth], d.floor);            // floor (matte stone)
      // subtle large-tile lines every 2 m
      for (i = -hw + 2; i < hw; i += 2) this.plane([i, 0.002, 0], [-90, 0, 0], [0.01, d.depth], d.tile);
      for (i = -hd + 2; i < hd; i += 2) this.plane([0, 0.002, i], [-90, 0, 0], [d.width, 0.01], d.tile);
      this.box([0, h + t / 2, 0], [d.width, t, d.depth], d.ceiling);         // ceiling
      if (d.style !== 'castle') {
        // emissive light-panel strips (visual only)
        for (i = -4; i <= 4; i += 4) {
          this.plane([i, h - 0.01, 0], [90, 0, 0], [0.5, Math.min(12, d.depth - 2)], '#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.8 });
        }
      }
      this.walls(d, hw, hd, h, t);
      this.box([d.panelW > 0 ? d.panelX : 0, 1.5, -hd + 0.01], [d.panelW > 0 ? d.panelW : Math.min(12, d.width - 4), 2.6, 0.02], d.accent);            // oak feature panel (back wall)
      if (d.style === 'castle') this.castle(hw, hd, h);
      if (d.style === 'warehouse') this.warehouse(hw, hd, h);
    },
    // --- walls with windows and the front door ---
    // A box on a wall in the wall's own terms: u along it, y up, `off` toward the room from the wall's centre plane.
    // Front/back walls run along x; left/right along z.
    wallBox: function (wall, u, y, du, dy, depth, off, color, extra) {
      var d = this.data, t = 0.2, sgn = (wall === 'front' || wall === 'right') ? 1 : -1;
      if (wall === 'front' || wall === 'back') {
        this.box([u, y, sgn * (d.depth / 2 + t / 2) - sgn * off], [du, dy, depth], color, extra);
      } else {
        this.box([sgn * (d.width / 2 + t / 2) - sgn * off, y, u], [depth, dy, du], color, extra);
      }
    },
    wallPlane: function (wall, u, y, du, dy, off, color, extra) {
      var d = this.data, t = 0.2, sgn = (wall === 'front' || wall === 'right') ? 1 : -1;
      var pos, rot;
      if (wall === 'front' || wall === 'back') { pos = [u, y, sgn * (d.depth / 2 + t / 2) - sgn * off]; rot = [0, 0, 0]; }
      else { pos = [sgn * (d.width / 2 + t / 2) - sgn * off, y, u]; rot = [0, 90, 0]; }
      this.plane(pos, rot, [du, dy], color, extra);
    },
    // Each wall is built from boxes around its openings: full-height columns between them, and a piece below and above each.
    walls: function (d, hw, hd, h, t) {
      var ops = [], self = this;
      try { ops = d.openings ? JSON.parse(d.openings) : []; } catch (e) { ops = []; }
      this.ops = ops;
      ['back', 'front', 'left', 'right'].forEach(function (wall) {
        var alongX = wall === 'front' || wall === 'back';
        var lo = alongX ? -hw - t : -hd, hi = alongX ? hw + t : hd;
        var mine = ops.filter(function (o) { return o.wall === wall; }).sort(function (a, b) { return a.c - b.c; });
        var piece = function (u0, u1, y0, y1) {
          if (u1 - u0 < 1e-4 || y1 - y0 < 1e-4) return;
          self.wallBox(wall, (u0 + u1) / 2, (y0 + y1) / 2, u1 - u0, y1 - y0, t, 0, d.wall);
        };
        var cursor = lo;
        mine.forEach(function (o) {
          var u0 = o.c - o.w / 2, u1 = o.c + o.w / 2;
          piece(cursor, u0, 0, h);
          piece(u0, u1, 0, o.y0);
          piece(u0, u1, o.y1, h);
          cursor = u1;
        });
        piece(cursor, hi, 0, h);
        mine.forEach(function (o) { if (o.kind === 'door') self.door(wall, o); else self.windowAt(wall, o); });
      });
    },
    windowAt: function (wall, o) {
      var st = o.style, w = o.w, hgt = o.y1 - o.y0, cy = (o.y0 + o.y1) / 2;
      var F = { modern: ['#2b2b2f', 0.05, 0.1], cottage: ['#f4f0e6', 0.07, 0.12], industrial: ['#4a4f57', 0.06, 0.12], castle: ['#6b665d', 0.14, 0.2] }[st] || ['#2b2b2f', 0.05, 0.1];
      var col = F[0], fb = F[1], fd = F[2], self = this;
      // Frame: top and bottom full width, sides between them.
      this.wallBox(wall, o.c, o.y1 - fb / 2, w, fb, fd, 0, col);
      this.wallBox(wall, o.c, o.y0 + fb / 2, w, fb, fd, 0, col);
      this.wallBox(wall, o.c - w / 2 + fb / 2, cy, fb, hgt - 2 * fb, fd, 0, col);
      this.wallBox(wall, o.c + w / 2 - fb / 2, cy, fb, hgt - 2 * fb, fd, 0, col);
      // Glazing bars where the panes divide: verticals run full height, horizontals fit between the verticals.
      var iw = w - 2 * fb, ih = hgt - 2 * fb, mb = st === 'castle' ? 0.04 : 0.03, mc = st === 'castle' ? '#2b2b2b' : col;
      var vs = { modern: [0.5], cottage: [0.5], industrial: [0.25, 0.5, 0.75], castle: [0.5] }[st] || [0.5];
      var hs = { modern: [], cottage: [0.33, 0.66], industrial: [], castle: [0.5] }[st] || [];
      var xs = [0].concat(vs).concat([1]);
      vs.forEach(function (f) { self.wallBox(wall, o.c - iw / 2 + f * iw, cy, mb, ih, 0.06, 0, mc); });
      hs.forEach(function (f) {
        for (var i = 0; i < xs.length - 1; i++) {
          var a = o.c - iw / 2 + xs[i] * iw + (i ? mb / 2 : 0), b = o.c - iw / 2 + xs[i + 1] * iw - (i < xs.length - 2 ? mb / 2 : 0);
          self.wallBox(wall, (a + b) / 2, o.y0 + fb + f * ih, b - a, mb, 0.06, 0, mc);
        }
      });
      // The glass: nearly clear, so the town outside shows through.
      this.wallPlane(wall, o.c, cy, iw, ih, 0, '#cfe6ff', { opacity: 0.14, transparent: true, depthWrite: false, roughness: 0.1 });
      // A sill board inside, for everything but the high factory windows.
      if (st !== 'industrial') this.wallBox(wall, o.c, o.y0 + 0.02, w + 0.2, 0.04, 0.34, 0.06, st === 'castle' ? '#7a756b' : st === 'cottage' ? '#f4f0e6' : '#cfcfd4');
    },
    // The front door. It is only for show: it never opens and nothing happens when you walk up to it.
    door: function (wall, o) {
      var st = o.style, w = o.w, hgt = o.y1, self = this;
      var F = { modern: ['#2b2b2f', 0.06], cottage: ['#f4f0e6', 0.08], industrial: ['#4a4f57', 0.1], castle: ['#6b665d', 0.2] }[st] || ['#2b2b2f', 0.06];
      var col = F[0], fb = F[1], iw = w - 2 * fb, ih = hgt - fb;
      var depth = st === 'castle' ? 0.2 : 0.12;
      this.wallBox(wall, o.c, hgt - fb / 2, w, fb, depth, 0, col);                                      // header
      this.wallBox(wall, o.c - w / 2 + fb / 2, ih / 2, fb, ih, depth, 0, col);                          // jambs
      this.wallBox(wall, o.c + w / 2 - fb / 2, ih / 2, fb, ih, depth, 0, col);
      this.wallBox(wall, o.c, 0.01, w, 0.02, 0.3, 0.05, st === 'castle' ? '#7a756b' : '#8d8d92');        // threshold
      if (st === 'modern') {
        // Two glass doors with dark aluminium frames and push bars.
        [-1, 1].forEach(function (s) {
          var cx = o.c + s * iw / 4, lw = iw / 2 - 0.01;
          self.wallBox(wall, cx, 0.06, lw, 0.12, 0.06, 0, '#3a3a40');
          self.wallBox(wall, cx, ih - 0.05, lw, 0.1, 0.06, 0, '#3a3a40');
          self.wallBox(wall, cx - s * (lw / 2 - 0.03), ih / 2, 0.06, ih - 0.22, 0.06, 0, '#3a3a40');
          self.wallBox(wall, cx + s * (lw / 2 - 0.03), ih / 2, 0.06, ih - 0.22, 0.06, 0, '#3a3a40');
          self.wallPlane(wall, cx, ih / 2, lw - 0.12, ih - 0.22, 0, '#cfe6ff', { opacity: 0.25, transparent: true, depthWrite: false, roughness: 0.1 });
          self.wallBox(wall, cx - s * 0.12, 1.05, 0.03, 0.8, 0.05, 0.05, '#c7c7cc');                     // push bar
        });
      } else if (st === 'cottage') {
        self.wallBox(wall, o.c, ih / 2, iw, ih, 0.06, 0, '#8a5a3c');                                      // the door leaf
        self.wallBox(wall, o.c, ih * 0.28, iw * 0.62, ih * 0.3, 0.08, 0, '#6e4630');                      // raised panel
        self.wallBox(wall, o.c, ih * 0.76, iw * 0.44, ih * 0.24, 0.09, 0, '#f4f0e6');                     // little window frame
        self.wallPlane(wall, o.c, ih * 0.76, iw * 0.34, ih * 0.18, 0.05, '#8fb8d8', { roughness: 0.2 });
        var knob = document.createElement('a-sphere');
        knob.setAttribute('position', this.knobPos(wall, o.c + iw * 0.38, ih * 0.5).join(' '));
        knob.setAttribute('radius', 0.035);
        knob.setAttribute('material', { color: '#c9a227', metalness: 0.6, roughness: 0.3 });
        this.el.appendChild(knob); this.built.push(knob);
      } else if (st === 'industrial') {
        self.wallBox(wall, o.c, ih / 2, iw, ih, 0.06, 0, '#8d9096');                                      // roller shutter
        for (var y = 0.35; y < ih - 0.05; y += 0.3) self.wallBox(wall, o.c, y, iw, 0.03, 0.09, 0, '#6e7177'); // slats
        self.wallBox(wall, o.c, 0.1, iw, 0.2, 0.1, 0.01, '#e0a526');                                      // yellow bottom bar
        if (o.personnel) self.personnelDoor(wall, o);
      } else {
        // Two heavy timber leaves bound with iron, a ring on each.
        [-1, 1].forEach(function (s) {
          var cx = o.c + s * iw / 4, lw = iw / 2 - 0.01;
          self.wallBox(wall, cx, ih / 2, lw, ih, 0.1, 0, '#5a3d24');
          [0.22, 0.5, 0.8].forEach(function (f) { self.wallBox(wall, cx, ih * f, lw, 0.1, 0.13, 0, '#2b2b2b'); }); // iron bands
          var ring = document.createElement('a-torus');
          ring.setAttribute('position', self.knobPos(wall, cx - s * 0.14, ih * 0.42).join(' '));
          ring.setAttribute('radius', 0.07); ring.setAttribute('radius-tubular', 0.012);
          ring.setAttribute('material', { color: '#2b2b2b', metalness: 0.5, roughness: 0.4 });
          self.el.appendChild(ring); self.built.push(ring);
        });
      }
    },

    // --- the warehouse: floor lines, steel trusses, pendant lamps, a personnel door and wall safety gear (all decor) ---
    // Is something already in the wall at u (half-width hu) between heights y0..y1?
    taken: function (wall, u, hu, y0, y1) {
      return (this.ops || []).some(function (o) { return o.wall === wall && Math.abs(u - o.c) < o.w / 2 + hu + 0.15 && o.y0 < y1 && o.y1 > y0; });
    },
    // A small fitting stuck to a wall's inner face: `dp` thick, standing a hair proud of it.
    onWall: function (wall, u, y, du, dy, dp, color, extra) { this.wallBox(wall, u, y, du, dy, dp, 0.1 + dp / 2 + 0.003, color, extra); },
    // A small man-door in the wall beside the roller shutter. It is a flat decoration: it never opens.
    personnelDoor: function (wall, o) {
      var p = o.personnel, c = o.c + o.w / 2 + p.gap + p.width / 2, w = p.width, hh = p.height, self = this;
      var fr = '#4a4f57', dp = 0.05;
      this.onWall(wall, c, hh / 2, w + 0.12, hh, dp, fr);                                                 // frame
      this.onWall(wall, c, hh / 2, w - 0.04, hh - 0.06, dp + 0.03, '#8d9096');                            // steel leaf
      this.onWall(wall, c, hh * 0.72, 0.4, 0.5, dp + 0.05, '#2b2f36');                                    // vision panel frame
      this.wallPlane(wall, c, hh * 0.72, 0.3, 0.4, 0.1 + dp + 0.09, '#9ec6e8', { roughness: 0.2 });
      this.onWall(wall, c - w * 0.32, hh * 0.45, 0.04, 0.2, dp + 0.08, '#c7c7cc');                         // push bar
      this.onWall(wall, c, hh + 0.35, 0.6, 0.22, 0.05, '#1f8a4c', { emissive: '#1f8a4c', emissiveIntensity: 0.7 }); // exit sign
      this.onWall(wall, c, hh + 0.35, 0.36, 0.06, 0.08, '#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 });
    },
    warehouse: function (hw, hd, h) {
      var d = this.data, i, j, x, z, steel = '#555a62', yellow = '#e0a526', self = this;
      // Floor: two yellow aisle lines either side of the middle aisle, and a hazard-striped band in front of the shutter.
      [-1, 1].forEach(function (s) { self.plane([s * 2.5, 0.006, -1], [-90, 0, 0], [0.14, 20], yellow); });
      [-1, 1].forEach(function (s) { self.plane([s * 8.2, 0.006, 4], [-90, 0, 0], [0.1, 18], '#d9d4c7'); }); // pale walkway lines in the side aisles
      var bz = hd - 1.1, n = Math.round(4.2 / 0.35);
      for (i = 0; i < n; i++) this.plane([-2.1 + (i + 0.5) * 0.35, 0.006, bz], [-90, 0, 0], [0.35, 0.7], i % 2 ? '#26282c' : yellow);
      // Ceiling: steel I-beams across the hall with lamps hanging from them.
      for (z = -hd + 3; z < hd - 1; z += 6) {
        this.box([0, h - 0.3, z], [d.width - 0.04, 0.5, 0.1], steel);        // web
        this.box([0, h - 0.56, z], [d.width - 0.04, 0.05, 0.32], steel);     // lower flange
        this.box([0, h - 0.04, z], [d.width - 0.04, 0.05, 0.32], steel);     // upper flange
      }
      [-1, 1].forEach(function (s) { self.box([s * 6.5, h - 0.7, 0], [0.16, 0.16, d.depth - 0.04], '#43474e'); }); // long cable trays
      for (x = -1; x <= 1; x += 2) for (z = -hd + 3; z < hd - 1; z += 6) {
        var lx = x * 8;
        this.box([lx, h - 0.8, z], [0.03, 0.5, 0.03], '#26282c');            // cord
        var shade = document.createElement('a-cone');
        shade.setAttribute('position', lx + ' ' + (h - 1.2) + ' ' + z);
        shade.setAttribute('radius-bottom', 0.55); shade.setAttribute('radius-top', 0.1); shade.setAttribute('height', 0.35); shade.setAttribute('segments-radial', 8);
        shade.setAttribute('material', { color: '#3c4047', flatShading: true, side: 'double' });
        this.el.appendChild(shade); this.built.push(shade);
        this.plane([lx, h - 1.38, z], [90, 0, 0], [0.7, 0.7], '#fff4d6', { emissive: '#fff4d6', emissiveIntensity: 0.9 }); // the bulb glow under the shade
      }
      // Walls: a dark base band with a yellow stripe on the side and front walls, broken around the door and windows.
      ['left', 'right', 'front'].forEach(function (wall) {
        var len = wall === 'front' ? d.width : d.depth, cuts = (self.ops || []).filter(function (o) { return o.wall === wall && o.y0 < 1.3; }).sort(function (a, b) { return a.c - b.c; });
        var cur = -len / 2 + 0.2, seg = function (a, b) {
          if (b - a < 0.05) return;
          self.onWall(wall, (a + b) / 2, 0.55, b - a, 1.1, 0.02, '#6d7178');
          self.onWall(wall, (a + b) / 2, 1.14, b - a, 0.08, 0.03, yellow);
        };
        cuts.forEach(function (o) { seg(cur, o.c - o.w / 2 - 0.1); cur = o.c + o.w / 2 + 0.1; });
        seg(cur, len / 2 - 0.2);
      });
      // Safety gear on the side walls where nothing else hangs: fire extinguishers with a red sign, caution plates.
      var spots = [{ wall: 'left', u: 8.5 }, { wall: 'right', u: 8.5 }, { wall: 'left', u: 12.5 }, { wall: 'right', u: -12.8 }, { wall: 'left', u: -12.8 }];
      var placed = 0;
      spots.forEach(function (sp) {
        if (placed >= 3 || self.taken(sp.wall, sp.u, 0.4, 0.1, 2.6)) return;
        placed++;
        self.onWall(sp.wall, sp.u, 1.95, 0.4, 0.4, 0.03, '#c0392b');                 // red sign
        self.onWall(sp.wall, sp.u, 1.95, 0.22, 0.06, 0.04, '#ffffff');
        self.onWall(sp.wall, sp.u, 1.95, 0.06, 0.22, 0.04, '#ffffff');
        self.onWall(sp.wall, sp.u, 1.1, 0.26, 0.5, 0.02, '#f2f2f2');                  // backboard
        var cyl = document.createElement('a-cylinder'), q = self.knobPos(sp.wall, sp.u, 1.0);
        var inward = sp.wall === 'left' ? 1 : -1;
        cyl.setAttribute('position', (q[0] + inward * 0.07) + ' 1.0 ' + q[2]);
        cyl.setAttribute('radius', 0.08); cyl.setAttribute('height', 0.46); cyl.setAttribute('segments-radial', 8);
        cyl.setAttribute('material', { color: '#c0392b', flatShading: true });
        self.el.appendChild(cyl); self.built.push(cyl);
        self.onWall(sp.wall, sp.u, 1.27, 0.06, 0.08, 0.2, '#26282c');                  // hose head
      });
    },
    // World position of a small fitting (knob, ring) on a wall's interior side.
    knobPos: function (wall, u, y) {
      var d = this.data, t = 0.2, sgn = (wall === 'front' || wall === 'right') ? 1 : -1, off = 0.12;
      if (wall === 'front' || wall === 'back') return [u, y, sgn * (d.depth / 2 + t / 2) - sgn * off];
      return [sgn * (d.width / 2 + t / 2) - sgn * off, y, u];
    },
    // Timber beams across the ceiling, stone pillars in the corners and torches along the long walls.
    castle: function (hw, hd, h) {
      var z, i;
      for (z = -hd + 3; z < hd; z += 4) this.box([0, h - 0.15 - 0.002, z], [d2(hw), 0.3, 0.3], '#4f3320');
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c, k) {
        this.box([c[0] * (hw - 0.4), h / 2, c[1] * (hd - 0.4)], [0.8, h, 0.8], '#8a847b');
        this.box([c[0] * (hw - 0.4), 0.15, c[1] * (hd - 0.4)], [0.92, 0.3, 0.92], '#716c64'); // plinth
      }, this);
      var side = this.ops || [];
      for (z = -hd + 5; z < hd - 3; z += 6) {
        for (i = -1; i <= 1; i += 2) {
          var wallName = i < 0 ? 'left' : 'right';
          if (side.some(function (o) { return o.wall === wallName && Math.abs(z - o.c) < o.w / 2 + 0.5; })) continue; // a window is here
          var x = i * (hw - 0.12);
          this.box([x, 2.3, z], [0.08, 0.5, 0.08], '#2b2b2b');                       // bracket
          var flame = document.createElement('a-cone');
          flame.setAttribute('position', x + ' 2.7 ' + z);
          flame.setAttribute('radius-bottom', 0.1);
          flame.setAttribute('radius-top', 0.01);
          flame.setAttribute('height', 0.3);
          flame.setAttribute('segments-radial', 6);
          flame.setAttribute('material', { color: '#ff9a3c', emissive: '#ff7a1a', emissiveIntensity: 1, flatShading: true });
          this.el.appendChild(flame);
          this.built.push(flame);
        }
      }
    }
  });
  function d2(hw) { return hw * 2; }
})();
