/* Classic script: `product-box` component. A brand-colored cube with the product photo (or its background-removed
   cutout) on its +z face and the comic price sticker stuck on the same face.
   kind:garment turns it into a hanging garment instead: a hanger in the brand color and the cutout hanging from it
   (origin = the rail the hook sits on), with the sticker on the garment. The click target stays a (clear) box. */
(function () {
  var geoCache = {}; // size -> BoxGeometry, shared by every box
  var matCache = {}; // color -> MeshStandardMaterial
  var planeGeoCache = {};

  function boxGeo(size) {
    return geoCache[size] || (geoCache[size] = new THREE.BoxGeometry(size, size, size));
  }
  function planeGeo(size) {
    return planeGeoCache[size] || (planeGeoCache[size] = new THREE.PlaneGeometry(size * 0.9, size * 0.9));
  }
  function boxMat(color) {
    return matCache[color] || (matCache[color] = new THREE.MeshStandardMaterial({ color: color, flatShading: true }));
  }
  // Product photos go through the image proxy; data: URLs (the demo garments) are used as they are.
  function imageUrl(thumb) {
    return String(thumb).indexOf('data:') === 0 ? thumb : '/api/img?u=' + encodeURIComponent(thumb);
  }
  var clearMat = null;
  function hitMat() {
    return clearMat || (clearMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  }
  var GW = 0.46, GH = 0.66, HANGER_DROP = 0.075; // garment fits GW x GH, hangs HANGER_DROP below the rail

  function hashSeed(str) {
    var h = 5381;
    str = String(str);
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }

  // A plain T-shirt shape in the retailer's color, for a garment whose photo is missing or fails to load.
  function silhouette(color) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var pts = [[34, 10], [52, 10], [64, 24], [76, 10], [94, 10], [124, 40], [106, 62], [94, 52], [94, 120], [34, 120], [34, 52], [22, 62], [4, 40]];
    g.fillStyle = color;
    g.beginPath();
    pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.closePath();
    g.fill();
    return { canvas: c, aspect: 1 };
  }

  AFRAME.registerComponent('product-box', {
    schema: {
      productId: { type: 'string' },
      thumb: { type: 'string', default: '' },
      color: { type: 'color', default: '#2196f3' },
      size: { default: 0.3 },
      kind: { default: 'box', oneOf: ['box', 'garment'] },
      sticker: { type: 'string', default: '' },
      price: { type: 'string', default: '' }
    },
    init: function () {
      var self = this;
      this.el.classList.add('clickable');
      this.mesh = null;
      this.plane = null;
      this.stickerMesh = null;
      this.stickerCanvas = null;
      this.tilt = 0;
      this.stickerToken = 0; // bumps on every redraw/clear so a stale async draw is ignored
      this.buildId = 0;      // bumps on every build/clear so a stale thumbnail load is ignored
      this.removed = false;
      this.onClick = function () {
        self.el.emit('product-selected', { productId: self.data.productId }, true);
      };
      this.el.addEventListener('click', this.onClick);
      this.build();
    },
    update: function (old) {
      if (!old || old.size === undefined) return; // first call: init already built
      var d = this.data;
      if (old.size !== d.size || old.color !== d.color || old.thumb !== d.thumb || old.kind !== d.kind) {
        this.clear();
        this.build();
      } else if (this.stickerMesh && (old.sticker !== d.sticker || old.price !== d.price)) {
        this.drawStickerLater();
      }
    },
    remove: function () {
      this.removed = true;
      this.el.removeEventListener('click', this.onClick);
      this.clear();
    },
    clear: function () {
      this.buildId++;
      this.stickerToken++;
      if (this.stickerMesh) {
        var sm = this.stickerMesh;
        if (sm.material) {
          if (sm.material.map) sm.material.map.dispose();
          sm.material.dispose();
        }
        if (sm.geometry) sm.geometry.dispose();
        this.el.removeObject3D('sticker');
        this.stickerMesh = null;
        this.stickerCanvas = null;
      }
      if (this.plane) {
        if (this.plane.material) {
          if (this.plane.material.map) this.plane.material.map.dispose();
          this.plane.material.dispose();
        }
        this.el.removeObject3D('thumb');
        this.plane = null;
      }
      if (this.hanger) {
        this.hanger.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
        this.el.removeObject3D('hanger');
        this.hanger = null;
      }
      if (this.mesh) { this.el.removeObject3D('mesh'); this.mesh = null; }
    },
    build: function () {
      var d = this.data, self = this;
      var buildId = ++this.buildId;
      if (d.kind === 'garment') { this.buildGarment(buildId); return; }
      this.mesh = new THREE.Mesh(boxGeo(d.size), boxMat(d.color));
      this.el.setObject3D('mesh', this.mesh);
      this.buildSticker();
      if (!d.thumb) return;
      var url = imageUrl(d.thumb);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (self.buildId !== buildId || !self.mesh) return; // removed or rebuilt while loading
        var cut = null;
        try { cut = self.makeCutout(img); } catch (e) { cut = null; } // tainted canvas etc.
        if (cut) self.buildCutoutPlane(cut);
        else self.buildThumbPlane(url, buildId);
      };
      img.onerror = function () { /* keep the colored box, no plane */ };
      img.src = url;
    },
    // Returns { canvas, aspect } for a background-removed crop, or null when the photo has no plain background.
    makeCutout: function (img) {
      var SC = window.StoreCutout;
      if (!SC) return null;
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      if (!iw || !ih) return null;
      var k = Math.min(1, 256 / Math.max(iw, ih));
      var w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
      var src = document.createElement('canvas');
      src.width = w; src.height = h;
      var ctx = src.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var id = ctx.getImageData(0, 0, w, h); // throws if tainted
      var res = SC.removeEdgeBackground(id.data, w, h);
      if (res.removedFraction < 0.04 || res.removedFraction > 0.9) return null; // plain photo or white-on-white eaten
      var bb = SC.alphaBBox(id.data, w, h);
      if (!bb) return null;
      ctx.putImageData(id, 0, 0);
      var pad = 2;
      var x0 = Math.max(0, bb.x - pad), y0 = Math.max(0, bb.y - pad);
      var x1 = Math.min(w, bb.x + bb.w + pad), y1 = Math.min(h, bb.y + bb.h + pad);
      var cw = x1 - x0, ch = y1 - y0;
      var out = document.createElement('canvas');
      out.width = cw; out.height = ch;
      out.getContext('2d').drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);
      return { canvas: out, aspect: cw / ch };
    },
    // The cutout sits on the box's +z face (the box stays visible behind it), fitted inside the face.
    buildCutoutPlane: function (cut) {
      var size = this.data.size, fit = size * 0.84;
      var pw, ph;
      if (cut.aspect >= 1) { pw = fit; ph = fit / cut.aspect; } else { ph = fit; pw = fit * cut.aspect; }
      var tex = new THREE.CanvasTexture(cut.canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
      plane.position.set(0, size * 0.04, size / 2 + 0.008);
      this.plane = plane;
      this.el.setObject3D('thumb', plane);
    },
    buildThumbPlane: function (url, buildId) {
      var d = this.data, self = this;
      var loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, function (tex) {
        if (self.buildId !== buildId || !self.mesh) { tex.dispose(); return; } // removed or rebuilt while loading
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        var plane = new THREE.Mesh(planeGeo(d.size), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
        plane.position.set(0, d.size * 0.04, d.size / 2 + 0.008);
        self.plane = plane;
        self.el.setObject3D('thumb', plane);
      }, undefined, function () {
        if (self.buildId === buildId) self.plane = null;
      });
    },
    // --- hanging garment ---
    buildGarment: function (buildId) {
      var d = this.data, self = this;
      // Click target: a clear box around the garment, resized once the photo's shape is known.
      this.mesh = new THREE.Mesh(boxGeo(1), hitMat());
      this.mesh.scale.set(GW, GH, 0.1);
      this.mesh.position.set(0, -HANGER_DROP - GH / 2, 0);
      this.el.setObject3D('mesh', this.mesh);
      // Hanger: a hook over the rail and a roof-shaped shoulder bar in the retailer's color.
      var g = new THREE.Group();
      var m = boxMat(d.color);
      var hook = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 5), m);
      hook.position.y = 0.0;
      var left = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.012), m);
      left.position.set(-0.095, -0.065, 0); left.rotation.z = 0.32;
      var right = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.012), m);
      right.position.set(0.095, -0.065, 0); right.rotation.z = -0.32;
      g.add(hook, left, right);
      this.hanger = g;
      this.el.setObject3D('hanger', g);
      this.buildSticker();
      this.placeGarmentSticker(GW, GH);
      var show = function (cut) { self.buildGarmentPlane(cut); };
      if (!d.thumb) { show(silhouette(d.color)); return; }
      var url = imageUrl(d.thumb);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (self.buildId !== buildId || !self.mesh) return;
        var cut = null;
        try { cut = self.makeCutout(img); } catch (e) { cut = null; }
        if (!cut) { // a photo with its own background: use it whole
          var c = document.createElement('canvas');
          c.width = img.naturalWidth || 128; c.height = img.naturalHeight || 128;
          c.getContext('2d').drawImage(img, 0, 0);
          cut = { canvas: c, aspect: c.width / c.height };
        }
        show(cut);
      };
      img.onerror = function () { if (self.buildId === buildId && self.mesh) show(silhouette(d.color)); };
      img.src = url;
    },
    // The garment image (double-sided, transparent around the cutout) hangs from the hanger, top edge under the shoulder bar.
    buildGarmentPlane: function (cut) {
      var pw, ph;
      if (cut.aspect >= GW / GH) { pw = GW; ph = GW / cut.aspect; } else { ph = GH; pw = GH * cut.aspect; }
      var tex = new THREE.CanvasTexture(cut.canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
      plane.position.set(0, -HANGER_DROP - ph / 2, 0);
      if (this.plane) this.el.removeObject3D('thumb');
      this.plane = plane;
      this.el.setObject3D('thumb', plane);
      this.mesh.scale.set(pw, ph, 0.1);
      this.mesh.position.set(0, -HANGER_DROP - ph / 2, 0);
      this.placeGarmentSticker(pw, ph);
    },
    placeGarmentSticker: function (pw, ph) {
      if (!this.stickerMesh) return;
      this.stickerMesh.position.set(pw * 0.22, -HANGER_DROP - ph * 0.72, 0.02);
    },
    buildSticker: function () {
      var d = this.data;
      var side = d.size * 0.55;
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      var tex = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(side, side), mat);
      mesh.position.set(d.size * 0.2, -d.size * 0.2, d.size / 2 + 0.018); // lower-right of the +z face
      mesh.renderOrder = 1;
      // Fixed per-product z-tilt of +-10 degrees.
      this.tilt = ((hashSeed(d.productId + ':tilt') % 2001) / 1000 - 1) * (10 * Math.PI / 180);
      mesh.rotation.z = this.tilt;
      this.stickerMesh = mesh;
      this.stickerCanvas = canvas;
      this.el.setObject3D('sticker', mesh);
      this.drawStickerLater();
    },
    drawStickerLater: function () {
      var self = this;
      var token = ++this.stickerToken;
      var draw = function () {
        if (self.removed || token !== self.stickerToken || !self.stickerMesh) return;
        var d = self.data;
        window.StoreSticker.drawSticker(self.stickerCanvas, { price: d.price, text: d.sticker, seed: d.productId });
        self.stickerMesh.material.map.needsUpdate = true;
      };
      var fonts = document.fonts;
      if (!fonts || !fonts.load) { draw(); return; }
      var timeout = new Promise(function (resolve) { setTimeout(resolve, 2000); });
      Promise.race([fonts.load('64px Bangers').catch(function () {}), timeout]).then(draw, draw);
    }
  });
})();
