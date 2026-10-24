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
      e.setAttribute('material', { color: color, flatShading: true });
      this.el.appendChild(e);
      this.built.push(e);
    },
    build: function () {
      var d = this.data, th = 0.05, H = d.rows * d.rowHeight + th;
      this.box([-d.width / 2 + th / 2, H / 2, 0], [th, H, d.depth], '#6b4a2f'); // left upright
      this.box([d.width / 2 - th / 2, H / 2, 0], [th, H, d.depth], '#6b4a2f');  // right upright
      this.box([0, H / 2, -d.depth / 2 + 0.01], [d.width, H, 0.02], '#8a6240'); // back panel
      for (var i = 0; i <= d.rows; i++) {
        this.box([0, i * d.rowHeight + th / 2, 0], [d.width, th, d.depth], '#a67b50'); // planks
      }
    }
  });
})();
