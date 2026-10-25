// Virtual joystick and touch-look for phones. The maths is DOM-free (and tested); the DOM part follows below.
//
// Move: dragging the stick walks the player; the knob follows the thumb, pushing it up walks forward.
// Look: dragging anywhere else on the 3D canvas with a finger turns the view (A-Frame's own touch look only understands one finger,
// so it could not work while a thumb is on the stick; look-controls has `touchEnabled:false` and this does it instead).

export const DEADZONE = 0.12;     // inside this share of the radius the stick does nothing
export const WALK_SPEED = 3.2;    // metres per second at full deflection
export const LOOK_SENSITIVITY = 0.0045; // radians per pixel of finger drag
export const TAP_SLOP = 8;        // a touch that moves less than this many pixels is a tap, not a look-drag

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Stick offset in pixels from its centre (screen y grows downward) -> { x: right (-1..1), y: forward (-1..1), mag: 0..1 }.
export function joystickVector(dx, dy, radius) {
  const len = Math.hypot(dx, dy);
  if (!radius || len === 0) return { x: 0, y: 0, mag: 0 };
  const mag = Math.min(1, len / radius);
  if (mag < DEADZONE) return { x: 0, y: 0, mag: 0 };
  // Past the dead zone, ease from 0 so there is no jump when the stick leaves it.
  const eased = (mag - DEADZONE) / (1 - DEADZONE);
  return { x: (dx / len) * eased, y: (-dy / len) * eased, mag: eased };
}

// How far to move this frame: `vec` from joystickVector, `yaw` = the rig's heading (A-Frame: facing -z at 0, turning left is +).
export function moveStep(vec, yaw, dt, speed = WALK_SPEED) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // forward
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);    // right
  return { dx: (fx * vec.y + rx * vec.x) * speed * dt || 0, dz: (fz * vec.y + rz * vec.x) * speed * dt || 0 }; // `|| 0`: no negative zeros
}

// A finger drag of (dx, dy) pixels -> how much to add to the view's yaw and pitch (drag right turns right, drag down looks down).
export function lookDelta(dx, dy, sensitivity = LOOK_SENSITIVITY) {
  return { yaw: -dx * sensitivity, pitch: -dy * sensitivity };
}
export const clampPitch = (p) => clamp(p, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);

// --- DOM part ---

export const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).get('joystick') === '1' || // force it on for testing on a desktop
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));

// root: the stick's outer circle, knob: the inner circle. Returns { setEnabled(bool) }.
// It publishes window.StoreJoystick = { enabled, vec, step(dt, yaw) } for the `joystick-move` component to read every frame.
export function createJoystick({ root, knob }) {
  const state = { enabled: false, vec: { x: 0, y: 0, mag: 0 } };
  let pointerId = null, cx = 0, cy = 0, radius = 48;

  const park = () => { state.vec = { x: 0, y: 0, mag: 0 }; knob.style.transform = 'translate(0px, 0px)'; };
  const move = (e) => {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; } // the knob stays inside the ring
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.vec = joystickVector(dx, dy, radius);
  };
  root.addEventListener('pointerdown', (e) => {
    if (!state.enabled || pointerId !== null) return;
    pointerId = e.pointerId;
    const r = root.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    radius = r.width / 2 - 8;
    try { root.setPointerCapture(pointerId); } catch (err) { /* not capturable (a synthetic event): the stick still works while the pointer stays over it */ }
    e.preventDefault();
    move(e);
  });
  root.addEventListener('pointermove', (e) => { if (e.pointerId === pointerId) { e.preventDefault(); move(e); } });
  const release = (e) => { if (e.pointerId === pointerId) { pointerId = null; park(); } };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('lostpointercapture', release);

  state.step = (dt, yaw) => moveStep(state.vec, yaw, dt);
  window.StoreJoystick = state;

  return {
    // Shown (and live) only while the player can walk; hiding it also lets go of the stick.
    setEnabled(on) {
      state.enabled = !!on;
      root.hidden = !on;
      if (!on) { pointerId = null; park(); }
    },
  };
}

// Touch look on the 3D canvas. Only fingers (pointerType touch) are handled: a mouse keeps using A-Frame's own drag-to-look.
export function attachTouchLook(canvas, getLook) {
  const fingers = new Map(); // pointerId -> { x, y, sx, sy, dragging }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, dragging: false });
  });
  canvas.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    if (!f.dragging && Math.hypot(e.clientX - f.sx, e.clientY - f.sy) < TAP_SLOP) return; // still a tap
    f.dragging = true;
    const look = getLook();
    if (look) {
      const d = lookDelta(e.clientX - f.x, e.clientY - f.y);
      look.yawObject.rotation.y += d.yaw;
      look.pitchObject.rotation.x = clampPitch(look.pitchObject.rotation.x + d.pitch);
    }
    f.x = e.clientX; f.y = e.clientY;
  });
  const end = (e) => fingers.delete(e.pointerId);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
