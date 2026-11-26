// A small seeded random number generator (mulberry32): the same seed gives the
// same island, clouds and traffic, which is what makes the screenshot scenes
// repeatable.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise over a 2D grid, built from a seeded random stream. Two
// octaves are enough for the island's ridges and the forest patches.
export function createNoise2D(random) {
  const size = 64;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i += 1) grid[i] = random();
  function at(ix, iz) {
    const x = ((ix % size) + size) % size;
    const z = ((iz % size) + size) % size;
    return grid[z * size + x];
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  return function noise(x, z) {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    const tx = smooth(x - fx);
    const tz = smooth(z - fz);
    const a = at(fx, fz);
    const b = at(fx + 1, fz);
    const c = at(fx, fz + 1);
    const d = at(fx + 1, fz + 1);
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Shortest signed turn from angle `from` to angle `to`, in (-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}
