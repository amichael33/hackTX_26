/* Classic script: `clerk` component. Faces +z. state: idle|listening|thinking|speaking */
(function () {
  var DEG = Math.PI / 180;
  var SPIN_MS = 900;
  AFRAME.registerComponent('clerk', {
    schema: {
      state: { default: 'idle', oneOf: ['idle', 'listening', 'thinking', 'speaking'] },
      outfit: { default: 'suit', oneOf: ['suit', 'apron', 'hivis', 'tabard'] } // clothes and headwear, chosen by the map
    },
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
      this.shirt = [ // body and sleeves; dress() recolors them for outfits that bring their own shirt
        mk('a-cylinder', { position: '0 0.85 0', radius: 0.28, height: 0.8, 'segments-radial': 8 }, '#3a7bd5', this.body),
        mk('a-sphere', { position: '0 1.25 0', radius: 0.28, 'segments-width': 8, 'segments-height': 6 }, '#3a7bd5', this.body),
        mk('a-sphere', { position: '0 0.45 0', radius: 0.28, 'segments-width': 8, 'segments-height': 6 }, '#3a7bd5', this.body),
        mk('a-box', { position: '-0.4 1.0 0', width: 0.12, height: 0.6, depth: 0.14 }, '#3a7bd5', this.body),
        mk('a-box', { position: '0.4 1.0 0', width: 0.12, height: 0.6, depth: 0.14 }, '#3a7bd5', this.body)
      ];
      this.head = document.createElement('a-entity');
      this.head.setAttribute('position', '0 1.75 0');
      this.body.appendChild(this.head);
      mk('a-sphere', { radius: 0.24, 'segments-width': 10, 'segments-height': 8 }, '#f1c9a0', this.head);
      mk('a-box', { position: '-0.08 0.05 0.21', width: 0.05, height: 0.05, depth: 0.03 }, '#222222', this.head);
      mk('a-box', { position: '0.08 0.05 0.21', width: 0.05, height: 0.05, depth: 0.03 }, '#222222', this.head);
      this.jaw = mk('a-box', { class: 'jaw', position: '0 -0.12 0.17', width: 0.16, height: 0.06, depth: 0.05 }, '#7a2f2f', this.head);
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
      this.tag = tag;
      this.body.object3D.add(tag);
      // Three lonely hairs, on the hat-free side of the crown (the hat sits at x 0.06).
      this.hairs = [];
      [[-0.04, 0], [-0.09, 0.03], [-0.13, -0.02]].forEach(function (h) {
        var y = Math.sqrt(0.24 * 0.24 - h[0] * h[0] - h[1] * h[1]);
        self.hairs.push(mk('a-cylinder', { position: h[0] + ' ' + (y + 0.035) + ' ' + h[1], radius: 0.004, height: 0.08, 'segments-radial': 4 }, '#3b2a1a', self.head));
      });
      this.mk = mk;
      this.clothes = [];
      this.dress();
      // One-shot celebratory spin, triggered by emitting `spin` on the clerk entity.
      this.spinFrom = -1;
      this.onSpin = function () { self.spinFrom = 0; };
      this.el.addEventListener('spin', this.onSpin);
    },
    update: function (old) {
      if (old && old.outfit !== undefined && old.outfit !== this.data.outfit) this.dress();
    },
    // Clothes and headwear for the chosen outfit. Only the torso above the counter, the neck and the head are visible.
    dress: function () {
      var self = this, mk = this.mk, o = this.data.outfit;
      this.clothes.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
      this.clothes = [];
      var add = function (e) { self.clothes.push(e); return e; };
      // A vest-like wrap around the torso with a gap at the front, so the shirt (and tie) shows through.
      var wrap = function (y, h, color, r) {
        var e = add(mk('a-cylinder', { position: '0 ' + y + ' 0', radius: r || 0.295, height: h, 'segments-radial': 8, 'open-ended': true, 'theta-start': 30, 'theta-length': 300 }, color, self.body));
        e.setAttribute('material', { color: color, flatShading: true, side: 'double' });
        return e;
      };
      var hat = function (pos, rot) { return add(mk('a-entity', { position: pos, rotation: rot || '0 0 0' }, '#111111', self.head)); };
      this.tag.position.set(-0.08, 1.15, 0.29);
      this.hairs.forEach(function (h) { h.setAttribute('visible', 'true'); });
      // The suit brings its own white shirt (red and white outfit); the others wear the blue one.
      var shirt = o === 'suit' ? '#f4f4f6' : '#3a7bd5';
      this.shirt.forEach(function (e) { e.setAttribute('material', { color: shirt, flatShading: true }); });
      // A curved panel on the front of the body (an apron): `deg` degrees centred on +z, so it hugs the torso instead of floating flat.
      var panel = function (y, h, r, deg, color) {
        var e = add(mk('a-cylinder', { position: '0 ' + y + ' 0', radius: r, height: h, 'segments-radial': 10, 'open-ended': true, 'theta-start': -deg / 2, 'theta-length': deg }, color, self.body));
        e.setAttribute('material', { color: color, flatShading: true, side: 'double' });
        return e;
      };

      if (o === 'suit' || o === 'apron') {
        add(mk('a-cylinder', { position: '0 1.42 0', radius: 0.235, height: 0.06, 'segments-radial': 8 }, '#ffffff', this.body)); // collar
      }
      if (o === 'suit') {
        wrap(1.15, 0.3, '#c0392b');                                                                                    // red vest over the white shirt
        // Red and white striped scarf: twelve 30-degree arcs round the neck, and a tail hanging down the front.
        for (var s = 0; s < 12; s++) {
          var seg = add(mk('a-entity', { position: '0 1.4 0', rotation: '0 ' + s * 30 + ' 0' }, '#ffffff', this.body));
          mk('a-torus', { radius: 0.255, 'radius-tubular': 0.05, arc: 30, rotation: '90 0 0', 'segments-tubular': 3, 'segments-radial': 5 }, s % 2 ? '#f4f4f6' : '#c0392b', seg);
        }
        [0, 1, 2].forEach(function (k) {
          add(mk('a-box', { position: '0.13 ' + (1.31 - k * 0.1).toFixed(2) + ' 0.3', width: 0.09, height: 0.1, depth: 0.03 }, k % 2 ? '#f4f4f6' : '#c0392b', self.body));
        });
        // Comically tiny top hat, perched at a jaunty angle (red with a white band).
        var th = hat('0.06 0.235 0', '0 0 -14');
        mk('a-cylinder', { position: '0 0.006 0', radius: 0.07, height: 0.012, 'segments-radial': 10 }, '#c0392b', th);
        mk('a-cylinder', { position: '0 0.055 0', radius: 0.042, height: 0.09, 'segments-radial': 10 }, '#c0392b', th);
        mk('a-cylinder', { position: '0 0.022 0', radius: 0.044, height: 0.016, 'segments-radial': 10 }, '#f4f4f6', th);
      } else if (o === 'apron') {
        // A bib apron: skirt and bib curve round the torso, a waist band wraps all the way round, straps go up over the neck.
        panel(0.93, 0.34, 0.305, 150, '#f3e9d8');                                                                           // skirt
        panel(1.255, 0.25, 0.298, 60, '#f3e9d8');                                                                           // bib
        add(mk('a-cylinder', { position: '0 1.12 0', radius: 0.312, height: 0.07, 'segments-radial': 10, 'open-ended': true }, '#c98b5b', this.body)); // waist band (closed ring)
        [-1, 1].forEach(function (s) {
          add(mk('a-box', { position: (s * 0.11) + ' 1.41 0.19', width: 0.03, height: 0.015, depth: 0.19, rotation: '18 0 0' }, '#c98b5b', self.body)); // neck straps
        });
        add(mk('a-box', { position: '0.09 0.95 0.297', width: 0.12, height: 0.1, depth: 0.012, rotation: '0 17 0' }, '#c98b5b', this.body)); // pocket
        this.tag.position.set(0, 1.27, 0.305);                                                                              // name tag pinned to the bib
        var bl = add(mk('a-box', { position: '-0.06 1.4 0.255', width: 0.08, height: 0.05, depth: 0.03, rotation: '0 0 18' }, '#c0392b', this.body));
        var br = add(mk('a-box', { position: '0.06 1.4 0.255', width: 0.08, height: 0.05, depth: 0.03, rotation: '0 0 -18' }, '#c0392b', this.body));
        add(mk('a-box', { position: '0 1.4 0.268', width: 0.035, height: 0.04, depth: 0.035 }, '#8e2a20', this.body));       // bow tie
        var th2 = hat('0.06 0.235 0', '0 0 -14');
        mk('a-cylinder', { position: '0 0.006 0', radius: 0.07, height: 0.012, 'segments-radial': 10 }, '#111111', th2);
        mk('a-cylinder', { position: '0 0.055 0', radius: 0.042, height: 0.09, 'segments-radial': 10 }, '#111111', th2);
        mk('a-cylinder', { position: '0 0.022 0', radius: 0.044, height: 0.016, 'segments-radial': 10 }, '#c98b5b', th2);
      } else if (o === 'hivis') {
        wrap(1.15, 0.32, '#ff7a1a');                                                                                       // hi-vis vest
        [1.08, 1.22].forEach(function (y) { wrap(y, 0.04, '#d9dde2', 0.299); });                                           // reflective stripes
        var dome = hat('0 0.02 0');                                                                                         // hard hat
        mk('a-sphere', { radius: 0.27, 'theta-length': 90, 'segments-width': 10, 'segments-height': 5 }, '#f2c200', dome);
        mk('a-cylinder', { position: '0 0.005 0.04', radius: 0.31, height: 0.02, 'segments-radial': 12 }, '#f2c200', dome);
        this.hairs.forEach(function (h) { h.setAttribute('visible', 'false'); });
      } else if (o === 'tabard') {
        wrap(1.1, 0.42, '#7a1f2b');                                                                                         // burgundy tabard
        wrap(0.91, 0.04, '#d4af37', 0.3);                                                                                   // gold hem
        var chain = add(mk('a-torus', { position: '0 1.43 0.02', radius: 0.21, 'radius-tubular': 0.012, rotation: '90 0 0', 'segments-tubular': 12, 'segments-radial': 5 }, '#d4af37', this.body));
        var crown = hat('0 0.2 0');
        mk('a-cylinder', { radius: 0.12, height: 0.1, 'segments-radial': 10, 'open-ended': true }, '#d4af37', crown).setAttribute('material', { color: '#d4af37', flatShading: true, side: 'double', metalness: 0.4, roughness: 0.4 });
        for (var i = 0; i < 5; i++) {
          var a = i * Math.PI * 2 / 5;
          mk('a-cone', { position: (Math.sin(a) * 0.1).toFixed(3) + ' 0.09 ' + (Math.cos(a) * 0.1).toFixed(3), 'radius-bottom': 0.03, 'radius-top': 0.002, height: 0.09, 'segments-radial': 4 }, '#d4af37', crown);
        }
        this.hairs.forEach(function (h) { h.setAttribute('visible', 'false'); });
      }
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
