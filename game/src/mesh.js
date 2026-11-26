// Mesh building: flat-shaded triangles with a colour and a normal per vertex.
// Everything in the game is built from these helpers, so the renderer only ever
// sees plain position / normal / colour arrays.
export function createMesh() {
  return { positions: [], normals: [], colors: [], indices: [] };
}

function pushVertex(mesh, p, n, c) {
  mesh.positions.push(p[0], p[1], p[2]);
  mesh.normals.push(n[0], n[1], n[2]);
  mesh.colors.push(c[0], c[1], c[2]);
  return mesh.positions.length / 3 - 1;
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

// One triangle, flat shaded: the face normal is computed from the winding.
export function addTriangle(mesh, a, b, c, color) {
  const n = normalize(cross(sub(b, a), sub(c, a)));
  const ia = pushVertex(mesh, a, n, color);
  const ib = pushVertex(mesh, b, n, color);
  const ic = pushVertex(mesh, c, n, color);
  mesh.indices.push(ia, ib, ic);
}

export function addQuad(mesh, a, b, c, d, color) {
  addTriangle(mesh, a, b, c, color);
  addTriangle(mesh, a, c, d, color);
}

// An axis-aligned box centred at `center` with size `size`, one colour.
// Faces are wound so the normals point outward.
export function addBox(mesh, center, size, color) {
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const p = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz],
  ];
  // +z, -z, +y, -y, +x, -x
  addQuad(mesh, p[4], p[5], p[6], p[7], color);
  addQuad(mesh, p[1], p[0], p[3], p[2], color);
  addQuad(mesh, p[3], p[7], p[6], p[2], color);
  addQuad(mesh, p[0], p[1], p[5], p[4], color);
  addQuad(mesh, p[1], p[2], p[6], p[5], color);
  addQuad(mesh, p[0], p[4], p[7], p[3], color);
}

// A four-sided pyramid (a tapered nose or a tree top): base square at y=0,
// apex at (0, height, 0), rotated around Y by `rotY`.
export function addPyramid(mesh, center, base, height, color, rotY = 0) {
  const [cx, cy, cz] = center;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const corner = (x, z) => [cx + x * c - z * s, cy, cz + x * s + z * c];
  const h = base / 2;
  const a = corner(-h, -h);
  const b = corner(h, -h);
  const d = corner(h, h);
  const e = corner(-h, h);
  const apex = [cx, cy + height, cz];
  addTriangle(mesh, a, b, apex, color);
  addTriangle(mesh, b, d, apex, color);
  addTriangle(mesh, d, e, apex, color);
  addTriangle(mesh, e, a, apex, color);
  addQuad(mesh, a, e, d, b, color);
}

// A square nose cone: base at z = center.z, apex toward -Z (the nose).
export function addNoseCone(mesh, center, base, length, color) {
  const [cx, cy, cz] = center;
  const h = base / 2;
  const apex = [cx, cy, cz - length];
  const a = [cx - h, cy - h, cz];
  const b = [cx + h, cy - h, cz];
  const c = [cx + h, cy + h, cz];
  const d = [cx - h, cy + h, cz];
  addTriangle(mesh, a, apex, b, color);
  addTriangle(mesh, b, apex, c, color);
  addTriangle(mesh, c, apex, d, color);
  addTriangle(mesh, d, apex, a, color);
  addQuad(mesh, a, b, c, d, color);
}

// A torus (a gold ring) lying in the XY plane, centred on the origin, its axis
// along Z. `radius` is the ring radius, `tube` the tube thickness.
export function addTorus(mesh, radius, tube, color, radial = 20, tubular = 8) {
  for (let i = 0; i < radial; i += 1) {
    const a0 = (i / radial) * Math.PI * 2;
    const a1 = ((i + 1) / radial) * Math.PI * 2;
    for (let j = 0; j < tubular; j += 1) {
      const b0 = (j / tubular) * Math.PI * 2;
      const b1 = ((j + 1) / tubular) * Math.PI * 2;
      const pt = (a, b) => {
        const cx = Math.cos(a);
        const sx = Math.sin(a);
        const cb = Math.cos(b);
        const sb = Math.sin(b);
        return [(radius + tube * cb) * cx, (radius + tube * cb) * sx, tube * sb];
      };
      const p00 = pt(a0, b0);
      const p10 = pt(a1, b0);
      const p11 = pt(a1, b1);
      const p01 = pt(a0, b1);
      addTriangle(mesh, p00, p10, p11, color);
      addTriangle(mesh, p00, p11, p01, color);
    }
  }
}

// A flat grid mesh (used for the ocean): positions with per-vertex colours,
// normals straight up. `heightFn(x, z)` gives the y of each vertex.
export function addGrid(mesh, cx, cz, size, segments, colorFn, heightFn) {
  const step = size / segments;
  const x0 = cx - size / 2;
  const z0 = cz - size / 2;
  const indexAt = (ix, iz) => iz * (segments + 1) + ix;
  const ids = [];
  for (let iz = 0; iz <= segments; iz += 1) {
    for (let ix = 0; ix <= segments; ix += 1) {
      const x = x0 + ix * step;
      const z = z0 + iz * step;
      const y = heightFn(x, z);
      const id = pushVertex(mesh, [x, y, z], [0, 1, 0], colorFn(x, z, y));
      ids.push(id);
    }
  }
  for (let iz = 0; iz < segments; iz += 1) {
    for (let ix = 0; ix < segments; ix += 1) {
      const a = ids[indexAt(ix, iz)];
      const b = ids[indexAt(ix + 1, iz)];
      const c = ids[indexAt(ix + 1, iz + 1)];
      const d = ids[indexAt(ix, iz + 1)];
      mesh.indices.push(a, b, c, a, c, d);
    }
  }
}

// Upload a built mesh to the GPU. Returns { position, normal, color, index,
// count } for the renderer to draw.
export function uploadMesh(gl, mesh) {
  function buffer(data, target) {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  }
  const position = buffer(new Float32Array(mesh.positions), gl.ARRAY_BUFFER);
  const normal = buffer(new Float32Array(mesh.normals), gl.ARRAY_BUFFER);
  const color = buffer(new Float32Array(mesh.colors), gl.ARRAY_BUFFER);
  const index = buffer(new Uint32Array(mesh.indices), gl.ELEMENT_ARRAY_BUFFER);
  return { position, normal, color, index, count: mesh.indices.length };
}
