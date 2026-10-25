/* Classic script: shared hand-drawn wood textures for the castle (timber shelves, the desk, the ceiling beams and the planked
   ceiling). Same look as the wheelbarrow: short slanted grain strokes, and planks with darker seams.
   StoreWood.material(kind, repeatX, repeatY, extra) returns an A-Frame `material` object using a canvas texture:
     kind  'grain'     mid-brown boards (shelf boards, desk top, posts)
           'beam'      dark timber (beams, lintels, posts)
           'plank'     light planks with seams between them (the desk front)
           'plankDark' darker planks with seams (shelf backs, the ceiling)
   A-Frame keeps one texture per `src`, and `repeat` is set on that shared texture, so every kind + repeat pair gets its own
   canvas (id wood-<kind>-<rx>x<ry>). If a canvas cannot be made, a plain brown colour is returned instead. */
(function (root) {
  var TONES = {
    grain:     { a: '#7a5738', b: '#6e4d2f', stroke: 'rgba(74,50,28,0.85)', seams: false },
    beam:      { a: '#5a3f27', b: '#4f3320', stroke: 'rgba(30,18,8,0.85)',  seams: false },
    plank:     { a: '#9a7448', b: '#946c42', stroke: 'rgba(70,45,20,0.45)', seams: true },
    plankDark: { a: '#7a5a38', b: '#6e5030', stroke: 'rgba(40,26,12,0.5)',  seams: true }
  };
  var FALLBACK = { grain: '#6e4d2f', beam: '#4f3320', plank: '#9a7448', plankDark: '#6a4a2c' };

  // A tile: `grain` and `beam` are 64x64 with two board tones side by side; planks are one 32x64 plank (seams on its long edges).
  function draw(kind) {
    var t = TONES[kind], plank = t.seams;
    var c = document.createElement('canvas');
    c.width = plank ? 32 : 64; c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = t.a; g.fillRect(0, 0, c.width, c.height);
    if (!plank) { g.fillStyle = t.b; g.fillRect(0, 0, 32, 64); }
    g.strokeStyle = t.stroke; g.lineWidth = plank ? 1.5 : 2;
    var n = plank ? 7 : 16;
    for (var k = 0; k < n; k++) {
      var x = plank ? 6 + (k * 11) % 20 : (k * 23) % 64, y = (k * 37) % 52;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (plank ? 2 : 3), y + (plank ? 9 : 10)); g.stroke();
    }
    g.fillStyle = plank ? 'rgba(40,26,12,0.8)' : t.stroke;
    if (plank) { g.fillRect(0, 0, 2, 64); g.fillRect(30, 0, 2, 64); } else { g.fillRect(31, 0, 2, 64); }
    return c;
  }

  var made = {};
  root.StoreWood = {
    material: function (kind, rx, ry, extra) {
      kind = TONES[kind] ? kind : 'grain';
      rx = rx || 1; ry = ry || 1;
      var plain = Object.assign({ color: FALLBACK[kind], flatShading: true, roughness: 0.95, metalness: 0 }, extra || {});
      try {
        var id = 'wood-' + kind + '-' + rx + 'x' + ry;
        if (!made[id]) {
          var c = draw(kind);
          c.id = id;
          c.style.display = 'none';
          document.body.appendChild(c);
          made[id] = true;
        }
        return Object.assign({ src: '#' + id, repeat: rx + ' ' + ry, color: '#ffffff', flatShading: true, roughness: 0.95, metalness: 0 }, extra || {});
      } catch (e) {
        return plain;
      }
    }
  };
})(window);
