// The golden-hour sky: a dome whose shader paints the sunset gradient and the
// sun disc, plus the drifting cloud puffs. The dome is a sphere around the
// camera; its colour comes from the view direction alone.
import { WORLD } from './config.js';

// A big sphere (radius 3200) centred on the origin. The renderer draws it
// centred on the camera with depth writes off, so it is always the backdrop.
export function buildSkyMesh() {
  const positions = [];
  const indices = [];
  const stacks = 12;
  const slices = 24;
  const radius = 3200;
  for (let i = 0; i <= stacks; i += 1) {
    const phi = (i / stacks) * Math.PI; // 0 = top
    for (let j = 0; j <= slices; j += 1) {
      const theta = (j / slices) * Math.PI * 2;
      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      );
    }
  }
  for (let i = 0; i < stacks; i += 1) {
    for (let j = 0; j < slices; j += 1) {
      const a = i * (slices + 1) + j;
      const b = a + slices + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, indices };
}

// A soft round puff, painted once on an offscreen canvas and uploaded as a
// texture. No image files, no network: the clouds are drawn by code.
export function createCloudTexture(gl) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const blobs = [
    [64, 78, 34],
    [42, 84, 24],
    [88, 84, 26],
    [64, 62, 26],
    [30, 92, 16],
    [98, 92, 16],
  ];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255, 235, 220, 0.85)');
    g.addColorStop(0.6, 'rgba(255, 220, 205, 0.45)');
    g.addColorStop(1, 'rgba(255, 220, 205, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// Fourteen puffs scattered high over the island, drifting slowly east.
export function buildClouds(random) {
  const clouds = [];
  for (let i = 0; i < 14; i += 1) {
    const angle = random() * Math.PI * 2;
    const dist = 700 + random() * 1400;
    clouds.push({
      x: Math.cos(angle) * dist,
      y: 320 + random() * 220,
      z: Math.sin(angle) * dist,
      scale: 180 + random() * 260,
      drift: 1.5 + random() * 2.5,
      alpha: 0.5 + random() * 0.35,
    });
  }
  return clouds;
}

export function sunDirection() {
  const d = WORLD.sunDir;
  const len = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / len, d[1] / len, d[2] / len];
}
