/* Classic script: `joystick-move` component, on the rig. Walks the player with the on-screen joystick (js/joystick.js publishes
   window.StoreJoystick). It must come before `bounds` on the rig, so the walls and shelves still push the player back each frame. */
(function () {
  AFRAME.registerComponent('joystick-move', {
    tick: function (time, delta) {
      var j = window.StoreJoystick;
      if (!j || !j.enabled || j.vec.mag === 0) return;
      var o = this.el.object3D;
      var s = j.step(Math.min(delta, 60) / 1000, o.rotation.y);
      o.position.x += s.dx;
      o.position.z += s.dz;
    }
  });
})();
