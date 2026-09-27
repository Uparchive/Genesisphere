import { Renderer } from "./renderer.js";

const VERTEX_SHADER = `
attribute vec3 aPosition; attribute vec3 aNormal;
uniform mat4 uMvp; uniform mat4 uModel; varying vec3 vNormal;
void main(){vNormal=mat3(uModel)*aNormal;gl_Position=uMvp*vec4(aPosition,1.0);}`;
const FRAGMENT_SHADER = `
precision mediump float; uniform vec3 uColor; uniform float uEmissive; varying vec3 vNormal;
void main(){float light=max(dot(normalize(vNormal),normalize(vec3(-0.4,0.7,1.0))),0.0);float shade=mix(0.28+0.72*light,1.0,uEmissive);gl_FragColor=vec4(uColor*shade,1.0);}`;
function compile(gl, type, source) {
  const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`WebGL shader compilation failed: ${error}`); }
  return shader;
}
function createProgram(gl) {
  const result = gl.createProgram(), vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER), fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  gl.attachShader(result, vertex); gl.attachShader(result, fragment); gl.linkProgram(result); gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(`WebGL program link failed: ${gl.getProgramInfoLog(result)}`);
  return result;
}
function createSphere() {
  const positions = [], normals = [], indices = [], rows = 18, columns = 24;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const phi = row / rows * Math.PI, theta = column / columns * Math.PI * 2;
    const x = -Math.cos(theta) * Math.sin(phi), y = Math.cos(phi), z = Math.sin(theta) * Math.sin(phi);
    positions.push(x, y, z); normals.push(x, y, z);
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const first = row * (columns + 1) + column, second = first + columns + 1;
    indices.push(first, second, first + 1, second, second + 1, first + 1);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = vector => { const length = Math.hypot(...vector) || 1; return vector.map(value => value / length); };
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
  return out;
}
function cameraMatrix(panX = 0) {
  const eye = [0, -3.7, 7.8], z = normalize(eye), x = normalize(cross([0, 1, 0], z)), y = cross(z, x);
  const matrix = new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  matrix[12] += panX; return matrix;
}
function modelMatrix(x, y, z, scale) { return new Float32Array([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, x, y, z, 1]); }

/** Project detached Entity Model snapshots into renderer-only positions. */
export function bodiesFromSnapshot(viewModel) {
  const selectedSystemId = viewModel.camera?.viewSystemId;
  if (!selectedSystemId) return [];
  const entities = viewModel.entities.filter(entity => entity.systemId === selectedSystemId);
  const stars = entities.filter(entity => entity.type === "cosmic.star").map(star => ({
    id: star.id, kind: "star", x: star.positionAU?.x ?? ((star.position?.x ?? 0.5) - 0.5) * 5,
    y: star.positionAU?.y ?? ((star.position?.y ?? 0.5) - 0.5) * 5, z: 0, radius: 0.28, color: [1, 0.72, 0.3], emissive: 1
  }));
  const planets = entities.filter(entity => entity.type === "cosmic.terrestrial-planet").map(planet => {
    const orbit = planet.orbit || {}, period = Math.max(1, orbit.periodDays || 365.25), phase = Number.isFinite(orbit.phaseRadians) ? orbit.phaseRadians : 0;
    const angle = phase + viewModel.simulationTime / 1000 * 36 / period * Math.PI * 2, axis = Math.max(0.16, Math.min(2.8, orbit.semiMajorAxisAU || 1));
    const star = stars.find(item => item.id === planet.parentStarId);
    return { id: planet.id, kind: "planet", x: (star?.x || 0) + Math.cos(angle) * axis, y: (star?.y || 0) + Math.sin(angle) * axis, z: 0,
      radius: Math.max(0.065, Math.min(0.16, 0.075 * Math.cbrt(Math.max(0.01, planet.radiusEarth || 1)))), color: [0.25, 0.62, 1], emissive: 0 };
  });
  return [...stars, ...planets];
}

/** Minimal native WebGL sphere renderer with no external library. */
export class WebGL3DRenderer extends Renderer {
  constructor({ now = () => performance.now(), onMetrics = () => {} } = {}) { super(); this.now = now; this.onMetrics = onMetrics; this.canvas = null; this.gl = null; this.viewModel = null; this.samples = []; this.disposed = true; }
  init(canvas) {
    this.dispose();
    const gl = canvas?.getContext?.("webgl", { alpha: false, antialias: true, powerPreference: "high-performance" }) || canvas?.getContext?.("experimental-webgl");
    if (!gl) throw new Error("WebGL is unavailable");
    this.canvas = canvas; this.gl = gl; this.program = createProgram(gl); this.mesh = createSphere(); this.frameCount = 0;
    this.positionBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer); gl.bufferData(gl.ARRAY_BUFFER, this.mesh.positions, gl.STATIC_DRAW);
    this.normalBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer); gl.bufferData(gl.ARRAY_BUFFER, this.mesh.normals, gl.STATIC_DRAW);
    this.indexBuffer = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.mesh.indices, gl.STATIC_DRAW);
    this.locations = { position: gl.getAttribLocation(this.program, "aPosition"), normal: gl.getAttribLocation(this.program, "aNormal"), mvp: gl.getUniformLocation(this.program, "uMvp"), model: gl.getUniformLocation(this.program, "uModel"), color: gl.getUniformLocation(this.program, "uColor"), emissive: gl.getUniformLocation(this.program, "uEmissive") };
    this.disposed = false; gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); return this;
  }
  update(viewModel) { if (this.disposed) throw new Error("WebGL3DRenderer is not initialized"); if (!viewModel || !Array.isArray(viewModel.entities)) throw new TypeError("WebGL3DRenderer requires a render view model"); this.viewModel = viewModel; }
  render() {
    if (this.disposed || !this.viewModel) throw new Error("WebGL3DRenderer requires init and update before render");
    const started = this.now(), gl = this.gl, canvas = this.canvas, ratio = Math.min(globalThis.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio)), height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.clearColor(0.004, 0.008, 0.02, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer); gl.enableVertexAttribArray(this.locations.position); gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer); gl.enableVertexAttribArray(this.locations.normal); gl.vertexAttribPointer(this.locations.normal, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    const zoom = Math.max(0.55, Math.min(5, this.viewModel.camera?.zoom || 1));
    const projection = perspective(Math.PI / 3 / Math.sqrt(zoom), width / height, 0.1, 80);
    const pan = this.viewModel.camera?.pan || { x: 0, y: 0 }, panX = Math.max(-2, Math.min(2, -pan.x / Math.max(1, this.viewModel.viewport?.width || width) * 3));
    const viewProjection = multiply(projection, cameraMatrix(panX)), bodies = bodiesFromSnapshot(this.viewModel);
    for (const body of bodies) {
      const model = modelMatrix(body.x, body.y, body.z, body.radius);
      gl.uniformMatrix4fv(this.locations.mvp, false, multiply(viewProjection, model)); gl.uniformMatrix4fv(this.locations.model, false, model);
      gl.uniform3fv(this.locations.color, body.color); gl.uniform1f(this.locations.emissive, body.emissive); gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    }
    const finished = this.now(), elapsed = finished - started; this.samples.push(elapsed); if (this.samples.length > 30) this.samples.shift();
    this.frameCount++;
    if (this.frameCount % 30 === 0) {
      const average = this.samples.reduce((sum, sample) => sum + sample, 0) / this.samples.length;
      if (Number.isFinite(this.frameWindowStart)) {
        const windowMs = Math.max(0.01, started - this.frameWindowStart);
        this.onMetrics({ frameMs: Number(average.toFixed(2)), fps: Number((30000 / windowMs).toFixed(1)), width, height, bodies: bodies.length });
      }
      this.frameWindowStart = started;
    }
  }
  dispose() {
    if (this.gl && !this.disposed) { for (const buffer of [this.positionBuffer, this.normalBuffer, this.indexBuffer]) if (buffer) this.gl.deleteBuffer(buffer); if (this.program) this.gl.deleteProgram(this.program); }
    this.canvas = null; this.gl = null; this.viewModel = null; this.disposed = true;
  }
}
