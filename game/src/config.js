// Every tuning number, colour and course waypoint in one place.
// Senja Mail Run: a golden-hour mail flight over the volcanic island Pulau Merapi.
// The pilot threads eight gold rings around the island, then brings the little
// mail plane home to the lit coastal strip. Units are metres, seconds, radians.
export const STEP = 1 / 60;

export const WORLD = {
  // Island radius; the sea is everything past it.
  islandRadius: 1150,
  // Sun direction (low western sun, golden hour) and sky colours.
  sunDir: [-0.82, 0.24, -0.3],
  fogColor: [0.96, 0.66, 0.42],
  fogDensity: 0.00045,
};

export const PLANE = {
  maxSpeed: 82, // m/s at full throttle (~160 kt)
  cruiseSpeed: 56,
  stallSpeed: 27,
  minSpeed: 18,
  throttleRate: 0.55, // per second
  pitchRate: 0.85, // rad/s at full stick
  rollRate: 2.1, // rad/s at full stick
  maxPitch: 0.55,
  maxRoll: 1.05,
  autoLevelRate: 0.9,
  fuelMax: 100,
  // Fuel burn per second: idle + throttle^2 term. Full-throttle cruise lasts ~4 min.
  fuelIdle: 0.1,
  fuelThrottle: 0.42,
};

export const RUNWAY = {
  cx: 760, // centre x
  cz: 420, // centre z (runway runs east-west)
  length: 400,
  width: 24,
  y: 8, // flattened strip height
  heading: Math.PI / 2, // landing heading: east
};

// The ring course: a clockwise coastal loop around Pulau Merapi — eight gold
// rings, then back down the valley to the lit coastal strip. y is the ring
// centre height, ~45 m above the ground beneath it, so every ring is
// reachable and none is buried in a hillside. R1 sits on the take-off line
// so the first hoop is a straight shot; R8 sits deep in the valley so the
// final descent has room to breathe.
export const RINGS = [
  { x: 1150, y: 70, z: 420, r: 16 },
  { x: 1150, y: 90, z: -300, r: 16 },
  { x: 700, y: 150, z: -750, r: 16 },
  { x: -100, y: 180, z: -800, r: 16 },
  { x: -900, y: 140, z: -550, r: 16 },
  { x: -1100, y: 110, z: 0, r: 16 },
  { x: -800, y: 90, z: 420, r: 16 },
  { x: -100, y: 80, z: 420, r: 16 },
];

export const SCORING = {
  ringPoints: 1000,
  landingBase: 2000,
  softnessMax: 1000, // gentle touchdown bonus
  fuelPerPoint: 10, // per fuel unit left at landing
  timeBonusMax: 1500, // shrinks with elapsed seconds
  timeBonusFalloff: 6, // points lost per second
};

export const PALETTE = {
  sand: [0.85, 0.7, 0.5],
  grass: [0.36, 0.54, 0.29],
  forest: [0.24, 0.42, 0.2],
  rock: [0.48, 0.42, 0.36],
  volcano: [0.36, 0.31, 0.27],
  oceanNear: [0.16, 0.42, 0.5],
  oceanFar: [0.07, 0.19, 0.3],
  skyZenith: [0.16, 0.14, 0.31],
  skyMid: [0.91, 0.45, 0.29],
  skyHorizon: [0.97, 0.7, 0.4],
  sun: [1.0, 0.95, 0.77],
  ringGold: [1.0, 0.78, 0.2],
  ringGoldDim: [0.72, 0.5, 0.12],
  planeCream: [0.95, 0.89, 0.76],
  planeRed: [0.76, 0.22, 0.17],
  planeDark: [0.16, 0.17, 0.2],
  runway: [0.32, 0.33, 0.37],
  runwayMark: [0.92, 0.92, 0.88],
  hudAmber: '#ffb347',
  hudGreen: '#7dff9a',
  hudRed: '#ff6b5e',
  hudPanel: 'rgba(10, 14, 24, 0.62)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const BEST_KEY = 'senja-mail-run.best';
