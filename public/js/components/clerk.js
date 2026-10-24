/* Classic script: `clerk` component. Faces +z. state: idle|listening|thinking|speaking */
(function () {
  var DEG = Math.PI / 180;
  var SPIN_MS = 900;
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
      // Comically tiny top hat, perched at a jaunty angle; parented to the head so it bobs and tilts along.
      var hat = mk('a-entity', { position: '0.06 0.235 0', rotation: '0 0 -14' }, '#111111', this.head);
      mk('a-cylinder', { position: '0 0.006 0', radius: 0.07, height: 0.012, 'segments-radial': 10 }, '#111111', hat);
      mk('a-cylinder', { position: '0 0.055 0', radius: 0.042, height: 0.09, 'segments-radial': 10 }, '#111111', hat);
      mk('a-cylinder', { position: '0 0.022 0', radius: 0.044, height: 0.016, 'segments-radial': 10 }, '#c0392b', hat);
      // Name tag on the chest: a canvas-textured sticker, parented to the body so it leans and spins along.
      var tagCanvas = document.createElement('canvas');
      tagCanvas.width = 256; tagCanvas.height = 128;
      var c = tagCanvas.getContext('2d');
      c.fillStyle = '#fbfbfd'; c.fillRect(0, 0, 256, 128);
      c.fillStyle = '#c0392b'; c.fillRect(0, 0, 256, 38);
      c.fillStyle = '#ffffff'; c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('HELLO, I\u2019M', 128, 20);
      c.fillStyle = '#1d1d1f'; c.font = 'bold 64px sans-serif';
      c.fillText('Bob', 128, 84);
      this.tagTex = new THREE.CanvasTexture(tagCanvas);
      if (THREE.SRGBColorSpace) this.tagTex.colorSpace = THREE.SRGBColorSpace;
      this.tagGeo = new THREE.PlaneGeometry(0.22, 0.11);
      this.tagMat = new THREE.MeshBasicMaterial({ map: this.tagTex, toneMapped: false });
      var tag = new THREE.Mesh(this.tagGeo, this.tagMat);
      tag.position.set(-0.08, 1.15, 0.29);
      this.body.object3D.add(tag);
      // Three lonely hairs, on the hat-free side of the crown (the hat sits at x 0.06).
      [[-0.04, 0, 8], [-0.09, 0.03, 20], [-0.13, -0.02, 30]].forEach(function (h) {
        var y = Math.sqrt(0.24 * 0.24 - h[0] * h[0] - h[1] * h[1]);
        mk('a-cylinder', { position: h[0] + ' ' + (y + 0.035) + ' ' + h[1], rotation: '0 0 ' + h[2], radius: 0.004, height: 0.08, 'segments-radial': 4 }, '#3b2a1a', self.head);
      });
      // One-shot celebratory spin, triggered by emitting `spin` on the clerk entity.
      this.spinFrom = -1;
      this.onSpin = function () { self.spinFrom = 0; };
      this.el.addEventListener('spin', this.onSpin);
    },
    remove: function () {
      this.el.removeEventListener('spin', this.onSpin);
      if (this.tagTex) { this.tagTex.dispose(); this.tagGeo.dispose(); this.tagMat.dispose(); }
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
      // Spin: one full turn with ease-in-out and a small hop, then settle back to facing +z.
      var spinY = 0;
      if (this.spinFrom === 0) this.spinFrom = time;
      if (this.spinFrom > 0) {
        var p = (time - this.spinFrom) / SPIN_MS;
        if (p >= 1) {
          this.spinFrom = -1;
        } else {
          spinY = Math.PI * 2 * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
          bob += Math.sin(p * Math.PI) * 0.12;
        }
      }
      body.position.y = bob;
      body.rotation.y = spinY;
      body.rotation.x = lean;
      head.rotation.z = tiltZ;
      head.rotation.y = turnY;
      jaw.scale.y = jawY;
    }
  });
})();
