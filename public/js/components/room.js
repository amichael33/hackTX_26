/* Classic script: registers the `room` A-Frame component (floor, walls, ceiling). */
(function () {
  AFRAME.registerComponent('room', {
    schema: { width: { default: 16 }, depth: { default: 20 }, height: { default: 4 } },
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
      var d = this.data, t = 0.2, hw = d.width / 2, hd = d.depth / 2, h = d.height;
      this.box([0, -t / 2, 0], [d.width, t, d.depth], '#b08a5e');            // floor
      this.box([0, h + t / 2, 0], [d.width, t, d.depth], '#f2efe6');         // ceiling
      this.box([0, h / 2, -hd - t / 2], [d.width + 2 * t, h, t], '#7fb7be'); // back
      this.box([0, h / 2, hd + t / 2], [d.width + 2 * t, h, t], '#7fb7be');  // front
      this.box([-hw - t / 2, h / 2, 0], [t, h, d], '#e8c27a');               // left
      this.box([hw + t / 2, h / 2, 0], [t, h, d], '#e8c27a');                // right
    }
  });
})();
