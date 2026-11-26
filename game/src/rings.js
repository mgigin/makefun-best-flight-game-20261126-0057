// The ring course: eight gold rings around Pulau Merapi, then the runway.
// One torus mesh is shared by every ring; the next ring glows brighter and
// the HUD points at it.
import { PALETTE, RINGS } from './config.js';
import { addTorus, createMesh } from './mesh.js';

export function buildRingMesh() {
  const mesh = createMesh();
  addTorus(mesh, 1, 0.12, PALETTE.ringGold, 24, 8);
  return mesh;
}

// Distance from the plane to a ring's centre, in metres.
export function ringDistance(plane, ring) {
  const dx = plane.pos.x - ring.x;
  const dy = plane.pos.y - ring.y;
  const dz = plane.pos.z - ring.z;
  return Math.hypot(dx, dy, dz);
}

// True when the plane is inside the ring's hoop.
export function ringPassed(plane, ring) {
  return ringDistance(plane, ring) < ring.r;
}

export function ringCourse() {
  return RINGS;
}
