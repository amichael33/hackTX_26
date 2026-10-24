/* Classic script: `shopping-cart` component. A low-poly cart that rolls 0.9 m ahead of the rig (yaw only, never
   pitch) and shows the saved items as little cubes with their thumbnail on top. Fed by the scene's
   `cart-changed` event ({ items }). Not clickable. */
(function () {
  var SCALE = 1.3;          // the whole cart (and its items) is drawn this much larger
  var AHEAD = 0.9 * SCALE;  // metres in front of the rig
  var BASKET_BOTTOM = 0.45; // local y of the basket underside
  var POP_MS = 250;
  var CART_RADIUS = 0.28 * SCALE;
  var STEPS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.35].map(function (d) { return d * SCALE; });
  var CUBE = 0.12;
  var COLS = 4, ROWS = 3;
  var PITCH_X = 0.13, PITCH_Z = 0.13;
  var TOP_Y = BASKET_BOTTOM + 0.02 + CUBE / 2; // cube centre: sits on the 0.02 thick basket floor

  // Shared by every cart / item (never disposed; they live for the page).
  var cartGeo = {};
  var mats = {};
  var cubeGeo = null, topGeo = null, frontGeo = null, cubeMat = null;

  function box(w, h, d) {
    var k = w + 'x' + h + 'x' + d;
    return cartGeo[k] || (cartGeo[k] = new THREE.BoxGeometry(w, h, d));
  }
  function mat(color) {
    return mats[color] || (mats[color] = new THREE.MeshStandardMaterial({ color: color, flatShading: true }));
  }
  function shared() {
    if (cubeGeo) return;
    cubeGeo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
    topGeo = new THREE.PlaneGeometry(CUBE * 0.9, CUBE * 0.9);
    topGeo.rotateX(-Math.PI / 2); // face up
    frontGeo = new THREE.PlaneGeometry(CUBE * 0.9, CUBE * 0.9); // faces +z, toward the player
    cubeMat = new THREE.MeshStandardMaterial({ color: '#fbfbfd', flatShading: true });
  }

  AFRAME.registerComponent('shopping-cart', {
    schema: {
      rig: { type: 'selector', default: '#rig' },
      max: { type: 'number', default: 12 },
      enabled: { type: 'boolean', default: false } // phase visibility, set by main.js applyState
    },
    init: function () {
      var self = this;
      shared();
      this.buildId = 0;         // bumps on every rebuild/remove so stale texture callbacks are dropped
      this.prevIds = {};        // id -> true for the previous render
      this.itemMats = [];       // per-item top materials (owned here, disposed on rebuild)
      this.popping = [];        // { group, t } entries animating 0 -> 1
      this.items = new THREE.Group();
      this.buildModel();
      this.blocked = false; // true while no clear spot ahead of the player exists
      this.el.object3D.visible = false; // main.js enables it in BROWSING
      this.onCart = function (e) { self.setItems((e.detail && e.detail.items) || []); };
      this.el.sceneEl.addEventListener('cart-changed', this.onCart);
    },
    // A wire-style basket: corner posts, rails and thin vertical bars you can see items through, a blue plastic rim and
    // handle grip, a chrome frame and four wheels. Parts butt against each other (no overlapping coplanar faces).
    buildModel: function () {
      var g = new THREE.Group();
      var chrome = mat('#c7c7cc'), dark = mat('#1d1d1f'), blue = mat('#0071e3'), floorMat = mat('#9a9aa0');
      var W = 0.55, H = 0.35, D = 0.4, T = 0.02, B = BASKET_BOTTOM;
      var P = 0.014, R = 0.012, V = 0.01, RIM = 0.02; // post, rail, vertical-bar and rim thickness
      function add(geo, m, x, y, z) {
        var mesh = new THREE.Mesh(geo, m);
        mesh.position.set(x, y, z);
        g.add(mesh);
        return mesh;
      }
      add(box(W, T, D), floorMat, 0, B + T / 2, 0);
      var xs = [-W / 2, W / 2], zs = [-D / 2, D / 2];
      // Corner posts up to just under the rim.
      xs.forEach(function (x) { zs.forEach(function (z) { add(box(P, H - RIM / 2, P), chrome, x, B + (H - RIM / 2) / 2, z); }); });
      // Rim (plastic): the long sides run the full depth, the front and back butt between them.
      xs.forEach(function (x) { add(box(RIM, RIM, D + RIM), blue, x, B + H, 0); });
      zs.forEach(function (z) { add(box(W - RIM, RIM, RIM), blue, 0, B + H, z); });
      // Two rails per wall, between the posts.
      [B + H * 0.35, B + H * 0.7].forEach(function (y) {
        zs.forEach(function (z) { add(box(W - P, R, R), chrome, 0, y, z); });
        xs.forEach(function (x) { add(box(R, R, D - P), chrome, x, y, 0); });
      });
      // Thin vertical bars between the rails, narrower than the rails so they never share a face with them.
      var barH = H - RIM / 2 - 0.02;
      [-0.2, -0.1, 0, 0.1, 0.2].forEach(function (x) { zs.forEach(function (z) { add(box(V, barH, V), chrome, x, B + T + barH / 2, z); }); });
      [-0.1, 0, 0.1].forEach(function (z) { xs.forEach(function (x) { add(box(V, barH, V), chrome, x, B + T + barH / 2, z); }); });
      // Handle on the +z side (faces the player): two posts down to the frame and a blue grip.
      add(box(0.03, 0.3, 0.03), chrome, -0.22, B + H - 0.02, D / 2 + 0.04);
      add(box(0.03, 0.3, 0.03), chrome, 0.22, B + H - 0.02, D / 2 + 0.04);
      add(box(0.5, 0.035, 0.035), blue, 0, B + H + 0.14, D / 2 + 0.04);
      // Frame under the basket, legs and wheels (radius 0.1 so they touch y 0).
      var wheelGeo = cartGeo.wheel || (cartGeo.wheel = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8));
      var legGeo = box(0.03, B - 0.1, 0.03);
      for (var sx = -1; sx <= 1; sx += 2) {
        for (var sz = -1; sz <= 1; sz += 2) {
          var w = add(wheelGeo, dark, sx * 0.22, 0.1, sz * 0.15);
          w.rotation.z = Math.PI / 2;
          add(legGeo, chrome, sx * 0.22, 0.1 + (B - 0.1) / 2, sz * 0.15);
        }
      }
      g.add(this.items);
      g.scale.setScalar(SCALE);
      this.el.setObject3D('cart', g);
    },
    update: function () {
      this.el.object3D.visible = this.data.enabled && !this.blocked;
    },
    setItems: function (list) {
      this.clearItems();
      var buildId = this.buildId;
      var n = Math.min(this.data.max, COLS * ROWS, list.length);
      var nowIds = {};
      for (var i = 0; i < n; i++) {
        var it = list[i];
        nowIds[it.id] = true;
        var col = i % COLS, row = Math.floor(i / COLS);
        var group = new THREE.Group();
        group.position.set(
          (col - (COLS - 1) / 2) * PITCH_X,
          TOP_Y,
          ((ROWS - 1) / 2 - row) * PITCH_Z // row 0 nearest the handle (+z)
        );
        group.add(new THREE.Mesh(cubeGeo, cubeMat));
        var topMat = new THREE.MeshBasicMaterial({ color: '#fbfbfd' });
        var top = new THREE.Mesh(topGeo, topMat);
        top.position.y = CUBE / 2 + 0.002;
        group.add(top);
        var front = new THREE.Mesh(frontGeo, topMat);
        front.position.z = CUBE / 2 + 0.002;
        group.add(front);
        this.itemMats.push(topMat);
        if (it.thumbnail) this.loadThumb(topMat, it.thumbnail, buildId);
        if (!this.prevIds[it.id]) {
          group.scale.setScalar(0.001);
          this.popping.push({ group: group, t: 0 });
        }
        this.items.add(group);
      }
      this.prevIds = nowIds;
    },
    loadThumb: function (topMat, thumb, buildId) {
      var self = this;
      var loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load('/api/img?u=' + encodeURIComponent(thumb), function (tex) {
        if (self.buildId !== buildId) { tex.dispose(); return; } // rebuilt or removed while loading
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        topMat.map = tex;
        topMat.needsUpdate = true;
      }, undefined, function () { /* stay white */ });
    },
    clearItems: function () {
      this.buildId++;
      for (var i = 0; i < this.itemMats.length; i++) {
        var m = this.itemMats[i];
        if (m.map) m.map.dispose();
        m.dispose();
      }
      this.itemMats.length = 0;
      this.popping.length = 0;
      while (this.items.children.length) this.items.remove(this.items.children[0]);
    },
    tick: function (time, delta) {
      var o = this.el.object3D;
      if (!this.data.enabled) { o.visible = false; return; }
      var rig = this.data.rig;
      if (rig) {
        var r = rig.object3D, yaw = r.rotation.y;
        var sx = -Math.sin(yaw), sz = -Math.cos(yaw);
        var C = window.StoreCollide;
        var d = AHEAD, found = !C || !C.circleClear;
        if (!found) {
          // Pull the cart back toward the player until its footprint is clear of fixtures and walls.
          for (var step = 0; step < STEPS.length; step++) {
            d = STEPS[step];
            if (C.circleClear(r.position.x + sx * d, r.position.z + sz * d, CART_RADIUS)) { found = true; break; }
          }
        }
        this.blocked = !found;
        o.visible = found;
        if (!found) return;
        o.position.set(r.position.x + sx * d, 0, r.position.z + sz * d);
        o.rotation.set(0, yaw, 0);
      }
      var p = this.popping;
      for (var i = p.length - 1; i >= 0; i--) {
        var e = p[i];
        e.t += delta;
        var k = Math.min(1, e.t / POP_MS);
        e.group.scale.setScalar(Math.max(0.001, 1 - (1 - k) * (1 - k))); // ease-out
        if (k >= 1) { p[i] = p[p.length - 1]; p.pop(); }
      }
    },
    remove: function () {
      this.el.sceneEl.removeEventListener('cart-changed', this.onCart);
      this.clearItems();
      this.el.removeObject3D('cart');
    }
  });
})();
