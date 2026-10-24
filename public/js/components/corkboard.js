/* Classic script: `corkboard` component. A framed cork board on the back wall (faces +z) that post-it notes get
   pinned to one by one. addNote(text, index) pops a note in and returns its world position; clearNotes() empties it. */
(function () {
  var COLORS = ['#fff176', '#ff9ec7', '#8fd3ff', '#b8f28a', '#ffcb80'];
  var COLS = 4;
  var POP_MS = 380;
  var NOTE = 0.8; // note edge, metres
  var MARGIN = 0.06; // clear space kept between a note and the frame

  function hashSeed(str) {
    var h = 5381;
    str = String(str);
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }

  // Wraps text to fit `maxW` px; returns lines.
  function wrap(g, text, maxW) {
    var words = String(text).split(' '), lines = [], line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (line && g.measureText(test).width > maxW) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function noteTexture(text, color) {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    var shade = g.createLinearGradient(0, 200, 0, 256); // curled bottom edge
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = shade;
    g.fillRect(0, 200, 256, 56);
    g.fillStyle = '#c0392b'; // pin
    g.beginPath(); g.arc(128, 26, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.arc(124, 22, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b2b2b';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    var size = 44, lines;
    for (; size >= 24; size -= 4) {
      g.font = 'bold ' + size + 'px "Marker Felt","Comic Sans MS","Segoe Print",cursive';
      lines = wrap(g, text, 210);
      if (lines.length * size * 1.15 <= 170) break;
    }
    var lh = size * 1.15, y0 = 148 - ((lines.length - 1) * lh) / 2;
    lines.forEach(function (l, i) { g.fillText(l, 128, y0 + i * lh); });
    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function corkTexture() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#c99a62';
    g.fillRect(0, 0, 512, 256);
    var seed = 12345;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (var i = 0; i < 2600; i++) {
      var d = rnd();
      g.fillStyle = d < 0.5 ? 'rgba(120,78,40,' + (0.15 + rnd() * 0.25) + ')' : 'rgba(235,196,140,' + (0.15 + rnd() * 0.3) + ')';
      g.beginPath(); g.arc(rnd() * 512, rnd() * 256, 0.8 + rnd() * 2.4, 0, Math.PI * 2); g.fill();
    }
    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  AFRAME.registerComponent('corkboard', {
    schema: { width: { default: 6 }, height: { default: 2.2 } },
    init: function () {
      var d = this.data;
      this.group = new THREE.Group();
      this.el.setObject3D('corkboard', this.group);
      this.owned = []; // geometries/materials/textures disposed in remove()
      var corkTex = corkTexture();
      var cork = new THREE.Mesh(new THREE.PlaneGeometry(d.width, d.height), new THREE.MeshStandardMaterial({ map: corkTex, roughness: 1, metalness: 0 }));
      this.group.add(cork);
      this.owned.push(cork.geometry, cork.material, corkTex);
      var frameMat = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.8, flatShading: true });
      var t = 0.08, fz = 0.03;
      var bars = [
        [d.width + t * 2, t, 0, d.height / 2 + t / 2], [d.width + t * 2, t, 0, -d.height / 2 - t / 2],
        [t, d.height, -d.width / 2 - t / 2, 0], [t, d.height, d.width / 2 + t / 2, 0]
      ];
      var self = this;
      bars.forEach(function (b) {
        var geo = new THREE.BoxGeometry(b[0], b[1], 0.08);
        var m = new THREE.Mesh(geo, frameMat);
        m.position.set(b[2], b[3], fz);
        self.group.add(m);
        self.owned.push(geo);
      });
      this.owned.push(frameMat);
      this.notes = []; // { mesh, t, delay }
    },
    // Slot i in a COLS-wide grid, centered on the board, with a little hand-pinned jitter.
    slot: function (i, text) {
      var d = this.data, rows = 2;
      var col = i % COLS, row = Math.floor(i / COLS) % rows;
      var gx = d.width / COLS, gy = d.height / rows;
      var seed = hashSeed(text);
      var rot = ((((seed >> 3) % 1000) / 1000) - 0.5) * 0.2; // about +-6 degrees
      var half = (NOTE / 2) * (Math.abs(Math.cos(rot)) + Math.abs(Math.sin(rot))); // half-extent of the rotated note
      var limX = d.width / 2 - half - MARGIN, limY = d.height / 2 - half - MARGIN;
      var x = (col - (COLS - 1) / 2) * gx + (((seed % 100) / 100) - 0.5) * 0.12;
      var y = ((rows - 1) / 2 - row) * gy + ((((seed >> 7) % 100) / 100) - 0.5) * 0.1;
      return {
        x: Math.max(-limX, Math.min(limX, x)),
        y: Math.max(-limY, Math.min(limY, y)),
        rot: rot,
        color: COLORS[seed % COLORS.length]
      };
    },
    addNote: function (text, index) {
      var s = this.slot(index, text);
      var tex = noteTexture(text, s.color);
      var geo = new THREE.PlaneGeometry(NOTE, NOTE);
      var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(s.x, s.y, 0.02);
      mesh.rotation.z = s.rot;
      mesh.scale.setScalar(0.001);
      this.group.add(mesh);
      this.notes.push({ mesh: mesh, t: 0 });
      var out = new THREE.Vector3();
      mesh.getWorldPosition(out);
      return out;
    },
    clearNotes: function () {
      this.notes.forEach(function (n) {
        n.mesh.parent && n.mesh.parent.remove(n.mesh);
        n.mesh.material.map.dispose();
        n.mesh.material.dispose();
        n.mesh.geometry.dispose();
      });
      this.notes = [];
    },
    tick: function (time, delta) {
      for (var i = 0; i < this.notes.length; i++) {
        var n = this.notes[i];
        if (n.t >= POP_MS) continue;
        n.t += delta;
        var k = Math.min(1, n.t / POP_MS), c1 = 1.70158, c3 = c1 + 1;
        var e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); // easeOutBack
        n.mesh.scale.setScalar(Math.max(0.001, e));
      }
    },
    remove: function () {
      this.clearNotes();
      this.owned.forEach(function (o) { o.dispose(); });
      this.el.removeObject3D('corkboard');
    }
  });
})();
