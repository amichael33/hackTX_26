/* Classic script: StoreFloor, the hand-drawn floor textures for the maps.
   StoreFloor.material(kind, width, depth) returns an A-Frame `material` object whose canvas texture repeats across a width x depth floor:
     'tile'      pale polished stone tiles, 2 m square, with fine grout and a little speckle (Classic)
     'parquet'   staggered wooden boards, 1 m long (Boutique)
     'flagstone' irregular grey slabs with dark mortar, repeating every 3 m (Castle)
   Each kind is one canvas in the page; its size in metres is TILE[kind], and the repeat is floor size / tile size. */
(function (root) {
  var TILE = { tile: 2, parquet: 1, flagstone: 3 };
  var FALLBACK = { tile: '#e4e1db', parquet: '#b98a58', flagstone: '#85817a' };

  function rng(seed) { var s = seed; return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
  function shade(g, x, y, w, h, base, spread, r) { // a slab filled with its own tone, in [base-spread, base+spread] per channel
    var d = (r() - 0.5) * 2 * spread;
    g.fillStyle = 'rgb(' + Math.round(base[0] + d) + ',' + Math.round(base[1] + d) + ',' + Math.round(base[2] + d) + ')';
    g.fillRect(x, y, w, h);
  }

  var DRAW = {
    tile: function (g, S) {
      var r = rng(11), n = 2, w = S / n;
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) shade(g, i * w, j * w, w, w, [226, 223, 217], 7, r);
      g.fillStyle = 'rgba(120,115,105,0.18)';
      for (var k = 0; k < 140; k++) g.fillRect(r() * S, r() * S, 1.5, 1.5);          // speckle
      g.fillStyle = 'rgba(95,90,82,0.55)';
      for (var e = 0; e < n; e++) { g.fillRect(e * w, 0, 2, S); g.fillRect(0, e * w, S, 2); } // grout
    },
    parquet: function (g, S) {
      var r = rng(23), rows = 5, h = S / rows;
      for (var i = 0; i < rows; i++) {
        var cut = ((i * 0.37) % 1) * S, x0 = 0;
        [cut, S - cut].forEach(function (len) {                                     // two boards per row, staggered row to row
          if (len < 6) return;
          shade(g, x0, i * h, len, h, [184, 138, 90], 16, r);
          g.strokeStyle = 'rgba(70,45,20,0.32)'; g.lineWidth = 1;
          for (var k = 0; k < 4; k++) { var y = i * h + 5 + r() * (h - 10); g.beginPath(); g.moveTo(x0 + 2, y); g.lineTo(x0 + len - 2, y + (r() - 0.5) * 3); g.stroke(); }
          g.fillStyle = 'rgba(45,28,12,0.7)'; g.fillRect(x0, i * h, 2, h); // butt joint
          x0 += len;
        });
        g.fillStyle = 'rgba(45,28,12,0.7)'; g.fillRect(0, i * h, S, 2);        // seam between rows
      }
    },
    flagstone: function (g, S) {
      var r = rng(37), rowsH = [60, 76, 52, 68], y = 0;
      g.fillStyle = '#3b3935'; g.fillRect(0, 0, S, S);                              // mortar
      rowsH.forEach(function (rh) {
        var cuts = 3 + Math.floor(r() * 2), widths = [], total = 0, k;
        for (k = 0; k < cuts; k++) { widths.push(0.6 + r() * 0.8); total += widths[k]; }
        var x = 0;
        widths.forEach(function (wv) {
          var w = wv / total * S;
          shade(g, x + 3, y + 3, w - 6, rh - 6, [138, 134, 126], 14, r);
          g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 3, y + 3, w - 6, 3);   // lit top edge
          g.fillStyle = 'rgba(0,0,0,0.12)'; for (var c = 0; c < 6; c++) g.fillRect(x + 6 + r() * (w - 14), y + 6 + r() * (rh - 14), 2, 2); // pits
          x += w;
        });
        y += rh;
      });
    }
  };

  function material(kind, width, depth) {
    kind = DRAW[kind] ? kind : 'tile';
    try {
      var id = 'floor-' + kind;
      if (!document.getElementById(id)) {
        var c = document.createElement('canvas');
        c.width = c.height = 256; c.id = id; c.style.display = 'none';
        DRAW[kind](c.getContext('2d'), 256);
        document.body.appendChild(c);
      }
      var t = TILE[kind];
      // A-Frame keeps one texture per src, so give each size its own repeat on the material (a plane's uv spans 0..1).
      return { src: '#' + id, repeat: (width / t) + ' ' + (depth / t), color: '#ffffff', roughness: 0.9, metalness: 0, flatShading: true };
    } catch (e) {
      return { color: FALLBACK[kind], roughness: 1, metalness: 0 };
    }
  }

  root.StoreFloor = { material: material, kinds: Object.keys(DRAW) };
})(window);
