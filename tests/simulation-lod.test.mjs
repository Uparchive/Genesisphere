import test from "node:test";
import assert from "node:assert/strict";
import { SIMULATION_LEVELS } from "../src/core/simulation-lod.js";
import { createEntityRecord } from "../src/core/entity-model.js";
import { WorldStore } from "../src/core/world-store.js";
import { UniverseState } from "../src/core/universe-state.js";

function body(id, x) {
  return createEntityRecord({ id, type: "cosmic.test-body", properties: { name: id, position: { x, y: 0 } } });
}

test("simulation LOD promotes and demotes entities with hysteresis without changing canonical state", () => {
  const state = new UniverseState({ world: new WorldStore() });
  const near = state.world.add(body("near", 0.5));
  const middle = state.world.add(body("middle", 5));
  const far = state.world.add(body("far", 50));

  let result = state.simulationLOD.evaluate({ focus: { x: 0, y: 0 }, relevantIds: [] });
  assert.deepEqual(result.levels, { active: 1, approximate: 1, dormant: 1 });
  assert.deepEqual(result.transitions.map(({ entityId, to }) => [entityId, to]), [
    ["middle", SIMULATION_LEVELS.APPROXIMATE], ["far", SIMULATION_LEVELS.DORMANT]
  ]);

  state.simulationLOD.evaluate({ focus: { x: 4, y: 0 } });
  assert.equal(state.simulationLOD.levelOf("middle"), SIMULATION_LEVELS.ACTIVE);
  assert.equal(state.simulationLOD.levelOf("far"), SIMULATION_LEVELS.DORMANT);
  state.simulationLOD.evaluate({ focus: { x: 50, y: 0 } });
  assert.equal(state.simulationLOD.levelOf("far"), SIMULATION_LEVELS.ACTIVE);
  assert.equal(state.world.get(far.id), far);
  assert.equal(state.world.get(near.id).id, near.id);
  assert.equal(state.world.get(middle.id).id, middle.id);

  const metrics = state.simulationLOD.snapshot().metrics;
  assert.equal(metrics.evaluations, 3);
  assert.equal(metrics.transitions, 7);
  assert.equal(metrics.promotions, 2);
  assert.equal(metrics.demotions, 5);
  assert.equal(metrics.considered, 9);
});

test("relevance keeps entities active and coordinate spaces are never compared", () => {
  const world = new WorldStore();
  world.add(body("relevant", 500));
  world.add(createEntityRecord({ id: "local-au", type: "cosmic.star", properties: { positionAU: { x: 500, y: 0 } } }));
  const state = new UniverseState({ world });

  const result = state.simulationLOD.evaluate({ focus: { x: 0, y: 0, space: "UU" }, relevantIds: ["relevant"] });
  assert.equal(state.simulationLOD.levelOf("relevant"), SIMULATION_LEVELS.ACTIVE);
  assert.equal(state.simulationLOD.levelOf("local-au"), SIMULATION_LEVELS.ACTIVE);
  assert.deepEqual(state.simulationLOD.entitiesAt(SIMULATION_LEVELS.DORMANT), []);
  assert.equal(result.levels.active, 2);
});
