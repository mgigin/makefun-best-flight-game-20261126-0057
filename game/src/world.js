// The game's rules and state, with no drawing and no browser in it: the
// mail plane, the ring course, fuel and damage, the score, and the screens.
// step() advances one fixed step and returns what happened as bit flags, so
// the caller can react (banner, sound, screen change) without the world
// knowing about screens or sound. Nothing here allocates after createWorld.
import { PLANE, RINGS, RUNWAY, SCORING, STEP } from './config.js';
import { clamp } from './random.js';
import { createPlane, stepPlane } from './plane.js';
import { ringDistance, ringPassed } from './rings.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_LOW_FUEL = 8;

export const PHASE_TITLE = 0;
export const PHASE_PLAY = 1;
export const PHASE_LANDED = 2;
export const PHASE_CRASHED = 3;

export function createWorld(terrain) {
  const plane = createPlane();
  const state = {
    plane,
    rings: RINGS,
    ringsCollected: 0,
    score: 0,
    elapsed: 0,
    phase: PHASE_TITLE,
    crashReason: '',
    landing: null, // { softness, fuelBonus, timeBonus, total } on touchdown
    lowFuelWarned: false,
    pullUpWarned: false,
  };

  function reset() {
    const fresh = createPlane();
    plane.pos.x = fresh.pos.x;
    plane.pos.y = fresh.pos.y;
    plane.pos.z = fresh.pos.z;
    plane.heading = fresh.heading;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = 0;
    plane.throttle = 0;
    plane.fuel = PLANE.fuelMax;
    plane.vspeed = 0;
    plane.propAngle = 0;
    plane.onGround = true;
    state.ringsCollected = 0;
    state.score = 0;
    state.elapsed = 0;
    state.phase = PHASE_TITLE;
    state.crashReason = '';
    state.landing = null;
    state.lowFuelWarned = false;
    state.pullUpWarned = false;
  }

  // Score the touchdown: softness from the vertical speed, fuel left, time.
  function scoreLanding(vspeed) {
    const softness = clamp(1 - Math.abs(vspeed) / 4.5, 0, 1);
    const softBonus = Math.round(SCORING.softnessMax * softness);
    const fuelBonus = Math.round(plane.fuel * SCORING.fuelPerPoint);
    const timeBonus = Math.max(0, SCORING.timeBonusMax - Math.round(state.elapsed) * SCORING.timeBonusFalloff);
    const total = SCORING.landingBase + softBonus + fuelBonus + timeBonus;
    state.landing = { softness, softBonus, fuelBonus, timeBonus, total };
    state.score += total;
    return state.landing;
  }

  // One fixed step of play. `ctl` is { pitch, roll, throttle } targets.
  // On the title screen the plane sits on the strip with the prop turning.
  function step(dt, ctl, titleBackdrop) {
    let events = 0;
    if (titleBackdrop) {
      plane.throttle = 0.12;
      plane.propAngle += 2.5 * dt;
      return events;
    }
    state.elapsed += dt;
    // Throttle keys nudge the target; the plane model eases toward it.
    const result = stepPlane(plane, ctl, dt, terrain.heightAt);
    if (result === 'landed') {
      events |= EVENT_LANDED;
      state.phase = PHASE_LANDED;
      scoreLanding(plane.vspeed);
      return events;
    }
    if (result === 'crashed-terrain' || result === 'crashed-water') {
      events |= EVENT_CRASHED;
      state.phase = PHASE_CRASHED;
      state.crashReason =
        result === 'crashed-water'
          ? 'Ditched in the sea — the mail is soaked.'
          : plane.vspeed < -6
            ? 'Hard landing — the undercarriage gave way.'
            : 'Flew into the island — the ridge wins this time.';
      return events;
    }
    // Rings: pass through the hoop to collect it.
    if (state.ringsCollected < RINGS.length) {
      const ring = RINGS[state.ringsCollected];
      if (ringPassed(plane, ring)) {
        state.ringsCollected += 1;
        state.score += SCORING.ringPoints;
        events |= EVENT_RING;
      }
    }
    // Warnings: fuel, and terrain ahead when low and fast.
    if (!state.lowFuelWarned && plane.fuel < 20) {
      state.lowFuelWarned = true;
      events |= EVENT_LOW_FUEL;
    }
    const ground = terrain.heightAt(plane.pos.x, plane.pos.z);
    const clearance = plane.pos.y - ground;
    if (!plane.onGround && clearance < 25 && plane.vspeed < -2 && !state.pullUpWarned) {
      state.pullUpWarned = true;
      // One-shot warning; re-arm once the pilot climbs clear.
    } else if (clearance > 60) {
      state.pullUpWarned = false;
    }
    return events;
  }

  // Distance and bearing to the next objective, for the HUD arrow.
  function nextTarget() {
    if (state.ringsCollected < RINGS.length) return RINGS[state.ringsCollected];
    return { x: RUNWAY.cx, y: RUNWAY.y + 4, z: RUNWAY.cz };
  }

  function nearestRingDistance() {
    if (state.ringsCollected >= RINGS.length) return 0;
    return ringDistance(plane, RINGS[state.ringsCollected]);
  }

  reset();
  return { state, reset, step, nextTarget, nearestRingDistance, STEP };
}
