/* Classic script: `alligator` component. A low-poly alligator that patrols the river, swimming mostly submerged: eyes,
   snout and a ridged back above the water, a tail that sways. It turns at the walls and snaps its jaws when the player
   is close. Walking by makes it swim over and face the player; on a bridge it opens wide and holds up a product in its
   mouth (the `gator-mouth` event asks main.js to fill `mouthEl` with a product-box). The entity sits on the river's centre line at water level; it swims along x.
   Purely visual: the player can never reach the water (see obstaclesFor in maps.js). */
(function () {
  var BELLY = '#8aa35a';
  var SPEED = 0.55;       // metres per second
  var SNAP_RANGE = 3.4;   // the player this close makes it snap
  var WATCH_RANGE = 6.5;  // the player this close makes it stop patrolling, swim over and face them
  var SHOW_MS = 7000;     // how long one product is held up before the next

  function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

  AFRAME.registerComponent('alligator', {
    schema: {
      range: { default: 7 },    // swims between -range and +range along x
      sway: { default: 0.35 },  // how far it wanders across the river (z)
      rig: { type: 'selector', default: '#rig' },
      avoid: { type: 'array', default: [] },       // x of each bridge: it surfaces beside them, where it can be seen, not under the deck
      avoidHalf: { default: 3.5 },                  // how far from a bridge's centre it keeps (clear of the bridge's side walls)
      // For a second gator: its own size and colour, direction and pace, and `slot`, which keeps it a couple of metres from the
      // first when both swim over to the player.
      scale: { default: 1 }, tint: { default: '#3f6b2f' }, startDir: { default: 1 }, speed: { default: 1 }, slot: { default: 0 }
    },
    init: function () {
      this.owned = [];
      this.root = new THREE.Group();            // moves and turns
      this.el.setObject3D('alligator', this.root);
      var tint = new THREE.Color(this.data.tint), darker = tint.clone().multiplyScalar(0.72);
      var mats = {
        green: new THREE.MeshStandardMaterial({ color: tint, roughness: 0.8, flatShading: true }),
        dark: new THREE.MeshStandardMaterial({ color: darker, roughness: 0.9, flatShading: true }),
        belly: new THREE.MeshStandardMaterial({ color: BELLY, roughness: 0.9, flatShading: true }),
        eye: new THREE.MeshStandardMaterial({ color: '#e8c820', emissive: '#a08a10', emissiveIntensity: 0.5, flatShading: true }),
        pupil: new THREE.MeshBasicMaterial({ color: '#111111' }),
        tooth: new THREE.MeshStandardMaterial({ color: '#f4f1e6', flatShading: true })
      };
      var self = this;
      Object.keys(mats).forEach(function (k) { self.owned.push(mats[k]); });
      function mesh(geo, m, x, y, z, parent) {
        var mm = new THREE.Mesh(geo, m);
        mm.position.set(x, y, z);
        (parent || self.root).add(mm);
        self.owned.push(geo);
        return mm;
      }

      // Head (faces +x): skull, a long snout, and a lower jaw that hinges at the back so it can open.
      this.head = new THREE.Group();
      this.head.position.set(0.55, 0, 0);
      this.root.add(this.head);
      mesh(box(0.42, 0.15, 0.34), mats.green, 0, 0.0, 0, this.head);              // skull
      mesh(box(0.42, 0.09, 0.22), mats.green, 0.38, -0.01, 0, this.head);         // snout
      [-1, 1].forEach(function (s) {
        mesh(new THREE.SphereGeometry(0.045, 6, 5), mats.eye, 0.08, 0.1, s * 0.11, self.head);   // eye bumps
        mesh(new THREE.SphereGeometry(0.02, 5, 4), mats.pupil, 0.115, 0.115, s * 0.11, self.head);
        mesh(box(0.025, 0.025, 0.02), mats.dark, 0.54, 0.04, s * 0.06, self.head);             // nostrils
      });
      // The jaw is a child group pivoting at its back end (x = -0.15 relative to the jaw's own origin).
      this.jaw = new THREE.Group();
      this.jaw.position.set(-0.18, -0.08, 0);
      this.head.add(this.jaw);
      mesh(box(0.8, 0.045, 0.28), mats.belly, 0.4, 0, 0, this.jaw);
      for (var i = 0; i < 6; i++) {                                                // teeth along both rims
        [-1, 1].forEach(function (s) { mesh(box(0.025, 0.04, 0.02), mats.tooth, 0.2 + i * 0.1, 0.04, s * 0.115, self.jaw); });
      }

      // Body and tail: segments that trail behind the head, each swaying a little later than the one before.
      this.segs = [];
      var dims = [[0.5, 0.17, 0.44], [0.38, 0.16, 0.44], [0.36, 0.15, 0.38], [0.34, 0.13, 0.3], [0.32, 0.11, 0.24], [0.3, 0.09, 0.18], [0.28, 0.07, 0.12], [0.26, 0.05, 0.08]];
      var x = 0.3;
      dims.forEach(function (d, k) {
        var g = new THREE.Group();
        x -= d[0] / 2 + (k ? 0.01 : 0);
        g.position.set(x, 0, 0);
        self.root.add(g);
        mesh(box(d[0], d[1], d[2]), mats.green, 0, 0, 0, g);
        // A row of bony ridges along the back (the scutes).
        [-1, 1].forEach(function (s) { if (k < 6) mesh(box(d[0] * 0.5, 0.04, 0.05), mats.dark, 0, d[1] / 2 + 0.015, s * d[2] * 0.2, g); });
        self.segs.push({ g: g, x0: x, k: k });
        x -= d[0] / 2;
      });
      this.owned.push(mats.green);
      // The product it holds up: main.js puts a product-box on this entity; the component floats it above the open jaws.
      this.mouthEl = document.createElement('a-entity');
      this.el.appendChild(this.mouthEl);
      this.mouthEl.object3D.scale.setScalar(0.001);
      this.showing = false;
      this.showAt = 0;
      this.lift = 0;          // 0..1: how far the head is raised
      this.vec = new THREE.Vector3();
      this.t = this.data.slot * 2.1; // out of step with the other gator's sway and bob
      this.dir = this.data.startDir;   // 1 = swimming toward +x
      this.yaw = this.dir > 0 ? 0 : Math.PI; // current heading (0 faces +x, PI faces -x)
      this.x = -this.dir * this.data.range;
      this.root.scale.setScalar(this.data.scale);
      this.root.position.x = this.x;
    },
    tick: function (time, delta) {
      var d = this.data, dt = Math.min(delta, 60) / 1000;
      this.t += dt;
      var C = window.StoreCollide, rig = d.rig;
      var px = 0, pz = 0, dist = 1e9, onBridge = false;
      var base = this.el.object3D.position;
      if (rig) {
        var p = rig.object3D.position;
        px = p.x; pz = p.z;
        var dxp = px - (base.x + this.root.position.x), dzp = pz - (base.z + this.root.position.z);
        dist = Math.sqrt(dxp * dxp + dzp * dzp);
        onBridge = !!(C && C.heightAt && C.heightAt(px, pz) > 0.25); // up on an arch
      }
      var watching = onBridge || dist < WATCH_RANGE;

      if (watching) {
        // Swim over to the player's side of the river (a little faster than patrolling) and face them.
        var tx = px;
        for (var bi = 0; bi < d.avoid.length; bi++) {
          var bx = Number(d.avoid[bi]);
          if (Math.abs(tx - bx) < d.avoidHalf) tx = bx + (bx < 0 ? 1 : -1) * d.avoidHalf; // toward the middle of the hall, in open water
        }
        tx += d.slot * (tx < 0 ? 2.6 : -2.6); // the second gator keeps a couple of metres from the first
        tx = Math.max(-d.range, Math.min(d.range, tx));
        var gap = tx - this.x;
        if (Math.abs(gap) > 0.25) this.x += Math.sign(gap) * Math.min(Math.abs(gap), SPEED * 1.6 * d.speed * dt);
        var fdx = px - (base.x + this.root.position.x), fdz = pz - (base.z + this.root.position.z);
        if (fdx * fdx + fdz * fdz > 0.2) this.faceYaw = Math.atan2(-fdz, fdx); // facing +x is 0, and rotation.y turns +x toward -z
      } else {
        // Patrol along the river and turn around at each end.
        this.x += this.dir * SPEED * d.speed * dt;
        if (this.x > d.range) { this.x = d.range; this.dir = -1; }
        else if (this.x < -d.range) { this.x = -d.range; this.dir = 1; }
      }
      var wantYaw = watching && this.faceYaw !== undefined ? this.faceYaw : (this.dir > 0 ? 0 : Math.PI);
      var diff = Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw));
      this.yaw += diff * Math.min(1, dt * (watching ? 4 : 2.5));
      this.root.rotation.y = this.yaw;
      this.root.position.x = this.x;
      this.root.position.z = Math.sin(this.t * 0.45) * d.sway;
      this.root.position.y = Math.sin(this.t * 1.6) * 0.012 - 0.01 + 0.05 * this.lift; // gentle bob, riding low; higher when showing off

      // The tail sways in a travelling wave; the head follows the front of it.
      var ph = this.t * 3.2;
      this.segs.forEach(function (s) {
        var amp = 0.02 + s.k * 0.028;
        s.g.position.z = Math.sin(ph - s.k * 0.8) * amp;
        s.g.rotation.y = Math.cos(ph - s.k * 0.8) * 0.18 * (0.3 + s.k * 0.12);
      });
      this.head.rotation.y = watching ? 0 : Math.sin(ph + 0.8) * 0.08;

      // Jaws: closed while patrolling, snapping when the player is near, wide open (and head raised) on a bridge.
      var near = dist < SNAP_RANGE;
      var open = onBridge ? 0.7 : near ? 0.35 + 0.3 * Math.max(0, Math.sin(this.t * 7)) : 0.04 + 0.03 * Math.sin(this.t * 1.1);
      this.lift += ((onBridge ? 1 : 0) - this.lift) * Math.min(1, dt * 4);
      this.jaw.rotation.z = -open;
      this.head.rotation.z = 0.03 + (near ? 0.15 : 0) + 0.3 * this.lift;

      // Holding a product: ask main.js for one when the player steps onto the bridge, and for the next every few seconds.
      var now = performance.now();
      if (onBridge && (!this.showing || now - this.showAt > SHOW_MS)) {
        this.showing = true;
        this.showAt = now;
        this.el.emit('gator-mouth', { open: true });
      } else if (!onBridge && this.showing) {
        this.showing = false;
        this.el.emit('gator-mouth', { open: false });
      }
      var m = this.mouthEl.object3D;
      var k = m.scale.x + ((this.showing ? 1 : 0.001) - m.scale.x) * Math.min(1, dt * 7);
      m.scale.setScalar(Math.max(0.001, k));
      if (k > 0.01) {
        // Just above the open jaws, turned to face the player.
        this.vec.set(0.25, 0.62, 0);
        this.head.localToWorld(this.vec);
        this.el.object3D.worldToLocal(this.vec);
        m.position.set(this.vec.x, this.vec.y + 0.05 * Math.sin(this.t * 2.2), this.vec.z);
        m.rotation.y = Math.atan2(px - (base.x + this.vec.x), pz - (base.z + this.vec.z));
      }
    },
    remove: function () {
      this.owned.forEach(function (o) { if (o.dispose) o.dispose(); });
      this.el.removeObject3D('alligator');
    }
  });
})();
