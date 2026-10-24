/* Classic script: `corkboard` component. A framed cork board on the back wall (faces +z) that notes get pinned to one by one.
   `notes: postit` = coloured sticky notes with a red pin; `notes: parchment` = torn, stained parchment with a dagger stuck through it
   (the castle). addNote(text, index) pops a note in and returns its world position; clearNotes() empties it. */
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

  // Old parchment: a torn outline (transparent outside it), stains, scorched edges and dark ink in a serif hand.
  var PARCHMENT = ['#ead9a8', '#e3cf98', '#efe0b4'];
  function parchmentTexture(text, seed) {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    var s = seed >>> 0;
    function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    // Torn outline: points around the edge, each pushed in or out a little.
    var pts = [], N = 36;
    for (var i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2, side = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      var r = 118 / side * 0.97 - (rnd() * 9 + (i % 3 === 0 ? rnd() * 6 : 0));
      pts.push([128 + Math.cos(a) * r, 128 + Math.sin(a) * r]);
    }
    g.beginPath();
    pts.forEach(function (p, k) { if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.closePath();
    var base = PARCHMENT[(seed >> 3) % PARCHMENT.length];
    var grad = g.createRadialGradient(128, 128, 20, 128, 128, 150);
    grad.addColorStop(0, base); grad.addColorStop(0.7, '#d9c186'); grad.addColorStop(1, '#a98a4e');
    g.fillStyle = grad;
    g.fill();
    g.save();
    g.clip();
    for (var k2 = 0; k2 < 7; k2++) {                                 // coffee-coloured stains and age spots
      g.fillStyle = 'rgba(120,80,30,' + (0.05 + rnd() * 0.08) + ')';
      g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 10 + rnd() * 34, 0, Math.PI * 2); g.fill();
    }
    for (var k3 = 0; k3 < 40; k3++) { g.fillStyle = 'rgba(90,60,20,' + (0.1 + rnd() * 0.2) + ')'; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2); }
    g.lineWidth = 14; g.strokeStyle = 'rgba(70,40,10,0.35)';         // scorched, darker edge
    g.stroke();
    g.restore();
    g.fillStyle = '#3b2a14';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    var size = 42, lines;
    for (; size >= 22; size -= 3) {
      g.font = 'italic bold ' + size + 'px "Palatino Linotype","Book Antiqua",Palatino,Georgia,serif';
      lines = wrap(g, text, 180);
      if (lines.length * size * 1.18 <= 150) break;
    }
    var lh = size * 1.18, y0 = 140 - ((lines.length - 1) * lh) / 2;
    lines.forEach(function (l, i2) { g.fillText(l, 128, y0 + i2 * lh); });
    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // The dagger that holds a parchment note: its point is the origin; the blade points down into the note, the handle tilts
  // out toward the viewer. Shared parts, built once per board.
  function buildDagger(parts) {
    var g = new THREE.Group();
    var blade = new THREE.Mesh(parts.blade, parts.steel);
    blade.position.y = 0.1; blade.rotation.z = Math.PI; blade.scale.z = 0.28;     // a flat cone, point down
    var guard = new THREE.Mesh(parts.guard, parts.iron); guard.position.y = 0.2;
    var grip = new THREE.Mesh(parts.grip, parts.leather); grip.position.y = 0.26;
    var pommel = new THREE.Mesh(parts.pommel, parts.gold); pommel.position.y = 0.325;
    g.add(blade, guard, grip, pommel);
    return g;
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
    schema: { width: { default: 6 }, height: { default: 2.2 }, notes: { default: 'postit', oneOf: ['postit', 'parchment'] } },
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
      // Shared dagger parts for the parchment style (disposed with the board).
      this.dagger = {
        blade: new THREE.ConeGeometry(0.024, 0.2, 4), guard: new THREE.BoxGeometry(0.1, 0.018, 0.024),
        grip: new THREE.CylinderGeometry(0.014, 0.014, 0.11, 8), pommel: new THREE.SphereGeometry(0.022, 8, 6),
        steel: new THREE.MeshStandardMaterial({ color: '#c9ced3', metalness: 0.6, roughness: 0.35, flatShading: true }),
        iron: new THREE.MeshStandardMaterial({ color: '#2b2b2b', metalness: 0.4, roughness: 0.5, flatShading: true }),
        leather: new THREE.MeshStandardMaterial({ color: '#5a3d24', roughness: 0.9, flatShading: true }),
        gold: new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 0.7, roughness: 0.3, flatShading: true })
      };
      Object.keys(this.dagger).forEach(function (k) { this.owned.push(this.dagger[k]); }, this);
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
      var parchment = this.data.notes === 'parchment';
      var tex = parchment ? parchmentTexture(text, hashSeed(text)) : noteTexture(text, s.color);
      var geo = new THREE.PlaneGeometry(NOTE, NOTE);
      var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0, transparent: parchment, alphaTest: parchment ? 0.4 : 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      var mesh = new THREE.Mesh(geo, mat);
      if (parchment) {
        // A dagger through the top of the note: point on the paper, handle leaning out, a slightly different lean on each.
        var knife = buildDagger(this.dagger);
        var lean = ((hashSeed(text + 'k') % 1000) / 1000 - 0.5) * 0.5;
        knife.position.set(0, NOTE / 2 - 0.16, 0.012);
        knife.rotation.set(0.55, 0, lean);
        mesh.add(knife);
      }
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
