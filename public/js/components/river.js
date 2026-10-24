/* Classic script: `river` component. A band of flowing water across the hall with a low stone bank on each side.
   Lies along x (entity at the river's centre line); the bridges (bridge.js) arch over it. Purely visual: the walls of water are
   collision obstacles in maps.js (obstaclesFor). */
(function () {
  AFRAME.registerComponent('river', {
    schema: { length: { default: 16 }, width: { default: 2.6 }, bank: { default: 0.2 } },
    init: function () {
      var d = this.data;
      this.group = new THREE.Group();
      this.el.setObject3D('river', this.group);
      this.owned = [];
      // Water: a plane with a tiling canvas of lighter ripples, scrolled along the flow every frame.
      var c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      var g = c.getContext('2d');
      g.fillStyle = '#2f7fb8';
      g.fillRect(0, 0, 256, 64);
      for (var row = 0; row < 5; row++) {
        g.strokeStyle = 'rgba(190,230,250,' + (0.25 + 0.1 * (row % 2)) + ')';
        g.lineWidth = 2;
        g.beginPath();
        for (var x = 0; x <= 256; x += 8) {
          var y = 8 + row * 13 + Math.sin((x / 256) * Math.PI * 2 * (1 + row % 2) + row) * 3;
          if (x) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
      }
      this.tex = new THREE.CanvasTexture(c);
      this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
      this.tex.repeat.set(d.length / 3, d.width / 1.2);
      if (THREE.SRGBColorSpace) this.tex.colorSpace = THREE.SRGBColorSpace;
      var wGeo = new THREE.PlaneGeometry(d.length, d.width);
      wGeo.rotateX(-Math.PI / 2);
      var wMat = new THREE.MeshStandardMaterial({ map: this.tex, transparent: true, opacity: 0.92, roughness: 0.25, metalness: 0.05, emissive: '#1b4a70', emissiveIntensity: 0.3 });
      var water = new THREE.Mesh(wGeo, wMat);
      water.position.y = 0.04;
      this.group.add(water);
      // Stone banks along both edges.
      var stone = new THREE.MeshStandardMaterial({ color: '#7d786f', roughness: 0.95, flatShading: true });
      var bGeo = new THREE.BoxGeometry(d.length, 0.18, d.bank);
      [-1, 1].forEach(function (s) {
        var b = new THREE.Mesh(bGeo, stone);
        b.position.set(0, 0.09, s * (d.width / 2 + d.bank / 2));
        this.group.add(b);
      }, this);
      this.owned.push(wGeo, wMat, this.tex, stone, bGeo);
    },
    tick: function (time, delta) {
      this.tex.offset.x -= delta * 0.00006 * this.data.length / 3; // flows toward -x
    },
    remove: function () {
      this.owned.forEach(function (o) { o.dispose(); });
      this.el.removeObject3D('river');
    }
  });
})();
