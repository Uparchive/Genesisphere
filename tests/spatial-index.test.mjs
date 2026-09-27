import test from "node:test";
import assert from "node:assert/strict";
import { WorldStore } from "../src/core/world-store.js";
import { findNearestStarInRegion } from "../src/modules/cosmic-command-terminal.js";

const entity = (id, type, properties = {}) => ({ id, type, ...properties });

test("radius queries find entities across cell boundaries, including negative coordinates", () => {
  const world = new WorldStore();
  world.add(entity("near", "cosmic.star-system", { position: { x: 1.01, y: -0.01 } }));
  world.add(entity("far", "cosmic.star-system", { position: { x: 2, y: -0.01 } }));

  assert.deepEqual(world.spatial.nearby({ x: 0.99, y: 0 }, 0.03).map(item => item.id), ["near"]);
  assert.deepEqual(world.spatial.nearby({ x: 1.01, y: -0.01 }, 0, { type: "cosmic.star-system" }).map(item => item.id), ["near"]);
  assert.equal(world.spatial.regionAt({ x: -0.01, y: -1 }), "region:-1:-1");
  assert.deepEqual(world.spatial.entitiesInRegion(world.spatial.regionAt({ x: 1.02, y: -0.02 })).map(item => item.id), ["near"]);
});

test("region activation filters presentation candidates without unloading entities or changing IDs", () => {
  const world = new WorldStore();
  const system = world.add(entity("system-A", "cosmic.star-system", { regionId: "region-A", position: { x: 0, y: 0 } }));
  world.add(entity("star-A", "cosmic.star", { systemId: system.id, position: { x: 0, y: 0 } }));
  world.add(entity("system-B", "cosmic.star-system", { regionId: "region-B", position: { x: 8, y: 0 } }));
  world.add(entity("star-B", "cosmic.star", { systemId: "system-B", position: { x: 8, y: 0 } }));

  world.spatial.setActiveRegion("region-A");
  assert.deepEqual(world.spatial.activeEntities().map(item => item.id).sort(), ["star-A", "system-A"]);
  assert.equal(world.has("star-B"), true);
  assert.equal(world.get("star-A").id, "star-A");
  world.spatial.setActiveRegion("region-B");
  assert.deepEqual(world.spatial.activeEntities().map(item => item.id).sort(), ["star-B", "system-B"]);
});

test("index tracks entity moves, removals and restored snapshots", () => {
  const world = new WorldStore();
  world.add(entity("moving", "cosmic.star-system", { regionId: "old", position: { x: 0, y: 0 } }));
  world.update("moving", { position: { x: 3, y: 0 }, regionId: "new" });
  assert.deepEqual(world.spatial.entitiesInRegion("old"), []);
  assert.deepEqual(world.spatial.nearby({ x: 3, y: 0 }, 0).map(item => item.id), ["moving"]);

  const restored = new WorldStore();
  restored.restore(world.snapshot());
  assert.deepEqual(restored.spatial.entitiesInRegion("new").map(item => item.id), ["moving"]);
  restored.remove("moving");
  assert.deepEqual(restored.spatial.entitiesInRegion("new"), []);
});

test("nearest-star lookup uses region-indexed candidates instead of scanning every entity", () => {
  const world = new WorldStore();
  world.add(entity("active-system", "cosmic.star-system", { regionId: "region-A", position: { x: 0, y: 0 } }));
  world.add(entity("near", "cosmic.star", { systemId: "active-system", position: { x: 0.5, y: 0.5 } }));
  world.add(entity("other-system", "cosmic.star-system", { regionId: "region-B", position: { x: 10, y: 10 } }));
  world.add(entity("far", "cosmic.star", { systemId: "other-system", position: { x: 10.5, y: 10.5 } }));
  world.byType = () => { throw new Error("full-world scan attempted"); };
  const positions = new Map([["near", { x: 3, y: 4 }], ["far", { x: 0, y: 0 }]]);
  const result = findNearestStarInRegion({
    engine: { world }, collisions: { positionOf: star => positions.get(star.id) },
    regionId: "region-A", coordinates: { x: 0.5, y: 0.5 }, bigBangStatus: { active: true, regionId: "region-A" }
  });
  assert.equal(result.star.id, "near");
  assert.equal(result.distanceAU, 5);
});
