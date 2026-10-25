/* Classic script: `zone-banner` component. A slim white panel with a dark bottom edge and
   crisp canvas-texture text on its +z face. Faces local +z.
   theme:castle makes it a dark timber plaque instead: painted grain, an iron border and rivets, cream serif lettering. */
(function () {
  // A timber plaque: dark boards with painted grain and seams, an iron border and four rivets. Seeded, so every sign matches.
  function paintPlaque(ctx) {
    var s = 7;
    var rnd = function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    var g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#6a4a2c'); g.addColorStop(1, '#4a321c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 128);
    for (var i = 0; i < 70; i++) {                                         // long grain strokes
      var y = rnd() * 128, x = rnd() * 900, len = 60 + rnd() * 220;
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(30,18,8,0.35)' : 'rgba(170,125,75,0.2)';
      ctx.lineWidth = 1 + rnd() * 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + len / 3, y + (rnd() - 0.5) * 4, x + len * 2 / 3, y + (rnd() - 0.5) * 4, x + len, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(25,14,6,0.7)';                                   // seams between the boards
    ctx.fillRect(341, 0, 3, 128); ctx.fillRect(683, 0, 3, 128);
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 8; ctx.strokeRect(5, 5, 1014, 118);  // iron border
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.strokeRect(10, 10, 1004, 108);
    [[26, 26], [998, 26], [26, 102], [998, 102]].forEach(function (p) {   // rivets
      ctx.fillStyle = '#1d1d1f'; ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(p[0] - 2, p[1] - 2, 2.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  AFRAME.registerComponent('zone-banner', {
    schema: { text: { default: '' }, width: { default: 2 }, height: { default: 0.26 }, theme: { default: 'shop', oneOf: ['shop', 'castle'] } },
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
      var castle = d.theme === 'castle';
      var panelMat = new THREE.MeshStandardMaterial({ color: castle ? '#4f3320' : '#fbfbfd', roughness: 0.85, metalness: 0 });
      var panel = new THREE.Mesh(panelGeo, panelMat);
      // Wider and lower than the panel by 2 mm, so none of its faces share a plane with the panel's (z-fighting).
      var edgeGeo = new THREE.BoxGeometry(d.width + 0.004, 0.012, 0.046);
      var edgeMat = new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.6, metalness: 0 });
      var edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.set(0, -d.height / 2 + 0.004, 0);

      var canvas = document.createElement('canvas');
      canvas.width = 1024; canvas.height = 128;
      var tex = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      var renderer = this.el.sceneEl && this.el.sceneEl.renderer;
      tex.anisotropy = Math.min(8, renderer ? renderer.capabilities.getMaxAnisotropy() : 8);
      var textGeo = new THREE.PlaneGeometry(d.width, d.width * 128 / 1024);
      var textMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      var textMesh = new THREE.Mesh(textGeo, textMat);
      textMesh.position.set(0, 0.006, 0.026);

      this.group.add(panel, edge, textMesh);
      this.disposables.push(panelGeo, panelMat, edgeGeo, edgeMat, textGeo, textMat, tex);

      var token = ++this.token;
      var draw = function () {
        if (token !== self.token) return; // stale build
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 1024, 128);
        if (castle) paintPlaque(ctx);
        var px = 128 * 0.6;
        var font = function (s) {
          return castle ? 'italic 700 ' + s + 'px "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif'
            : '600 ' + s + 'px "Inter", -apple-system, "Segoe UI", sans-serif';
        };
        ctx.font = font(px);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0.5px';
        var maxW = 1024 * 0.92;
        var w = ctx.measureText(d.text).width;
        if (w > maxW) { px = Math.floor(px * maxW / w); ctx.font = font(px); }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (castle) { ctx.fillStyle = 'rgba(20,10,0,0.7)'; ctx.fillText(d.text, 514, 68); } // a dark shadow so the letters look carved in
        ctx.fillStyle = castle ? '#f2e4bd' : '#1d1d1f';
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
