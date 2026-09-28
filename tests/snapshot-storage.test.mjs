import test from "node:test";
import assert from "node:assert/strict";
import { createGenesisEngine } from "../src/app.js";
import { serializeUniverseSnapshot } from "../src/core/persistence.js";
import { loadSnapshotWithRecovery, saveSnapshotWithRecovery } from "../src/core/snapshot-storage.js";

function snapshot(simulationTime) {
  const engine = createGenesisEngine({ empty: true });
  return serializeUniverseSnapshot({ simulationTime, world: engine.world.snapshot(), gravity: { version: 1, lastTime: simulationTime, states: [], trails: [], habitability: [], lastTrailAt: 0 } });
}

class MemoryStorage {
  values = new Map();
  failKey = null;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (key === this.failKey) throw new Error("simulated storage failure");
    this.values.set(key, String(value));
  }
}

test("browser saves retain a valid previous snapshot when replacing the current save fails", () => {
  const storage = new MemoryStorage();
  const key = "genesisphere:universe:alice";
  const first = snapshot(12);
  saveSnapshotWithRecovery(storage, key, first);
  storage.failKey = key;

  assert.throws(() => saveSnapshotWithRecovery(storage, key, snapshot(24)), /simulated storage failure/);
  assert.deepEqual(loadSnapshotWithRecovery(storage, key), { snapshot: first, recovered: false });
  assert.equal(JSON.parse(storage.getItem(key)).simulationTime, 12);
  assert.equal(JSON.parse(storage.getItem(`${key}:previous`)).schemaVersion, 1);
});

test("browser loading recovers the previous valid snapshot when the current save is corrupt", () => {
  const storage = new MemoryStorage();
  const key = "genesisphere:universe:alice";
  const first = snapshot(12);
  saveSnapshotWithRecovery(storage, key, first);
  saveSnapshotWithRecovery(storage, key, snapshot(24));
  storage.values.set(key, "{broken json");

  assert.deepEqual(loadSnapshotWithRecovery(storage, key), { snapshot: first, recovered: true });
});

test("browser save records wall-clock and simulation timestamps with the schema version", () => {
  const storage = new MemoryStorage();
  const record = saveSnapshotWithRecovery(storage, "save", snapshot(42));
  assert.equal(record.format, "genesisphere-snapshot");
  assert.equal(record.simulationTime, 42);
  assert.equal(record.schemaVersion, 1);
  assert.ok(Number.isFinite(Date.parse(record.savedAt)));
});
