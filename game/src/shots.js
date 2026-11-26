// The screenshot scenes behind ?shot=start|play|approach|end. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by the same autopilot a careful pilot would fly, so the frame is
// what a real sortie looks like and the same seed always gives the same frame.
import { RINGS, RUNWAY, STEP } from './config.js';
import { autopilotLand, autopilotTo } from './plane.js';
import { EVENT_CRASHED, EVENT_LANDED, PHASE_CRASHED, PHASE_LANDED, PHASE_PLAY } from './world.js';
import { SCREEN_CRASHED, SCREEN_LANDED, SCREEN_PLAY, SCREEN_TITLE } from './hud.js';

const START_SECONDS = 6;
const PLAY_RINGS = 3; // stop just past the third ring, mid-action
const PLAY_LIMIT_SECONDS = 180;
const APPROACH_LIMIT_SECONDS = 420;
const END_LIMIT_SECONDS = 600;

/** Fly the autopilot one step toward the current objective. */
function autopilotStep(world, terrain) {
  const state = world.state;
  const plane = state.plane;
  let ctl;
  if (state.ringsCollected < RINGS.length) {
    const prev = state.ringsCollected === 0
      ? { x: RUNWAY.cx - 150, y: RUNWAY.y, z: RUNWAY.cz }
      : RINGS[state.ringsCollected - 1];
    ctl = autopilotTo(plane, RINGS[state.ringsCollected], prev, { heightAt: terrain.heightAt });
  } else {
    ctl = autopilotLand(plane, terrain.heightAt);
  }
  return world.step(STEP, ctl, false);
}

/**
 * Set the world to the named scene (start, play, approach or end; any other
 * name is start) and return the screen to draw over it and the score to show.
 */
export function stageShot(name, world, terrain) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'approach' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, null, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  state.phase = PHASE_PLAY;
  const limit = name === 'end' ? END_LIMIT_SECONDS : name === 'approach' ? APPROACH_LIMIT_SECONDS : PLAY_LIMIT_SECONDS;
  let events = 0;
  for (let i = 0; i < limit / STEP; i += 1) {
    events = autopilotStep(world, terrain);
    if (events & (EVENT_LANDED | EVENT_CRASHED)) break;
    if (name === 'play' && state.ringsCollected >= PLAY_RINGS) {
      // A breath past the third ring: the next hoop is ahead, the HUD is lit.
      for (let k = 0; k < 90; k += 1) autopilotStep(world, terrain);
      break;
    }
    if (name === 'approach' && state.ringsCollected >= RINGS.length) {
      const dx = RUNWAY.cx - 150 - state.plane.pos.x;
      const dz = RUNWAY.cz - state.plane.pos.z;
      if (Math.hypot(dx, dz) < 500 && state.plane.pos.y < 95) break;
    }
  }
  if (state.phase === PHASE_LANDED) return { screen: SCREEN_LANDED, best: state.score };
  if (state.phase === PHASE_CRASHED) return { screen: SCREEN_CRASHED, best: state.score };
  return { screen: SCREEN_PLAY, best: state.score };
}
