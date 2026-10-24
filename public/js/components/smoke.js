/* Classic script: `smoke` component. A pool of soft puff sprites for the "magic trick" reveal.
   Usage: document.getElementById('smoke').components.smoke.puff(x, y, z, { size, count, spread, life }). */
(function () {
  var POOL = 360;
  var puffTex = null;

  // One shared texture: a few overlapping soft blobs so each puff looks cloudy, not like a perfect disc.
  function texture() {
    if (puffTex) return puffTex;
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    [[64, 64, 56], [44, 70, 34], [84, 58, 36], [60, 40, 30], [66, 88, 30]].forEach(function (b) {
      var grad = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2]);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    });
    puffTex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) puffTex.colorSpace = THREE.SRGBColorSpace;
    return puffTex;
  }

  AFRAME.registerComponent('smoke', {
    init: function () {
      this.group = new THREE.Group();
      this.el.setObject3D('smoke', this.group);
      this.parts = [];
      this.next = 0; // ring-buffer cursor: the oldest particle is recycled when the pool is full
      var tex = texture();
      for (var i = 0; i < POOL; i++) {
        var mat = new THREE.SpriteMaterial({ map: tex, color: '#b4b6c0', transparent: true, opacity: 0, depthWrite: false });
        var s = new THREE.Sprite(mat);
        s.visible = false;
        s.renderOrder = 3;
        this.group.add(s);
        this.parts.push({ s: s, age: 0, life: 1, live: false, vx: 0, vy: 0, vz: 0, s0: 0, s1: 0, rot: 0, vr: 0 });
      }
    },
    remove: function () {
      this.parts.forEach(function (p) { p.s.material.dispose(); });
      if (puffTex) { puffTex.dispose(); puffTex = null; }
      this.el.removeObject3D('smoke');
    },
    // A burst of `count` soft sprites around (x, y, z) that swell, drift upward and fade.
    puff: function (x, y, z, opts) {
      opts = opts || {};
      var size = opts.size || 0.6, count = opts.count || 4, spread = opts.spread === undefined ? size * 0.35 : opts.spread;
      var life = opts.life || 1100;
      for (var i = 0; i < count; i++) {
        var p = this.parts[this.next];
        this.next = (this.next + 1) % POOL;
        p.live = true;
        p.age = -Math.random() * 120; // slight stagger so the burst billows
        p.life = life * (0.75 + Math.random() * 0.5);
        p.s.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.3) * spread * 0.6, z + (Math.random() - 0.5) * spread);
        p.vx = (Math.random() - 0.5) * 0.25;
        p.vy = 0.15 + Math.random() * 0.3;
        p.vz = (Math.random() - 0.5) * 0.25;
        p.s0 = size * (0.5 + Math.random() * 0.3);
        p.s1 = size * (1.3 + Math.random() * 0.9);
        p.s.material.rotation = Math.random() * 6.28;
        p.vr = (Math.random() - 0.5) * 0.8;
        p.s.scale.setScalar(p.s0);
        p.s.material.opacity = 0;
        p.s.visible = true;
      }
    },
    tick: function (time, delta) {
      var dt = Math.min(delta, 50);
      for (var i = 0; i < this.parts.length; i++) {
        var p = this.parts[i];
        if (!p.live) continue;
        p.age += dt;
        if (p.age < 0) continue;
        var k = p.age / p.life;
        if (k >= 1) { p.live = false; p.s.visible = false; continue; }
        var sec = dt / 1000;
        p.s.position.x += p.vx * sec;
        p.s.position.y += p.vy * sec;
        p.s.position.z += p.vz * sec;
        p.s.material.rotation += p.vr * sec;
        p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k))); // ease-out swell
        p.s.material.opacity = Math.min(1, k * 6) * (1 - k) * 1.0; // quick fade-in, long fade-out
      }
    }
  });
})();
