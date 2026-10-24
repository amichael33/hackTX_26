/* Classic script: `clothes-rail` component. The hangers of one clothing rail (its children are product-box kind:garment).
   More garments hang on a rail than fit in view: the window shows RAIL_WINDOW of them and two arrow buttons slide it, so the
   player flips through the clothes. Garments slide with easing and shrink away at the window edges. Faces local +z.
   Constants mirror public/js/clothesLayout.js (guarded by test/clothesRail.test.js). */
(function () {
  var PITCH = 0.32, WINDOW = 6, STEP = 3, POP_MS = 380;
  var HALF = (WINDOW / 2) * PITCH;
  var ARROW_Y = 1.0; // world height of the arrow buttons

  function hangerX(i, offset) { return (i - offset - (WINDOW - 1) / 2) * PITCH; }
  function clampOffset(o, n) { return Math.max(0, Math.min(Math.max(0, n - WINDOW), o)); }

  AFRAME.registerComponent('clothes-rail', {
    schema: {
      kind: { default: 'wall', oneOf: ['wall', 'island'] },
      count: { default: 6 } // garments on this rail; a short rail is centred in the window
    },
    init: function () {
      this.garments = []; // { el, born (ms or -1), x }
      this.offset = 0;
      this.target = 0;
      this.arrows = [];
      this.frame = [];   // island only: the little frame the garments hang from
      this.base = this.data.count < WINDOW ? -(WINDOW - this.data.count) / 2 : 0; // shifts a short rail to the middle
      if (this.data.kind === 'island') this.buildIslandFrame();
    },
    // The island has no shelf behind it, so it gets its own small frame: two posts and a bar over the table.
    buildIslandFrame: function () {
      var self = this;
      function add(tag, attrs, color) {
        var e = document.createElement(tag);
        Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        e.setAttribute('material', { color: color, flatShading: true, roughness: 0.5, metalness: 0.3 });
        self.el.appendChild(e);
        self.frame.push(e);
      }
      var x = 4 * PITCH / 2 + 0.12;
      [-x, x].forEach(function (px) { add('a-box', { position: px + ' 0.43 0', width: 0.03, height: 0.86, depth: 0.03 }, '#555a60'); });
      add('a-cylinder', { position: '0 0.86 0', rotation: '0 0 90', radius: 0.012, height: 2 * x, 'segments-radial': 8 }, '#9aa0a8');
    },
    // Adds a garment entity (already a child of this entity) at position `index` on the rail. It stays hidden until reveal().
    addGarment: function (el, index) {
      el.object3D.scale.setScalar(0.001);
      this.garments[index] = { el: el, born: -1, x: hangerX(index, this.offset + this.base) };
      el.object3D.position.x = this.garments[index].x;
      this.refreshArrows();
    },
    reveal: function (index) {
      var g = this.garments[index];
      if (g && g.born < 0) g.born = performance.now();
    },
    // Scrolls by `dir` * STEP hangers (the window slides toward the end of the rail).
    flip: function (dir) {
      this.target = clampOffset(this.target + dir * STEP, this.garments.length);
      this.refreshArrows();
    },
    refreshArrows: function () {
      var n = this.garments.length, self = this;
      if (this.data.kind !== 'wall' || n <= WINDOW) return;
      if (!this.arrows.length) {
        [-1, 1].forEach(function (dir) {
          var a = document.createElement('a-entity');
          a.setAttribute('position', (dir * (HALF + 0.2)) + ' ' + ARROW_Y + ' 0.02');
          var cone = document.createElement('a-cone');
          cone.setAttribute('radius-bottom', 0.1);
          cone.setAttribute('radius-top', 0.005);
          cone.setAttribute('height', 0.18);
          cone.setAttribute('segments-radial', 3);
          cone.setAttribute('rotation', '0 0 ' + (dir > 0 ? -90 : 90)); // points along the direction the clothes will slide
          cone.setAttribute('material', { color: '#0071e3', flatShading: true });
          a.appendChild(cone);
          // A roomier click target than the cone itself.
          var hit = document.createElement('a-box');
          hit.setAttribute('width', 0.3); hit.setAttribute('height', 0.3); hit.setAttribute('depth', 0.1);
          hit.setAttribute('material', { opacity: 0, transparent: true });
          a.appendChild(hit);
          // The raycaster only tests meshes on the entity that carries the class, so the class and the handler go on the meshes' entities.
          [cone, hit].forEach(function (m) { m.classList.add('clickable'); m.addEventListener('click', function () { self.flip(dir); }); });
          self.el.appendChild(a);
          self.arrows.push({ el: a, cone: cone, dir: dir });
        });
      }
      // An arrow dims at the end of the rail, where there is nothing more to flip to.
      this.arrows.forEach(function (a) {
        var canGo = a.dir < 0 ? self.target > 0 : self.target < n - WINDOW;
        a.cone.setAttribute('material', { color: '#0071e3', opacity: canGo ? 1 : 0.25, transparent: !canGo, flatShading: true });
      });
    },
    tick: function (time, delta) {
      var k = Math.min(1, delta / 120), now = performance.now(), i, g;
      this.offset += (this.target - this.offset) * k;
      if (Math.abs(this.target - this.offset) < 0.002) this.offset = this.target;
      for (i = 0; i < this.garments.length; i++) {
        g = this.garments[i];
        if (!g) continue;
        g.x = hangerX(i, this.offset + this.base);
        g.el.object3D.position.x = g.x;
        var edge = Math.max(0, (Math.abs(g.x) - HALF + PITCH / 2) / PITCH);    // 0 inside the window, 1 a full pitch outside
        var fade = Math.max(0, 1 - edge);
        var p = g.born < 0 ? 0 : Math.min(1, (now - g.born) / POP_MS);
        var c1 = 1.70158, c3 = c1 + 1;
        var pop = g.born < 0 ? 0 : 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); // easeOutBack
        g.el.object3D.scale.setScalar(Math.max(0.001, fade * pop));
      }
    },
    remove: function () {
      this.arrows.forEach(function (a) { if (a.el.parentNode) a.el.parentNode.removeChild(a.el); });
      this.frame.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
      this.arrows = [];
      this.frame = [];
    }
  });
})();
