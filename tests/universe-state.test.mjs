import test from "node:test";
import assert from "node:assert/strict";
import { UniverseState, createLegacyUniverseAdapter } from "../src/core/universe-state.js";
import { createGenesisEngine } from "../src/game-engine.js";

test("UniverseState owns the canonical world and exposes the legacy UI adapter", () => {
  const engine = createGenesisEngine();
  const state = engine.state;
  const adapter = createLegacyUniverseAdapter(state);
  const before = state.world.snapshot();

  assert.equal(adapter.world, state.world);
  assert.deepEqual(adapter.world.snapshot(), before);
  assert.equal(state.world.byType("cosmic.empty-space").length, 1);

  adapter.simulationTime = 1250;
  adapter.timeScale = 2;
  adapter.paused = true;
  assert.equal(state.simulationTime, 1250);
  assert.equal(state.timeScale, 2);
  assert.equal(state.paused, true);

  const created = engine.create("cosmic.star-system", { name: "Test", universeId: state.world.byType("cosmic.empty-space")[0].id });
  assert.equal(state.world.get(created.id).name, "Test");
  assert.throws(() => { adapter.simulationTime = -1; }, /non-negative finite/);
});

test("UniverseState keeps legacy world snapshots readable without changing their format", () => {
  const source = createGenesisEngine();
  const saved = JSON.parse(JSON.stringify(source.state.world.snapshot()));
  const target = createGenesisEngine({ empty: false });

  target.legacyUniverse.world.restore(saved);

  assert.deepEqual(target.state.world.snapshot(), saved);
  assert.equal(target.state.world.byType("cosmic.empty-space")[0].name, "Genesisphere");
});
