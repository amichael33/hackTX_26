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
      // Rocks and reeds on the bank, clear of the bridges (x = +-5.2 +- 1.4) so nothing sits on the way across.
      var reedMat = new THREE.MeshStandardMaterial({ color: '#6b8f3a', roughness: 1, flatShading: true });
      var headMat = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 1, flatShading: true });
      var rockMat = new THREE.MeshStandardMaterial({ color: '#6f6b64', roughness: 1, flatShading: true });
      var stemGeo = new THREE.CylinderGeometry(0.008, 0.015, 1, 4), headGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.16, 5), rockGeo = new THREE.DodecahedronGeometry(0.16, 0);
      var half = d.length / 2, edge = d.width / 2 + d.bank + 0.12, k = 0;
      [-7.6, -6.9, -2.4, -1.5, 1.3, 2.3, 6.9, 7.6].forEach(function (cx) {
        if (Math.abs(cx) > half - 0.4) return;
        [-1, 1].forEach(function (s) {
          for (var r = 0; r < 4; r++, k++) {
            var h = 0.55 + ((k * 37) % 10) / 10 * 0.5, x = cx + (((k * 17) % 9) - 4) * 0.04, z = s * (edge + (((k * 13) % 5) * 0.03));
            var stem = new THREE.Mesh(stemGeo, reedMat); stem.scale.y = h; stem.position.set(x, h / 2, z); stem.rotation.z = (((k * 7) % 5) - 2) * 0.05;
            this.group.add(stem);
            if (r % 2 === 0) { var hd2 = new THREE.Mesh(headGeo, headMat); hd2.position.set(x - stem.rotation.z * h * 0.5, h + 0.04, z); this.group.add(hd2); }
          }
          var rock = new THREE.Mesh(rockGeo, rockMat);
          rock.scale.set(1 + (k % 3) * 0.3, 0.6, 1 + (k % 2) * 0.4); rock.position.set(cx + 0.25, 0.07, s * (edge + 0.1)); rock.rotation.y = k;
          this.group.add(rock);
        });
      }, this);
      this.owned.push(wGeo, wMat, this.tex, stone, bGeo, reedMat, headMat, rockMat, stemGeo, headGeo, rockGeo);
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
