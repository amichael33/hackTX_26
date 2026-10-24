/* Classic script: `shopping-cart` component. A low-poly cart that rolls ahead of the rig (yaw only, never pitch) and
   shows the saved items as little cubes with their thumbnail on top and front. Fed by the scene's `cart-changed` event
   ({ items }). Not clickable. `variant` picks the model: cart (wire shopping cart), basket (wicker rolling basket),
   dolly (platform truck) or wheelbarrow, each with its own reach, footprint and item grid. */
(function () {
  var POP_MS = 250;
  var CUBE = 0.12;

  // Shared by every cart / item (never disposed; they live for the page).
  var cartGeo = {};
  var mats = {};
  var cubeGeo = null, slabGeo = null, topGeo = null, frontGeo = null, cubeMat = null;

  function box(w, h, d) {
    var k = w + 'x' + h + 'x' + d;
    return cartGeo[k] || (cartGeo[k] = new THREE.BoxGeometry(w, h, d));
  }
  function mat(color) {
    return mats[color] || (mats[color] = new THREE.MeshStandardMaterial({ color: color, flatShading: true }));
  }
  function wheelGeo(r, w) {
    var k = 'wheel' + r + 'x' + w;
    return cartGeo[k] || (cartGeo[k] = new THREE.CylinderGeometry(r, r, w, 10));
  }
  // The photo with its plain background removed: { canvas, aspect }, or null when it has none (or cannot be read).
  // Same idea as product-box.js, kept small here.
  function cutout(img) {
    var SC = window.StoreCutout;
    if (!SC) return null;
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    var k = Math.min(1, 160 / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    var id = ctx.getImageData(0, 0, w, h);
    var res = SC.removeEdgeBackground(id.data, w, h);
    if (res.removedFraction < 0.04 || res.removedFraction > 0.9) return null;
    var bb = SC.alphaBBox(id.data, w, h);
    if (!bb) return null;
    ctx.putImageData(id, 0, 0);
    var out = document.createElement('canvas');
    out.width = bb.w; out.height = bb.h;
    out.getContext('2d').drawImage(c, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
    return { canvas: out, aspect: bb.w / bb.h };
  }

  function shared() {
    if (cubeGeo) return;
    cubeGeo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
    slabGeo = new THREE.BoxGeometry(CUBE, 0.04, CUBE); // a folded garment
    topGeo = new THREE.PlaneGeometry(CUBE * 0.9, CUBE * 0.9);
    topGeo.rotateX(-Math.PI / 2); // face up
    frontGeo = new THREE.PlaneGeometry(CUBE * 0.9, CUBE * 0.9); // faces +z, toward the player
    cubeMat = new THREE.MeshStandardMaterial({ color: '#fbfbfd', flatShading: true });
  }

  // --- the models. Origin = floor centre, +z = the handle side (toward the player). `add` places a part. ---
  function newPart(g) {
    return function (geo, m, x, y, z, rx, ry, rz) {
      var mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      if (rx || ry || rz) mesh.rotation.set(rx || 0, ry || 0, rz || 0);
      g.add(mesh);
      return mesh;
    };
  }
  var DEG = Math.PI / 180;

  // A wire basket on a chrome frame, blue plastic rim and handle grip. Parts butt against each other (no coplanar overlaps).
  function buildCart(g) {
    var add = newPart(g);
    var chrome = mat('#c7c7cc'), dark = mat('#1d1d1f'), blue = mat('#0071e3'), floorMat = mat('#9a9aa0');
    var W = 0.55, H = 0.35, D = 0.4, T = 0.02, B = 0.45;
    var P = 0.014, R = 0.012, V = 0.01, RIM = 0.02;
    add(box(W, T, D), floorMat, 0, B + T / 2, 0);
    var xs = [-W / 2, W / 2], zs = [-D / 2, D / 2];
    xs.forEach(function (x) { zs.forEach(function (z) { add(box(P, H - RIM / 2, P), chrome, x, B + (H - RIM / 2) / 2, z); }); });
    xs.forEach(function (x) { add(box(RIM, RIM, D + RIM), blue, x, B + H, 0); });
    zs.forEach(function (z) { add(box(W - RIM, RIM, RIM), blue, 0, B + H, z); });
    [B + H * 0.35, B + H * 0.7].forEach(function (y) {
      zs.forEach(function (z) { add(box(W - P, R, R), chrome, 0, y, z); });
      xs.forEach(function (x) { add(box(R, R, D - P), chrome, x, y, 0); });
    });
    var barH = H - RIM / 2 - 0.02;
    [-0.2, -0.1, 0, 0.1, 0.2].forEach(function (x) { zs.forEach(function (z) { add(box(V, barH, V), chrome, x, B + T + barH / 2, z); }); });
    [-0.1, 0, 0.1].forEach(function (z) { xs.forEach(function (x) { add(box(V, barH, V), chrome, x, B + T + barH / 2, z); }); });
    add(box(0.03, 0.3, 0.03), chrome, -0.22, B + H - 0.02, D / 2 + 0.04);
    add(box(0.03, 0.3, 0.03), chrome, 0.22, B + H - 0.02, D / 2 + 0.04);
    add(box(0.5, 0.035, 0.035), blue, 0, B + H + 0.14, D / 2 + 0.04);
    var legGeo = box(0.03, B - 0.1, 0.03);
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        add(wheelGeo(0.1, 0.05), dark, sx * 0.22, 0.1, sz * 0.15, 0, 0, Math.PI / 2);
        add(legGeo, chrome, sx * 0.22, 0.1 + (B - 0.1) / 2, sz * 0.15);
      });
    });
  }

  // A wicker rolling basket: low woven tub on casters with a wooden push bar.
  function buildBasket(g) {
    var add = newPart(g);
    var wick = mat('#b98b57'), rim = mat('#8a6338'), wood = mat('#8a6a45'), dark = mat('#2b2b2b');
    var W = 0.62, D = 0.44, Y = 0.3, WALL = 0.12, T = 0.03, t = 0.025;
    add(box(W, T, D), wick, 0, Y + T / 2, 0);
    [-1, 1].forEach(function (s) { add(box(t, WALL, D), wick, s * (W / 2 - t / 2), Y + T + WALL / 2, 0); });                     // sides
    [-1, 1].forEach(function (s) { add(box(W - 2 * t, WALL, t), wick, 0, Y + T + WALL / 2, s * (D / 2 - t / 2)); });             // front / back
    [-1, 1].forEach(function (s) { add(box(0.045, 0.03, D + 0.04), rim, s * (W / 2 - 0.0125), Y + T + WALL + 0.015, 0); });       // side rims
    [-1, 1].forEach(function (s) { add(box(W - 0.095, 0.03, 0.045), rim, 0, Y + T + WALL + 0.015, s * (D / 2 - 0.0125)); });     // end rims
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        add(box(0.03, 0.18, 0.03), dark, sx * 0.25, 0.21, sz * 0.17);                                                              // caster stem
        add(wheelGeo(0.06, 0.03), dark, sx * 0.25, 0.06, sz * 0.17, 0, 0, Math.PI / 2);
      });
    });
    [-1, 1].forEach(function (s) { add(box(0.03, 0.62, 0.03), wood, s * 0.2, Y + 0.31, D / 2 + 0.0165 + 0.015); });                // push-bar posts
    add(box(0.43, 0.035, 0.035), wood, 0, Y + 0.62 + 0.0175, D / 2 + 0.0315);
  }

  // A platform dolly (truck): steel deck, big rear wheels, small front casters, a tall handle frame with an orange grip.
  function buildDolly(g) {
    var add = newPart(g);
    var steel = mat('#4a4f57'), orange = mat('#e8742a'), dark = mat('#1d1d1f'), rubber = mat('#2b2b2b');
    var W = 0.62, D = 0.46, Y = 0.2, T = 0.035;
    add(box(W, T, D), steel, 0, Y + T / 2, 0);
    add(box(W, 0.07, 0.025), rubber, 0, Y + T + 0.035, -D / 2 + 0.0125);                        // toe stop at the front
    [-1, 1].forEach(function (s) { add(box(0.03, 0.62, 0.03), steel, s * 0.25, Y + T + 0.31, D / 2 - 0.015); });  // handle rails
    add(box(0.53, 0.03, 0.03), steel, 0, Y + T + 0.3, D / 2 - 0.015);                           // brace
    add(box(0.53, 0.04, 0.04), orange, 0, Y + T + 0.64, D / 2 - 0.015);                         // grip
    add(box(0.6, 0.03, 0.03), steel, 0, 0.12, 0.12);                                            // rear axle
    [-1, 1].forEach(function (s) { add(wheelGeo(0.12, 0.05), dark, s * 0.34, 0.12, 0.12, 0, 0, Math.PI / 2); });
    [-1, 1].forEach(function (s) {
      add(box(0.03, 0.1, 0.03), steel, s * 0.24, Y - 0.05, -0.18);
      add(wheelGeo(0.05, 0.03), dark, s * 0.24, 0.05, -0.18, 0, 0, Math.PI / 2);
    });
  }

  // A wooden wheelbarrow: a deep slanted tub with plank seams and iron bands, a spoked wooden wheel on a fork at the front, two
  // long handles that rise to hand height at the back (with leather grips) and legs under them, braced between the handles.
  function buildWheelbarrow(g) {
    var add = newPart(g);
    var wood = mat('#8a6a45'), dark = mat('#4f3320'), seam = mat('#6e5234'), iron = mat('#2b2b2b'), leather = mat('#3a2a18'), rim = mat('#a07d52');
    var RAIL_LO = [-0.4, 0.2], RAIL_HI = [0.72, 0.46];                         // [z, y] of the front and rear ends of the handles
    var span = RAIL_HI[0] - RAIL_LO[0], rise = RAIL_HI[1] - RAIL_LO[1];
    var railLen = Math.sqrt(span * span + rise * rise), tilt = -Math.atan2(rise, span);
    var railY = function (z) { return RAIL_LO[1] + (z - RAIL_LO[0]) / span * rise; };
    // Handles: long rails rising toward the player, a grip on each end, and a brace between them.
    [-1, 1].forEach(function (s) {
      add(box(0.04, 0.04, railLen), dark, s * 0.17, (RAIL_LO[1] + RAIL_HI[1]) / 2, (RAIL_LO[0] + RAIL_HI[0]) / 2, tilt, 0, 0);
      add(box(0.05, 0.05, 0.2), leather, s * 0.17, RAIL_HI[1] + 0.012, RAIL_HI[0] + 0.1, tilt, 0, 0);                              // grip
      add(box(0.035, railY(0.42) - 0.02, 0.035), dark, s * 0.17, (railY(0.42) - 0.02) / 2, 0.42);                                  // leg
      add(box(0.07, 0.02, 0.12), dark, s * 0.17, 0.01, 0.42);                                                                      // foot
    });
    add(box(0.3, 0.035, 0.035), dark, 0, railY(0.55) - 0.005, 0.55);                                                               // rear brace
    add(box(0.3, 0.035, 0.035), dark, 0, railY(-0.3) - 0.005, -0.3);                                                               // front brace
    // The tub: floor, two slanted sides, a leaning front and a low back, with plank seams and two iron bands on each outside face.
    add(box(0.38, 0.025, 0.52), wood, 0, 0.31, 0);
    var panel = function (w, h, x, y, z, rx, rz, alongZ) {
      var grp = new THREE.Group();
      grp.position.set(x, y, z); grp.rotation.set(rx, 0, rz);
      g.add(grp);
      var put = newPart(grp);
      put(alongZ ? box(0.025, h, w) : box(w, h, 0.025), wood, 0, 0, 0);
      for (var i = -1; i <= 1; i++) {                                                                                             // plank seams
        put(alongZ ? box(0.006, h, 0.008) : box(0.008, h, 0.006), seam, alongZ ? -0.0135 : i * w / 4, 0, alongZ ? i * w / 4 : 0.0135);
      }
      [-0.07, 0.07].forEach(function (by) {                                                                                       // iron bands
        put(alongZ ? box(0.006, 0.022, w + 0.01) : box(w + 0.01, 0.022, 0.006), iron, alongZ ? -0.0145 : 0, by, alongZ ? 0 : 0.0145);
      });
      put(alongZ ? box(0.035, 0.03, w) : box(w, 0.03, 0.035), rim, 0, h / 2, 0);                                                    // top rim
    };
    panel(0.54, 0.26, -0.235, 0.44, 0, 0, 20 * DEG, true);                      // left side (leans out)
    panel(0.54, 0.26, 0.235, 0.44, 0, 0, -20 * DEG, true);                      // right side
    panel(0.44, 0.26, 0, 0.44, -0.3, -22 * DEG, 0, false);                      // front board, leaning forward
    panel(0.4, 0.14, 0, 0.375, 0.27, 0, 0, false);                              // low back board
    // The front wheel: an iron tyre, a wooden wheel with crossed spokes, on a fork that reaches back to the handles.
    add(wheelGeo(0.17, 0.05), iron, 0, 0.17, -0.5, 0, 0, Math.PI / 2);
    add(wheelGeo(0.15, 0.054), wood, 0, 0.17, -0.5, 0, 0, Math.PI / 2);
    [0, 60, 120].forEach(function (a) { add(box(0.058, 0.28, 0.016), dark, 0, 0.17, -0.5, a * DEG, 0, 0); });
    add(box(0.14, 0.03, 0.03), dark, 0, 0.17, -0.5);                                                                              // axle
    var fl = Math.sqrt(0.1 * 0.1 + 0.03 * 0.03), fa = -Math.atan2(RAIL_LO[1] - 0.17, RAIL_LO[0] + 0.5);
    [-1, 1].forEach(function (s) { add(box(0.025, 0.03, fl + 0.02), dark, s * 0.07, 0.185, -0.45, fa, 0, 0); });                   // fork arms
  }

  // Per-variant: model builder, drawn scale, how far ahead of the player it rolls, its footprint radius for collisions
  // (both in metres, after scaling) and the item grid (model units, before scaling): cols x rows, pitches, y of a cube's centre.
  var VARIANTS = {
    cart:        { build: buildCart,        scale: 1.3, ahead: 1.17, radius: 0.364, grid: { cols: 4, rows: 3, px: 0.13, pz: 0.13,  y: 0.45 + 0.02 + CUBE / 2, z: 0 } },
    basket:      { build: buildBasket,      scale: 1.4, ahead: 1.2,  radius: 0.4,   grid: { cols: 4, rows: 3, px: 0.13, pz: 0.125, y: 0.3 + 0.03 + CUBE / 2,  z: 0 } },
    dolly:       { build: buildDolly,       scale: 1.3, ahead: 1.25, radius: 0.42,  grid: { cols: 4, rows: 3, px: 0.13, pz: 0.13,  y: 0.2 + 0.035 + CUBE / 2, z: -0.02 } },
    wheelbarrow: { build: buildWheelbarrow, scale: 1.3, ahead: 1.7,  radius: 0.55,  grid: { cols: 3, rows: 3, px: 0.125, pz: 0.13, y: 0.3225 + CUBE / 2,     z: 0 } }
  };
  var STEP_FRACTIONS = [1, 0.89, 0.78, 0.67, 0.56, 0.44, 0.39];

  AFRAME.registerComponent('shopping-cart', {
    schema: {
      rig: { type: 'selector', default: '#rig' },
      max: { type: 'number', default: 12 },
      variant: { default: 'cart', oneOf: ['cart', 'basket', 'dolly', 'wheelbarrow'] },
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
      this.list = [];
      this.v = VARIANTS[this.data.variant] || VARIANTS.cart;
      this.buildModel();
      this.blocked = false; // true while no clear spot ahead of the player exists
      this.el.object3D.visible = false; // main.js enables it in BROWSING
      this.onCart = function (e) { self.list = (e.detail && e.detail.items) || []; self.setItems(self.list); };
      this.el.sceneEl.addEventListener('cart-changed', this.onCart);
    },
    buildModel: function () {
      var g = new THREE.Group();
      this.v.build(g);
      g.add(this.items);
      g.scale.setScalar(this.v.scale);
      this.el.setObject3D('cart', g);
    },
    update: function (old) {
      this.el.object3D.visible = this.data.enabled && !this.blocked;
      if (old && old.variant !== undefined && old.variant !== this.data.variant) {
        // Another map's cart: swap the model and lay the items out again for its grid.
        this.v = VARIANTS[this.data.variant] || VARIANTS.cart;
        this.el.removeObject3D('cart');
        this.prevIds = {};
        this.buildModel();
        this.setItems(this.list);
      }
    },
    setItems: function (list) {
      this.clearItems();
      var buildId = this.buildId, gr = this.v.grid;
      var n = Math.min(this.data.max, gr.cols * gr.rows, list.length);
      var nowIds = {};
      for (var i = 0; i < n; i++) {
        var it = list[i];
        nowIds[it.id] = true;
        var col = i % gr.cols, row = Math.floor(i / gr.cols);
        var group = new THREE.Group();
        group.position.set(
          (col - (gr.cols - 1) / 2) * gr.px,
          gr.y,
          ((gr.rows - 1) / 2 - row) * gr.pz + gr.z // row 0 nearest the handle (+z)
        );
        // Drawn like its product on the shelf: a box in the retailer's colour with the cut-out photo on its front and top; for
        // clothes, a folded garment (a thin slab with the photo on top). The photo appears once it has loaded.
        var photoMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.1 });
        photoMat.visible = false;
        var planes = [];
        var bodyColor = it.color || '#fbfbfd';
        if (it.garment === true) {
          var slab = new THREE.Mesh(slabGeo, mat(bodyColor));
          slab.position.y = -CUBE / 2 + 0.02;
          group.add(slab);
          var flat = new THREE.Mesh(topGeo, photoMat);
          flat.position.y = -CUBE / 2 + 0.043;
          group.add(flat);
          planes.push(flat);
        } else {
          group.add(new THREE.Mesh(cubeGeo, mat(bodyColor)));
          var top = new THREE.Mesh(topGeo, photoMat);
          top.position.y = CUBE / 2 + 0.002;
          group.add(top);
          var front = new THREE.Mesh(frontGeo, photoMat);
          front.position.z = CUBE / 2 + 0.002;
          group.add(front);
          planes.push(top, front);
        }
        this.itemMats.push(photoMat);
        if (it.thumbnail) this.loadThumb(photoMat, it.thumbnail, buildId, planes);
        if (!this.prevIds[it.id]) {
          group.scale.setScalar(0.001);
          this.popping.push({ group: group, t: 0 });
        }
        this.items.add(group);
      }
      this.prevIds = nowIds;
    },
    // Loads the product photo, cuts the plain background away (when it has one) and puts it on the item's planes.
    loadThumb: function (photoMat, thumb, buildId, planes) {
      var self = this, img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (self.buildId !== buildId) return; // rebuilt or removed while loading
        var cut = null;
        try { cut = cutout(img); } catch (e) { cut = null; } // tainted canvas etc.
        var tex, aspect;
        if (cut) { tex = new THREE.CanvasTexture(cut.canvas); aspect = cut.aspect; }
        else { tex = new THREE.Texture(img); tex.needsUpdate = true; aspect = 1; } // a photo with its own background: show it whole
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        photoMat.map = tex;
        photoMat.visible = true;
        photoMat.needsUpdate = true;
        planes.forEach(function (pl) {
          var sx = aspect >= 1 ? 1 : aspect, sy = aspect >= 1 ? 1 / aspect : 1;
          if (pl.geometry === topGeo) pl.scale.set(sx, 1, sy); else pl.scale.set(sx, sy, 1);
        });
      };
      img.onerror = function () { /* stay a plain coloured box */ };
      img.src = String(thumb).indexOf('data:') === 0 ? thumb : '/api/img?u=' + encodeURIComponent(thumb);
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
        var d = this.v.ahead, found = !C || !C.circleClear;
        if (!found) {
          // Pull the cart back toward the player until its footprint is clear of fixtures and walls.
          for (var step = 0; step < STEP_FRACTIONS.length; step++) {
            d = this.v.ahead * STEP_FRACTIONS[step];
            if (C.circleClear(r.position.x + sx * d, r.position.z + sz * d, this.v.radius)) { found = true; break; }
          }
        }
        this.blocked = !found;
        o.visible = found;
        if (!found) return;
        var cx = r.position.x + sx * d, cz = r.position.z + sz * d;
        o.position.set(cx, C && C.heightAt ? C.heightAt(cx, cz) : 0, cz); // rides over bridges
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
