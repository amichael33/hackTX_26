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
      var loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      var url = '/api/img?u=' + encodeURIComponent(d.thumb);
      loader.load(url, function (tex) {
        if (self.buildId !== buildId || !self.mesh) { tex.dispose(); return; } // removed or rebuilt while loading
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        var plane = new THREE.Mesh(planeGeo(d.size), new THREE.MeshBasicMaterial({ map: tex }));
        plane.position.z = d.size / 2 + 0.002;
        self.plane = plane;
        self.el.setObject3D('thumb', plane);
      }, undefined, function () {
        // Texture failed: keep the colored box, no plane.
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
