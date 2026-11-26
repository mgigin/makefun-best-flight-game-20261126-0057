// Pulau Merapi: the volcanic island the mail run flies around. One height
// function rules everything — the terrain mesh, the collision check, the
// autopilot's clearance and the screenshot staging all read the same ground.
import { PALETTE, RUNWAY, WORLD } from './config.js';
import { clamp, createNoise2D, smoothstep } from './random.js';
import { addBox, addPyramid, createMesh } from './mesh.js';

const VOLCANO = { x: -150, z: -200, height: 260, sigma: 380 };
const HILLS = [
  { x: 420, z: -350, height: 60, sigma: 260 },
  { x: -620, z: 380, height: 50, sigma: 240 },
  { x: 250, z: 620, height: 45, sigma: 220 },
];

function gauss(x, z, h) {
  const dx = x - h.x;
  const dz = z - h.z;
  return h.height * Math.exp(-(dx * dx + dz * dz) / (2 * h.sigma * h.sigma));
}

export function createTerrain(random) {
  const noise = createNoise2D(random);
  const forestNoise = createNoise2D(random);

  // The island rises from the sea to a broad dome, with the volcano cone and a
  // few hills on top, then ridged noise for the valleys. The coastal strip is
  // flattened so the runway sits level.
  function heightAt(x, z) {
    const d = Math.hypot(x, z);
    let h = 90 * (1 - smoothstep(480, WORLD.islandRadius, d));
    h += gauss(x, z, VOLCANO);
    for (const hill of HILLS) h += gauss(x, z, hill);
    const n = noise(x / 180 + 7.3, z / 180 + 2.1);
    const n2 = noise(x / 61 + 1.7, z / 61 + 9.4);
    h += (n - 0.5) * 46 + (n2 - 0.5) * 14;
    // Runway flattening: a smooth mask over the strip.
    const rx = smoothstep(260, 190, Math.abs(x - RUNWAY.cx));
    const rz = smoothstep(55, 30, Math.abs(z - RUNWAY.cz));
    const mask = rx * rz;
    h = h * (1 - mask) + RUNWAY.y * mask;
    // Valley floor: a smooth canyon west of the strip so the final approach
    // flies over flat ground instead of the ridge. The canyon runs the full
    // width of the island's south side, so the mail run can come home low
    // along it instead of diving over the hills.
    const valley = capsuleDistance(x, z, -1000, RUNWAY.cz, RUNWAY.cx, RUNWAY.cz);
    const vm = smoothstep(90, 45, valley);
    h = h * (1 - vm * 0.92) + RUNWAY.y * vm * 0.92;
    // Sea floor: never above -3, so the waterline is clean.
    return Math.max(h, -3);
  }

  // Distance from (x, z) to the segment (x0, z0)-(x1, z1).
  function capsuleDistance(x, z, x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len2 = dx * dx + dz * dz;
    let t = len2 === 0 ? 0 : ((x - x0) * dx + (z - z0) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    return Math.hypot(x - px, z - pz);
  }

  function groundColor(x, z, h, slope) {
    const d = Math.hypot(x, z);
    const n = noise(x / 90 + 3.1, z / 90 + 5.7);
    const fn = forestNoise(x / 140 + 11.2, z / 140 + 4.8);
    let c;
    if (h < 7) c = PALETTE.sand;
    else if (h < 60) c = fn > 0.62 ? PALETTE.forest : PALETTE.grass;
    else if (h < 150) c = fn > 0.55 ? PALETTE.forest : PALETTE.grass;
    else if (h < 225) c = PALETTE.rock;
    else c = PALETTE.volcano;
    // Warm sunset wash + a little variation so the slopes read.
    const warm = 1 + 0.08 * Math.sin(d * 0.01);
    const shade = 0.92 + 0.16 * n - 0.25 * clamp(slope, 0, 1);
    return [c[0] * warm * shade, c[1] * warm * shade * 0.94, c[2] * warm * shade * 0.88];
  }

  // Terrain mesh: a 120x120 grid over the island and its shallows, smooth
  // normals from the height function, colours by height and slope.
  function buildTerrainMesh() {
    const mesh = createMesh();
    const size = 2800;
    const segments = 120;
    const step = size / segments;
    const x0 = -size / 2;
    const z0 = -size / 2;
    const heights = new Float32Array((segments + 1) * (segments + 1));
    for (let iz = 0; iz <= segments; iz += 1) {
      for (let ix = 0; ix <= segments; ix += 1) {
        heights[iz * (segments + 1) + ix] = heightAt(x0 + ix * step, z0 + iz * step);
      }
    }
    function height(ix, iz) {
      const cx = clamp(ix, 0, segments);
      const cz = clamp(iz, 0, segments);
      return heights[cz * (segments + 1) + cx];
    }
    const ids = [];
    for (let iz = 0; iz <= segments; iz += 1) {
      for (let ix = 0; ix <= segments; ix += 1) {
        const x = x0 + ix * step;
        const z = z0 + iz * step;
        const h = height(ix, iz);
        const slope = Math.hypot(height(ix + 1, iz) - height(ix - 1, iz), height(ix, iz + 1) - height(ix, iz - 1)) / (2 * step);
        // Smooth normal from the local gradient.
        const nx = -(height(ix + 1, iz) - height(ix - 1, iz)) / (2 * step);
        const nz = -(height(ix, iz + 1) - height(ix, iz - 1)) / (2 * step);
        const len = Math.hypot(nx, 1, nz);
        const id = mesh.positions.length / 3;
        mesh.positions.push(x, h, z);
        mesh.normals.push(nx / len, 1 / len, nz / len);
        const c = groundColor(x, z, h, slope);
        mesh.colors.push(c[0], c[1], c[2]);
        ids.push(id);
      }
    }
    for (let iz = 0; iz < segments; iz += 1) {
      for (let ix = 0; ix < segments; ix += 1) {
        const a = ids[iz * (segments + 1) + ix];
        const b = ids[iz * (segments + 1) + ix + 1];
        const c = ids[(iz + 1) * (segments + 1) + ix + 1];
        const d = ids[(iz + 1) * (segments + 1) + ix];
        mesh.indices.push(a, b, c, a, c, d);
      }
    }
    return mesh;
  }

  // Ocean: a big flat sheet at y=0. Its colour deepens away from the island;
  // the renderer ripples it with a time uniform.
  function buildOceanMesh() {
    const mesh = createMesh();
    const size = 7000;
    const segments = 24;
    const step = size / segments;
    const ids = [];
    for (let iz = 0; iz <= segments; iz += 1) {
      for (let ix = 0; ix <= segments; ix += 1) {
        const x = -size / 2 + ix * step;
        const z = -size / 2 + iz * step;
        const d = Math.hypot(x, z);
        const t = smoothstep(900, 2600, d);
        const c = [
          PALETTE.oceanNear[0] + (PALETTE.oceanFar[0] - PALETTE.oceanNear[0]) * t,
          PALETTE.oceanNear[1] + (PALETTE.oceanFar[1] - PALETTE.oceanNear[1]) * t,
          PALETTE.oceanNear[2] + (PALETTE.oceanFar[2] - PALETTE.oceanNear[2]) * t,
        ];
        const id = mesh.positions.length / 3;
        mesh.positions.push(x, 0, z);
        mesh.normals.push(0, 1, 0);
        mesh.colors.push(c[0], c[1], c[2]);
        ids.push(id);
      }
    }
    for (let iz = 0; iz < segments; iz += 1) {
      for (let ix = 0; ix < segments; ix += 1) {
        const a = ids[iz * (segments + 1) + ix];
        const b = ids[iz * (segments + 1) + ix + 1];
        const c = ids[(iz + 1) * (segments + 1) + ix + 1];
        const d = ids[(iz + 1) * (segments + 1) + ix];
        mesh.indices.push(a, b, c, a, c, d);
      }
    }
    return mesh;
  }

  // Trees and the lighthouse: one static props mesh, so the island reads as
  // lived-in from the air. Trees only grow on low grass, never on the runway.
  function buildPropsMesh() {
    const mesh = createMesh();
    const trunk = [0.32, 0.2, 0.13];
    const leaf = [0.2, 0.4, 0.16];
    const leafDark = [0.14, 0.32, 0.12];
    let placed = 0;
    let guard = 0;
    while (placed < 130 && guard < 4000) {
      guard += 1;
      const x = (random() - 0.5) * 2100;
      const z = (random() - 0.5) * 2100;
      const h = heightAt(x, z);
      if (h < 9 || h > 120) continue;
      if (Math.abs(x - RUNWAY.cx) < 260 && Math.abs(z - RUNWAY.cz) < 70) continue;
      if (Math.abs(z - RUNWAY.cz) < 90 && x > -1000 && x < RUNWAY.cx) continue;
      const s = 0.8 + random() * 0.9;
      addBox(mesh, [x, h + 2.2 * s, z], [1.1 * s, 4.4 * s, 1.1 * s], trunk);
      addPyramid(mesh, [x, h + 4.4 * s, z], 4.6 * s, 7.5 * s, random() > 0.5 ? leaf : leafDark);
      placed += 1;
    }
    // The lighthouse on the eastern point: white tower, red top, a warm lamp.
    const lx = 1020;
    const lz = 210;
    const lh = heightAt(lx, lz);
    addBox(mesh, [lx, lh + 9, lz], [7, 18, 7], [0.92, 0.9, 0.84]);
    addBox(mesh, [lx, lh + 19, lz], [8, 3, 8], PALETTE.planeRed);
    addBox(mesh, [lx, lh + 21.5, lz], [4, 3, 4], [1.0, 0.85, 0.4]);
    return mesh;
  }

  // Crater glow: a small emissive disc at the volcano's mouth, drawn with the
  // emissive pass so it reads as lit lava at dusk.
  function buildCraterMesh() {
    const mesh = createMesh();
    const cx = VOLCANO.x;
    const cz = VOLCANO.z;
    const cy = heightAt(cx, cz) + 1;
    const r = 26;
    const segs = 12;
    for (let i = 0; i < segs; i += 1) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r];
      const p1 = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
      const c = [cx, cy, cz];
      // Fan triangles, colour hot orange in the middle fading out.
      const col = [1.0, 0.42 + 0.1 * Math.cos(a0), 0.1];
      mesh.positions.push(...c, ...p0, ...p1);
      for (let k = 0; k < 3; k += 1) mesh.normals.push(0, 1, 0);
      mesh.colors.push(1.0, 0.55, 0.15, col[0], col[1], col[2], col[0], col[1], col[2]);
      const base = mesh.positions.length / 3 - 3;
      mesh.indices.push(base, base + 1, base + 2);
    }
    return mesh;
  }

  return {
    heightAt,
    terrainMesh: buildTerrainMesh(),
    oceanMesh: buildOceanMesh(),
    propsMesh: buildPropsMesh(),
    craterMesh: buildCraterMesh(),
  };
}
