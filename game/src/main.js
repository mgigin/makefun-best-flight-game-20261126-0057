// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, landed and crashed. The camera rides behind the tail, or,
// with C, sits at the windscreen.
//
// ?seed=N fixes the island. ?shot=start|play|approach|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { buildClouds } from './sky.js';
import { buildPlaneMesh, buildPropMesh } from './plane.js';
import { buildRingMesh, ringCourse } from './rings.js';
import { buildRunwayLightsMesh, buildRunwayMesh } from './runway.js';
import { CAMERA_CHASE, CAMERA_COCKPIT, createRenderer } from './render.js';
import {
  SCREEN_CRASHED,
  SCREEN_LANDED,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  createHud,
} from './hud.js';
import { createAudio } from './audio.js';
import {
  ACTION_CAMERA,
  ACTION_CONFIRM,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import {
  EVENT_CRASHED,
  EVENT_LANDED,
  EVENT_LOW_FUEL,
  EVENT_RING,
  PHASE_CRASHED,
  PHASE_LANDED,
  createWorld,
} from './world.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const terrain = createTerrain(random);
const world = createWorld(terrain);
const renderer = createRenderer(canvas, {
  terrain,
  runwayMesh: buildRunwayMesh(),
  runwayLightsMesh: buildRunwayLightsMesh(),
  ringMesh: buildRingMesh(),
  planeMesh: buildPlaneMesh(),
  propMesh: buildPropMesh(),
});
const hud = createHud(document);
const audio = createAudio();
const clouds = buildClouds(random);
const rings = ringCourse();

const renderState = {
  plane: world.state.plane,
  rings,
  ringsCollected: 0,
  clouds,
  time: 0,
  dt: STEP,
  cameraMode: CAMERA_CHASE,
};

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this
    // visit only.
  }
}

function hudState(screen) {
  return {
    plane: world.state.plane,
    ringsCollected: world.state.ringsCollected,
    score: world.state.score,
    elapsed: world.state.elapsed,
    screen,
  };
}

function runShot(name) {
  const scene = stageShot(name, world, terrain);
  renderState.ringsCollected = world.state.ringsCollected;
  renderState.time = world.state.elapsed + 6;
  // Snap the chase camera to the plane at once: the shot only paints twice,
  // and the camera's ease-in would otherwise leave it halfway from its
  // start point, with the plane out of frame.
  renderState.dt = 1;
  if (scene.screen !== SCREEN_TITLE) hud.hideOverlays();
  let painted = 0;
  function paint() {
    renderer.draw(renderState, scene.screen);
    hud.update(hudState(scene.screen), renderState.time);
    if (scene.screen === SCREEN_TITLE) hud.showTitle(0);
    else if (scene.screen === SCREEN_LANDED) {
      const l = world.state.landing;
      hud.showEnd('landed', [
        `Rings 8/8 · ${8 * 1000} pts`,
        `Touchdown bonus · ${l.total} pts`,
        `  soft landing +${l.softBonus} · fuel +${l.fuelBonus} · time +${l.timeBonus}`,
        `TOTAL SCORE · ${world.state.score}`,
        'Press R to fly again.',
      ]);
    } else if (scene.screen === SCREEN_CRASHED) {
      hud.showEnd('crashed', [world.state.crashReason, `Score ${world.state.score}`, 'Press R to fly again.']);
    }
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let throttleTarget = 0;
  let cameraMode = CAMERA_CHASE;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    throttleTarget = 0;
    screen = SCREEN_PLAY;
    announce('Flying. Thread the eight gold rings, then land on the strip.');
  }

  function endGame(kind) {
    if (kind === 'landed') {
      screen = SCREEN_LANDED;
      const l = world.state.landing;
      hud.showEnd('landed', [
        `Rings 8/8 · ${8 * 1000} pts`,
        `Touchdown bonus · ${l.total} pts`,
        `  soft landing +${l.softBonus} · fuel +${l.fuelBonus} · time +${l.timeBonus}`,
        `TOTAL SCORE · ${world.state.score}`,
        'Press R to fly again.',
      ]);
      announce(`Landed. Score ${world.state.score}.`);
    } else {
      screen = SCREEN_CRASHED;
      hud.showEnd('crashed', [world.state.crashReason, `Score ${world.state.score}`, 'Press R to fly again.']);
      announce(`Crashed. Score ${world.state.score}.`);
    }
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_CAMERA) {
      cameraMode = cameraMode === CAMERA_CHASE ? CAMERA_COCKPIT : CAMERA_CHASE;
      renderState.cameraMode = cameraMode;
    }
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      hud.showBanner(muted ? 'SOUND OFF' : 'SOUND ON', 1.2, renderState.time);
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_LANDED || screen === SCREEN_CRASHED)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    } else if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startGame();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      renderState.time += STEP;
      return;
    }
    throttleTarget = Math.max(0, Math.min(1, throttleTarget + input.throttleDelta() * STEP));
    const ctl = {
      pitch: input.pitch(),
      roll: input.roll(),
      throttle: throttleTarget,
    };
    const events = world.step(STEP, ctl, false);
    renderState.time += STEP;
    if (events & EVENT_RING) {
      const n = world.state.ringsCollected;
      hud.showBanner(n >= 8 ? 'ALL RINGS — BRING HER HOME' : `RING ${n}/8  +1000`, 2, renderState.time);
      audio.ring();
    }
    if (events & EVENT_LOW_FUEL) {
      hud.showBanner('LOW FUEL — FLY HER HOME', 3, renderState.time);
    }
    if (events & EVENT_LANDED) {
      audio.land();
      endGame('landed');
    } else if (events & EVENT_CRASHED) {
      audio.crash();
      endGame('crashed');
    }
    const plane = world.state.plane;
    if (screen === SCREEN_PLAY) {
      audio.update(throttleTarget, plane.speed, plane.onGround);
      const ground = terrain.heightAt(plane.pos.x, plane.pos.z);
      if (!plane.onGround && plane.pos.y - ground < 25 && plane.vspeed < -2) {
        hud.showBanner('PULL UP', 1, renderState.time);
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderState.ringsCollected = world.state.ringsCollected;
    renderer.draw(renderState, screen);
    hud.update(hudState(screen), renderState.time);
    if (screen === SCREEN_TITLE) hud.showTitle(best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Senja Mail Run. Press Space or click to fly.');
  hud.showTitle(best);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
