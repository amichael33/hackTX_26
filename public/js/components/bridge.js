/* Classic script: `bridge` component. An arched stone bridge across the river: a curved deck with a parapet along each side.
   The entity sits at the bridge's centre (x across the deck, z along it); the deck's top follows
   y = arch * sin(pi * t), t = 0..1 along the length, the same curve maps.js `walkHeight` uses to lift the player. */
(function () {
  var STEPS = 28;
  var THICK = 0.3;     // deck thickness (underside follows the arch)
  var PARAPET = 0.2;   // side wall thickness (matches the collision rect) and height
  var PARAPET_H = 0.42;

  // A shape in the (z, y) plane between two curves, extruded across x by `depth`, then turned so shape x -> world z.
  function sweep(length, arch, lowerOffset, upperOffset, depth) {
    var shape = new THREE.Shape(), i, t, z, h;
    for (i = 0; i <= STEPS; i++) {
      t = i / STEPS; z = -length / 2 + t * length; h = arch * Math.sin(Math.PI * t);
      if (i) shape.lineTo(z, h + upperOffset); else shape.moveTo(z, h + upperOffset);
    }
    for (i = STEPS; i >= 0; i--) {
      t = i / STEPS; z = -length / 2 + t * length; h = arch * Math.sin(Math.PI * t);
      shape.lineTo(z, Math.max(h + lowerOffset, -0.05)); // the ends sink into the floor
    }
    var geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false, steps: 1 });
    // (shape x, shape y, extrude z) -> (world x, y, z) = (extrude, y, shape x): swap x and z.
    geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
    geo.translate(-depth / 2, 0, 0);
    geo.computeVertexNormals();
    return geo;
  }

  AFRAME.registerComponent('bridge', {
    schema: { width: { default: 2.4 }, length: { default: 5.8 }, arch: { default: 0.8 } },
    init: function () {
      var d = this.data, self = this;
      this.group = new THREE.Group();
      this.el.setObject3D('bridge', this.group);
      this.owned = [];
      var deckMat = new THREE.MeshStandardMaterial({ color: '#8a847b', roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
      var wallMat = new THREE.MeshStandardMaterial({ color: '#9a948a', roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
      var deckGeo = sweep(d.length, d.arch, -THICK, 0, d.width);
      this.group.add(new THREE.Mesh(deckGeo, deckMat));
      this.owned.push(deckGeo, deckMat, wallMat);
      // Parapets on both sides, sitting on the deck's edge strips (the player walks between them).
      [-1, 1].forEach(function (s) {
        var g = sweep(d.length, d.arch, 0.0, PARAPET_H, PARAPET);
        var m = new THREE.Mesh(g, wallMat);
        m.position.x = s * (d.width / 2 - PARAPET / 2);
        // The wall's lower edge is the deck's top, so it rests on it; lift by a hair to keep the faces apart.
        m.position.y = 0.002;
        self.group.add(m);
        self.owned.push(g);
      });
    },
    remove: function () {
      this.owned.forEach(function (o) { o.dispose(); });
      this.el.removeObject3D('bridge');
    }
  });
})();
