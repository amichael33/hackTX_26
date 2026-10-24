/* Classic script (also parses as an ES module under Node): edge flood-fill background removal.
   Exposes globalThis.StoreCutout = { removeEdgeBackground, alphaBBox }. */
(function (root) {
  function removeEdgeBackground(data, w, h, opts) {
    var minLight = opts && opts.minLight !== undefined ? opts.minLight : 232;
    var maxChroma = opts && opts.maxChroma !== undefined ? opts.maxChroma : 24;
    var n = w * h;
    if (!n) return { removedFraction: 0 };

    function isBg(p) {
      var i = p * 4;
      if (data[i + 3] < 16) return true;
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      return mn >= minLight && mx - mn <= maxChroma;
    }

    var seen = new Uint8Array(n); // 1 = queued/removed
    var queue = new Int32Array(n);
    var head = 0, tail = 0;
    function seed(p) {
      if (!seen[p] && isBg(p)) { seen[p] = 1; queue[tail++] = p; }
    }
    for (var x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (var y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }

    while (head < tail) {
      var p = queue[head++];
      var px = p % w;
      if (px > 0) seed(p - 1);
      if (px < w - 1) seed(p + 1);
      if (p >= w) seed(p - w);
      if (p < n - w) seed(p + w);
    }

    // Feather first (needs the original alpha of kept pixels), then clear the removed ones.
    for (var q = 0; q < n; q++) {
      if (seen[q]) continue;
      var qx = q % w;
      var near = (qx > 0 && seen[q - 1]) || (qx < w - 1 && seen[q + 1]) ||
                 (q >= w && seen[q - w]) || (q < n - w && seen[q + w]);
      if (near && data[q * 4 + 3] > 140) data[q * 4 + 3] = 140;
    }
    for (var r = 0; r < n; r++) if (seen[r]) data[r * 4 + 3] = 0;

    return { removedFraction: tail / n };
  }

  function alphaBBox(data, w, h, alphaMin) {
    if (alphaMin === undefined) alphaMin = 16;
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] >= alphaMin) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  root.StoreCutout = { removeEdgeBackground: removeEdgeBackground, alphaBBox: alphaBBox };
})(globalThis);
