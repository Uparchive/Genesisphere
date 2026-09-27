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
    { id: "star", type: "cosmic.star", systemId: "system", positionAU: { x: 1, y: 0 } },
    { id: "planet", type: "cosmic.terrestrial-planet", systemId: "system", parentStarId: "star", orbit: { semiMajorAxisAU: 1, periodDays: 365.25, phaseRadians: 0 }, radiusEarth: 1 },
    { id: "outside", type: "cosmic.star", systemId: "other", positionAU: { x: 50, y: 50 } }
  ], simulationTime: 0, camera: { viewSystemId: "system" } });
  const bodies = bodiesFromSnapshot(view);
  assert.deepEqual(bodies.map(body => body.id), ["star", "planet"]);
  assert.equal(bodies[0].x, 1);
  assert.equal(bodies[1].x, 2);
  assert.equal(view.entities.length, 3);
});

test("WebGL renderer draws snapshot bodies, reports frame metrics, and disposes", () => {
  let metric = null, clock = 0, draws = 0;
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6,
    STATIC_DRAW: 7, DEPTH_TEST: 8, CULL_FACE: 9, FLOAT: 10, TRIANGLES: 11, UNSIGNED_SHORT: 12, COLOR_BUFFER_BIT: 1, DEPTH_BUFFER_BIT: 2,
    createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true, getShaderInfoLog: () => "", deleteShader() {},
    createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true, getProgramInfoLog: () => "", deleteProgram() {},
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {}, getAttribLocation: () => 0, getUniformLocation: () => ({}),
    enable() {}, viewport() {}, clearColor() {}, clear() {}, useProgram() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
    uniformMatrix4fv() {}, uniform3fv() {}, uniform1f() {}, drawElements() { draws++; }
  };
  const canvas = { clientWidth: 1366, clientHeight: 768, getContext: kind => kind === "webgl" ? gl : null };
  const renderer = new WebGL3DRenderer({ now: () => (clock += 1), onMetrics: value => { metric = value; } });
  const view = createRenderViewModel({ entities: [{ id: "s", type: "cosmic.star", systemId: "system", positionAU: { x: 0, y: 0 } }], simulationTime: 0, camera: { viewSystemId: "system" }, viewport: { width: 320, height: 240 } });
  renderer.init(canvas).update(view);
  for (let index = 0; index < 60; index++) renderer.render();
  assert.equal(draws, 60);
  assert.equal(metric.width, 1366);
  assert.equal(metric.height, 768);
  assert.equal(metric.bodies, 1);
  canvas.clientWidth = 390; canvas.clientHeight = 844;
  for (let index = 0; index < 30; index++) renderer.render();
  assert.equal(metric.width, 390);
  assert.equal(metric.height, 844);
  renderer.dispose();
  assert.throws(() => renderer.render(), /init and update/);
});
