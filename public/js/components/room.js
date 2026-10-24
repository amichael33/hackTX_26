/* Classic script: registers the `room` A-Frame component (floor, walls, ceiling). */
(function () {
  AFRAME.registerComponent('room', {
    schema: {
      width: { default: 16 }, depth: { default: 20 }, height: { default: 4 },
      floor: { default: '#e9e7e3' }, wall: { default: '#f5f5f7' }, ceiling: { default: '#ffffff' },
      accent: { default: '#d9bf98' }, tile: { default: '#dcd9d3' }
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
      // emissive light-panel strips (visual only)
      for (i = -4; i <= 4; i += 4) {
        this.plane([i, h - 0.01, 0], [90, 0, 0], [0.5, Math.min(12, d.depth - 2)], '#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.8 });
      }
      this.box([0, h / 2, -hd - t / 2], [d.width + 2 * t, h, t], d.wall); // back
      this.box([0, h / 2, hd + t / 2], [d.width + 2 * t, h, t], d.wall);  // front
      this.box([-hw - t / 2, h / 2, 0], [t, h, d.depth], d.wall);               // left
      this.box([hw + t / 2, h / 2, 0], [t, h, d.depth], d.wall);                // right
      this.box([0, 1.5, -hd + 0.01], [Math.min(12, d.width - 4), 2.6, 0.02], d.accent);            // oak feature panel (back wall)
    }
  });
})();
