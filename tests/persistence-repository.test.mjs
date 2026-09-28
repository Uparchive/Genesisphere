import test from "node:test";
import assert from "node:assert/strict";
import { CloudflarePersistenceRepository } from "../src/adapters/cloudflare-persistence-repository.js";
import { InMemoryPersistenceRepository } from "../src/core/persistence-repository.js";
import { serializeUniverseSnapshot } from "../src/core/persistence.js";
import { createGenesisEngine } from "../src/app.js";
import { UniverseDO } from "../src/cloudflare/worker.js";

function emptySnapshot() {
  const engine = createGenesisEngine({ empty: true });
  return serializeUniverseSnapshot({ simulationTime: 0, world: engine.world.snapshot(), gravity: { version: 1, lastTime: 0, states: [], trails: [], habitability: [], lastTrailAt: 0 } });
}

test("in-memory repository isolates user/universe scopes and returns detached snapshots", async () => {
  const repository = new InMemoryPersistenceRepository();
  const snapshot = emptySnapshot();
  const saved = await repository.save({ userId: "alice", universeId: "home", snapshot, expectedRevision: 0, operationId: "op-1" });
  assert.deepEqual(saved, { saved: true, revision: 1, idempotent: false });
  const loaded = await repository.load({ userId: "alice", universeId: "home" });
  assert.equal(loaded.revision, 1);
  assert.deepEqual(loaded.snapshot, snapshot);
  loaded.snapshot.world.entities.push({ id: "caller-mutation" });
  assert.deepEqual((await repository.load({ userId: "alice", universeId: "home" })).snapshot, snapshot);
  assert.deepEqual(await repository.load({ userId: "bob", universeId: "home" }), { snapshot: null, revision: 0 });
  assert.deepEqual(await repository.load({ userId: "alice", universeId: "other" }), { snapshot: null, revision: 0 });
});

test("in-memory repository makes retries idempotent and rejects stale revisions without replacing data", async () => {
  const repository = new InMemoryPersistenceRepository();
  const snapshot = emptySnapshot();
  await repository.save({ userId: "alice", universeId: "home", snapshot, expectedRevision: 0, operationId: "op-1" });
  assert.deepEqual(await repository.save({ userId: "alice", universeId: "home", snapshot, expectedRevision: 0, operationId: "op-1" }), { saved: true, revision: 1, idempotent: true });
  await assert.rejects(repository.save({ userId: "alice", universeId: "home", snapshot, expectedRevision: 0, operationId: "op-2" }), error => error.code === "PERSISTENCE_CONFLICT" && error.currentRevision === 1);
  assert.deepEqual((await repository.load({ userId: "alice", universeId: "home" })).snapshot, snapshot);
});

test("Cloudflare adapter binds scope to the authenticated identity and sends the universe ID separately", async () => {
  let request;
  const user = { uid: "alice", getIdToken: async () => "token" };
  const repository = new CloudflarePersistenceRepository({
    baseUrl: "https://api.example.test/",
    getCurrentUser: () => user,
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({ snapshot: null, revision: 0 }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  await repository.load({ userId: "alice", universeId: "galaxy-1" });
  assert.equal(new URL(request.url).searchParams.get("universeId"), "galaxy-1");
  assert.equal(request.init.headers.Authorization, "Bearer token");
  await assert.rejects(repository.load({ userId: "bob", universeId: "galaxy-1" }), error => error.code === "PERSISTENCE_IDENTITY_MISMATCH");
});

test("Durable Object writes are revision-checked and idempotent", async () => {
  let row = null;
  const sql = { exec(query, ...args) {
    if (query.startsWith("SELECT")) return { toArray: () => row ? [{ ...row }] : [] };
    if (query.startsWith("INSERT INTO universe_state")) {
      const [snapshot, simulationTime, processedWallMs, activeUntilMs, revision, operationId] = args;
      row = { snapshot, simulation_time: simulationTime, processed_wall_ms: processedWallMs, active_until_ms: activeUntilMs, revision, operation_id: operationId };
    }
    return { toArray: () => [] };
  } };
  const object = new UniverseDO({ storage: { sql, setAlarm: async () => {} } });
  const snapshot = emptySnapshot();
  const makeWrite = (expectedRevision, operationId, value = snapshot) => new Request("https://universe.internal/state", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ snapshot: value, expectedRevision, operationId })
  });
  const first = await object.fetch(makeWrite(0, "op-1"));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { saved: true, revision: 1, idempotent: false });
  const retry = await object.fetch(makeWrite(0, "op-1"));
  assert.deepEqual(await retry.json(), { saved: true, revision: 1, idempotent: true });
  const conflict = await object.fetch(makeWrite(0, "op-2"));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).currentRevision, 1);
  const loaded = await (await object.fetch(new Request("https://universe.internal/state"))).json();
  assert.equal(loaded.revision, 1);
  assert.deepEqual(loaded.snapshot, snapshot);
});
