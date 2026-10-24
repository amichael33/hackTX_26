// Faceted mirror-tile disco ball hanging from the ceiling (y 4.0) at the entity's position. Not clickable.
AFRAME.registerComponent('disco-ball', {
  schema: { radius: { default: 0.35 }, ceiling: { default: 4.0 }, speed: { default: 0.4 } },
  init() {
    const { radius, ceiling } = this.data;
    const geo = new THREE.SphereGeometry(radius, 16, 10).toNonIndexed();
    const n = geo.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      const g = 0.75 + Math.random() * 0.25; // one gray per face
      for (let k = 0; k < 3; k++) colors.set([g, g, g], (i + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.ballMat = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, metalness: 0.3, roughness: 0.25, emissive: 0x222222,
    });
    this.ball = new THREE.Mesh(geo, this.ballMat);
    const rodLen = ceiling - (this.el.object3D.position.y + radius);
    const rodGeo = new THREE.CylinderGeometry(0.015, 0.015, rodLen, 6);
    this.rodMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    this.rod = new THREE.Mesh(rodGeo, this.rodMat);
    this.rod.position.y = radius + rodLen / 2;
    this.el.object3D.add(this.ball, this.rod); // rod does not spin with the ball (separate child)
  },
  tick(time, dt) {
    this.ball.rotation.y += this.data.speed * (dt / 1000);
  },
  remove() {
    this.el.object3D.remove(this.ball, this.rod);
    this.ball.geometry.dispose(); this.ballMat.dispose();
    this.rod.geometry.dispose(); this.rodMat.dispose();
  },
});
