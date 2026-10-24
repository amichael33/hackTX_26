/* Classic script: `product-box` component. A tier-colored cube with an optional thumbnail on its +z face. */
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

  AFRAME.registerComponent('product-box', {
    schema: {
      productId: { type: 'string' },
      thumb: { type: 'string', default: '' },
      color: { type: 'color', default: '#2196f3' },
      size: { default: 0.3 }
    },
    init: function () {
      var self = this;
      this.el.classList.add('clickable');
      this.mesh = null;
      this.plane = null;
      this.onClick = function () {
        self.el.emit('product-selected', { productId: self.data.productId }, true);
      };
      this.el.addEventListener('click', this.onClick);
      this.build();
    },
    update: function (old) {
      if (old && old.size !== undefined && (old.size !== this.data.size || old.color !== this.data.color || old.thumb !== this.data.thumb)) {
        this.clear();
        this.build();
      }
    },
    remove: function () {
      this.el.removeEventListener('click', this.onClick);
      this.clear();
    },
    clear: function () {
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
      this.mesh = new THREE.Mesh(boxGeo(d.size), boxMat(d.color));
      this.el.setObject3D('mesh', this.mesh);
      if (!d.thumb) return;
      var loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      var url = '/api/img?u=' + encodeURIComponent(d.thumb);
      loader.load(url, function (tex) {
        if (!self.mesh) { tex.dispose(); return; } // removed while loading
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        var plane = new THREE.Mesh(planeGeo(d.size), new THREE.MeshBasicMaterial({ map: tex }));
        plane.position.z = d.size / 2 + 0.002;
        self.plane = plane;
        self.el.setObject3D('thumb', plane);
      }, undefined, function () {
        // Texture failed: keep the colored box, no plane.
        self.plane = null;
      });
    }
  });
})();
