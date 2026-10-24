/* Classic script: `desk` component, L-shaped counter plus register. Front faces +z. */
(function () {
  AFRAME.registerComponent('desk', {
    schema: { body: { default: '#fbfbfd' }, top: { default: '#d9bf98' } },
    update: function (old) {
      if (!old || Object.keys(old).length === 0) return; // init already built
      this.clear();
      this.build();
    },
    init: function () {
      this.built = [];
      this.build();
    },
    build: function () {
      var self = this;
      var d = this.data;
      function box(pos, size, color) {
        var e = document.createElement('a-box');
        e.setAttribute('position', pos.join(' '));
        e.setAttribute('width', size[0]);
        e.setAttribute('height', size[1]);
        e.setAttribute('depth', size[2]);
        e.setAttribute('material', { color: color, flatShading: true, roughness: 0.9, metalness: 0 });
        self.el.appendChild(e);
        self.built.push(e);
      }
      box([0, 0.5, 0], [3.2, 1, 0.8], d.body);            // main counter (white front panels)
      box([1.8, 0.5, -0.9], [0.8, 1, 1.8], d.body);       // L return (toward back)
      box([0, 1.02, 0], [3.3, 0.04, 0.9], d.top);        // main top (light oak)
      box([1.8, 1.02, -0.9], [0.9, 0.04, 1.9], d.top);   // return top
      box([0.9, 1.15, 0], [0.4, 0.22, 0.3], '#fbfbfd');      // register body
      box([0.9, 1.35, -0.08], [0.36, 0.2, 0.02], '#1d1d1f'); // register screen (slim, dark)
    },
    clear: function () {
      this.built.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
      this.built = [];
    },
    remove: function () { this.clear(); }
  });
})();
