/* Classic script: `zone-banner` component. A slim white panel with a dark bottom edge and
   crisp canvas-texture text on its +z face. Faces local +z. */
(function () {
  AFRAME.registerComponent('zone-banner', {
    schema: { text: { default: '' }, width: { default: 2 }, height: { default: 0.26 } },
    init: function () {
      this.token = 0;
      this.disposables = [];
      this.group = new THREE.Group();
      this.el.setObject3D('zone-banner', this.group);
      this.build();
    },
    update: function (old) {
      if (!old || Object.keys(old).length === 0) return; // init already built
      this.clear();
      this.build();
    },
    remove: function () {
      this.clear();
      this.el.removeObject3D('zone-banner');
    },
    clear: function () {
      this.token++; // any pending font-wait draw is now stale
      while (this.group.children.length) this.group.remove(this.group.children[0]);
      this.disposables.forEach(function (d) { d.dispose(); });
      this.disposables = [];
    },
    build: function () {
      var d = this.data, self = this;
      var panelGeo = new THREE.BoxGeometry(d.width, d.height, 0.04);
      var panelMat = new THREE.MeshStandardMaterial({ color: '#fbfbfd', roughness: 0.85, metalness: 0 });
      var panel = new THREE.Mesh(panelGeo, panelMat);
      var edgeGeo = new THREE.BoxGeometry(d.width, 0.012, 0.042);
      var edgeMat = new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.6, metalness: 0 });
      var edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.set(0, -d.height / 2 + 0.006, 0);

      var canvas = document.createElement('canvas');
      canvas.width = 1024; canvas.height = 128;
      var tex = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var renderer = this.el.sceneEl && this.el.sceneEl.renderer;
      tex.anisotropy = Math.min(8, renderer ? renderer.capabilities.getMaxAnisotropy() : 8);
      var textGeo = new THREE.PlaneGeometry(d.width, d.width * 128 / 1024);
      var textMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
      var textMesh = new THREE.Mesh(textGeo, textMat);
      textMesh.position.set(0, 0.006, 0.021);

      this.group.add(panel, edge, textMesh);
      this.disposables.push(panelGeo, panelMat, edgeGeo, edgeMat, textGeo, textMat, tex);

      var token = ++this.token;
      var draw = function () {
        if (token !== self.token) return; // stale build
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 1024, 128);
        var px = 128 * 0.6;
        var font = function (s) { return '600 ' + s + 'px "Inter", -apple-system, "Segoe UI", sans-serif'; };
        ctx.font = font(px);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0.5px';
        var maxW = 1024 * 0.92;
        var w = ctx.measureText(d.text).width;
        if (w > maxW) { px = Math.floor(px * maxW / w); ctx.font = font(px); }
        ctx.fillStyle = '#1d1d1f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.text, 512, 64);
        tex.needsUpdate = true;
      };
      var fontReady = (document.fonts && document.fonts.load)
        ? Promise.race([
            document.fonts.load('600 28px Inter').catch(function () {}),
            new Promise(function (r) { setTimeout(r, 2000); })
          ])
        : Promise.resolve();
      fontReady.then(draw);
    }
  });
})();
