// The coastal strip: asphalt, centreline dashes, threshold bars, amber edge
// lights, PAPI boxes and a windsock, all on the flattened ground. The strip
// is the only place a touchdown is forgiven, so it has to read from the air.
import { PALETTE, RUNWAY } from './config.js';
import { addBox, addQuad, createMesh } from './mesh.js';

const ASPHALT = PALETTE.runway;
const MARK = PALETTE.runwayMark;
const AMBER = [1.0, 0.72, 0.2];
const RED = [0.9, 0.25, 0.2];
const WHITE = [0.95, 0.95, 0.92];

export function buildRunwayMesh() {
  const mesh = createMesh();
  const y = RUNWAY.y + 0.15;
  const x0 = RUNWAY.cx - RUNWAY.length / 2;
  const x1 = RUNWAY.cx + RUNWAY.length / 2;
  const z0 = RUNWAY.cz - RUNWAY.width / 2;
  const z1 = RUNWAY.cz + RUNWAY.width / 2;
  // Asphalt slab.
  addQuad(
    mesh,
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
    ASPHALT,
  );
  // Centreline dashes, every 24 m.
  const dy = y + 0.05;
  for (let x = x0 + 18; x < x1 - 12; x += 24) {
    addQuad(
      mesh,
      [x, dy, RUNWAY.cz - 0.9],
      [x + 12, dy, RUNWAY.cz - 0.9],
      [x + 12, dy, RUNWAY.cz + 0.9],
      [x, dy, RUNWAY.cz + 0.9],
      MARK,
    );
  }
  // Threshold bars at both ends.
  for (const tx of [x0 + 6, x1 - 14]) {
    for (let k = -2; k <= 2; k += 1) {
      const z = RUNWAY.cz + k * 4;
      addQuad(
        mesh,
        [tx, dy, z - 1.2],
        [tx + 8, dy, z - 1.2],
        [tx + 8, dy, z + 1.2],
        [tx, dy, z + 1.2],
        MARK,
      );
    }
  }
  // Edge lights: small amber posts along both sides, every 40 m.
  for (let x = x0 + 10; x <= x1 - 10; x += 40) {
    addBox(mesh, [x, y + 0.5, z0 - 1.5], [0.5, 1.0, 0.5], AMBER);
    addBox(mesh, [x, y + 0.5, z1 + 1.5], [0.5, 1.0, 0.5], AMBER);
  }
  // PAPI: four boxes beside the threshold, two red two white, telling the
  // pilot the glide slope at a glance.
  const px = x0 + 26;
  for (let k = 0; k < 4; k += 1) {
    addBox(mesh, [px, y + 0.6, z1 + 6 + k * 3], [1.2, 1.2, 1.2], k < 2 ? RED : WHITE);
  }
  // Windsock: pole and a drooping orange cone, south of the strip.
  addBox(mesh, [RUNWAY.cx + 120, y + 4, RUNWAY.cz + 34], [0.4, 8, 0.4], [0.85, 0.85, 0.8]);
  addBox(mesh, [RUNWAY.cx + 120, y + 8.2, RUNWAY.cz + 32], [0.5, 1.2, 4.5], [0.95, 0.45, 0.15]);
  return mesh;
}

// The edge lights and PAPI lamps, drawn with the emissive pass so they glow
// at dusk. Kept separate from the slab so the renderer can light them up.
export function buildRunwayLightsMesh() {
  const mesh = createMesh();
  const y = RUNWAY.y + 0.15;
  const x0 = RUNWAY.cx - RUNWAY.length / 2;
  const x1 = RUNWAY.cx + RUNWAY.length / 2;
  const z0 = RUNWAY.cz - RUNWAY.width / 2;
  const z1 = RUNWAY.cz + RUNWAY.width / 2;
  for (let x = x0 + 10; x <= x1 - 10; x += 40) {
    addBox(mesh, [x, y + 1.1, z0 - 1.5], [0.7, 0.4, 0.7], [1.0, 0.8, 0.3]);
    addBox(mesh, [x, y + 1.1, z1 + 1.5], [0.7, 0.4, 0.7], [1.0, 0.8, 0.3]);
  }
  const px = x0 + 26;
  for (let k = 0; k < 4; k += 1) {
    addBox(mesh, [px, y + 0.6, z1 + 6 + k * 3], [1.3, 1.3, 1.3], k < 2 ? [1.0, 0.3, 0.25] : [1.0, 1.0, 0.95]);
  }
  return mesh;
}
