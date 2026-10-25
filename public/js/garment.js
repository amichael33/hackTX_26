/* Classic script (also parses as an ES module under Node): DOM-free garment helpers for the clothing racks.
   Exposes globalThis.StoreGarment = { KINDS, SILHOUETTES, kindFromTitle, isSkin, analyzePhoto }.
   - kindFromTitle: which garment a product title names (default tee).
   - SILHOUETTES: one polygon per kind in a 100 x 120 box, used to draw a garment-shaped model.
   - analyzePhoto: given RGBA pixels of an already background-removed photo, is a person wearing it? (skin-tone share of
     the figure pixels) and what colour is the garment (non-skin colour of the torso area). */
(function (root) {
  var KINDS = ['hoodie', 'tee', 'sweater', 'jacket', 'dress', 'pants', 'skirt', 'scarf'];

  // Checked in order: the first match wins ("shirt dress" is a dress, "hooded sweatshirt" a hoodie).
  var KIND_WORDS = [
    ['dress', /\b(dress|gown|jumpsuit|romper)\b/i],
    ['hoodie', /\b(hoodie|hoody|hooded|sweatshirt)\b/i],
    ['jacket', /\b(jacket|coat|blazer|parka|puffer|bomber|windbreaker|vest|cardigan)\b/i],
    ['sweater', /\b(sweater|jumper|pullover|knit|turtleneck|quarter[\s-]?zip|crewneck|crew neck)\b/i],
    ['pants', /\b(pants?|jeans?|trousers?|chinos?|joggers?|leggings?|shorts|slacks|cargo)\b/i],
    ['skirt', /\b(skirt|skort)\b/i],
    ['scarf', /\b(scarf|scarves|shawl|wrap)\b/i],
    ['tee', /\b(tee|t-?shirt|tank|top|shirt|polo|blouse)\b/i]
  ];

  function kindFromTitle(title) {
    var s = String(title == null ? '' : title);
    for (var i = 0; i < KIND_WORDS.length; i++) if (KIND_WORDS[i][1].test(s)) return KIND_WORDS[i][0];
    return 'tee';
  }

  var SILHOUETTES = {
    tee: [[30, 8], [44, 8], [50, 16], [56, 8], [70, 8], [96, 30], [82, 48], [72, 40], [72, 110], [28, 110], [28, 40], [18, 48], [4, 30]],
    hoodie: [[28, 12], [38, 4], [50, 2], [62, 4], [72, 12], [98, 40], [88, 98], [74, 94], [74, 112], [26, 112], [26, 94], [12, 98], [2, 40]],
    sweater: [[30, 8], [44, 8], [50, 16], [56, 8], [70, 8], [98, 34], [90, 100], [76, 96], [76, 112], [24, 112], [24, 96], [10, 100], [2, 34]],
    jacket: [[24, 10], [40, 6], [50, 16], [60, 6], [76, 10], [98, 36], [92, 104], [78, 100], [76, 112], [24, 112], [22, 100], [8, 104], [2, 36]],
    dress: [[36, 6], [44, 6], [50, 16], [56, 6], [64, 6], [70, 40], [84, 112], [16, 112], [30, 40]],
    pants: [[26, 6], [74, 6], [78, 112], [56, 112], [50, 44], [44, 112], [22, 112]],
    skirt: [[30, 6], [70, 6], [90, 100], [10, 100]],
    scarf: [[20, 10], [80, 10], [80, 28], [60, 28], [60, 112], [40, 112], [40, 28], [20, 28]]
  };

  // Skin tone in YCbCr (BT.601): the classic Cb 77..127, Cr 133..173 box, with a luma floor so near-black never counts.
  function isSkin(r, g, b) {
    var y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (y < 45) return false;
    var cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    var cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
  }

  var PERSON_MIN = 0.02, PERSON_MAX = 0.5; // skin share of the figure: between = person; above = a tan garment

  function hex(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
  function toHex(r, g, b) { return '#' + hex(r) + hex(g) + hex(b); }

  // data: RGBA of the cut-out (transparent = background). Returns
  // { isPerson, skinFraction, color, dominantColors } where color is the main non-skin colour of the torso area.
  function analyzePhoto(data, w, h) {
    var none = { isPerson: false, skinFraction: 0, color: null, dominantColors: [] };
    if (!data || !w || !h) return none;
    var figure = 0, skin = 0, x0 = w, x1 = -1, y0 = h, y1 = -1, x, y, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = (y * w + x) * 4;
        if (data[i + 3] < 128) continue;
        figure++;
        if (isSkin(data[i], data[i + 1], data[i + 2])) skin++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (!figure) return none;
    var frac = skin / figure;
    // Torso area: the middle band of the figure's bounding box, where a worn top shows its colour and print.
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    var tx0 = x0 + bw * 0.25, tx1 = x0 + bw * 0.75, ty0 = y0 + bh * 0.25, ty1 = y0 + bh * 0.65;
    var bins = {};
    function collect(ax0, ax1, ay0, ay1) {
      var n = 0;
      for (var yy = Math.floor(ay0); yy <= ay1; yy++) {
        for (var xx = Math.floor(ax0); xx <= ax1; xx++) {
          var j = (yy * w + xx) * 4;
          if (data[j + 3] < 128) continue;
          var r = data[j], g = data[j + 1], b = data[j + 2];
          if (isSkin(r, g, b)) continue;
          var key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
          var bin = bins[key] || (bins[key] = { n: 0, r: 0, g: 0, b: 0 });
          bin.n++; bin.r += r; bin.g += g; bin.b += b; n++;
        }
      }
      return n;
    }
    if (!collect(tx0, tx1, ty0, ty1)) { bins = {}; collect(x0, x1, y0, y1); } // only skin in the torso box: any non-skin pixel
    var list = Object.keys(bins).map(function (k) { return bins[k]; }).sort(function (a, b) { return b.n - a.n; });
    var colors = list.slice(0, 3).map(function (b) { return toHex(b.r / b.n, b.g / b.n, b.b / b.n); });
    return {
      isPerson: frac >= PERSON_MIN && frac <= PERSON_MAX,
      skinFraction: frac,
      color: colors[0] || null,
      dominantColors: colors
    };
  }

  root.StoreGarment = { KINDS: KINDS, SILHOUETTES: SILHOUETTES, kindFromTitle: kindFromTitle, isSkin: isSkin, analyzePhoto: analyzePhoto };
})(globalThis);
