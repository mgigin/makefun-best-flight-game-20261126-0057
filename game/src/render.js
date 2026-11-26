// The renderer: hand-written WebGL, no libraries. One lit shader for the
// world (terrain, sea, plane, rings, runway), one sky shader for the sunset
// dome, one textured shader for the cloud puffs. Two cameras: chase and
// cockpit.
import { PALETTE, WORLD } from './config.js';
import { basisOf } from './plane.js';
import { buildSkyMesh, createCloudTexture, sunDirection } from './sky.js';
import { uploadMesh } from './mesh.js';
import { SCREEN_TITLE } from './hud.js';

// --- 4x4 matrices, column-major like WebGL wants them. ---
function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function mat4LookAt(eye, target, up) {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  const out = mat4Identity();
  out[0] = x[0];
  out[1] = y[0];
  out[2] = z[0];
  out[4] = x[1];
  out[5] = y[1];
  out[6] = z[1];
  out[8] = x[2];
  out[9] = y[2];
  out[10] = z[2];
  out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  return out;
}

function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

// Model matrix from an orthonormal basis: columns right, up, back(-forward),
// plus translation. Model -Z is the nose.
function mat4FromBasis(right, up, back, pos) {
  const out = mat4Identity();
  out[0] = right[0];
  out[1] = right[1];
  out[2] = right[2];
  out[4] = up[0];
  out[5] = up[1];
  out[6] = up[2];
  out[8] = back[0];
  out[9] = back[1];
  out[10] = back[2];
  out[12] = pos[0];
  out[13] = pos[1];
  out[14] = pos[2];
  return out;
}

function mat4RotateZ(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out = mat4Identity();
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  return out;
}

function mat4Translate(x, y, z) {
  const out = mat4Identity();
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

function mat4Scale(s) {
  const out = mat4Identity();
  out[0] = s;
  out[5] = s;
  out[10] = s;
  return out;
}

const LIT_VERTEX = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime;
uniform float uWaveAmp;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  if (uWaveAmp > 0.0) {
    world.y += sin(world.x * 0.08 + uTime * 1.3) * uWaveAmp
             + cos(world.z * 0.06 + uTime * 0.9) * uWaveAmp * 0.7;
  }
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  gl_Position = uProj * uView * world;
}`;

const LIT_FRAGMENT = `
precision mediump float;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uViewPos;
uniform float uEmissive;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize(uSunDir);
  float diff = max(dot(n, l), 0.0);
  vec3 v = normalize(uViewPos - vWorld);
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), 40.0) * 0.35;
  vec3 color = vColor * (vec3(0.58, 0.55, 0.58) + uSunColor * diff)
             + uSunColor * spec;
  color += vColor * uEmissive;
  float dist = length(uViewPos - vWorld);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(color, 1.0);
}`;

const SKY_VERTEX = `
attribute vec3 aPos;
uniform mat4 uView;
uniform mat4 uProj;
varying vec3 vDir;
void main() {
  vDir = aPos;
  vec4 pos = uProj * uView * vec4(aPos, 1.0);
  gl_Position = pos.xyww;
}`;

const SKY_FRAGMENT = `
precision mediump float;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -1.0, 1.0);
  vec3 zenith = vec3(0.28, 0.22, 0.42);
  vec3 mid = vec3(0.91, 0.45, 0.29);
  vec3 horizon = vec3(0.97, 0.70, 0.40);
  vec3 color = h > 0.0
    ? mix(mid, zenith, pow(h, 1.8))
    : mix(horizon, vec3(0.35, 0.25, 0.3), clamp(-h * 3.0, 0.0, 1.0));
  color = mix(color, horizon, pow(max(0.0, 1.0 - abs(h) * 3.0), 2.0) * 0.6);
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  float disc = smoothstep(0.9992, 0.9997, s);
  float glow = pow(s, 24.0) * 0.55 + pow(s, 6.0) * 0.28;
  color += vec3(1.0, 0.95, 0.77) * (disc * 2.2 + glow);
  gl_FragColor = vec4(color, 1.0);
}`;

const CLOUD_VERTEX = `
attribute vec3 aPos;
attribute vec2 aUV;
uniform mat4 uView;
uniform mat4 uProj;
varying vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

const CLOUD_FRAGMENT = `
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
varying vec2 vUV;
void main() {
  vec4 tex = texture2D(uTex, vUV);
  if (tex.a * uAlpha < 0.03) discard;
  gl_FragColor = vec4(tex.rgb, tex.a * uAlpha);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

export const CAMERA_CHASE = 0;
export const CAMERA_COCKPIT = 1;

export function createRenderer(canvas, world) {
  const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL is not available');
  gl.getExtension('OES_element_index_uint');
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  const lit = createProgram(gl, LIT_VERTEX, LIT_FRAGMENT);
  const litLoc = {
    model: gl.getUniformLocation(lit, 'uModel'),
    view: gl.getUniformLocation(lit, 'uView'),
    proj: gl.getUniformLocation(lit, 'uProj'),
    time: gl.getUniformLocation(lit, 'uTime'),
    waveAmp: gl.getUniformLocation(lit, 'uWaveAmp'),
    sunDir: gl.getUniformLocation(lit, 'uSunDir'),
    sunColor: gl.getUniformLocation(lit, 'uSunColor'),
    fogColor: gl.getUniformLocation(lit, 'uFogColor'),
    fogDensity: gl.getUniformLocation(lit, 'uFogDensity'),
    viewPos: gl.getUniformLocation(lit, 'uViewPos'),
    emissive: gl.getUniformLocation(lit, 'uEmissive'),
    pos: gl.getAttribLocation(lit, 'aPos'),
    normal: gl.getAttribLocation(lit, 'aNormal'),
    color: gl.getAttribLocation(lit, 'aColor'),
  };
  const sky = createProgram(gl, SKY_VERTEX, SKY_FRAGMENT);
  const skyLoc = {
    view: gl.getUniformLocation(sky, 'uView'),
    proj: gl.getUniformLocation(sky, 'uProj'),
    sunDir: gl.getUniformLocation(sky, 'uSunDir'),
    pos: gl.getAttribLocation(sky, 'aPos'),
  };
  const cloud = createProgram(gl, CLOUD_VERTEX, CLOUD_FRAGMENT);
  const cloudLoc = {
    view: gl.getUniformLocation(cloud, 'uView'),
    proj: gl.getUniformLocation(cloud, 'uProj'),
    tex: gl.getUniformLocation(cloud, 'uTex'),
    alpha: gl.getUniformLocation(cloud, 'uAlpha'),
    pos: gl.getAttribLocation(cloud, 'aPos'),
    uv: gl.getAttribLocation(cloud, 'aUV'),
  };

  const gpu = {
    terrain: uploadMesh(gl, world.terrain.terrainMesh),
    ocean: uploadMesh(gl, world.terrain.oceanMesh),
    props: uploadMesh(gl, world.terrain.propsMesh),
    crater: uploadMesh(gl, world.terrain.craterMesh),
    runway: uploadMesh(gl, world.runwayMesh),
    runwayLights: uploadMesh(gl, world.runwayLightsMesh),
    ring: uploadMesh(gl, world.ringMesh),
    plane: uploadMesh(gl, world.planeMesh),
    prop: uploadMesh(gl, world.propMesh),
  };
  const skyMesh = buildSkyMesh();
  const skyPos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyPos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(skyMesh.positions), gl.STATIC_DRAW);
  const skyIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skyIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(skyMesh.indices), gl.STATIC_DRAW);
  const skyCount = skyMesh.indices.length;
  const cloudTex = createCloudTexture(gl);
  const cloudPosBuf = gl.createBuffer();
  const cloudUvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cloudUvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
  const cloudIdxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cloudIdxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

  const camera = { pos: [0, 60, 300], look: [0, 40, 0] };

  function resize() {
    const w = canvas.clientWidth || 1280;
    const h = canvas.clientHeight || 720;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    return canvas.width / canvas.height;
  }

  function drawMesh(mesh, model, view, proj, opts) {
    gl.useProgram(lit);
    gl.uniformMatrix4fv(litLoc.model, false, model);
    gl.uniformMatrix4fv(litLoc.view, false, view);
    gl.uniformMatrix4fv(litLoc.proj, false, proj);
    gl.uniform1f(litLoc.time, opts.time);
    gl.uniform1f(litLoc.waveAmp, opts.waveAmp || 0);
    gl.uniform1f(litLoc.emissive, opts.emissive || 0);
    gl.uniform3fv(litLoc.sunDir, sunDirection());
    gl.uniform3f(litLoc.sunColor, 1.0, 0.8, 0.55);
    gl.uniform3fv(litLoc.fogColor, WORLD.fogColor);
    gl.uniform1f(litLoc.fogDensity, WORLD.fogDensity);
    gl.uniform3fv(litLoc.viewPos, opts.viewPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
    gl.enableVertexAttribArray(litLoc.pos);
    gl.vertexAttribPointer(litLoc.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
    gl.enableVertexAttribArray(litLoc.normal);
    gl.vertexAttribPointer(litLoc.normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.color);
    gl.enableVertexAttribArray(litLoc.color);
    gl.vertexAttribPointer(litLoc.color, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  }

  // A ring's hoop faces the direction of travel: its axis is the line from
  // the previous waypoint to the next.
  function ringModel(ring, prev, next) {
    const dir = normalize3([next.x - prev.x, next.y - prev.y, next.z - prev.z]);
    const up0 = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const x = normalize3(cross3(up0, dir));
    const y = cross3(dir, x);
    const basis = mat4FromBasis(x, y, dir, [ring.x, ring.y, ring.z]);
    return mat4Multiply(basis, mat4Scale(ring.r));
  }

  function draw(state, screen) {
    const aspect = resize();
    const plane = state.plane;
    const basis = basisOf(plane.heading, plane.pitch, plane.roll);
    const f = basis.forward;
    const p = [plane.pos.x, plane.pos.y, plane.pos.z];

    // Camera: chase rides behind and above the tail; cockpit sits at the
    // windscreen and looks down the nose.
    let eye;
    let look;
    let up;
    if (state.cameraMode === CAMERA_COCKPIT) {
      eye = [p[0] + f[0] * 1.6 + basis.up[0] * 1.0, p[1] + f[1] * 1.6 + basis.up[1] * 1.0, p[2] + f[2] * 1.6 + basis.up[2] * 1.0];
      look = [p[0] + f[0] * 120, p[1] + f[1] * 120, p[2] + f[2] * 120];
      up = basis.up;
    } else {
      const desired = [
        p[0] - f[0] * 15 + basis.up[0] * 4.2 + basis.right[0] * 3.0,
        Math.max(p[1] - f[1] * 15 + basis.up[1] * 4.2 + basis.right[1] * 3.0, 2.5),
        p[2] - f[2] * 15 + basis.up[2] * 4.2 + basis.right[2] * 3.0,
      ];
      const k = 1 - Math.exp(-state.dt * 5);
      camera.pos[0] += (desired[0] - camera.pos[0]) * k;
      camera.pos[1] += (desired[1] - camera.pos[1]) * k;
      camera.pos[2] += (desired[2] - camera.pos[2]) * k;
      eye = camera.pos;
      // On the title screen the plane sits below centre, under the title.
      const titleLift = screen === SCREEN_TITLE ? 2.5 : 0;
      look = [p[0] + f[0] * 26, p[1] + f[1] * 26 + 1 + titleLift, p[2] + f[2] * 26];
      const mix = 0.55;
      up = normalize3([
        basis.up[0] * (1 - mix),
        basis.up[1] * (1 - mix) + mix,
        basis.up[2] * (1 - mix),
      ]);
    }
    const view = mat4LookAt(eye, look, up);
    const proj = mat4Perspective((62 * Math.PI) / 180, aspect, 0.5, 8000);
    const identity = mat4Identity();
    const opts = { time: state.time, viewPos: eye };

    gl.clearColor(0.35, 0.22, 0.3, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky dome first, centred on the camera, depth writes off. The dome is
    // viewed from inside, so face culling stays off for this draw.
    gl.useProgram(sky);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.uniformMatrix4fv(skyLoc.view, false, view);
    gl.uniformMatrix4fv(skyLoc.proj, false, proj);
    gl.uniform3fv(skyLoc.sunDir, sunDirection());
    gl.bindBuffer(gl.ARRAY_BUFFER, skyPos);
    gl.enableVertexAttribArray(skyLoc.pos);
    gl.vertexAttribPointer(skyLoc.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skyIdx);
    gl.drawElements(gl.TRIANGLES, skyCount, gl.UNSIGNED_INT, 0);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // Sea, island, trees, lighthouse, strip, crater glow.
    drawMesh(gpu.ocean, identity, view, proj, { ...opts, waveAmp: 0.55 });
    drawMesh(gpu.terrain, identity, view, proj, opts);
    drawMesh(gpu.props, identity, view, proj, opts);
    drawMesh(gpu.runway, identity, view, proj, opts);
    drawMesh(gpu.runwayLights, identity, view, proj, { ...opts, emissive: 0.9 });
    drawMesh(gpu.crater, identity, view, proj, { ...opts, emissive: 0.85 });

    // Rings: the next one burns bright and pulses; done ones go dim green.
    const rings = state.rings;
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      const prev = rings[Math.max(0, i - 1)];
      const next = rings[Math.min(rings.length - 1, i + 1)];
      const model = ringModel(ring, prev, next);
      const done = i < state.ringsCollected;
      const isNext = i === state.ringsCollected;
      const pulse = isNext ? 1 + 0.06 * Math.sin(state.time * 3) : 1;
      drawMesh(gpu.ring, mat4Multiply(model, mat4Scale(pulse)), view, proj, {
        ...opts,
        emissive: done ? 0.12 : isNext ? 0.75 : 0.45,
      });
    }

    // The plane and its spinning prop (not in cockpit view).
    if (state.cameraMode !== CAMERA_COCKPIT) {
      const back = [-f[0], -f[1], -f[2]];
      const model = mat4FromBasis(basis.right, basis.up, back, p);
      drawMesh(gpu.plane, model, view, proj, opts);
      const propModel = mat4Multiply(
        mat4Multiply(model, mat4Translate(0, 0, -4.25)),
        mat4RotateZ(plane.propAngle),
      );
      drawMesh(gpu.prop, propModel, view, proj, opts);
    }

    // Clouds last, blended, so the sun glows through them.
    gl.useProgram(cloud);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniformMatrix4fv(cloudLoc.view, false, view);
    gl.uniformMatrix4fv(cloudLoc.proj, false, proj);
    gl.uniform1i(cloudLoc.tex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cloudTex);
    const camRight = normalize3(cross3([0, 1, 0], normalize3([look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]])));
    const camUp = normalize3(cross3(normalize3([look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]]), camRight));
    for (const cloudData of state.clouds) {
      const cx = cloudData.x + cloudData.drift * state.time;
      const cy = cloudData.y;
      const cz = cloudData.z;
      const hw = cloudData.scale;
      const hh = cloudData.scale * 0.42;
      const verts = new Float32Array([
        cx - camRight[0] * hw - camUp[0] * hh, cy - camRight[1] * hw - camUp[1] * hh, cz - camRight[2] * hw - camUp[2] * hh,
        cx + camRight[0] * hw - camUp[0] * hh, cy + camRight[1] * hw - camUp[1] * hh, cz + camRight[2] * hw - camUp[2] * hh,
        cx + camRight[0] * hw + camUp[0] * hh, cy + camRight[1] * hw + camUp[1] * hh, cz + camRight[2] * hw + camUp[2] * hh,
        cx - camRight[0] * hw + camUp[0] * hh, cy - camRight[1] * hw + camUp[1] * hh, cz - camRight[2] * hw + camUp[2] * hh,
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, cloudPosBuf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(cloudLoc.pos);
      gl.vertexAttribPointer(cloudLoc.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, cloudUvBuf);
      gl.enableVertexAttribArray(cloudLoc.uv);
      gl.vertexAttribPointer(cloudLoc.uv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cloudIdxBuf);
      gl.uniform1f(cloudLoc.alpha, cloudData.alpha);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  return { draw };
}
