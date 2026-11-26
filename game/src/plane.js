// The mail plane: a little red-and-cream courier, "PK-SENJA", built from boxes
// and a pyramid nose, plus the arcade flight model that flies it. Model space:
// nose toward -Z, wings along X, up is +Y. The renderer orients it from the
// heading / pitch / roll basis vectors.
import { PALETTE, PLANE, RUNWAY } from './config.js';
import { clamp, lerp, wrapAngle } from './random.js';
import { addBox, addNoseCone, createMesh } from './mesh.js';

export function buildPlaneMesh() {
  const mesh = createMesh();
  const cream = PALETTE.planeCream;
  const red = PALETTE.planeRed;
  const dark = PALETTE.planeDark;
  const glass = [0.15, 0.28, 0.38];
  // Fuselage: nose cone, mid cabin, tapering tail.
  addNoseCone(mesh, [0, 0, -2.6], 1.5, 1.6, cream);
  addBox(mesh, [0, 0, -1.2], [1.5, 1.4, 2.6], cream);
  addBox(mesh, [0, 0.1, 1.2], [1.2, 1.1, 2.6], cream);
  addBox(mesh, [0, 0.15, 2.9], [0.8, 0.8, 1.4], cream);
  // Red cheatline along the fuselage.
  addBox(mesh, [0, -0.05, -1.2], [1.54, 0.28, 2.6], red);
  addBox(mesh, [0, 0.05, 1.2], [1.24, 0.24, 2.6], red);
  // Cockpit windows.
  addBox(mesh, [0, 0.62, -1.9], [1.0, 0.42, 1.0], glass);
  addBox(mesh, [0, 0.55, -0.9], [1.1, 0.35, 0.6], glass);
  // Main wing and red tips.
  addBox(mesh, [0, -0.15, -0.4], [9.0, 0.18, 1.7], cream);
  addBox(mesh, [-4.35, -0.15, -0.4], [0.6, 0.2, 1.7], red);
  addBox(mesh, [4.35, -0.15, -0.4], [0.6, 0.2, 1.7], red);
  // Tail: horizontal stabiliser and vertical fin.
  addBox(mesh, [0, 0.15, 3.2], [3.2, 0.14, 1.0], cream);
  addBox(mesh, [0, 0.85, 3.1], [0.16, 1.5, 1.2], red);
  // Fixed gear: two wheels and struts.
  addBox(mesh, [-0.7, -0.95, -0.9], [0.14, 0.7, 0.14], dark);
  addBox(mesh, [0.7, -0.95, -0.9], [0.14, 0.7, 0.14], dark);
  addBox(mesh, [-0.7, -1.25, -0.9], [0.34, 0.5, 0.5], dark);
  addBox(mesh, [0.7, -1.25, -0.9], [0.34, 0.5, 0.5], dark);
  return mesh;
}

// The propeller, a separate mesh so it can spin around the nose axis.
export function buildPropMesh() {
  const mesh = createMesh();
  const dark = PALETTE.planeDark;
  const yellow = [0.95, 0.8, 0.25];
  addBox(mesh, [0, 0, 0], [0.3, 0.3, 0.3], dark);
  addBox(mesh, [0, 1.15, 0], [0.22, 2.0, 0.08], dark);
  addBox(mesh, [0, -1.15, 0], [0.22, 2.0, 0.08], dark);
  addBox(mesh, [0, 2.05, 0], [0.22, 0.25, 0.08], yellow);
  addBox(mesh, [0, -2.05, 0], [0.22, 0.25, 0.08], yellow);
  return mesh;
}

// Flight state. `pos` is metres, `heading` 0 = north (-Z), `pitch` positive =
// climbing, `roll` positive = banked right, `speed` m/s, `throttle` 0..1.
export function createPlane() {
  return {
    pos: { x: RUNWAY.cx - 150, y: RUNWAY.y + 1.6, z: RUNWAY.cz },
    heading: RUNWAY.heading,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelMax,
    vspeed: 0,
    propAngle: 0,
    onGround: true,
  };
}

// Forward vector for a heading/pitch pair.
export function forwardOf(heading, pitch) {
  return [
    Math.sin(heading) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(heading) * Math.cos(pitch),
  ];
}

// Right vector for a heading (level wings).
export function rightOf(heading) {
  return [Math.cos(heading), 0, Math.sin(heading)];
}

// Basis vectors with roll applied: right', up', forward.
export function basisOf(heading, pitch, roll) {
  const f = forwardOf(heading, pitch);
  const r = rightOf(heading);
  // Level up = right x forward.
  const u = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const rp = [r[0] * cr - u[0] * sr, r[1] * cr - u[1] * sr, r[2] * cr - u[2] * sr];
  const up = [u[0] * cr + r[0] * sr, u[1] * cr + r[1] * sr, u[2] * cr + r[2] * sr];
  return { right: rp, up, forward: f };
}

// One fixed step of the flight model. `ctl` is { pitch, roll, throttle } with
// pitch/roll in -1..1 and throttle in 0..1 (targets). `heightAt` is the ground
// function. Returns 'ok' | 'crashed-terrain' | 'crashed-water' | 'landed'.
export function stepPlane(plane, ctl, dt, heightAt) {
  // Throttle eases toward its target; the prop spins with it.
  plane.throttle = clamp(plane.throttle + clamp(ctl.throttle - plane.throttle, -PLANE.throttleRate * dt, PLANE.throttleRate * dt), 0, 1);
  plane.propAngle += (2 + plane.throttle * 26) * dt;

  // Stick: pitch and roll ease toward the commanded deflection, then the
  // wings auto-level when the stick is released.
  const pitchTarget = clamp(ctl.pitch, -1, 1) * PLANE.maxPitch;
  const rollTarget = clamp(ctl.roll, -1, 1) * PLANE.maxRoll;
  const rate = plane.onGround ? 0.4 : 1;
  plane.pitch += clamp(pitchTarget - plane.pitch, -PLANE.pitchRate * rate * dt, PLANE.pitchRate * rate * dt);
  plane.roll += clamp(rollTarget - plane.roll, -PLANE.rollRate * rate * dt, PLANE.rollRate * rate * dt);
  if (ctl.roll === 0 && !plane.onGround) {
    plane.roll -= clamp(plane.roll, -PLANE.autoLevelRate * dt, PLANE.autoLevelRate * dt);
  }

  // Speed chases the throttle setting, with drag; a dive adds speed, a climb
  // bleeds it.
  const targetSpeed = PLANE.minSpeed + plane.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  plane.speed += clamp(targetSpeed - plane.speed, -26 * dt, 14 * dt);
  plane.speed += -Math.sin(plane.pitch) * 9 * dt;

  // A stalled wing cannot hold the nose up: it drops and the controls go soft.
  const stalled = plane.speed < PLANE.stallSpeed && !plane.onGround;
  if (stalled) {
    plane.pitch -= 0.5 * dt;
    plane.roll *= 1 - 0.4 * dt;
  }

  // A banked turn: heading rate grows with bank and falls with speed. A
  // right bank (positive roll) turns the nose right (heading increases).
  plane.heading += (Math.tan(plane.roll) * 9.8) / Math.max(plane.speed, 12) * dt;
  plane.heading = wrapAngle(plane.heading);

  // Move. Vertical speed is climb from pitch minus the sink of a slow wing:
  // below 30 m/s the plane settles, which is what makes a flare land instead
  // of float.
  const f = forwardOf(plane.heading, plane.pitch);
  const sink = Math.max(0, 30 - plane.speed) * 0.3;
  const vspeed = f[1] * plane.speed - sink;
  plane.vspeed = vspeed;
  plane.pos.x += f[0] * plane.speed * dt;
  plane.pos.y += vspeed * dt;
  plane.pos.z += f[2] * plane.speed * dt;

  // Fuel: idle burn plus a throttle-squared term, so full power costs.
  if (!plane.onGround || plane.throttle > 0.05) {
    plane.fuel = Math.max(0, plane.fuel - (PLANE.fuelIdle + PLANE.fuelThrottle * plane.throttle * plane.throttle) * dt);
  }
  if (plane.fuel <= 0 && plane.throttle > 0) plane.throttle = 0;

  // Ground and water. `vspeed` was set in the Move section above.
  const ground = heightAt(plane.pos.x, plane.pos.z);
  if (plane.onGround) {
    // Rolling on the strip: stay glued until fast enough to lift off. The
    // pilot may already be pulling back (pitch builds toward rotation), but
    // the wings stay level on the wheels.
    plane.roll = 0;
    plane.pitch = clamp(plane.pitch, -0.05, 0.3);
    if (plane.speed > 34 && plane.pitch > 0.06) {
      plane.onGround = false;
    } else {
      plane.pos.y = ground + 1.6;
    }
    return 'ok';
  }
  const clearance = plane.pos.y - ground;
  if (clearance <= 1.6) {
    // Touchdown: only the runway forgives, and only gently.
    const onStrip =
      Math.abs(plane.pos.x - RUNWAY.cx) < RUNWAY.length / 2 &&
      Math.abs(plane.pos.z - RUNWAY.cz) < RUNWAY.width / 2;
    const aligned = Math.abs(wrapAngle(plane.heading - RUNWAY.heading)) < 0.35;
    const gentle = vspeed > -4.5 && plane.speed < 48 && Math.abs(plane.roll) < 0.25;
    if (onStrip && aligned && gentle) {
      plane.pos.y = ground + 1.6;
      plane.pitch = 0;
      plane.roll = 0;
      plane.onGround = true;
      return 'landed';
    }
    return ground <= 0.5 ? 'crashed-water' : 'crashed-terrain';
  }
  return 'ok';
}

// Steer toward a point: the autopilot the screenshot scenes use, and the same
// shape a player could fly. Returns { pitch, roll, throttle } targets.
// `prev` is the previous waypoint: far out, the plane aims at an entry point
// 250 m before the target along the leg, so it arrives on the leg line and
// flies straight through the hoop instead of orbiting it. With
// opts.heightAt given, the plane stays at least 40 m above the ground
// beneath it until it is close to the target, so it never clips a rising
// slope on the way to a ring.
export function autopilotTo(plane, target, prev, opts = {}) {
  const dx = target.x - plane.pos.x;
  const dy = target.y - plane.pos.y;
  const dz = target.z - plane.pos.z;
  const dist = Math.hypot(dx, dz);
  let aimX = target.x;
  let aimZ = target.z;
  if (prev && dist > 300) {
    const lx = target.x - prev.x;
    const lz = target.z - prev.z;
    const llen = Math.hypot(lx, lz) || 1;
    aimX = target.x - (lx / llen) * 300;
    aimZ = target.z - (lz / llen) * 300;
  }
  const desiredHeading = Math.atan2(aimX - plane.pos.x, -(aimZ - plane.pos.z));
  const headingErr = wrapAngle(desiredHeading - plane.heading);
  const roll = clamp(headingErr * 1.4, -0.85, 0.85);
  let targetY = target.y;
  if (opts.heightAt && dist > 100) {
    // Terrain clearance along the flight path: sample the ground at
    // quarters of the way to the target and stay 30 m above the highest
    // of it. The plane clears a ridge between it and the ring, then drops
    // to the ring's altitude for the last 100 m — every ring sits ~45 m
    // above its own ground, so the last stretch is clear.
    let maxGround = opts.heightAt(plane.pos.x, plane.pos.z);
    for (let f = 0.25; f <= 1.0; f += 0.25) {
      const g = opts.heightAt(
        plane.pos.x + dx * f,
        plane.pos.z + dz * f,
      );
      if (g > maxGround) maxGround = g;
    }
    targetY = Math.max(targetY, maxGround + 30);
  }
  const desiredPitch = clamp((targetY - plane.pos.y) * 0.03, -0.6, 0.85);
  const pitch = clamp(desiredPitch, -1, 1);
  let throttle = opts.throttle ?? 0.78;
  // Slow down on the way in: a tight turn at low speed is what threads the
  // hoop, and a fast plane just orbits it. Slow down even more when the
  // turn is sharp, so the turn radius shrinks to match.
  if (dist < 600) throttle = Math.min(throttle, 0.55);
  if (dist < 300) throttle = Math.min(throttle, 0.42);
  if (dist < 150) throttle = Math.min(throttle, 0.35);
  return { pitch, roll, throttle };
}

// Final approach: chase a carrot 300 m ahead along the runway centreline,
// so the plane aligns with the strip instead of orbiting a fixed point, and
// ride a gentle glide slope down to the threshold. Over the strip, flare to
// a soft -1.5 m/s descent and let her settle. Off the centreline the plane
// never descends below the ground beneath it plus 18 m, so a late turn-in
// cannot put it into the hillside south of the valley.
export function autopilotLand(plane, heightAt) {
  const dx = 300;
  const dz = RUNWAY.cz - plane.pos.z;
  const desiredHeading = Math.atan2(dx, -dz);
  const headingErr = wrapAngle(desiredHeading - plane.heading);
  const roll = clamp(headingErr * 1.6, -0.6, 0.6);
  const thresholdX = RUNWAY.cx - RUNWAY.length / 2;
  const distToThreshold = Math.max(0, thresholdX - plane.pos.x);
  let targetAlt = RUNWAY.y + 2 + distToThreshold * 0.09;
  if (heightAt && Math.abs(dz) > 40) {
    targetAlt = Math.max(targetAlt, heightAt(plane.pos.x, plane.pos.z) + 18);
  }
  const altErr = targetAlt - plane.pos.y;
  let pitch = clamp(altErr * 0.02, -0.22, 0.2);
  let throttle = 0.5;
  if (plane.pos.x > thresholdX && plane.pos.y - RUNWAY.y < 12) {
    // Flare: hold a soft -1.5 m/s descent, power to idle, let her settle.
    pitch = clamp((-1.5 - plane.vspeed) * 0.08, -0.15, 0.15);
    throttle = 0.12;
  }
  return { pitch, roll, throttle };
}

export function planeSpeedKnots(plane) {
  return Math.round(plane.speed * 1.944);
}

export function planeAltitudeFeet(plane) {
  return Math.round(plane.pos.y * 3.281);
}

export function planeHeadingDegrees(plane) {
  let deg = (plane.heading * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return Math.round(deg);
}

export function planeVerticalSpeedFpm(plane) {
  return Math.round((plane.vspeed ?? 0) * 196.85);
}
