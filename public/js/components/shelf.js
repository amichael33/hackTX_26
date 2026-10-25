/* Classic script: `shelf` component. Front faces local +z. `style` picks the look; every style has the same footprint
   (width x depth), the same plank tops (rowHeight apart) and the same open front, so product slots do not change. */
(function () {
  AFRAME.registerComponent('shelf', {
    schema: {
      width: { default: 2 }, rows: { default: 3 }, depth: { default: 0.5 }, rowHeight: { default: 0.6 },
      style: { default: 'oak', oneOf: ['oak', 'cubby', 'rack', 'timber', 'rail'] }
    },
    init: function () { this.built = []; this.build(); },
    update: function (old) {
      if (!old || Object.keys(old).length === 0) return;
      this.clear();
      this.build();
    },
    remove: function () { this.clear(); },
    clear: function () {
      this.built.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
      this.built = [];
    },
    box: function (pos, size, color) {
      var e = document.createElement('a-box');
      e.setAttribute('position', pos.join(' '));
      e.setAttribute('width', size[0]);
      e.setAttribute('height', size[1]);
      e.setAttribute('depth', size[2]);
      e.setAttribute('material', typeof color === 'object' ? color : { color: color, flatShading: true, roughness: 0.9, metalness: 0 });
      this.el.appendChild(e);
      this.built.push(e);
    },
    // Parts butt against each other instead of overlapping, so no two faces are coplanar and overlapping (z-fighting).
    build: function () {
      var d = this.data;
      var th = 0.05, H = d.rows * d.rowHeight + th, i;
      var self = this;
      var plank = function (inner, color, depth, z) {
        for (i = 0; i <= d.rows; i++) self.box([0, i * d.rowHeight + th / 2, z], [inner, th, depth], color);
      };
      var ut, inner;
      if (d.style === 'cubby') {
        // White unit with a colored back and a divider in every row: two cubbies side by side.
        ut = 0.03; inner = d.width - 2 * ut;
        this.box([-d.width / 2 + ut / 2, H / 2, 0], [ut, H, d.depth], '#f5f5f7');
        this.box([d.width / 2 - ut / 2, H / 2, 0], [ut, H, d.depth], '#f5f5f7');
        this.box([0, H / 2, -d.depth / 2 + 0.01], [inner, H, 0.02], '#e8b4a0');
        plank(inner, '#f1ece4', d.depth - 0.02, 0.01);
        for (i = 0; i < d.rows; i++) this.box([0, i * d.rowHeight + th + (d.rowHeight - th) / 2, 0.01], [0.03, d.rowHeight - th, d.depth - 0.02], '#f5f5f7');
      } else if (d.style === 'rack') {
        // Open steel rack: four corner posts, thin steel decks and an orange front beam under each deck. No back.
        var p = 0.04;
        inner = d.width - 2 * p;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
          self.box([c[0] * (d.width / 2 - p / 2), H / 2, c[1] * (d.depth / 2 - p / 2)], [p, H, p], '#4a4f57');
        });
        plank(inner, '#a3a9b1', d.depth - 2 * p, 0);
        for (i = 1; i <= d.rows; i++) this.box([0, i * d.rowHeight - 0.03, d.depth / 2 - 0.015 + 0.002], [inner, 0.06, 0.03], '#e8742a');
      } else if (d.style === 'rail') {
        // Clothing rail: two steel posts, a hanging bar at hanger height and feet. Garments hang from the bar (clothes-rail).
        var rp = 0.03, barY = 1.66;
        [-1, 1].forEach(function (sx) {
          self.box([sx * (d.width / 2 - 0.05), 0.87, 0], [rp, 1.74, rp], '#555a60');            // post
          self.box([sx * (d.width / 2 - 0.05), 0.015, 0], [0.1, 0.03, d.depth - 0.1], '#3d4146'); // foot
        });
        var bar = document.createElement('a-cylinder');
        bar.setAttribute('position', '0 ' + barY + ' 0');
        bar.setAttribute('rotation', '0 0 90');
        bar.setAttribute('radius', 0.012);
        bar.setAttribute('height', d.width - 0.1 - rp);
        bar.setAttribute('segments-radial', 8);
        bar.setAttribute('material', { color: '#9aa0a8', flatShading: true, roughness: 0.5, metalness: 0.4 });
        this.el.appendChild(bar);
        this.built.push(bar);
      } else if (d.style === 'timber') {
        // Rustic timber frame: heavy dark posts, thick planks, a top lintel and a plank back.
        var tp = 0.08;
        inner = d.width - 2 * tp;
        // Real wood: dark grain on the posts and lintel, planks with seams on the back, mid-brown grain on the boards.
        var W = window.StoreWood, wood = function (kind, rx, ry) { return W ? W.material(kind, rx, ry) : null; };
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
          self.box([c[0] * (d.width / 2 - tp / 2), H / 2, c[1] * (d.depth / 2 - tp / 2)], [tp, H, tp], wood('beam') || '#4f3320');
        });
        this.box([0, H / 2, -d.depth / 2 + 0.01], [inner, H, 0.02], wood('plankDark', 6, 1) || '#6a4a2c');
        plank(inner, wood('grain') || '#8a6a45', d.depth - 0.02, 0.01);
        this.box([0, H + 0.04, 0], [d.width, 0.08, d.depth], wood('beam') || '#4f3320'); // lintel
      } else {
        // oak (default): white uprights and back, light oak planks.
        ut = 0.03; inner = d.width - 2 * ut;
        this.box([-d.width / 2 + ut / 2, H / 2, 0], [ut, H, d.depth], '#f5f5f7'); // left upright (outer edge stays at -width/2)
        this.box([d.width / 2 - ut / 2, H / 2, 0], [ut, H, d.depth], '#f5f5f7');  // right upright
        this.box([0, H / 2, -d.depth / 2 + 0.01], [inner, H, 0.02], '#f5f5f7');   // back panel, between the uprights
        plank(inner, '#d9bf98', d.depth - 0.02, 0.01);                              // oak planks, in front of the back panel
      }
    }
  });
})();
