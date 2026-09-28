import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createGenesisEngine } from "../src/app.js";
import { createGravitySystem } from "../src/systems/stellar/orbital-collisions.js";
import { deserializeUniverseSnapshot, migrateUniverseSnapshot, serializeUniverseSnapshot } from "../src/core/persistence.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/universe-snapshot-v1.json", import.meta.url), "utf8"));
const legacyFixture = JSON.parse(await readFile(new URL("./fixtures/universe-snapshot-legacy-v1.json", import.meta.url), "utf8"));

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

test("versioned fixture round-trips through serializers and preserves IDs and relationships", () => {
  const internal = deserializeUniverseSnapshot(fixture);
  const engine = createGenesisEngine({ empty: false });
  engine.world.restore(internal.world);
  const system = engine.world.get("fixture-system");
  assert.equal(system.universeId, "fixture-universe");
  assert.equal(system.components.relations.universeId, "fixture-universe");
  assert.deepEqual(engine.world.all().map(entity => entity.id), ["fixture-universe", "fixture-system"]);
  const serialized = serializeUniverseSnapshot({ ...internal, world: engine.world.snapshot() });
  assert.deepEqual(serialized, fixture);
});

test("legacy version:1 saves migrate to the current versioned contract", () => {
  const legacy = {
    version: 1,
    simulationTime: 12,
    world: { version: 1, entities: [{ id: "legacy-system", type: "cosmic.star-system", schemaVersion: 1, createdAt: 10, name: "Legacy", universeId: "legacy-universe", position: { x: 0, y: 0 } }], events: [] },
    gravity: { version: 1, lastTime: 12, states: [], trails: [], habitability: [], lastTrailAt: 0 }
  };
  const migrated = migrateUniverseSnapshot(legacy);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.world.entities[0].id, "legacy-system");
  assert.equal(deserializeUniverseSnapshot(legacy).world.entities[0].universeId, "legacy-universe");
});

test("legacy save fixture migrates and restores IDs, relationships, properties, and history", () => {
  const migrated = migrateUniverseSnapshot(legacyFixture);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.simulationTime, 12000);
  assert.equal(migrated.world.entities[0].id, "legacy-universe");
  assert.equal(migrated.world.entities[1].properties.universeId, "legacy-universe");
  assert.deepEqual(migrated.world.events, legacyFixture.world.events);

  const internal = deserializeUniverseSnapshot(legacyFixture);
  const engine = createGenesisEngine({ empty: false });
  engine.world.restore(internal.world);
  assert.deepEqual(engine.world.all().map(entity => entity.id), ["legacy-universe", "legacy-system"]);
  assert.equal(engine.world.get("legacy-system").universeId, "legacy-universe");
  assert.deepEqual(engine.world.get("legacy-universe").metadata, { origin: "legacy-save" });
  assert.deepEqual(engine.world.history(), legacyFixture.world.events);

  const savedAgain = serializeUniverseSnapshot({ ...internal, world: engine.world.snapshot() });
  assert.equal(savedAgain.schemaVersion, 1);
  assert.equal(savedAgain.world.entities[1].properties.universeId, "legacy-universe");
  assert.deepEqual(savedAgain.world.events, legacyFixture.world.events);
});

test("invalid versioned snapshots are rejected before Core state is changed", () => {
  const engine = createGenesisEngine({ empty: false });
  engine.create("cosmic.empty-space", { name: "Keep me" });
  const before = engine.world.all();
  const invalid = structuredClone(fixture);
  invalid.world.entities[1].properties.universeId = 42;
  assert.throws(() => deserializeUniverseSnapshot(invalid), /Invalid entity relation/);
  assert.deepEqual(engine.world.all(), before);
});
