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
