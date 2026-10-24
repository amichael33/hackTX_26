/* Classic script: `desk` component, L-shaped counter plus register. Front faces +z. */
(function () {
  AFRAME.registerComponent('desk', {
    init: function () {
      var self = this;
      this.built = [];
      function box(pos, size, color) {
        var e = document.createElement('a-box');
        e.setAttribute('position', pos.join(' '));
        e.setAttribute('width', size[0]);
        e.setAttribute('height', size[1]);
        e.setAttribute('depth', size[2]);
        e.setAttribute('material', { color: color, flatShading: true });
        self.el.appendChild(e);
        self.built.push(e);
      }
      box([0, 0.5, 0], [3.2, 1, 0.8], '#8a5a3c');            // main counter
      box([1.8, 0.5, -0.9], [0.8, 1, 1.8], '#8a5a3c');       // L return (toward back)
      box([0, 1.02, 0], [3.3, 0.04, 0.9], '#c9a27a');        // main top
      box([1.8, 1.02, -0.9], [0.9, 0.04, 1.9], '#c9a27a');   // return top
      box([0.9, 1.15, 0], [0.4, 0.22, 0.3], '#3d4146');      // register body
      box([0.9, 1.35, -0.08], [0.36, 0.2, 0.04], '#1f2326'); // register screen
    },
    remove: function () {
      this.built.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
      this.built = [];
    }
  });
})();
