import test from "node:test";
import assert from "node:assert/strict";
import { Renderer, createRenderViewModel } from "../src/rendering/renderer.js";
import { LegacyRenderer } from "../src/rendering/legacy-renderer.js";
import { GenesisEngine } from "../src/core/engine.js";

test("Core initializes headlessly without importing or constructing a renderer", () => {
  const core = new GenesisEngine();
  assert.equal(core.world.all().length, 0);
  assert.equal(core.modules.size, 0);
});

test("render view models are detached immutable snapshots", () => {
  const entity = { id: "star-1", type: "cosmic.star", position: { x: 1, y: 2 } };
  const view = createRenderViewModel({ entities: [entity], simulationTime: 42, scene: "universe", viewport: { width: 800, height: 600 } });
  entity.position.x = 9;
  assert.equal(view.entities[0].position.x, 1);
  assert.ok(Object.isFrozen(view.entities[0].position));
  assert.throws(() => { view.entities[0].position.x = 4; }, TypeError);
});

test("LegacyRenderer follows init/update/render/dispose and only gets a view model", () => {
  const calls = [];
  const context = {};
  const canvas = { getContext: kind => (calls.push(["context", kind]), context) };
  const renderer = new LegacyRenderer({ drawFrame: frame => calls.push(["draw", frame]) });
  const view = createRenderViewModel({ entities: [], simulationTime: 3, scene: "universe" });
  renderer.init(canvas);
  renderer.update(view);
  renderer.render();
  assert.equal(calls[0][1], "2d");
  assert.equal(calls[1][1].viewModel, view);
  assert.equal("core" in calls[1][1], false);
  renderer.dispose();
  assert.throws(() => renderer.render(), /init and update/);
});

test("renderer contract identifies lifecycle operations", () => {
  for (const method of ["init", "update", "render", "dispose"]) {
    assert.throws(() => new Renderer()[method](), /must be implemented/);
  }
});

import { WebGL3DRenderer, bodiesFromSnapshot } from "../src/rendering/webgl3d-renderer.js";

test("WebGL proof maps the same snapshot star and orbiting planet without mutating it", () => {
  const view = createRenderViewModel({ entities: [
    { id: "star", type: "cosmic.star", systemId: "system", templateId: "star.template", positionAU: { x: 1, y: 0 } },
    { id: "planet", type: "cosmic.terrestrial-planet", systemId: "system", parentStarId: "star", templateId: "planet.template", orbit: { semiMajorAxisAU: 1, periodDays: 365.25, phaseRadians: 0 }, radiusEarth: 1 },
    { id: "outside", type: "cosmic.star", systemId: "other", positionAU: { x: 50, y: 50 } }
  ], simulationTime: 0, camera: { viewSystemId: "system" } });
  const bodies = bodiesFromSnapshot(view);
  assert.deepEqual(bodies.map(body => body.id), ["star", "planet"]);
  assert.equal(bodies[0].x, 1);
  assert.equal(bodies[0].textureId, "star.template");
  assert.equal(bodies[1].x, 2);
  assert.equal(bodies[1].textureId, "planet.template");
  assert.deepEqual(bodies[1].lightDirection, [-1, 0, 0.22]);
  assert.equal(view.entities.length, 3);
});

test("WebGL universe scene projects Core coordinates and responds to entity snapshots", () => {
  const source = [{ id: "system-a", type: "cosmic.star-system", position: { x: 0.5, y: 0.5 } },
    { id: "system-b", type: "cosmic.star-system", position: { x: 300.5, y: 0.5 } }];
  const first = createRenderViewModel({ entities: source, simulationTime: 0, scene: "universe", camera: { universe: { x: 0.5, y: 0.5 } } });
  assert.deepEqual(bodiesFromSnapshot(first).map(body => body.id), ["system-a", "system-b"]);
  assert.equal(bodiesFromSnapshot(first)[0].x, 0);
  assert.equal(bodiesFromSnapshot(first)[1].x, 2160);
  const next = createRenderViewModel({ entities: source.slice(0, 1), simulationTime: 1, scene: "universe", camera: { universe: { x: 0.5, y: 0.5 } } });
  assert.deepEqual(bodiesFromSnapshot(next).map(body => body.id), ["system-a"]);
  assert.equal(source.length, 2, "view projection does not take ownership of Core state");
});

test("WebGL region scene projects nested systems relative to the Spatial Core camera region", () => {
  const view = createRenderViewModel({ entities: [
    { id: "region", type: "cosmic.star-system", regionId: "region", position: { x: 10000, y: -3000 } },
    { id: "nested", type: "cosmic.star-system", parentSystemId: "region", position: { x: 10000.001, y: -3000 } }
  ], simulationTime: 0, scene: "system", camera: { viewSystemId: "region" }, viewport: { width: 390, height: 600 } });
  const bodies = bodiesFromSnapshot(view);
  assert.deepEqual(bodies.map(body => body.id), ["nested"]);
  assert.ok(Math.abs(bodies[0].x - 0.132) < 1e-9);
});

test("WebGL hit testing returns EntityId and renderer restart retains the Core snapshot", () => {
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6, STATIC_DRAW: 7,
    DEPTH_TEST: 8, CULL_FACE: 9, BLEND: 10, ONE: 11, ONE_MINUS_SRC_ALPHA: 12, FLOAT: 13,
    createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true, getShaderInfoLog: () => "", deleteShader() {},
    createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true, getProgramInfoLog: () => "", deleteProgram() {},
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {}, getAttribLocation: () => 0, getUniformLocation: () => ({}), enable() {}, blendFunc() {}
  };
  const canvas = { clientWidth: 800, clientHeight: 600, getContext: () => gl };
  const entity = { id: "core-star-id", type: "cosmic.star", systemId: "system", positionAU: { x: 0, y: 0 } };
  const snapshot = createRenderViewModel({ entities: [entity], simulationTime: 0, scene: "system", camera: { viewSystemId: "system" }, viewport: { width: 800, height: 600 } });
  const renderer = new WebGL3DRenderer();
  renderer.init(canvas).update(snapshot);
  assert.equal(renderer.pick(400, 300), "core-star-id");
  renderer.dispose();
  assert.equal(snapshot.entities[0].id, "core-star-id");
  renderer.init(canvas).update(snapshot);
  assert.equal(renderer.pick(400, 300), "core-star-id");
  renderer.dispose();
});

test("WebGL renderer draws snapshot bodies, reports frame metrics, and disposes", () => {
  let metric = null, clock = 0, draws = 0, firstMvp = null;
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6,
    STATIC_DRAW: 7, DEPTH_TEST: 8, CULL_FACE: 9, FLOAT: 10, TRIANGLES: 11, UNSIGNED_SHORT: 12, COLOR_BUFFER_BIT: 1, DEPTH_BUFFER_BIT: 2,
    BLEND: 13, SRC_ALPHA: 14, ONE: 15, ONE_MINUS_SRC_ALPHA: 16, TEXTURE0: 17, TEXTURE_2D: 18, TEXTURE_WRAP_S: 19, TEXTURE_WRAP_T: 20,
    CLAMP_TO_EDGE: 20, TEXTURE_MIN_FILTER: 21, TEXTURE_MAG_FILTER: 22, LINEAR: 23, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 24, RGBA: 25,
    createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true, getShaderInfoLog: () => "", deleteShader() {},
    createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true, getProgramInfoLog: () => "", deleteProgram() {},
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {}, getAttribLocation: () => 0, getUniformLocation: (_program, name) => name,
    enable() {}, blendFunc() {}, viewport() {}, clearColor() {}, clear() {}, useProgram() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
    uniformMatrix4fv(location, _transpose, value) { if (location === "uMvp" && !firstMvp) firstMvp = value; }, uniform3fv() {}, uniform1f() {}, uniform1i() {},
    activeTexture() {}, bindTexture() {}, pixelStorei() {}, texParameteri() {}, texImage2D() {}, createTexture: () => ({}), deleteTexture() {},
    drawElements() { draws++; }
  };
  const canvas = { clientWidth: 1366, clientHeight: 768, getContext: kind => kind === "webgl" ? gl : null };
  const renderer = new WebGL3DRenderer({ now: () => (clock += 1), onMetrics: value => { metric = value; } });
  const view = createRenderViewModel({ entities: [{ id: "s", type: "cosmic.star", systemId: "system", positionAU: { x: 0, y: 0 } }], simulationTime: 0, camera: { viewSystemId: "system", pan: { x: 100, y: 80 } }, viewport: { width: 320, height: 240 } });
  renderer.init(canvas).update(view);
  for (let index = 0; index < 60; index++) renderer.render();
  assert.equal(draws, 60);
  assert.equal(metric.width, 1366);
  assert.equal(metric.height, 768);
  assert.equal(metric.bodies, 1);
  assert.ok(firstMvp[12] > 0, "rightward pan moves the camera with legacy screen-space direction");
  assert.ok(firstMvp[13] < 0, "downward pan moves the camera with legacy screen-space direction");
  canvas.clientWidth = 390; canvas.clientHeight = 844;
  for (let index = 0; index < 30; index++) renderer.render();
  assert.equal(metric.width, 390);
  assert.equal(metric.height, 844);
  renderer.dispose();
  assert.throws(() => renderer.render(), /init and update/);
});

test("WebGL renderer loads catalog artwork into sphere textures", () => {
  const images = [], uploaded = [], deleted = [];
  class MockImage { set src(value) { this.url = value; images.push(this); } }
  let textureUniform = 0;
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6,
    STATIC_DRAW: 7, DEPTH_TEST: 8, CULL_FACE: 9, BLEND: 10, SRC_ALPHA: 11, ONE: 12, ONE_MINUS_SRC_ALPHA: 13, FLOAT: 14, TRIANGLES: 15, UNSIGNED_SHORT: 16,
    COLOR_BUFFER_BIT: 1, DEPTH_BUFFER_BIT: 2, TEXTURE0: 16, TEXTURE_2D: 17, TEXTURE_WRAP_S: 18, TEXTURE_WRAP_T: 19, CLAMP_TO_EDGE: 20,
    TEXTURE_MIN_FILTER: 21, TEXTURE_MAG_FILTER: 22, LINEAR: 23, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 24, RGBA: 25,
    createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true, getShaderInfoLog: () => "", deleteShader() {},
    createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true, getProgramInfoLog: () => "", deleteProgram() {},
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {}, getAttribLocation: () => 0, getUniformLocation: (_program, name) => name,
    enable() {}, blendFunc() {}, viewport() {}, clearColor() {}, clear() {}, useProgram() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
    uniformMatrix4fv() {}, uniform3fv() {}, uniform1f(location, value) { if (location === "uHasTexture") textureUniform = value; }, uniform1i() {}, activeTexture() {}, pixelStorei() {}, texParameteri() {},
    createTexture: () => ({}), bindTexture() {}, texImage2D(...args) { uploaded.push(args); }, deleteTexture(texture) { deleted.push(texture); }, drawElements() {}
  };
  const renderer = new WebGL3DRenderer({ assets: [{ id: "planet.template", asset: "assets/celestial/planets/gas-giant/preview.webp" }], ImageClass: MockImage });
  const canvas = { clientWidth: 800, clientHeight: 600, getContext: () => gl };
  const view = createRenderViewModel({ entities: [{ id: "p", type: "cosmic.terrestrial-planet", systemId: "system", templateId: "planet.template", parentStarId: "s", orbit: { semiMajorAxisAU: 1 } }], simulationTime: 0, camera: { viewSystemId: "system" }, viewport: { width: 800, height: 600 } });
  renderer.init(canvas).update(view);
  assert.equal(images.length, 1);
  assert.equal(images[0].url, "assets/celestial/planets/gas-giant/master.webp");
  images[0].onload();
  renderer.render();
  assert.equal(uploaded.length, 1);
  assert.equal(textureUniform, 1);
  renderer.dispose();
  assert.equal(deleted.length, 1);
});
