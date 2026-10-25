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
  var GARMENT_BULGE = 0.04;                       // how far the front sheet bulges out at its middle
  // How far the cloth sheet bulges toward the viewer at (u, v) in -1..1: most at the middle, none at the edges.
  function garmentBulge(u, v) { return GARMENT_BULGE * (1 - u * u) * (1 - 0.35 * v * v); }

  function hashSeed(str) {
    var h = 5381;
    str = String(str);
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }

  // A garment-shaped model of the kind the title names (default tee) filled with one color: used when the photo is missing
  // or fails to load, and for photos of a person wearing the garment (see StoreGarment.analyzePhoto).
  function silhouette(color, kind) {
    var SG = window.StoreGarment;
    var pts = (SG && SG.SILHOUETTES[kind || 'tee']) || [[30, 8], [70, 8], [96, 30], [82, 48], [72, 40], [72, 110], [28, 110], [28, 40], [18, 48], [4, 30]];
    var c = document.createElement('canvas');
    c.width = 100; c.height = 120;
    var g = c.getContext('2d');
    g.fillStyle = color;
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    if (kind === 'hoodie') { g.rect(38, 76, 24, 14); g.moveTo(44, 12); g.lineTo(44, 40); g.moveTo(56, 12); g.lineTo(56, 40); }
    else if (kind === 'jacket') { g.moveTo(50, 16); g.lineTo(50, 112); }
    g.stroke();
    return { canvas: c, aspect: c.width / c.height };
  }

  AFRAME.registerComponent('product-box', {
    schema: {
      productId: { type: 'string' },
      thumb: { type: 'string', default: '' },
      title: { type: 'string', default: '' }, // names the garment kind (hoodie, tee, ...) for on-model photos
      color: { type: 'color', default: '#2196f3' },
      size: { default: 0.3 },
      kind: { default: 'box', oneOf: ['box', 'garment'] },
      sticker: { type: 'string', default: '' },
      price: { type: 'string', default: '' },
      rating: { type: 'string', default: '' } // "4.6": draws a small star badge opposite the price sticker; '' = no badge
    },
    init: function () {
      var self = this;
      this.el.classList.add('clickable');
      this.mesh = null;
      this.plane = null;
      this.stickerMesh = null;
      this.stickerCanvas = null;
      this.ratingMesh = null;
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
      if (old.size !== d.size || old.color !== d.color || old.thumb !== d.thumb || old.kind !== d.kind || old.title !== d.title || old.rating !== d.rating) {
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
      if (this.ratingMesh) {
        var rm = this.ratingMesh;
        if (rm.material.map) rm.material.map.dispose();
        rm.material.dispose(); rm.geometry.dispose();
        this.el.removeObject3D('rating');
        this.ratingMesh = null;
      }
      if (this.plane) {
        var own = this.plane.userData.ownGeometry; // garments build their own curved geometry; box planes share a cached one
        this.plane.traverse(function (o) {
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            if (o.material.emissiveMap && o.material.emissiveMap !== o.material.map) o.material.emissiveMap.dispose();
            o.material.dispose();
          }
          if (own && o.geometry) o.geometry.dispose();
        });
        this.el.removeObject3D('thumb');
        this.plane = null;
      }
      if (this.hanger) {
        this.hanger.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.userData.tag && o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } // the photo tag owns its material
        });
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
      this.buildRating(d.size * 0.42, [-d.size * 0.27, d.size * 0.27, d.size / 2 + 0.018]);
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
      this.buildRating(0.17, [-GW * 0.2, -HANGER_DROP - GH * 0.9, 0.05]);
      this.placeGarmentSticker(GW, GH);
      var kind = window.StoreGarment ? window.StoreGarment.kindFromTitle(d.title) : 'tee';
      var show = function (cut) { self.buildGarmentPlane(cut); };
      if (!d.thumb) { show(silhouette(d.color, kind)); return; }
      var url = imageUrl(d.thumb);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (self.buildId !== buildId || !self.mesh) return;
        var cut = null;
        try { cut = self.makeCutout(img); } catch (e) { cut = null; }
        var model = cut ? self.personModel(cut, kind) : null;
        if (model) { // someone is wearing it: draw a garment-shaped model and hang the photo on the hanger as a tag
          show(model);
          self.buildPhotoTag(cut);
          return;
        }
        if (!cut) { // a photo with its own background: use it whole
          var c = document.createElement('canvas');
          c.width = img.naturalWidth || 128; c.height = img.naturalHeight || 128;
          c.getContext('2d').drawImage(img, 0, 0);
          cut = { canvas: c, aspect: c.width / c.height };
        }
        show(cut);
      };
      img.onerror = function () { if (self.buildId === buildId && self.mesh) show(silhouette(d.color, kind)); };
      img.src = url;
    },
    // For a cut-out photo of a person wearing the garment: a silhouette of this kind filled with the torso color, else null.
    personModel: function (cut, kind) {
      var SG = window.StoreGarment;
      if (!SG) return null;
      try {
        var c = cut.canvas;
        var res = SG.analyzePhoto(c.getContext('2d').getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if (!res.isPerson || !res.color) return null;
        return silhouette(res.color, kind);
      } catch (e) { return null; }
    },
    // The original on-model photo as a small tag on a string from the left end of the hanger.
    buildPhotoTag: function (cut) {
      if (!this.hanger) return;
      var tw = 0.11, th = 0.11;
      if (cut.aspect >= 1) th = tw / cut.aspect; else tw = th * cut.aspect;
      var tex = new THREE.CanvasTexture(cut.canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
      var tag = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), mat);
      tag.userData.tag = true;
      tag.position.set(-0.19, -0.16 - th / 2, 0.03);
      var str = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.09, 0.003), boxMat('#e8e4d8'));
      str.position.set(-0.19, -0.115, 0.03);
      this.hanger.add(tag, str);
    },
    // The garment is two gently bulging sheets (front and back) joined at the edges, lit like cloth, so it has some volume
    // instead of being a flat cut-out. Top edge sits just under the shoulder bar.
    buildGarmentPlane: function (cut) {
      var pw, ph;
      if (cut.aspect >= GW / GH) { pw = GW; ph = GW / cut.aspect; } else { ph = GH; pw = GH * cut.aspect; }
      var tex = new THREE.CanvasTexture(cut.canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var mkMat = function () {
        // Lambert shading gives the curve some light and shadow; the emissive map keeps the photo's colors bright.
        return new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.55, transparent: true, alphaTest: 0.1 });
      };
      var geo = new THREE.PlaneGeometry(pw, ph, 10, 12);
      var pos = geo.attributes.position;
      for (var i = 0; i < pos.count; i++) pos.setZ(i, garmentBulge(pos.getX(i) / (pw / 2), pos.getY(i) / (ph / 2)));
      geo.computeVertexNormals();
      var front = new THREE.Mesh(geo, mkMat());
      var back = new THREE.Mesh(geo, mkMat());
      back.rotation.y = Math.PI; // the same sheet turned to face the other way (the back of the cloth)
      var group = new THREE.Group();
      group.add(front, back);
      group.position.set(0, -HANGER_DROP - ph / 2, 0);
      group.userData.ownGeometry = true;
      group.userData.size = { w: pw, h: ph };
      if (this.plane) this.el.removeObject3D('thumb');
      this.plane = group;
      this.el.setObject3D('thumb', group);
      this.mesh.scale.set(pw, ph, 0.1 + 2 * GARMENT_BULGE);
      this.mesh.position.set(0, -HANGER_DROP - ph / 2, 0);
      this.placeGarmentSticker(pw, ph);
    },
    placeGarmentSticker: function (pw, ph) {
      if (this.ratingMesh) this.ratingMesh.position.set(-pw / 2 * 0.44, -HANGER_DROP - ph / 2 - ph / 2 * 0.44, garmentBulge(-0.44, -0.44) + 0.012); // lower left, mirroring the price
      if (!this.stickerMesh) return;
      var u = 0.44, v = -0.44; // lower right of the garment, in -1..1 sheet coordinates
      this.stickerMesh.position.set(pw / 2 * u, -HANGER_DROP - ph / 2 + ph / 2 * v, garmentBulge(u, v) + 0.012);
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
    // The star-rating badge: a small round sticker on the opposite corner to the price (none when the product has no rating).
    buildRating: function (side, pos) {
      var d = this.data;
      if (!d.rating) return;
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      window.StoreSticker.drawRating(canvas, { rating: d.rating });
      var tex = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(side, side), mat);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.renderOrder = 1;
      this.ratingMesh = mesh;
      this.el.setObject3D('rating', mesh);
      var fonts = document.fonts, self = this;
      if (fonts && fonts.load) fonts.load('54px Bangers').then(function () { // redraw once the comic font is in
        if (self.ratingMesh !== mesh) return;
        window.StoreSticker.drawRating(canvas, { rating: d.rating });
        tex.needsUpdate = true;
      }).catch(function () {});
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
