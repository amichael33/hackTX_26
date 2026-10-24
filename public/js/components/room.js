/* Classic script: registers the `room` A-Frame component (floor, walls, ceiling). */
(function () {
  AFRAME.registerComponent('room', {
    schema: {
      width: { default: 16 }, depth: { default: 20 }, height: { default: 4 },
      floor: { default: '#e9e7e3' }, wall: { default: '#f5f5f7' }, ceiling: { default: '#ffffff' },
      accent: { default: '#d9bf98' }, tile: { default: '#dcd9d3' },
      panelX: { default: 0 }, panelW: { default: 0 }, // the back-wall accent panel (0 width = the old default); the map sizes it to the corkboard
      style: { default: 'plain', oneOf: ['plain', 'castle'] } // castle: timber ceiling beams, stone pillars and wall torches
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
      this.box([0, h / 2, -hd - t / 2], [d.width + 2 * t, h, t], d.wall); // back
      this.box([0, h / 2, hd + t / 2], [d.width + 2 * t, h, t], d.wall);  // front
      this.box([-hw - t / 2, h / 2, 0], [t, h, d.depth], d.wall);               // left
      this.box([hw + t / 2, h / 2, 0], [t, h, d.depth], d.wall);                // right
      this.box([d.panelW > 0 ? d.panelX : 0, 1.5, -hd + 0.01], [d.panelW > 0 ? d.panelW : Math.min(12, d.width - 4), 2.6, 0.02], d.accent);            // oak feature panel (back wall)
      if (d.style === 'castle') this.castle(hw, hd, h);
    },
    // Timber beams across the ceiling, stone pillars in the corners and torches along the long walls.
    castle: function (hw, hd, h) {
      var z, i;
      for (z = -hd + 3; z < hd; z += 4) this.box([0, h - 0.15 - 0.002, z], [d2(hw), 0.3, 0.3], '#4f3320');
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c, k) {
        this.box([c[0] * (hw - 0.4), h / 2, c[1] * (hd - 0.4)], [0.8, h, 0.8], '#8a847b');
        this.box([c[0] * (hw - 0.4), 0.15, c[1] * (hd - 0.4)], [0.92, 0.3, 0.92], '#716c64'); // plinth
      }, this);
      for (z = -hd + 5; z < hd - 3; z += 6) {
        for (i = -1; i <= 1; i += 2) {
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
