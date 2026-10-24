/* Classic script: `clerk` component. Faces +z. state: idle|listening|thinking|speaking */
(function () {
  var DEG = Math.PI / 180;
  AFRAME.registerComponent('clerk', {
    schema: { state: { default: 'idle', oneOf: ['idle', 'listening', 'thinking', 'speaking'] } },
    init: function () {
      var self = this;
      this.built = [];
      this.nextJaw = 0;
      this.jawScale = 1;
      function mk(tag, attrs, color, parent) {
        var e = document.createElement(tag);
        Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        e.setAttribute('material', { color: color, flatShading: true });
        (parent || self.el).appendChild(e);
        return e;
      }
      this.body = document.createElement('a-entity'); // pivot for lean/bob
      this.el.appendChild(this.body);
      this.built.push(this.body);
      // Capsule body from certain-to-exist primitives: cylinder + two sphere caps (centered at 0.85)
      mk('a-cylinder', { position: '0 0.85 0', radius: 0.28, height: 0.8, 'segments-radial': 8 }, '#3a7bd5', this.body);
      mk('a-sphere', { position: '0 1.25 0', radius: 0.28, 'segments-width': 8, 'segments-height': 6 }, '#3a7bd5', this.body);
      mk('a-sphere', { position: '0 0.45 0', radius: 0.28, 'segments-width': 8, 'segments-height': 6 }, '#3a7bd5', this.body);
      mk('a-box', { position: '-0.4 1.0 0', width: 0.12, height: 0.6, depth: 0.14 }, '#3a7bd5', this.body);
      mk('a-box', { position: '0.4 1.0 0', width: 0.12, height: 0.6, depth: 0.14 }, '#3a7bd5', this.body);
      this.head = document.createElement('a-entity');
      this.head.setAttribute('position', '0 1.75 0');
      this.body.appendChild(this.head);
      mk('a-sphere', { radius: 0.24, 'segments-width': 10, 'segments-height': 8 }, '#f1c9a0', this.head);
      mk('a-box', { position: '-0.08 0.05 0.21', width: 0.05, height: 0.05, depth: 0.03 }, '#222222', this.head);
      mk('a-box', { position: '0.08 0.05 0.21', width: 0.05, height: 0.05, depth: 0.03 }, '#222222', this.head);
      this.jaw = mk('a-box', { class: 'jaw', position: '0 -0.12 0.17', width: 0.16, height: 0.06, depth: 0.05 }, '#7a2f2f', this.head);
    },
    remove: function () {
      this.built.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
      this.built = [];
    },
    tick: function (time) {
      var s = this.data.state, t = time / 1000;
      var head = this.head.object3D, body = this.body.object3D, jaw = this.jaw.object3D;
      var bob = 0, tiltZ = 0, turnY = 0, lean = 0, jawY = 1;
      if (s === 'idle') {
        bob = Math.sin(t * 2) * 0.02;
      } else if (s === 'listening') {
        tiltZ = 15 * DEG; lean = 8 * DEG;
        bob = Math.sin(t * 2) * 0.01;
      } else if (s === 'thinking') {
        turnY = Math.sin(t * 0.8) * 30 * DEG;
      } else if (s === 'speaking') {
        bob = Math.abs(Math.sin(t * 8)) * 0.03;
        if (time >= this.nextJaw) {
          this.jawScale = 0.4 + Math.random() * 2.2;
          this.nextJaw = time + 80 + Math.random() * 80;
        }
        jawY = this.jawScale;
      }
      body.position.y = bob;
      body.rotation.x = lean;
      head.rotation.z = tiltZ;
      head.rotation.y = turnY;
      jaw.scale.y = jawY;
    }
  });
})();
