// Keyboard and pointer input. Held keys give pitch, roll and throttle; one
// shot presses (start, pause, restart, camera, mute) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost
// and never counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_CAMERA = 8;
export const ACTION_MUTE = 16;

const PITCH_UP = new Set(['ArrowUp']);
const PITCH_DOWN = new Set(['ArrowDown']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['KeyW', 'ShiftLeft', 'ShiftRight']);
const THROTTLE_DOWN = new Set(['KeyS', 'ControlLeft', 'ControlRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const CAMERA = new Set(['KeyC']);
const MUTE = new Set(['KeyM']);

export function createInput() {
  const held = new Set();
  let actions = 0;
  let drag = null; // { x, y } deflection -1..1 while the pointer is dragged
  let wheelDelta = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code) || ROLL_LEFT.has(event.code) || ROLL_RIGHT.has(event.code) || THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)) {
        event.preventDefault();
      }
      return;
    }
    held.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (RESTART.has(event.code)) actions |= ACTION_RESTART;
    else if (CAMERA.has(event.code)) actions |= ACTION_CAMERA;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    drag = null;
  });

  // Mouse: drag to steer (left/right banks, up/down pitches), wheel for
  // throttle, click to confirm. The whole game is playable either way.
  const canvas = document.getElementById('game');
  if (canvas) {
    canvas.addEventListener('pointerdown', (event) => {
      drag = { x: 0, y: 0, startX: event.clientX, startY: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const rect = canvas.getBoundingClientRect();
      drag.x = Math.max(-1, Math.min(1, (event.clientX - drag.startX) / (rect.width / 3)));
      drag.y = Math.max(-1, Math.min(1, (event.clientY - drag.startY) / (rect.height / 3)));
    });
    canvas.addEventListener('pointerup', (event) => {
      const wasDrag = drag && (Math.abs(drag.x) > 0.08 || Math.abs(drag.y) > 0.08);
      drag = null;
      if (!wasDrag) actions |= ACTION_CONFIRM;
    });
    canvas.addEventListener('wheel', (event) => {
      wheelDelta += event.deltaY < 0 ? 0.08 : -0.08;
      event.preventDefault();
    }, { passive: false });
  }

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    // Pitch: +1 climbs, -1 descends. Roll: +1 banks right, -1 banks left.
    pitch() {
      const keys = (has(PITCH_UP) ? 1 : 0) - (has(PITCH_DOWN) ? 1 : 0);
      const mouse = drag ? -drag.y : 0;
      return Math.max(-1, Math.min(1, keys + mouse));
    },
    roll() {
      const keys = (has(ROLL_RIGHT) ? 1 : 0) - (has(ROLL_LEFT) ? 1 : 0);
      const mouse = drag ? drag.x : 0;
      return Math.max(-1, Math.min(1, keys + mouse));
    },
    // Throttle change per second while the keys are held.
    throttleDelta() {
      const keys = (has(THROTTLE_UP) ? 1 : 0) - (has(THROTTLE_DOWN) ? 1 : 0);
      const wheel = wheelDelta;
      wheelDelta = 0;
      return keys + wheel;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
