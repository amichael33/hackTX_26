/* Classic script: `outside` component. The world seen through the shop's windows: a sky, ground, roads and a ring of buildings,
   trees, lamps and vehicles around the room, themed per map (city | town | industrial | medieval). Unlit (basic) materials,
   shaded per face, so it needs no lights of its own and does not change how the inside looks. Everything is
   generated from a seeded random generator, so a theme always looks the same. */
(function () {
  var THREE_ = null;

  // --- per-theme look ---
  var THEMES = {
    city: {
      sky: ['#6fb7ff', '#e6f5ff'], sun: '#fff3b0', clouds: true, ground: '#9a9ca1', walk: '#c9cbd0', road: '#3d4046', mark: '#e8e8e8',
      buildings: 'tower', palette: ['#9fb4c7', '#b9c4cf', '#8aa0b5', '#c9d2da', '#a7b9a8'], trees: 'round', lamps: 'street', cars: ['#c0392b', '#2c5aa0', '#e0a526', '#d9d4c7', '#1f2933'],
      hills: null, far: 'skyline'
    },
    town: {
      sky: ['#ffb27a', '#ffe9c9'], sun: '#fff0c0', clouds: true, ground: '#b6a98f', walk: '#d2c7ae', road: '#6e655a', mark: null,
      buildings: 'house', palette: ['#e8b4a0', '#a8c8b8', '#e3d092', '#b6a5d4', '#9bc0dd', '#f0c9a8'], roof: ['#8a4b3a', '#6b4a3a', '#7a5a4a'], trees: 'round', lamps: 'street',
      cars: ['#c0392b', '#2c5aa0', '#e0a526'], hills: ['#7fa05a', '#6e9150'], far: null
    },
    industrial: {
      sky: ['#8f99a3', '#cfd3d7'], sun: null, clouds: false, ground: '#9d9d98', walk: '#b3b3ae', road: '#55595e', mark: '#e0a526',
      buildings: 'shed', palette: ['#b8bcc2', '#a3a9b0', '#c9ccd0', '#9aa5a0'], trees: null, lamps: 'flood', cars: ['#e8742a', '#c0392b', '#2c5aa0', '#d9d4c7'],
      hills: null, far: 'stacks'
    },
    medieval: {
      sky: ['#2c3366', '#f4a96a'], sun: null, moon: '#f4f1e0', clouds: false, ground: '#5f7f3a', walk: '#8a7a5a', road: '#7a6a4a', mark: null,
      buildings: 'cottage', palette: ['#e9e2cf', '#ddd3b8', '#e4d9c0'], roof: ['#7a3b2e', '#5b4a3a', '#6b4a34'], trees: 'pine', lamps: 'torch',
      cars: [], hills: ['#3d5a34', '#4a6a40', '#34503a'], far: 'keep'
    }
  };

  function makeRng(seedStr) {
    var h = 2166136261;
    for (var i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 1013904223) | 0; return ((h >>> 0) % 100000) / 100000; };
  }

  AFRAME.registerComponent('outside', {
    schema: { theme: { default: 'city' }, width: { default: 16 }, depth: { default: 20 } },
    init: function () { this.group = null; this.owned = []; this.build(); },
    update: function (old) { if (old && Object.keys(old).length) { this.clear(); this.build(); } },
    remove: function () { this.clear(); },
    clear: function () {
      this.owned.forEach(function (o) { if (o.dispose) o.dispose(); });
      this.owned = [];
      if (this.group) { this.el.removeObject3D('outside'); this.group = null; }
    },

    build: function () {
      var d = this.data, T = THEMES[d.theme] || THEMES.city, self = this;
      var rnd = makeRng(d.theme + ':outside');
      var pick = function (a) { return a[Math.floor(rnd() * a.length) % a.length]; };
      var between = function (a, b) { return a + rnd() * (b - a); };
      var g = this.group = new THREE.Group();
      this.el.setObject3D('outside', g);
      var hw = d.width / 2, hd = d.depth / 2;
      var own = function (o) { self.owned.push(o); return o; };

      // Basic materials, shaded per face (a cheap fake of sunlight from the upper left).
      var matCache = {};
      var FACE = [0.88, 0.7, 1.0, 0.5, 0.82, 0.66]; // +x, -x, +y, -y, +z, -z
      var shaded = function (color, tex, key) {
        var k = key || color;
        if (matCache[k]) return matCache[k];
        return (matCache[k] = FACE.map(function (f, i) {
          var c = new THREE.Color(color).multiplyScalar(f);
          return own(new THREE.MeshBasicMaterial({ color: c, map: tex && i !== 2 && i !== 3 ? tex : null }));
        }));
      };
      var flat = function (color) { return own(new THREE.MeshBasicMaterial({ color: color })); };
      var add = function (geo, mat, x, y, z, parent) {
        var m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        (parent || g).add(m);
        own(geo);
        return m;
      };

      // --- sky: a big gradient sphere that is always behind everything, plus a sun or moon and a few clouds ---
      var sc = document.createElement('canvas');
      sc.width = 4; sc.height = 256;
      var sg = sc.getContext('2d'), grad = sg.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, T.sky[0]); grad.addColorStop(0.55, T.sky[1]); grad.addColorStop(1, T.sky[1]);
      sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
      var skyTex = own(new THREE.CanvasTexture(sc));
      if (THREE.SRGBColorSpace) skyTex.colorSpace = THREE.SRGBColorSpace;
      var sky = add(new THREE.SphereGeometry(100, 24, 14), own(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false })), 0, 0, 0);
      sky.renderOrder = -10;
      if (T.sun) add(new THREE.SphereGeometry(4.5, 12, 8), flat(T.sun), -45, 52, -78);
      if (T.moon) add(new THREE.SphereGeometry(4, 12, 8), flat(T.moon), 55, 46, -72);
      if (T.clouds) {
        var cloudMat = flat('#ffffff');
        for (var ci = 0; ci < 8; ci++) {
          var cx = between(-80, 80), cz = between(-85, 20), cy = between(42, 62);
          for (var cb = 0; cb < 4; cb++) {
            var puff = add(new THREE.SphereGeometry(between(4, 7), 8, 6), cloudMat, cx + cb * 5 - 7, cy + between(-1, 1.5), cz + between(-2, 2));
            puff.scale.y = 0.55;
          }
        }
      }

      // --- ground, sidewalks, roads ---
      var plane = function (w, dd, y, color, x, z) {
        var geo = new THREE.PlaneGeometry(w, dd); geo.rotateX(-Math.PI / 2);
        return add(geo, flat(color), x || 0, y, z || 0);
      };
      plane(400, 400, -0.06, T.ground);
      var ROAD0 = 2.2, ROAD1 = 7.2; // road lies this far from the wall
      var spanX = hw + 26, spanZ = hd + 26;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (n) {
        var alongX = n[1] !== 0;
        var len = alongX ? 2 * spanX : 2 * spanZ;
        var cx = n[0] * (hw + (ROAD0 + ROAD1) / 2), cz = n[1] * (hd + (ROAD0 + ROAD1) / 2);
        plane(alongX ? len : ROAD1 - ROAD0, alongX ? ROAD1 - ROAD0 : len, -0.05, T.road, cx, cz);
        plane(alongX ? len : ROAD0, alongX ? ROAD0 : len, -0.045, T.walk, n[0] * (hw + ROAD0 / 2), n[1] * (hd + ROAD0 / 2)); // sidewalk
        plane(alongX ? len : 2.2, alongX ? 2.2 : len, -0.045, T.walk, n[0] * (hw + ROAD1 + 1.1), n[1] * (hd + ROAD1 + 1.1));    // far sidewalk
        if (T.mark) {
          var dash = flat(T.mark);
          for (var u = -(len / 2) + 2; u < len / 2 - 2; u += 4) {
            var dg = new THREE.PlaneGeometry(alongX ? 2 : 0.18, alongX ? 0.18 : 2); dg.rotateX(-Math.PI / 2);
            add(dg, dash, alongX ? u : cx, -0.04, alongX ? cz : u);
          }
        }
      });

      // --- facade textures (one tile each, repeated over a building by scaling its UVs) ---
      var tex = function (w, h, draw) {
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        draw(c.getContext('2d'), w, h);
        var t = own(new THREE.CanvasTexture(c));
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      // A tile's real size in metres [w, h], used to scale UVs.
      var TILE = { tower: [2.8, 6], house: [4, 3.2], cottage: [4, 3.2], shed: [1.2, 3] };
      var facade = function (kind, base, variant) {
        return tex(128, 128, function (g2, w, h) {
          g2.fillStyle = base; g2.fillRect(0, 0, w, h);
          if (kind === 'tower') {
            for (var cx2 = 0; cx2 < 2; cx2++) for (var cy2 = 0; cy2 < 2; cy2++) {
              var lit = ((variant * 7 + cx2 * 3 + cy2 * 5) % 5) === 0;
              g2.fillStyle = lit ? '#ffeaa0' : '#6f93b8';
              g2.fillRect(cx2 * 64 + 10, cy2 * 64 + 12, 44, 38);
              if (!lit) { g2.fillStyle = 'rgba(255,255,255,0.28)'; g2.fillRect(cx2 * 64 + 10, cy2 * 64 + 12, 44, 12); }
            }
          } else if (kind === 'house') {
            g2.fillStyle = '#5b4a3a'; g2.fillRect(38, 22, 52, 66);                       // window frame
            g2.fillStyle = '#9ec6e8'; g2.fillRect(43, 27, 42, 56);
            g2.fillStyle = '#5b4a3a'; g2.fillRect(63, 27, 3, 56); g2.fillRect(43, 53, 42, 3);
            g2.fillStyle = variant % 2 ? '#7a9a6a' : '#b05a4a';                          // shutters
            g2.fillRect(24, 24, 12, 62); g2.fillRect(92, 24, 12, 62);
            g2.fillStyle = 'rgba(0,0,0,0.12)'; g2.fillRect(0, 118, 128, 10);
          } else if (kind === 'cottage') {
            g2.strokeStyle = '#4f3320'; g2.lineWidth = 6;                                // half-timber frame
            g2.strokeRect(3, 3, 122, 122);
            g2.beginPath(); g2.moveTo(64, 3); g2.lineTo(64, 125); g2.moveTo(3, 64); g2.lineTo(125, 64);
            g2.moveTo(3, 3); g2.lineTo(64, 64); g2.moveTo(125, 3); g2.lineTo(64, 64); g2.stroke();
            g2.fillStyle = '#e8c870'; g2.fillRect(78, 80, 26, 30);                       // warm lit window
            g2.strokeStyle = '#4f3320'; g2.lineWidth = 3; g2.strokeRect(78, 80, 26, 30);
          } else {
            for (var sx = 0; sx < 128; sx += 16) { g2.fillStyle = (sx / 16) % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'; g2.fillRect(sx, 0, 16, 128); }
          }
        });
      };
      var variants = [];
      var kind = T.buildings;
      for (var vi = 0; vi < 5; vi++) variants.push({ tex: facade(kind, T.palette[vi % T.palette.length], vi), color: T.palette[vi % T.palette.length], v: vi });

      // A box whose side UVs follow its real size, so a facade tile repeats instead of stretching.
      var buildingBox = function (w, h, dp, variant) {
        var geo = new THREE.BoxGeometry(w, h, dp), uv = geo.attributes.uv;
        var tw = TILE[kind][0], th = TILE[kind][1];
        var faceW = [dp, dp, w, w, w, w]; // +x -x +y -y +z -z (top/bottom unused)
        for (var f = 0; f < 6; f++) for (var i = 0; i < 4; i++) {
          var k = f * 4 + i;
          if (f === 2 || f === 3) continue;
          uv.setXY(k, uv.getX(k) * (faceW[f] / tw), uv.getY(k) * (h / th));
        }
        return geo;
      };

      var gable = function (w, dp, rh, color) {
        var shape = new THREE.Shape();
        shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, rh); shape.closePath();
        var geo = new THREE.ExtrudeGeometry(shape, { depth: dp, bevelEnabled: false });
        geo.translate(0, 0, -dp / 2);
        var m = flat(color);
        return { geo: geo, mats: [m, flat(new THREE.Color(color).multiplyScalar(0.8).getStyle())] };
      };

      // --- one building ---
      var placeBuilding = function (cx, cz, rotY, w, dp, h, row) {
        var v = variants[Math.floor(rnd() * variants.length) % variants.length];
        var grp = new THREE.Group();
        grp.position.set(cx, 0, cz);
        grp.rotation.y = rotY;
        g.add(grp);
        var mats = shaded(v.color, v.tex, kind + v.v);
        var body = add(buildingBox(w, h, dp, v), mats, 0, h / 2, 0, grp);
        if (kind === 'house' || kind === 'cottage') {
          var rh = Math.min(w, dp) * 0.5 + 0.4;
          var r = gable(w + 0.5, dp + 0.5, rh, pick(T.roof));
          var roof = new THREE.Mesh(r.geo, r.mats);
          roof.position.set(0, h, 0);
          roof.rotation.y = rnd() < 0.5 ? 0 : Math.PI / 2;
          if (roof.rotation.y) { // ridge across: the gable's base must span the other side
            var r2 = gable(dp + 0.5, w + 0.5, rh, pick(T.roof)); roof.geometry = r2.geo; roof.material = r2.mats; roof.rotation.y = Math.PI / 2;
            own(r2.geo);
          }
          grp.add(roof); own(r.geo);
          var chim = add(new THREE.BoxGeometry(0.6, 1.6, 0.6), flat('#8a6a5a'), w * 0.25, h + rh * 0.6, dp * 0.15, grp);
        } else if (kind === 'tower') {
          if (rnd() < 0.7) add(new THREE.BoxGeometry(w * 0.4, 1.4, dp * 0.4), flat('#8d9096'), w * 0.1, h + 0.7, 0, grp);   // roof plant
          if (rnd() < 0.3) add(new THREE.CylinderGeometry(0.08, 0.08, 6, 4), flat('#55595e'), -w * 0.25, h + 3, dp * 0.2, grp); // antenna
        } else if (kind === 'shed') {
          add(new THREE.BoxGeometry(w + 0.3, 0.5, dp + 0.3), flat('#7b8087'), 0, h + 0.25, 0, grp);                                // flat roof lip
          for (var rd = -1; rd <= 1; rd += 2) add(new THREE.BoxGeometry(3.2, 3.6, 0.15), flat('#c9a227'), rd * w * 0.25, 1.8, dp / 2 + 0.05, grp); // roller doors
        }
        return grp;
      };

      // --- rows of buildings along each side of the shop ---
      var DIST0 = ROAD1 + 2.6;
      var sides = [
        { n: [1, 0], rot: Math.PI / 2, along: [-(hd + 18), hd + 18], span: 'z' },
        { n: [-1, 0], rot: -Math.PI / 2, along: [-(hd + 18), hd + 18], span: 'z' },
        { n: [0, 1], rot: Math.PI, along: [-(hw + 1), hw + 1], span: 'x' },
        { n: [0, -1], rot: 0, along: [-(hw + 1), hw + 1], span: 'x' }
      ];
      var WIDTH = { tower: [8, 12], house: [5, 7], cottage: [5, 7], shed: [14, 22] };
      var HEIGHT = { tower: [[12, 24], [24, 46]], house: [[5, 8], [6, 9]], cottage: [[4.5, 7], [5, 8]], shed: [[7, 10], [8, 11]] };
      var DEPTH = { tower: [8, 11], house: [6, 8], cottage: [6, 8], shed: [10, 14] };
      sides.forEach(function (sd) {
        for (var row = 0; row < 2; row++) {
          var u = sd.along[0] + between(0, 3), dist0 = DIST0 + row * 17;
          while (u < sd.along[1]) {
            var w = between(WIDTH[kind][0], WIDTH[kind][1]), dp = between(DEPTH[kind][0], DEPTH[kind][1]);
            var h = between(HEIGHT[kind][row][0], HEIGHT[kind][row][1]);
            var uc = u + w / 2, off = dist0 + dp / 2;
            var cx = sd.span === 'z' ? sd.n[0] * (hw + off) : uc, cz = sd.span === 'z' ? uc : sd.n[1] * (hd + off);
            if (rnd() < (row ? 0.85 : 0.92)) placeBuilding(cx, cz, sd.rot, w, dp, h, row);
            u += w + between(0.8, 2.8);
          }
        }
      });

      // --- street dressing: trees, lamps, vehicles ---
      var sidewalkAt = function (n, off, uu) { return [n[0] ? n[0] * (hw + off) : uu, n[1] ? n[1] * (hd + off) : uu]; };
      var trunkMat = flat('#6b4a2f');
      var tree = function (x, z, s) {
        if (T.trees === 'pine') {
          add(new THREE.CylinderGeometry(0.18 * s, 0.22 * s, 1.4 * s, 6), trunkMat, x, 0.7 * s, z);
          for (var tl = 0; tl < 3; tl++) add(new THREE.ConeGeometry((1.6 - tl * 0.35) * s, 2.4 * s, 7), flat(['#2f5a36', '#2a4f30', '#356440'][tl]), x, (1.8 + tl * 1.3) * s, z);
        } else {
          add(new THREE.CylinderGeometry(0.18 * s, 0.24 * s, 2.0 * s, 6), trunkMat, x, 1.0 * s, z);
          add(new THREE.SphereGeometry(1.5 * s, 8, 6), flat(pick(['#5f9a4a', '#6aa84f', '#4f8a42', '#7fb05a'])), x, 3.0 * s, z);
        }
      };
      var lampMat = flat('#33363b');
      var lamp = function (x, z) {
        if (T.lamps === 'torch') {
          add(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), flat('#4f3320'), x, 1.1, z);
          add(new THREE.ConeGeometry(0.2, 0.55, 6), flat('#ff9a3c'), x, 2.45, z);
        } else {
          var tall = T.lamps === 'flood' ? 9 : 4.6;
          add(new THREE.CylinderGeometry(0.07, 0.1, tall, 6), lampMat, x, tall / 2, z);
          add(new THREE.SphereGeometry(T.lamps === 'flood' ? 0.45 : 0.28, 8, 6), flat('#fff3c0'), x, tall + 0.1, z);
        }
      };
      var carMats = {};
      var car = function (x, z, alongX) {
        var color = pick(T.cars), glass = flat('#2b3a4a');
        var body = new THREE.Group();
        body.position.set(x, 0, z);
        if (alongX) body.rotation.y = Math.PI / 2;
        g.add(body);
        add(new THREE.BoxGeometry(1.9, 0.75, 4.2), flat(color), 0, 0.6, 0, body);
        add(new THREE.BoxGeometry(1.7, 0.6, 2.2), glass, 0, 1.25, -0.2, body);
        [-0.85, 0.85].forEach(function (wx) { [-1.3, 1.3].forEach(function (wz) { add(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 8), flat('#1d1d1f'), wx, 0.34, wz, body).rotation.z = Math.PI / 2; }); });
      };
      var truck = function (x, z, alongX) {
        var color = pick(T.cars), body = new THREE.Group();
        body.position.set(x, 0, z);
        if (alongX) body.rotation.y = Math.PI / 2;
        g.add(body);
        add(new THREE.BoxGeometry(2.4, 2.4, 2.2), flat(color), 0, 1.6, 3.6, body);                 // cab
        add(new THREE.BoxGeometry(2.5, 2.8, 6.4), flat('#e9e9ec'), 0, 1.8, -0.5, body);            // trailer
        [-1.1, 1.1].forEach(function (wx) { [-2.6, 0.4, 3.6].forEach(function (wz) { add(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 8), flat('#1d1d1f'), wx, 0.5, wz, body).rotation.z = Math.PI / 2; }); });
      };
      var vehicles = []; // [x, z, clear radius] of every vehicle placed so far
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (n) {
        var span = n[0] ? hd + 20 : hw + 20;
        for (var u = -span; u < span; u += T.lamps === 'torch' ? 7 : 10) {
          var p = sidewalkAt(n, ROAD1 + 1.1, u + between(-1, 1)), q = sidewalkAt(n, 1.1, u + 5 + between(-1, 1));
          lamp(p[0], p[1]);
          if (T.trees && rnd() < 0.75) { var tp = sidewalkAt(n, ROAD1 + 1.1, u + 5 + between(-1.5, 1.5)); tree(tp[0], tp[1], between(0.85, 1.25)); }
          // Only low bushes against the shop's own wall: a full tree here would poke through it into the room.
          if (T.trees && rnd() < 0.5) { var tq = sidewalkAt(n, 1.5, u + between(-1, 1)); add(new THREE.SphereGeometry(between(0.4, 0.6), 7, 5), flat(pick(['#5f9a4a', '#4f8a42', '#6aa84f'])), tq[0], 0.4, tq[1]); }
        }
        // Vehicles on the road: two fixed lanes, and a spot is only used if it is clear of every vehicle already placed
        // (on any road), so two never overlap. Trucks are longer, so they need more room.
        var cars = d.theme === 'industrial' ? 3 : T.cars.length ? 4 : 0;
        for (var ci2 = 0; ci2 < cars; ci2++) {
          var isTruck = d.theme === 'industrial' && rnd() < 0.6, need = isTruck ? 5.0 : 2.7;
          for (var attempt = 0; attempt < 30; attempt++) {
            var cu = between(-span + 4, span - 4), lane = ROAD0 + (rnd() < 0.5 ? 1.5 : 3.7);
            var cp = sidewalkAt(n, lane, cu);
            var spot = cp;
            var clear = vehicles.every(function (v) { var ddx = v[0] - spot[0], ddz = v[1] - spot[1]; return Math.sqrt(ddx * ddx + ddz * ddz) >= v[2] + need; });
            if (!clear) continue;
            vehicles.push([spot[0], spot[1], need]);
            if (isTruck) truck(spot[0], spot[1], n[0] === 0); else if (T.cars.length) car(spot[0], spot[1], n[0] === 0);
            break;
          }
        }
      });

      // --- extras that make each place feel like itself ---
      if (d.theme === 'industrial') {
        // Stacks of shipping containers in the yard behind the first row, a gantry crane and a smokestack.
        var cols = ['#c0392b', '#2c5aa0', '#2e8b57', '#e0a526', '#8a4b3a'];
        for (var st = 0; st < 10; st++) {
          var sx2 = (rnd() < 0.5 ? -1 : 1) * (hw + between(28, 46)), sz2 = between(-hd - 10, hd + 10), lv = 1 + Math.floor(rnd() * 3);
          for (var l = 0; l < lv; l++) add(new THREE.BoxGeometry(2.6, 2.6, 12), shaded(pick(cols)), sx2, 1.3 + l * 2.6, sz2);
        }
        var crane = new THREE.Group(); crane.position.set(hw + 50, 0, -10); g.add(crane);
        [-8, 8].forEach(function (cz) { add(new THREE.BoxGeometry(1.2, 26, 1.2), flat('#d6a321'), 0, 13, cz, crane); });
        add(new THREE.BoxGeometry(1.4, 1.6, 22), flat('#d6a321'), 0, 26, 0, crane);
        add(new THREE.CylinderGeometry(1.8, 2.4, 40, 10), flat('#a8a39a'), -hw - 60, 20, -hd - 20);
        add(new THREE.CylinderGeometry(1.85, 1.85, 4, 10), flat('#c0392b'), -hw - 60, 38, -hd - 20);
      }
      if (T.far === 'skyline') {
        for (var sk = 0; sk < 26; sk++) { var a = (sk / 26) * Math.PI * 2, rr = between(70, 90), hh = between(20, 55); add(new THREE.BoxGeometry(between(6, 11), hh, between(6, 11)), flat(pick(['#9db0c4', '#8fa4ba', '#b0bfce'])), Math.cos(a) * rr, hh / 2, Math.sin(a) * rr); }
      }
      if (T.far === 'keep') {
        // A distant castle on a hill: curtain wall, towers with cone roofs, and the keep.
        var kp = new THREE.Group(); kp.position.set(-hw - 30, 0, -hd - 62); g.add(kp);
        add(new THREE.SphereGeometry(26, 10, 6), flat('#3d5a34'), 0, -10, 0, kp);
        add(new THREE.BoxGeometry(34, 8, 4), shaded('#8d887d'), 0, 7, 0, kp);
        [-17, 17].forEach(function (tx) { add(new THREE.CylinderGeometry(3.2, 3.6, 14, 8), flat('#8d887d'), tx, 7, 0, kp); add(new THREE.ConeGeometry(4.2, 6, 8), flat('#7a3b2e'), tx, 17, 0, kp); });
        add(new THREE.BoxGeometry(9, 22, 9), shaded('#9a958a'), 0, 11, -2, kp);
        add(new THREE.ConeGeometry(7, 9, 4), flat('#7a3b2e'), 0, 26, -2, kp);
      }
      if (T.hills) {
        for (var hl = 0; hl < 14; hl++) {
          var ha = (hl / 14) * Math.PI * 2 + between(-0.2, 0.2), hr = between(66, 92), rad = between(16, 34);
          var hill = add(new THREE.SphereGeometry(rad, 10, 6), flat(pick(T.hills)), Math.cos(ha) * hr, -rad * 0.55, Math.sin(ha) * hr);
          hill.scale.y = 0.8;
        }
      }
    }
  });
})();
