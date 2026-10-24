/* Classic script: window.StoreSticker.drawSticker(canvas, {price, text, seed}). Comic starburst price sticker.
   Call after document.fonts.load('64px Bangers') so the price uses the comic font. */
(function () {
  var PALETTE = ['#ffe600', '#ff4fa3', '#39d98a', '#4cc9f0', '#ff9f1c', '#c77dff'];
  var DARK = '#1b1b1b';
  var FONT = 'Bangers, Impact, "Arial Black", sans-serif';

  function hashSeed(s) {
    var h = 5381;
    s = String(s);
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }
  // mulberry32
  function makeRng(seed) {
    var a = hashSeed(seed);
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Split into at most 2 lines; shrink the font until every line fits maxW.
  function fitText(ctx, text, maxW, startPx) {
    var words = String(text).split(' ').filter(Boolean);
    var px = startPx;
    for (;;) {
      ctx.font = px + 'px ' + FONT;
      var lines = [words.join(' ')];
      if (ctx.measureText(lines[0]).width > maxW && words.length > 1) {
        var best = null;
        for (var i = 1; i < words.length; i++) {
          var a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
          var w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
          if (!best || w < best.w) best = { w: w, lines: [a, b] };
        }
        lines = best.lines;
      }
      var widest = 0;
      for (var j = 0; j < lines.length; j++) widest = Math.max(widest, ctx.measureText(lines[j]).width);
      if (widest <= maxW || px <= 12) return { px: px, lines: lines };
      px -= 2;
    }
  }

  function drawSticker(canvas, opts) {
    var S = 256, c = S / 2;
    canvas.width = S;
    canvas.height = S;
    var ctx = canvas.getContext('2d');
    var rng = makeRng(opts.seed);
    ctx.clearRect(0, 0, S, S);

    var points = 12 + Math.floor(rng() * 7); // 12-18
    var fill = PALETTE[Math.floor(rng() * PALETTE.length)];
    var outer = 116, inner = 88;
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var r = (i % 2 === 0 ? outer : inner) * (1 + (rng() * 2 - 1) * 0.12);
      var ang = (i / (points * 2)) * Math.PI * 2;
      var x = c + Math.cos(ang) * r, y = c + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = DARK;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = DARK;
    var price = fitText(ctx, String(opts.price == null ? '' : opts.price).replace(/\s+/g, ''), 150, 64);
    ctx.font = price.px + 'px ' + FONT;
    ctx.fillText(price.lines[0], c, 96);

    var t = fitText(ctx, opts.text || '', 150, 28);
    ctx.font = t.px + 'px ' + FONT;
    var lh = t.px * 1.05, y0 = 158 - ((t.lines.length - 1) * lh) / 2;
    for (var k = 0; k < t.lines.length; k++) ctx.fillText(t.lines[k], c, y0 + k * lh);
  }

  window.StoreSticker = { drawSticker: drawSticker };
})();
