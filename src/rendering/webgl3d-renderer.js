import { Renderer } from "./renderer.js";
import { spatialCoordinates } from "../core/spatial-coordinate-system.js";

const VERTEX_SHADER = `
attribute vec3 aPosition; attribute vec3 aNormal;
uniform mat4 uMvp; uniform mat4 uModel; varying vec3 vNormal; varying vec2 vUv;
void main(){vNormal=mat3(uModel)*aNormal;vUv=vec2(aPosition.x*0.5+0.5,0.5-aPosition.y*0.5);gl_Position=uMvp*vec4(aPosition,1.0);}`;
const FRAGMENT_SHADER = `
precision mediump float; uniform vec3 uColor; uniform vec3 uLightDirection; uniform float uEmissive; uniform float uHasTexture; uniform sampler2D uTexture; varying vec3 vNormal; varying vec2 vUv;
void main(){float light=max(dot(normalize(vNormal),normalize(uLightDirection)),0.0);if(uHasTexture>0.5){vec4 texel=texture2D(uTexture,vUv);if(texel.a<0.06)discard;float textureShade=mix(0.18+0.82*light,1.0,uEmissive);gl_FragColor=vec4(texel.rgb*textureShade,texel.a);}else{float shade=mix(0.12+0.88*light,1.0,uEmissive);gl_FragColor=vec4(uColor*shade,1.0);}}`;
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
function createSphere(rows = 18, columns = 24) {
  const positions = [], normals = [], indices = [];
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
function cameraMatrix(panX = 0, panY = 0) {
  const eye = [0, 0, 7.8], z = normalize(eye), x = normalize(cross([0, 1, 0], z)), y = cross(z, x);
  const matrix = new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  matrix[12] += panX; matrix[13] += panY; return matrix;
}
function modelMatrix(x, y, z, scale) { return new Float32Array([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, x, y, z, 1]); }

/** Project detached Entity Model snapshots into renderer-only positions. */
export function bodiesFromSnapshot(viewModel) {
  const camera = viewModel.camera || {}, selectedSystemId = camera.viewSystemId;
  if (viewModel.scene === "details") {
    const selected = viewModel.entities.find(entity => entity.id === camera.selectedEntityId && entity.type === "cosmic.terrestrial-planet");
    return selected ? [{ id: selected.id, kind: "planet", textureId: selected.templateId, x: 0, y: 0, z: 0, radius: 0.78, color: [0.25, 0.62, 1], emissive: 0 }] : [];
  }
  if (!selectedSystemId && viewModel.scene !== "universe") return [];
  if (viewModel.scene === "universe") {
    const center = camera.universe || { x: 0.5, y: 0.5 };
    return viewModel.entities.filter(entity => entity.type === "cosmic.star-system" && !entity.parentSystemId && entity.position)
      .map(system => {
        const delta = spatialCoordinates.worldDelta(system.position, center);
        return { id: system.id, kind: "system", x: delta.x * 7.2, y: delta.y * 7.2, z: 0, radius: system.id === selectedSystemId ? 0.14 : 0.1, color: [0.55, 0.78, 1], emissive: 0.75 };
      });
  }
  const entities = viewModel.entities.filter(entity => entity.systemId === selectedSystemId);
  const stars = entities.filter(entity => entity.type === "cosmic.star").map(star => ({
    id: star.id, kind: "star", textureId: star.templateId, x: star.positionAU?.x ?? ((star.position?.x ?? 0.5) - 0.5) * 5,
    y: star.positionAU?.y ?? ((star.position?.y ?? 0.5) - 0.5) * 5, z: 0, radius: 0.28, color: [1, 0.72, 0.3], emissive: 1
  }));
  const planets = entities.filter(entity => entity.type === "cosmic.terrestrial-planet").map(planet => {
    const orbit = planet.orbit || {}, period = Math.max(1, orbit.periodDays || 365.25), phase = Number.isFinite(orbit.phaseRadians) ? orbit.phaseRadians : 0;
    const angle = phase + viewModel.simulationTime / 1000 * 36 / period * Math.PI * 2, axis = Math.max(0.16, Math.min(2.8, orbit.semiMajorAxisAU || 1));
    const star = stars.find(item => item.id === planet.parentStarId);
    const x = (star?.x || 0) + Math.cos(angle) * axis, y = (star?.y || 0) + Math.sin(angle) * axis;
    return { id: planet.id, kind: "planet", textureId: planet.templateId, x, y, z: 0, lightDirection: [star ? star.x - x : -1, star ? star.y - y : 0, 0.22],
      radius: Math.max(0.065, Math.min(0.16, 0.075 * Math.cbrt(Math.max(0.01, planet.radiusEarth || 1)))), color: [0.25, 0.62, 1], emissive: 0 };
  });
  const otherBodies = entities.filter(entity => entity.type === "cosmic.black-hole" || entity.type === "cosmic.asteroid").map(entity => {
    const point = entity.positionAU || entity.position || { x: 0, y: 0 };
    return { id: entity.id, kind: entity.type === "cosmic.black-hole" ? "black-hole" : "asteroid", x: point.x, y: point.y, z: 0,
      radius: entity.type === "cosmic.black-hole" ? 0.13 : 0.035, color: entity.type === "cosmic.black-hole" ? [0.12, 0.08, 0.2] : [0.75, 0.6, 0.43], emissive: 0 };
  });
  const region = viewModel.entities.find(entity => entity.id === selectedSystemId);
  const regionSystems = region?.position ? viewModel.entities.filter(entity => entity.type === "cosmic.star-system" && entity.parentSystemId === selectedSystemId && entity.position)
    .map(system => {
      const delta = spatialCoordinates.worldDelta(system.position, region.position), scale = Math.max(1, Math.min(320, (viewModel.viewport?.height || 600) * 0.22));
      return { id: system.id, kind: "system", x: delta.x * scale, y: delta.y * scale, z: 0, radius: 0.1, color: [0.55, 0.78, 1], emissive: 0.75 };
    }) : [];
  return [...stars, ...planets, ...otherBodies, ...regionSystems];
}

/** Minimal native WebGL sphere renderer with no external library. */
export class WebGL3DRenderer extends Renderer {
  constructor({ now = () => performance.now(), onMetrics = () => {}, assets = [], ImageClass = globalThis.Image } = {}) {
    super(); this.now = now; this.onMetrics = onMetrics; this.ImageClass = ImageClass; this.assetUrls = new Map(assets.filter(asset => asset?.id && asset.asset).map(asset => [asset.id, asset.asset.replace(/preview\.webp(?:\?.*)?$/, "master.webp")]));
    this.canvas = null; this.gl = null; this.viewModel = null; this.samples = []; this.textures = new Map(); this.pendingTextures = new Set(); this.meshes = new Map(); this.disposed = true;
  }
  init(canvas) {
    this.dispose();
    const gl = canvas?.getContext?.("webgl", { alpha: false, antialias: true, powerPreference: "high-performance" }) || canvas?.getContext?.("experimental-webgl");
    if (!gl) throw new Error("WebGL is unavailable");
    this.canvas = canvas; this.gl = gl; this.program = createProgram(gl); this.frameCount = 0;
    this.locations = { position: gl.getAttribLocation(this.program, "aPosition"), normal: gl.getAttribLocation(this.program, "aNormal"), mvp: gl.getUniformLocation(this.program, "uMvp"), model: gl.getUniformLocation(this.program, "uModel"), color: gl.getUniformLocation(this.program, "uColor"), lightDirection: gl.getUniformLocation(this.program, "uLightDirection"), emissive: gl.getUniformLocation(this.program, "uEmissive"), hasTexture: gl.getUniformLocation(this.program, "uHasTexture"), texture: gl.getUniformLocation(this.program, "uTexture") };
    this.disposed = false; gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); return this;
  }
  update(viewModel) {
    if (this.disposed) throw new Error("WebGL3DRenderer is not initialized");
    if (!viewModel || !Array.isArray(viewModel.entities)) throw new TypeError("WebGL3DRenderer requires a render view model");
    this.viewModel = viewModel;
    if (this.ImageClass) for (const entity of viewModel.entities) {
      if (entity.systemId !== viewModel.camera?.viewSystemId || !entity.templateId || this.textures.has(entity.templateId) || this.pendingTextures.has(entity.templateId)) continue;
      const url = this.assetUrls.get(entity.templateId); if (!url) continue;
      const image = new this.ImageClass(), gl = this.gl;
      this.pendingTextures.add(entity.templateId);
      image.onload = () => {
        this.pendingTextures.delete(entity.templateId);
        if (this.disposed || this.gl !== gl) return;
        const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); this.textures.set(entity.templateId, texture);
      };
      image.onerror = () => this.pendingTextures.delete(entity.templateId);
      image.src = url;
    }
  }
  render() {
    if (this.disposed || !this.viewModel) throw new Error("WebGL3DRenderer requires init and update before render");
    const started = this.now(), gl = this.gl, canvas = this.canvas, ratio = Math.min(globalThis.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio)), height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.clearColor(0.004, 0.008, 0.02, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program);
    const zoom = Math.max(0.55, Math.min(5, this.viewModel.camera?.zoom || 1));
    const projection = perspective(Math.PI / 3 / Math.sqrt(zoom), width / height, 0.1, 80);
    const pan = this.viewModel.camera?.pan || { x: 0, y: 0 }, viewportWidth = Math.max(1, this.viewModel.viewport?.width || width), viewportHeight = Math.max(1, this.viewModel.viewport?.height || height);
    const panX = Math.max(-2, Math.min(2, pan.x / viewportWidth * 3)), panY = Math.max(-2, Math.min(2, -pan.y / viewportHeight * 3));
    const viewProjection = multiply(projection, cameraMatrix(panX, panY)), bodies = bodiesFromSnapshot(this.viewModel);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.locations.texture, 0);
    for (const body of bodies) {
      const projected = projectBody(body, viewProjection, width, height);
      if (!projected || projected.depth < -1 || projected.depth > 1 || projected.x < -projected.radius || projected.x > width + projected.radius || projected.y < -projected.radius || projected.y > height + projected.radius) continue;
      const lod = projected.radius < 4 ? 0 : projected.radius < 18 ? 1 : 2;
      const mesh = this.#mesh(lod);
      const model = modelMatrix(body.x, body.y, body.z, body.radius);
      gl.uniformMatrix4fv(this.locations.mvp, false, multiply(viewProjection, model)); gl.uniformMatrix4fv(this.locations.model, false, model);
      const texture = this.textures.get(body.textureId); gl.bindTexture(gl.TEXTURE_2D, texture || null); gl.uniform1f(this.locations.hasTexture, texture ? 1 : 0);
      gl.uniform3fv(this.locations.color, body.color); gl.uniform3fv(this.locations.lightDirection, body.lightDirection || [-0.4, 0.7, 1]); gl.uniform1f(this.locations.emissive, body.emissive);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer); gl.enableVertexAttribArray(this.locations.position); gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer); gl.enableVertexAttribArray(this.locations.normal); gl.vertexAttribPointer(this.locations.normal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer); gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
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
  /** Return the Core id under a viewport point; render-object references never escape. */
  pick(x, y) {
    if (this.disposed || !this.viewModel || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const width = Math.max(1, this.canvas.clientWidth || 1), height = Math.max(1, this.canvas.clientHeight || 1);
    const zoom = Math.max(0.55, Math.min(5, this.viewModel.camera?.zoom || 1));
    const projection = perspective(Math.PI / 3 / Math.sqrt(zoom), width / height, 0.1, 80);
    const pan = this.viewModel.camera?.pan || { x: 0, y: 0 }, viewportWidth = Math.max(1, this.viewModel.viewport?.width || width), viewportHeight = Math.max(1, this.viewModel.viewport?.height || height);
    const viewProjection = multiply(projection, cameraMatrix(Math.max(-2, Math.min(2, pan.x / viewportWidth * 3)), Math.max(-2, Math.min(2, -pan.y / viewportHeight * 3))));
    let nearest = null;
    for (const body of bodiesFromSnapshot(this.viewModel)) {
      const projected = projectBody(body, viewProjection, width, height);
      if (!projected || projected.depth < -1 || projected.depth > 1) continue;
      const distance = Math.hypot(x - projected.x, y - projected.y);
      if (distance <= Math.max(10, projected.radius * 1.25) && (!nearest || distance < nearest.distance)) nearest = { id: body.id, distance };
    }
    return nearest?.id ?? null;
  }
  #mesh(lod) {
    if (this.meshes.has(lod)) return this.meshes.get(lod);
    const gl = this.gl, [rows, columns] = [[6, 8], [12, 16], [18, 24]][lod], data = createSphere(rows, columns);
    const mesh = { indexCount: data.indices.length };
    mesh.positionBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer); gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
    mesh.normalBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer); gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);
    mesh.indexBuffer = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    this.meshes.set(lod, mesh); return mesh;
  }
  dispose() {
    if (this.gl && !this.disposed) { for (const mesh of this.meshes.values()) for (const buffer of [mesh.positionBuffer, mesh.normalBuffer, mesh.indexBuffer]) if (buffer) this.gl.deleteBuffer(buffer); for (const texture of this.textures.values()) this.gl.deleteTexture(texture); if (this.program) this.gl.deleteProgram(this.program); }
    this.meshes.clear(); this.textures.clear(); this.pendingTextures.clear(); this.canvas = null; this.gl = null; this.viewModel = null; this.disposed = true;
  }
}

function projectBody(body, viewProjection, width, height) {
  const clip = multiplyVector(viewProjection, [body.x, body.y, body.z, 1]);
  if (!Number.isFinite(clip[3]) || clip[3] <= 0) return null;
  const nx = clip[0] / clip[3], ny = clip[1] / clip[3], depth = clip[2] / clip[3];
  const focal = height * Math.abs(viewProjection[5]) / 2 / clip[3];
  return { x: (nx + 1) * width / 2, y: (1 - ny) * height / 2, depth, radius: Math.max(1, body.radius * focal) };
}
function multiplyVector(matrix, vector) {
  return [0, 1, 2, 3].map(row => matrix[row] * vector[0] + matrix[4 + row] * vector[1] + matrix[8 + row] * vector[2] + matrix[12 + row] * vector[3]);
}
