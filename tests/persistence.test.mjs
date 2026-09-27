import test from "node:test";
import assert from "node:assert/strict";
import { createGenesisEngine } from "../src/app.js";
import { createGravitySystem } from "../src/systems/stellar/orbital-collisions.js";

test("world snapshots restore entities and bounded history without emitting new records", () => {
  const source = createGenesisEngine();
  const snapshot = source.world.snapshot();
  const restored = createGenesisEngine({ empty: false });
  restored.world.restore(snapshot);
  assert.deepEqual(restored.world.all(), source.world.all());
  assert.deepEqual(restored.world.history(), source.world.history());
  assert.throws(() => restored.world.restore({ version: 9, entities: [], events: [] }), /Unsupported world snapshot/);
});

test("gravity checkpoints preserve integrated body positions after engine restoration", () => {
  const source = createGenesisEngine({ empty: false });
  source.world.add({ id: "system", type: "cosmic.star-system", position: { x: 0.5, y: 0.5 }, universeId: "universe" });
  source.world.add({ id: "star", type: "cosmic.star", systemId: "system", position: { x: 0.5, y: 0.5 }, positionAU: { x: 0, y: 0 }, velocityAUPerSecond: { x: 0, y: 0 }, massSolar: 1, radiusSolar: 1, temperatureK: 5780 });
  const gravity = createGravitySystem(source);
  gravity.update(0);
  gravity.update(1000);
  const expected = gravity.positionOf("star");

  const restored = createGenesisEngine({ empty: false });
  restored.world.restore(source.world.snapshot());
  const restoredGravity = createGravitySystem(restored);
  restoredGravity.restore(gravity.snapshot());
  assert.deepEqual(restoredGravity.positionOf("star"), expected);
  restoredGravity.update(2000);
  assert.ok(restoredGravity.positionOf("star"));
});
