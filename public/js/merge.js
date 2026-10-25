/* Classic script: StoreMerge.staticMeshes(root, skip, owned), a draw-call saver for the scenery. Every opaque, untextured mesh under
   `root` that shares a material (plain MeshBasicMaterials are matched by colour) is baked into one mesh, and the originals are removed.
   Meshes that move, are textured, see-through, or use per-face material arrays stay as they are: put anything animated under `skip`
   (an object whose whole subtree is left alone). The new geometries are pushed onto `owned` so the caller can dispose them. */
(function (root) {
  function staticMeshes(group, skip, owned) {
    group.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), rel = new THREE.Matrix4();
    var buckets = {}, drop = [];
    (function walk(o) {
      if (o === skip) return;
      if (o.isMesh && !Array.isArray(o.material)) {
        var m = o.material, geo = o.geometry, a = geo.attributes;
        var plain = (m.isMeshBasicMaterial || m.isMeshStandardMaterial) && !m.map && !m.transparent && m.depthWrite && m.side === THREE.FrontSide;
        if (plain && o.renderOrder === 0 && geo.index && a.position && a.normal && a.uv) {
          var key = m.isMeshBasicMaterial ? 'b' + m.color.getHexString() : m.uuid;
          var b = buckets[key] || (buckets[key] = { mat: m, pos: [], nor: [], uv: [], idx: [], base: 0 });
          rel.multiplyMatrices(inv, o.matrixWorld);
          var nm = new THREE.Matrix3().getNormalMatrix(rel), v = new THREE.Vector3(), flip = rel.determinant() < 0;
          for (var i = 0; i < a.position.count; i++) {
            v.fromBufferAttribute(a.position, i).applyMatrix4(rel); b.pos.push(v.x, v.y, v.z);
            v.fromBufferAttribute(a.normal, i).applyMatrix3(nm).normalize(); b.nor.push(v.x, v.y, v.z);
            b.uv.push(a.uv.getX(i), a.uv.getY(i));
          }
          for (var j = 0; j < geo.index.count; j += 3) {
            var i0 = geo.index.getX(j), i1 = geo.index.getX(j + 1), i2 = geo.index.getX(j + 2);
            if (flip) b.idx.push(b.base + i0, b.base + i2, b.base + i1); else b.idx.push(b.base + i0, b.base + i1, b.base + i2);
          }
          b.base += a.position.count;
          drop.push(o);
          return;
        }
      }
      for (var c = 0; c < o.children.length; c++) walk(o.children[c]);
    })(group);
    drop.forEach(function (o) { o.parent.remove(o); });
    Object.keys(buckets).forEach(function (k) {
      var b = buckets[k], geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.idx.length > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      owned.push(geo);
      group.add(new THREE.Mesh(geo, b.mat));
    });
  }
  root.StoreMerge = { staticMeshes: staticMeshes };
})(window);
