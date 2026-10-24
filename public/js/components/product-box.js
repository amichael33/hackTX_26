/* Classic script: `product-box` component. A tier-colored cube with an optional thumbnail on its +z face
   and a billboarded comic price sticker floating above it. */
(function () {
  var geoCache = {}; // size -> BoxGeometry, shared by every box
  var matCache = {}; // color -> MeshStandardMaterial
  var planeGeoCache = {};

  // Preallocated scratch objects: tick runs every frame and must not allocate.
  var vCam = new THREE.Vector3();
  var vMesh = new THREE.Vector3();
  var qParent = new THREE.Quaternion();

  function boxGeo(size) {
    return geoCache[size] || (geoCache[size] = new THREE.BoxGeometry(size, size, size));
  }
  function planeGeo(size) {
    return planeGeoCache[size] || (planeGeoCache[size] = new THREE.PlaneGeometry(size * 0.9, size * 0.9));
  }
  function boxMat(color) {
    return matCache[color] || (matCache[color] = new THREE.MeshStandardMaterial({ color: color, flatShading: true }));
  }
  function hashSeed(str) {
    var h = 5381;
    str = String(str);
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }

  AFRAME.registerComponent('product-box', {
    schema: {
      productId: { type: 'string' },
      thumb: { type: 'string', default: '' },
      color: { type: 'color', default: '#2196f3' },
      size: { default: 0.3 },
      sticker: { type: 'string', default: '' },
      price: { type: 'string', default: '' }
    },
    init: function () {
      var self = this;
      this.el.classList.add('clickable');
      this.mesh = null;
      this.plane = null;
      this.standee = null;
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
      if (old.size !== d.size || old.color !== d.color || old.thumb !== d.thumb) {
        this.clear();
        this.build();
      } else if (this.stickerMesh && (old.sticker !== d.sticker || old.price !== d.price)) {
        this.drawStickerLater();
      }
    },
    tick: function () {
      var m = this.stickerMesh;
      var cam = this.el.sceneEl && this.el.sceneEl.camera;
      if (!m || !cam) return;
      cam.getWorldPosition(vCam);
      m.getWorldPosition(vMesh);
      // Yaw-only billboard: world yaw toward the camera, minus the parent's world yaw.
      this.el.object3D.getWorldQuaternion(qParent);
      var parentYaw = 2 * Math.atan2(qParent.y, qParent.w);
      m.rotation.set(0, Math.atan2(vCam.x - vMesh.x, vCam.z - vMesh.z) - parentYaw, this.tilt);
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
      if (this.standee) {
        var st = this.standee;
        st.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          // The cardboard material is shared via matCache; only the canvas-textured one is ours.
          if (o.material && o.material.map) { o.material.map.dispose(); o.material.dispose(); }
        });
        this.el.removeObject3D('standee');
        this.standee = null;
      }
      if (this.plane) {
        if (this.plane.material) {
          if (this.plane.material.map) this.plane.material.map.dispose();
          this.plane.material.dispose();
        }
        this.el.removeObject3D('thumb');
        this.plane = null;
      }
      if (this.mesh) { this.el.removeObject3D('mesh'); this.mesh = null; }
    },
    build: function () {
      var d = this.data, self = this;
      var buildId = ++this.buildId;
      this.mesh = new THREE.Mesh(boxGeo(d.size), boxMat(d.color));
      this.el.setObject3D('mesh', this.mesh);
      this.buildSticker();
      if (!d.thumb) return;
      var url = '/api/img?u=' + encodeURIComponent(d.thumb);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (self.buildId !== buildId || !self.mesh) return; // removed or rebuilt while loading
        var cut = null;
        try { cut = self.makeCutout(img); } catch (e) { cut = null; } // tainted canvas etc.
        if (cut) self.buildStandee(cut);
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
      if (res.removedFraction < 0.04) return null;
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
    buildStandee: function (cut) {
      var d = this.data, size = d.size;
      var pw, ph;
      if (cut.aspect >= 1) { pw = size; ph = size / cut.aspect; } else { ph = size; pw = size * cut.aspect; }
      var tex = new THREE.CanvasTexture(cut.canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
      plane.position.y = -size / 2 + ph / 2; // bottom edge on the surface the box sat on
      var stand = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.9, ph * 0.25, 0.012), boxMat('#c8a165'));
      stand.position.set(0, -size / 2 + ph * 0.125, -0.008);
      var group = new THREE.Group();
      group.add(plane);
      group.add(stand);
      this.standee = group;
      this.el.setObject3D('standee', group);
      // Hidden, not removed: the box stays in the raycast target set, so the click area is unchanged.
      this.mesh.visible = false;
      if (this.stickerMesh) {
        var side = size * 0.7;
        this.stickerMesh.position.y = -size / 2 + ph + side / 2 + 0.02;
      }
    },
    buildThumbPlane: function (url, buildId) {
      var d = this.data, self = this;
      var loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, function (tex) {
        if (self.buildId !== buildId || !self.mesh) { tex.dispose(); return; } // removed or rebuilt while loading
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        var plane = new THREE.Mesh(planeGeo(d.size), new THREE.MeshBasicMaterial({ map: tex }));
        plane.position.z = d.size / 2 + 0.002;
        self.plane = plane;
        self.el.setObject3D('thumb', plane);
      }, undefined, function () {
        if (self.buildId === buildId) self.plane = null;
      });
    },
    buildSticker: function () {
      var d = this.data;
      var side = d.size * 0.7;
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      var tex = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(side, side), mat);
      mesh.position.y = d.size / 2 + side / 2 + 0.02;
      mesh.rotation.order = 'YXZ'; // yaw first, so the z-tilt stays in the sticker's own plane
      mesh.renderOrder = 1;
      // Fixed per-product z-tilt of +-10 degrees.
      this.tilt = ((hashSeed(d.productId + ':tilt') % 2001) / 1000 - 1) * (10 * Math.PI / 180);
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
