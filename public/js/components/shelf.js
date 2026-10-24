/* Classic script: `shelf` component. Front faces local +z. */
(function () {
  AFRAME.registerComponent('shelf', {
    schema: { width: { default: 2 }, rows: { default: 3 }, depth: { default: 0.5 }, rowHeight: { default: 0.6 } },
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
      e.setAttribute('material', { color: color, flatShading: true, roughness: 0.9, metalness: 0 });
      this.el.appendChild(e);
      this.built.push(e);
    },
    build: function () {
      var d = this.data, th = 0.05, ut = 0.03, H = d.rows * d.rowHeight + th;
      this.box([-d.width / 2 + ut / 2, H / 2, 0], [ut, H, d.depth], '#f5f5f7'); // left upright (outer edge stays at -width/2)
      this.box([d.width / 2 - ut / 2, H / 2, 0], [ut, H, d.depth], '#f5f5f7');  // right upright
      // Parts butt against each other instead of overlapping, so no two faces are coplanar and overlapping (z-fighting).
      var inner = d.width - 2 * ut;
      this.box([0, H / 2, -d.depth / 2 + 0.01], [inner, H, 0.02], '#f5f5f7'); // back panel, between the uprights
      for (var i = 0; i <= d.rows; i++) {
        this.box([0, i * d.rowHeight + th / 2, 0.01], [inner, th, d.depth - 0.02], '#d9bf98'); // oak planks, in front of the back panel
      }
    }
  });
})();
