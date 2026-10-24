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
    init: function () { this.group = null; this.owned = []; this.puffs = []; this.sails = null; this.build(); },
    tick: function (time, delta) {
      if (this.sails) this.sails.rotation.z -= Math.min(delta, 50) * 0.0006;
      for (var i = 0; i < this.puffs.length; i++) { // chimney smoke: each puff rises, swells and fades, then starts again
        var p = this.puffs[i], t = ((time * 0.00022 + p.phase) % 1 + 1) % 1;
        p.mesh.position.y = p.y0 + t * 2.4;
        p.mesh.scale.setScalar(0.35 + t * 0.9);
        p.mat.opacity = 0.55 * (1 - t) * Math.min(1, t * 8);
      }
    },
    update: function (old) { if (old && Object.keys(old).length) { this.clear(); this.build(); } },
    remove: function () { this.clear(); },
    clear: function () {
      this.owned.forEach(function (o) { if (o.dispose) o.dispose(); });
      this.owned = [];
      this.puffs = [];
      this.sails = null;
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
      var srnd = makeRng(d.theme + ':extras'); // separate stream, so adding dressing never shifts where the buildings stand

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
      var cobbleTex = null;
      var cobbles = function () { // 4x4 stones per tile, each a slightly different grey-brown
        if (cobbleTex) return cobbleTex;
        var c = document.createElement('canvas'); c.width = c.height = 128;
        var x2 = c.getContext('2d'), cr = makeRng('cobbles');
        x2.fillStyle = '#4f4840'; x2.fillRect(0, 0, 128, 128);
        for (var r = 0; r < 4; r++) for (var q = 0; q < 4; q++) {
          var sh = 98 + Math.floor(cr() * 34);
          x2.fillStyle = 'rgb(' + sh + ',' + (sh - 7) + ',' + (sh - 16) + ')';
          x2.fillRect(q * 32 + (r % 2 ? 16 : 0) + 2, r * 32 + 2, 28, 28);
          if (r % 2 && q === 3) x2.fillRect(0, r * 32 + 2, 14, 28); // the half stone wrapping round
        }
        cobbleTex = own(new THREE.CanvasTexture(c));
        cobbleTex.wrapS = cobbleTex.wrapT = THREE.RepeatWrapping;
        if (THREE.SRGBColorSpace) cobbleTex.colorSpace = THREE.SRGBColorSpace;
        return cobbleTex;
      };
      plane(400, 400, -0.06, T.ground);
      var ROAD0 = 2.2, ROAD1 = 7.2; // road lies this far from the wall
      var spanX = hw + 26, spanZ = hd + 26;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (n) {
        var alongX = n[1] !== 0;
        var len = alongX ? 2 * spanX : 2 * spanZ;
        var cx = n[0] * (hw + (ROAD0 + ROAD1) / 2), cz = n[1] * (hd + (ROAD0 + ROAD1) / 2);
        var roadPlane = plane(alongX ? len : ROAD1 - ROAD0, alongX ? ROAD1 - ROAD0 : len, -0.05, T.road, cx, cz);
        if (d.theme === 'town') { // cobblestones: a repeating stone tile over the road
          var ct = cobbles().clone(); ct.needsUpdate = true;
          ct.repeat.set((alongX ? len : ROAD1 - ROAD0) / 1.6, (alongX ? ROAD1 - ROAD0 : len) / 1.6);
          own(ct); roadPlane.material = own(new THREE.MeshBasicMaterial({ map: ct }));
        }
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
            // Window layouts differ per variant: grid, ribbon curtain wall, narrow three-across, mullioned grid, vertical fins.
            var win = function (x, y, ww, hh, lit) {
              g2.fillStyle = lit ? '#ffeaa0' : '#6f93b8'; g2.fillRect(x, y, ww, hh);
              if (!lit) { g2.fillStyle = 'rgba(255,255,255,0.28)'; g2.fillRect(x, y, ww, Math.max(4, hh * 0.3)); }
            };
            var tv = variant % 5;
            if (tv === 1) {
              for (var ry = 0; ry < 2; ry++) { win(0, ry * 64 + 12, 128, 38, false); g2.fillStyle = base; for (var mx = 32; mx < 128; mx += 32) g2.fillRect(mx - 1, ry * 64 + 12, 3, 38); }
            } else if (tv === 2) {
              for (var c3 = 0; c3 < 3; c3++) for (var r3 = 0; r3 < 2; r3++) win(c3 * 43 + 8, r3 * 64 + 10, 27, 44, ((c3 * 5 + r3 * 3 + variant) % 4) === 0);
            } else if (tv === 3) {
              for (var c4 = 0; c4 < 2; c4++) for (var r4 = 0; r4 < 2; r4++) { win(c4 * 64 + 8, r4 * 64 + 10, 48, 44, ((c4 + r4 * 2 + variant) % 6) === 0); g2.fillStyle = base; g2.fillRect(c4 * 64 + 30, r4 * 64 + 10, 4, 44); g2.fillRect(c4 * 64 + 8, r4 * 64 + 30, 48, 3); }
            } else if (tv === 4) {
              win(0, 0, 128, 128, false); g2.fillStyle = base;
              for (var fx = 0; fx < 128; fx += 21) g2.fillRect(fx, 0, 9, 128);
              g2.fillRect(0, 60, 128, 8);
            } else {
              for (var cx2 = 0; cx2 < 2; cx2++) for (var cy2 = 0; cy2 < 2; cy2++) win(cx2 * 64 + 10, cy2 * 64 + 12, 44, 38, ((variant * 7 + cx2 * 3 + cy2 * 5) % 5) === 0);
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
      var crnd = makeRng('city:details');
      var cpick = function (a) { return a[Math.floor(crnd() * a.length) % a.length]; };
      var SHOPS = [['CAFE', '#7a4f2f'], ['BOOKS', '#2c5aa0'], ['SHOES', '#c0392b'], ['PIZZA', '#2e8b57'], ['BANK', '#1f2933'], ['FLORIST', '#a04f7a'], ['TECH', '#3d4046']];
      var lampMat = flat('#33363b');
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

      // --- town dressing on a house front (local +z faces the street): a shop sign, a striped awning, a window box, chimney smoke ---
      var dress = makeRng('town:dress');
      var SHOPS = ['BAKERY', 'BOOKS', 'TEA', 'FLOWERS', 'TOYS', 'CHEESE'];
      var signMats = {};
      var signMat = function (name, bg) {
        if (signMats[name]) return signMats[name];
        var t = tex(128, 32, function (g2, cw, ch) {
          g2.fillStyle = bg; g2.fillRect(0, 0, cw, ch);
          g2.strokeStyle = '#f4ecd8'; g2.lineWidth = 2; g2.strokeRect(2, 2, cw - 4, ch - 4);
          g2.fillStyle = '#f4ecd8'; g2.font = 'bold 20px sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(name, cw / 2, ch / 2 + 1);
        });
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        return (signMats[name] = own(new THREE.MeshBasicMaterial({ map: t })));
      };
      var awningMats = {};
      var awningMat = function (col) {
        if (awningMats[col]) return awningMats[col];
        var t = tex(64, 8, function (g2, cw, ch) {
          for (var i = 0; i < 8; i++) { g2.fillStyle = i % 2 ? '#f4ecd8' : col; g2.fillRect(i * 8, 0, 8, ch); }
        });
        return (awningMats[col] = own(new THREE.MeshBasicMaterial({ map: t })));
      };
      var smokeMats = [0.55, 0.4, 0.28].map(function (o) { return own(new THREE.MeshBasicMaterial({ color: '#e9e4dc', transparent: true, opacity: o, depthWrite: false })); });
      var townFront = function (grp, w, dp, h, row, chimPos) {
        // smoke on every house, since they can be seen from above the street too
        for (var sm = 0; sm < 3; sm++) {
          var puff = add(new THREE.SphereGeometry(0.28 + sm * 0.13, 7, 5), smokeMats[sm], chimPos.x + sm * 0.25, chimPos.y + 1.2 + sm * 0.65, chimPos.z, grp);
          puff.scale.y = 0.8;
        }
        if (row !== 0 || dress() < 0.12) return;
        var ax = -w / 2 + 2, z0 = dp / 2;                     // the ground-floor window sits 2 m from the left edge of each 4 m tile
        var accent = ['#b5483a', '#3f7a5a', '#3a5f9a', '#c28a2c'][Math.floor(dress() * 4)];
        var aw = add(new THREE.BoxGeometry(2.6, 0.05, 1.0), awningMat(accent), ax, 2.43, z0 + 0.47, grp);
        aw.rotation.x = 0.35;
        var name = SHOPS[Math.floor(dress() * SHOPS.length)];
        add(new THREE.BoxGeometry(2.2, 0.5, 0.08), signMat(name, '#5b3a29'), ax, 3.0, z0 + 0.04, grp);   // fascia board above the awning
        add(new THREE.BoxGeometry(1.5, 0.22, 0.28), flat('#7a4a30'), ax, 0.92, z0 + 0.16, grp);          // window box below the sill
        add(new THREE.BoxGeometry(1.4, 0.1, 0.22), flat('#5f9a4a'), ax, 1.1, z0 + 0.16, grp);
        var fc = ['#e86a8a', '#f2c14e', '#ffffff', '#c58be8'];
        for (var fl = 0; fl < 5; fl++) add(new THREE.BoxGeometry(0.12, 0.12, 0.12), flat(fc[(fl + Math.floor(dress() * 4)) % 4]), ax - 0.56 + fl * 0.28, 1.2, z0 + 0.16, grp);
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
          if (kind === 'house') townFront(grp, w, dp, h, row, chim.position);
          if (kind === 'cottage' && srnd() < 0.6) { // a thread of chimney smoke (animated in tick)
            for (var sp = 0; sp < 3; sp++) {
              var smat = own(new THREE.MeshBasicMaterial({ color: '#c9c6c0', transparent: true, opacity: 0, depthWrite: false }));
              var pm = add(new THREE.IcosahedronGeometry(0.4, 0), smat, w * 0.25, h + rh * 0.6 + 1, dp * 0.15, grp);
              self.puffs.push({ mesh: pm, mat: smat, phase: sp / 3 + srnd() * 0.1, y0: h + rh * 0.6 + 1 });
            }
          }
        } else if (kind === 'tower') {
          if (rnd() < 0.7) add(new THREE.BoxGeometry(w * 0.4, 1.4, dp * 0.4), flat('#8d9096'), w * 0.1, h + 0.7, 0, grp);   // roof plant
          if (rnd() < 0.3) add(new THREE.CylinderGeometry(0.08, 0.08, 6, 4), flat('#55595e'), -w * 0.25, h + 3, dp * 0.2, grp); // antenna
        } else if (kind === 'shed') {
          add(new THREE.BoxGeometry(w + 0.3, 0.5, dp + 0.3), flat('#7b8087'), 0, h + 0.25, 0, grp);                                // flat roof lip
          add(new THREE.BoxGeometry(w + 0.06, 0.9, dp + 0.06), flat(v.v % 2 ? '#2c5aa0' : '#3d5a6e'), 0, h * 0.8, 0, grp);        // colored cladding band
          for (var rd = -1; rd <= 1; rd += 2) {
            var dx = rd * w * 0.25;
            add(new THREE.BoxGeometry(3.7, 3.95, 0.12), flat('#4a4f57'), dx, 1.975, dp / 2 + 0.03, grp);                              // dock door frame
            add(new THREE.BoxGeometry(3.2, 3.6, 0.15), flat('#c9a227'), dx, 1.8, dp / 2 + 0.05, grp);                                // roller doors
            add(new THREE.BoxGeometry(3.2, 0.12, 0.2), flat('#1d1d1f'), dx, 0.9, dp / 2 + 0.08, grp);                                // shutter seam
            add(new THREE.BoxGeometry(0.5, 0.9, 0.6), flat('#1d1d1f'), dx - 1.9, 0.6, dp / 2 + 0.3, grp);                           // dock bumpers
            add(new THREE.BoxGeometry(0.5, 0.9, 0.6), flat('#1d1d1f'), dx + 1.9, 0.6, dp / 2 + 0.3, grp);
          }
          for (var rv = 0; rv < 3; rv++) add(new THREE.BoxGeometry(1.4, 0.9, 1.4), flat('#8d9096'), (rv - 1) * w * 0.3, h + 0.95, -dp * 0.1, grp);  // roof vents
        }
        return grp;
      };

      // The industrial container yard lies beside the left wall, in the first building row (world z range).
      var YARD = { z0: -9.5, z1: 14.5 }; // ends before the front road at z = depth / 2
      // --- rows of buildings along each side of the shop ---
      var DIST0 = ROAD1 + 2.6;
      var sides = [
        { n: [1, 0], rot: kind === 'house' ? -Math.PI / 2 : Math.PI / 2, along: [-(hd + 18), hd + 18], span: 'z' },   // town houses face the street
        { n: [-1, 0], rot: kind === 'house' ? Math.PI / 2 : -Math.PI / 2, along: [-(hd + 18), hd + 18], span: 'z' },
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
            var inYard = d.theme === 'industrial' && row === 0 && sd.n[0] === -1 && cz > YARD.z0 - 8 && cz < YARD.z1 + 8; // keep the container yard clear
            if (rnd() < (row ? 0.85 : 0.92) && !inYard) { var bg = placeBuilding(cx, cz, sd.rot, w, dp, h, row); if (d.theme === 'city' && row === 0 && bg) cityStorefront(bg, w, dp, sd.n[0] ? -1 : 1); }
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


      // --- city only: storefronts, crosswalk, traffic lights, a bus stop and pedestrians. Own random stream, so the rest of the layout is unchanged. ---
      function cityStorefront(grp, w, dp, fs) {
        var shop = cpick(SHOPS), awn = cpick(['#c0392b', '#2c5aa0', '#2e8b57', '#e0a526', '#7a4fa0']);
        var fz = fs * (dp / 2);
        add(new THREE.BoxGeometry(w * 0.9, 3.0, 0.1), flat('#2b3a4a'), 0, 1.6, fz + fs * 0.07, grp);                 // shop window
        add(new THREE.BoxGeometry(1.5, 2.5, 0.12), flat('#e8f0f8'), (crnd() - 0.5) * w * 0.4, 1.35, fz + fs * 0.09, grp); // lit door
        var aw = add(new THREE.BoxGeometry(w * 0.82, 0.08, 1.0), flat(awn), 0, 3.35, fz + fs * 0.5, grp);               // awning
        aw.rotation.x = fs * 0.22;
        var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
        var cg = cv.getContext('2d'); cg.fillStyle = shop[1]; cg.fillRect(0, 0, 256, 64);
        cg.fillStyle = '#ffffff'; cg.font = 'bold 40px sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(shop[0], 128, 34);
        var st = own(new THREE.CanvasTexture(cv)); if (THREE.SRGBColorSpace) st.colorSpace = THREE.SRGBColorSpace;
        var sg2 = new THREE.PlaneGeometry(Math.min(w * 0.6, 4.2), 0.75), sm = add(sg2, own(new THREE.MeshBasicMaterial({ map: st })), 0, 4.0, fz + fs * 0.07, grp);
        if (fs < 0) sm.rotation.y = Math.PI;
      }
      function trafficLight(x, z, faceZ) {
        add(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 6), lampMat, x, 1.8, z);
        var head = add(new THREE.BoxGeometry(0.34, 1.0, 0.3), flat('#1d1d1f'), x, 3.9, z);
        [['#e0392b', 4.2], ['#e0a526', 3.9], ['#3cb371', 3.6]].forEach(function (c) {
          [-1, 1].forEach(function (sd2) { add(new THREE.SphereGeometry(0.1, 8, 6), flat(c[0]), x, c[1], z + sd2 * 0.16); });
        });
      }
      function pedestrian(x, z, ry) {
        var gp = new THREE.Group(); gp.position.set(x, 0, z); gp.rotation.y = ry; g.add(gp);
        var shirt = cpick(['#c0392b', '#2c5aa0', '#e0a526', '#2e8b57', '#7a4fa0', '#d9d4c7']), pants = cpick(['#2b2b2f', '#3d4a5c', '#5b4a3a']);
        [-0.09, 0.09].forEach(function (lx) { add(new THREE.BoxGeometry(0.14, 0.8, 0.16), flat(pants), lx, 0.4, 0, gp); });
        add(new THREE.BoxGeometry(0.4, 0.6, 0.22), flat(shirt), 0, 1.1, 0, gp);
        [-0.27, 0.27].forEach(function (ax) { add(new THREE.BoxGeometry(0.1, 0.55, 0.12), flat(shirt), ax, 1.1, 0, gp); });
        add(new THREE.SphereGeometry(0.15, 8, 6), flat(cpick(['#f1c9a5', '#d9a77e', '#a56f4a', '#7a4f33'])), 0, 1.6, 0, gp);
      }
      function busStop(x, z) {
        var gp = new THREE.Group(); gp.position.set(x, 0, z); gp.rotation.y = -Math.PI / 2; g.add(gp); // open side faces the shop and the road
        add(new THREE.BoxGeometry(3.0, 0.1, 1.3), flat('#3d4046'), 0, 2.5, 0, gp);                          // roof
        [-1.4, 1.4].forEach(function (px) { add(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), lampMat, px, 1.25, 0.55, gp); add(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), lampMat, px, 1.25, -0.55, gp); });
        add(new THREE.BoxGeometry(2.8, 1.8, 0.05), flat('#a9c6dc'), 0, 1.5, -0.6, gp);                      // glass back
        add(new THREE.BoxGeometry(1.8, 0.08, 0.4), flat('#7b8087'), 0, 0.5, -0.35, gp);                     // bench
        add(new THREE.BoxGeometry(0.9, 0.7, 0.04), flat('#2c5aa0'), 1.0, 1.6, -0.55, gp);                    // route map
        add(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), lampMat, 2.0, 1.6, 0.4, gp);                    // stop pole
        add(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 12), flat('#2c5aa0'), 2.0, 3.2, 0.4, gp).rotation.x = Math.PI / 2; // round sign
      }
      if (d.theme === 'city') {
        // Zebra crossing on the front road, right in front of the door.
        var zebra = flat('#f2f2f2');
        for (var zx = -2.25; zx <= 2.25; zx += 0.9) {
          var zg = new THREE.PlaneGeometry(0.5, ROAD1 - ROAD0 - 0.8); zg.rotateX(-Math.PI / 2);
          add(zg, zebra, zx, -0.02, hd + (ROAD0 + ROAD1) / 2);
        }
        var stopLine = new THREE.PlaneGeometry(5.4, 0.3); stopLine.rotateX(-Math.PI / 2);
        add(stopLine, zebra, 0, -0.02, hd + ROAD1 - 0.5);
        trafficLight(-3.3, hd + ROAD0 - 0.4); trafficLight(3.3, hd + ROAD1 + 0.6);
        busStop(hw + ROAD1 + 1.2, 4);
        // Pedestrians on the near sidewalk of the front and side streets, and one on the crossing.
        [[-6, 0.9, 1], [5.5, 1.5, 3], [-2.6, 1.2, -1], [hw + 1.1, -4, 0.5], [-hw - 1.3, 2.5, 2], [hw + 1.3, 8, 1.2]].forEach(function (pp) {
          var px = pp[0], pz = pp[1];
          if (Math.abs(px) < hw - 0.5) pedestrian(px, hd + pz, pp[2]); else pedestrian(px, pz, pp[2]);
        });
        pedestrian(1.35, hd + 4.3, Math.PI);
        pedestrian(-1.8, hd + ROAD1 + 1.2, 0.3);
      }
      if (d.theme === 'town') {
        // Benches under the shop's front windows and potted shrubs by the door, all beyond the wall's outer face (z = hd + 0.2).
        var wood = flat('#7a4a30'), iron = flat('#33363b');
        [-2.75, 2.75].forEach(function (bx) {
          add(new THREE.BoxGeometry(1.4, 0.07, 0.42), wood, bx, 0.46, hd + 0.7);
          add(new THREE.BoxGeometry(1.4, 0.36, 0.05), wood, bx, 0.78, hd + 0.5);
          [-0.6, 0.6].forEach(function (lx) { add(new THREE.BoxGeometry(0.06, 0.44, 0.4), iron, bx + lx, 0.22, hd + 0.7); });
        });
        // The shop's own sign above the door and striped awnings over its front windows.
        add(new THREE.BoxGeometry(1.7, 0.42, 0.08), signMat('BOUTIQUE', '#7a3b2e'), 0, 2.62, hd + 0.26);
        [-2.75, 2.75].forEach(function (ax2) {
          var aw2 = add(new THREE.BoxGeometry(1.7, 0.05, 0.8), awningMat('#b5483a'), ax2, 2.5, hd + 0.2 + 0.38);
          aw2.rotation.x = 0.3;
        });
        [-1.1, 1.1].forEach(function (px) {
          add(new THREE.CylinderGeometry(0.26, 0.2, 0.4, 7), flat('#b5654a'), px, 0.2, hd + 0.6);
          add(new THREE.SphereGeometry(0.34, 7, 5), flat('#4f8a42'), px, 0.62, hd + 0.6);
        });
      }

      // --- extras that make each place feel like itself ---
      if (d.theme === 'industrial') {
        // A container yard beside the left wall (clear of buildings, see YARD): ribbed shipping containers in stacks, with a
        // gantry crane straddling it. Further out: silos, a smokestack with a smoke plume, and an overcast layer of cloud.
        var ribTex = {};
        var ribbed = function (color) {
          if (ribTex[color]) return ribTex[color];
          var t = tex(64, 64, function (g2, w, h) {
            g2.fillStyle = color; g2.fillRect(0, 0, w, h);
            for (var rx = 0; rx < w; rx += 8) { g2.fillStyle = 'rgba(0,0,0,0.22)'; g2.fillRect(rx, 0, 3, h); g2.fillStyle = 'rgba(255,255,255,0.1)'; g2.fillRect(rx + 3, 0, 2, h); }
            g2.fillStyle = 'rgba(0,0,0,0.3)'; g2.fillRect(0, 0, w, 3); g2.fillRect(0, h - 3, w, 3);
          });
          return (ribTex[color] = shaded(color, t, 'rib' + color));
        };
        var cols = ['#c0392b', '#2c5aa0', '#2e8b57', '#e0a526', '#8a4b3a', '#d9d4c7'];
        var xc = -(hw + 17.5);
        for (var ix = -2; ix <= 2; ix++) {
          for (var iz = 0; iz < 2; iz++) {
            var lv = 1 + Math.floor(rnd() * 4);
            for (var l = 0; l < lv; l++) add(new THREE.BoxGeometry(2.6, 2.6, 11.6), ribbed(pick(cols)), xc + ix * 3.1, 1.3 + l * 2.6, YARD.z0 + 6 + iz * 12);
          }
        }
        // Gantry crane: two A-frame legs, a beam along the yard, a trolley and a container on the hook.
        var crane = new THREE.Group(); crane.position.set(xc, 0, (YARD.z0 + YARD.z1) / 2); g.add(crane);
        var cy = '#d6a321', halfLen = 12.9;
        [-halfLen, halfLen].forEach(function (cz) {
          [-5.2, 5.2].forEach(function (cx) { add(new THREE.BoxGeometry(0.7, 15, 0.7), flat(cy), cx, 7.5, cz, crane); });
          add(new THREE.BoxGeometry(11.4, 0.8, 1.2), flat(cy), 0, 15.2, cz, crane);          // cross girder
          add(new THREE.BoxGeometry(11.4, 0.5, 1.4), flat('#4a4f57'), 0, 0.25, cz, crane);   // foot rail
        });
        add(new THREE.BoxGeometry(1.4, 1.2, 2 * halfLen + 1.4), flat(cy), 0, 16.2, 0, crane);  // main beam
        add(new THREE.BoxGeometry(1.8, 0.9, 2.4), flat('#2c5aa0'), 0, 15.4, 4, crane);         // trolley
        add(new THREE.BoxGeometry(0.1, 1.2, 0.1), flat('#1d1d1f'), -0.6, 14.4, 4, crane);
        add(new THREE.BoxGeometry(0.1, 1.2, 0.1), flat('#1d1d1f'), 0.6, 14.4, 4, crane);
        add(new THREE.BoxGeometry(2.4, 0.3, 5), flat('#4a4f57'), 0, 13.7, 4, crane);           // spreader
        add(new THREE.BoxGeometry(2.6, 2.6, 11.6), ribbed('#c0392b'), 0, 12.2, 4, crane);      // the hanging container (bottom at 10.9)
        // Silos, a smokestack with smoke, and overcast clouds.
        [0, 1, 2].forEach(function (k) {
          var sx3 = hw + 62, sz3 = -hd - 8 + k * 9;
          add(new THREE.CylinderGeometry(3.4, 3.4, 20, 12), flat('#c9ccd0'), sx3, 10, sz3);
          add(new THREE.ConeGeometry(3.6, 3, 12), flat('#8d9096'), sx3, 21.5, sz3);
        });
        add(new THREE.CylinderGeometry(1.8, 2.4, 40, 10), flat('#a8a39a'), -hw - 60, 20, -hd - 20);
        add(new THREE.CylinderGeometry(1.85, 1.85, 4, 10), flat('#c0392b'), -hw - 60, 38, -hd - 20);
        var smokeMat = own(new THREE.MeshBasicMaterial({ color: '#7d8389', transparent: true, opacity: 0.7, depthWrite: false }));
        for (var sp2 = 0; sp2 < 6; sp2++) {
          var puff2 = add(new THREE.SphereGeometry(2.2 + sp2 * 0.9, 8, 6), smokeMat, -hw - 60 + sp2 * 3.2, 43 + sp2 * 3.6, -hd - 20 + sp2 * 1.4);
          puff2.scale.y = 0.75;
        }
        var cloudMat2 = flat('#aab0b6');
        for (var oc = 0; oc < 16; oc++) {
          var oc1 = add(new THREE.SphereGeometry(between(9, 15), 8, 5), cloudMat2, between(-85, 85), between(48, 66), between(-85, 40));
          oc1.scale.y = 0.3;
        }
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
      if (d.theme === 'medieval') {
        // Village dressing, all well beyond the shop's walls: a well at the crossroads, a market, a paddock with hay, a windmill.
        var wood = flat('#6b4a2f'), stone = shaded('#8d887d', null, 'medStone');
        var wx0 = hw + 4.7, wz0 = hd + 4.7;
        add(new THREE.CylinderGeometry(0.95, 1.05, 0.9, 8), stone, wx0, 0.45, wz0);
        add(new THREE.CircleGeometry(0.62, 8), flat('#1d2f45'), wx0, 0.91, wz0).rotation.x = -Math.PI / 2;
        [-1, 1].forEach(function (sx) { add(new THREE.BoxGeometry(0.14, 1.9, 0.14), wood, wx0 + sx * 0.95, 1.45, wz0); });
        add(new THREE.BoxGeometry(0.1, 0.1, 1.6), wood, wx0, 2.3, wz0);
        var wroof = add(new THREE.ConeGeometry(1.7, 0.9, 4), flat('#7a3b2e'), wx0, 2.8, wz0); wroof.rotation.y = Math.PI / 4;
        add(new THREE.BoxGeometry(0.25, 0.3, 0.25), wood, wx0, 1.7, wz0);                           // bucket
        // Two market stalls on the left road, striped awnings and goods on the counters.
        [-4, -9].forEach(function (sz, si) {
          var sx = -hw - 4.7, st = new THREE.Group();
          st.position.set(sx, 0, sz); g.add(st);
          add(new THREE.BoxGeometry(1.2, 0.9, 2.6), wood, 0, 0.45, 0, st);                                 // counter
          [[-0.55, -1.2], [0.55, -1.2], [-0.55, 1.2], [0.55, 1.2]].forEach(function (pp) { add(new THREE.BoxGeometry(0.1, 2.3, 0.1), wood, pp[0], 1.15, pp[1], st); });
          for (var sb = 0; sb < 5; sb++) add(new THREE.BoxGeometry(1.5, 0.08, 0.52), flat(sb % 2 ? '#e8e2cf' : (si ? '#2c5aa0' : '#b3262e')), 0, 2.4 - 0.001 * sb, -1.04 + sb * 0.52, st);
          for (var gd = 0; gd < 4; gd++) add(new THREE.SphereGeometry(0.17, 6, 5), flat(['#c0392b', '#e0a526', '#6aa84f', '#e8742a'][(gd + si) % 4]), -0.2 + (gd % 2) * 0.4, 1.0, -0.8 + gd * 0.5, st);
        });
        // A fenced paddock with haystacks beyond the front-right corner of the crossroads.
        var px = hw + 6, pz = hd + 14;
        for (var fp = -3; fp <= 3; fp++) {
          [[px - 3.6, pz + fp * 1.3, 0], [px + 3.6, pz + fp * 1.3, 0], [px + fp * 1.2, pz - 4.2, 1], [px + fp * 1.2, pz + 4.2, 1]].forEach(function (f) {
            add(new THREE.BoxGeometry(0.12, 1.0, 0.12), wood, f[0], 0.5, f[1]);
            if (fp < 3) { var rl = add(new THREE.BoxGeometry(f[2] ? 1.2 : 0.08, 0.08, f[2] ? 0.08 : 1.3), wood, f[0] + (f[2] ? 0.6 : 0), 0.75, f[1] + (f[2] ? 0 : 0.65)); }
          });
        }
        [[-1.4, -1], [1.2, 0.6], [-0.2, 2]].forEach(function (hp, hi) {
          add(new THREE.CylinderGeometry(0.95, 1.0, 0.8, 8), flat('#d9b44a'), px + hp[0], 0.4, pz + hp[1]);
          add(new THREE.ConeGeometry(0.88, 1.1 + 0.2 * (hi % 2), 8), flat('#c9a23a'), px + hp[0], 1.35, pz + hp[1]);
        });
        // A windmill on the far green, its sails turning slowly toward the shop.
        var mx = hw + 48, mz = 14, mill = new THREE.Group(); mill.scale.setScalar(2.4);
        mill.position.set(mx, 0, mz); mill.rotation.y = Math.atan2(-mx, -mz); g.add(mill);
        add(new THREE.CylinderGeometry(1.6, 2.5, 7, 8), shaded('#e4d9c0', null, 'millBody'), 0, 3.5, 0, mill);
        add(new THREE.ConeGeometry(2.2, 2.6, 8), flat('#7a3b2e'), 0, 8.3, 0, mill);
        var sails = new THREE.Group(); sails.position.set(0, 6.3, 2.0); mill.add(sails);
        add(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 6), wood, 0, 0, -0.1, sails).rotation.x = Math.PI / 2;
        for (var sk2 = 0; sk2 < 4; sk2++) {
          var arm = new THREE.Group(); arm.rotation.z = sk2 * Math.PI / 2; sails.add(arm);
          add(new THREE.BoxGeometry(0.12, 5.6, 0.12), wood, 0, 2.9, 0, arm);
          add(new THREE.BoxGeometry(0.9, 4.2, 0.05), flat('#e8dcc0'), 0.55, 3.2, 0.1, arm);
        }
        this.sails = sails;
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
