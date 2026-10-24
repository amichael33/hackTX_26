/* Classic script: `bounds` clamps the entity's x/z position to a rectangle every tick. */
(function () {
  AFRAME.registerComponent('bounds', {
    schema: {
      minX: { default: -7.5 }, maxX: { default: 7.5 },
      minZ: { default: -9.5 }, maxZ: { default: 9.5 }
    },
    tick: function () {
      var p = this.el.object3D.position, d = this.data;
      if (p.x < d.minX) p.x = d.minX; else if (p.x > d.maxX) p.x = d.maxX;
      if (p.z < d.minZ) p.z = d.minZ; else if (p.z > d.maxZ) p.z = d.maxZ;
      if (window.StoreCollide) window.StoreCollide.resolve(p);
    }
  });
})();
