import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joystickVector, moveStep, lookDelta, clampPitch, DEADZONE, WALK_SPEED } from '../public/js/joystick.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('the stick does nothing inside its dead zone and at rest', () => {
  assert.deepEqual(joystickVector(0, 0, 48), { x: 0, y: 0, mag: 0 });
  assert.equal(joystickVector(3, 2, 48).mag, 0);
  assert.equal(joystickVector(10, 10, 0).mag, 0); // no radius, no movement (not NaN)
});

test('pushing up is forward, right is right, and the full push is magnitude 1', () => {
  const up = joystickVector(0, -48, 48);
  assert.ok(near(up.y, 1) && near(up.x, 0) && near(up.mag, 1));
  const right = joystickVector(48, 0, 48);
  assert.ok(near(right.x, 1) && near(right.y, 0));
  const back = joystickVector(0, 48, 48);
  assert.ok(near(back.y, -1));
  assert.ok(joystickVector(0, -480, 48).mag <= 1, 'dragging past the ring is capped');
});

test('leaving the dead zone starts from zero (no jump) and speed grows smoothly', () => {
  const justOut = joystickVector(0, -48 * (DEADZONE + 0.001), 48);
  assert.ok(justOut.mag > 0 && justOut.mag < 0.01);
  const half = joystickVector(0, -24, 48).mag, threeQ = joystickVector(0, -36, 48).mag;
  assert.ok(half < threeQ && threeQ < 1);
});

test('moveStep: forward follows the heading (facing -z at yaw 0, turning left is +)', () => {
  const fwd = { x: 0, y: 1, mag: 1 };
  let s = moveStep(fwd, 0, 1);
  assert.ok(near(s.dx, 0) && near(s.dz, -WALK_SPEED));
  s = moveStep(fwd, Math.PI / 2, 1);              // turned left: forward is -x
  assert.ok(near(s.dx, -WALK_SPEED) && near(s.dz, 0, 1e-9));
  s = moveStep({ x: 1, y: 0, mag: 1 }, 0, 1);     // strafe right at yaw 0 is +x
  assert.ok(near(s.dx, WALK_SPEED) && near(s.dz, 0));
  s = moveStep({ x: 0, y: 1, mag: 1 }, 0, 0.5);   // half a second, half the distance
  assert.ok(near(s.dz, -WALK_SPEED / 2));
  assert.deepEqual(moveStep({ x: 0, y: 0, mag: 0 }, 1.2, 1), { dx: 0, dz: 0 });
});

test('looking: drag right turns right (yaw falls), drag down looks down (pitch falls); pitch is clamped short of straight up or down', () => {
  const d = lookDelta(100, 0);
  assert.ok(d.yaw < 0 && d.pitch === 0);
  assert.ok(lookDelta(0, 100).pitch < 0);
  assert.ok(clampPitch(5) < Math.PI / 2 && clampPitch(-5) > -Math.PI / 2);
  assert.equal(clampPitch(0.3), 0.3);
});
