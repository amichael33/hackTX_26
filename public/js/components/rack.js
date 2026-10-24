/* Classic script: `rack` clothing rack component. */
(function () {
  AFRAME.registerComponent('rack', {
    schema: { width: { default: 1.5 } },
    init: function () { this.built = []; this.build(); },
    update: function (old) {
      if (!old || Object.keys(old).length === 0) return;
      this.clear();
      this.build();
    },
    remove: function () { this.clear(); },
    clear: function () {
      this.built.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
      this.built = [];
    },
    add: function (tag, attrs, mat) {
      var e = document.createElement(tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      e.setAttribute('material', { color: mat, flatShading: true });
      this.el.appendChild(e);
      this.built.push(e);
    },
    build: function () {
      var w = this.data.width, i;
      this.add('a-cylinder', { position: (-w / 2) + ' 0.8 0', radius: 0.03, height: 1.6, 'segments-radial': 8 }, '#555a60');
      this.add('a-cylinder', { position: (w / 2) + ' 0.8 0', radius: 0.03, height: 1.6, 'segments-radial': 8 }, '#555a60');
      this.add('a-cylinder', { position: '0 1.6 0', radius: 0.03, height: w, rotation: '0 0 90', 'segments-radial': 8 }, '#555a60');
      this.add('a-box', { position: (-w / 2) + ' 0.03 0', width: 0.1, height: 0.06, depth: 0.8 }, '#3d4146');
      this.add('a-box', { position: (w / 2) + ' 0.03 0', width: 0.1, height: 0.06, depth: 0.8 }, '#3d4146');
      var n = Math.max(2, Math.floor(w / 0.25));
      for (i = 0; i < n; i++) {
        var x = -w / 2 + 0.15 + i * ((w - 0.3) / (n - 1));
        this.add('a-box', { position: x + ' 1.5 0', width: 0.03, height: 0.12, depth: 0.4 }, '#d9d4c7'); // hanger
      }
    }
  });
})();
