import test from "node:test";
import assert from "node:assert/strict";
import { DomainEvent, EventBus } from "../src/core/event-bus.js";
import { createGenesisEngine } from "../src/game-engine.js";

test("EventBus delivers subscribers in order and supports independent unsubscribe", () => {
  const bus = new EventBus();
  const received = [];
  const removeFirst = bus.on("sample", value => received.push(`first:${value}`));
  bus.on("sample", value => received.push(`second:${value}`));

  bus.emit("sample", 1);
  assert.equal(removeFirst(), true);
  assert.equal(removeFirst(), false);
  bus.emit("sample", 2);

  assert.deepEqual(received, ["first:1", "second:1", "second:2"]);
});

test("a failing subscriber is recorded without blocking later subscribers", () => {
  const bus = new EventBus();
  const received = [];
  bus.on("sample", () => { throw new Error("subscriber failed"); });
  bus.on("sample", () => received.push("delivered"));

  bus.emit("sample", null);

  assert.deepEqual(received, ["delivered"]);
  assert.equal(bus.listenerErrors.length, 1);
  assert.equal(bus.listenerErrors[0].type, "sample");
});

test("Core publishes creation, change, removal, and time events in operation order", () => {
  const engine = createGenesisEngine();
  const received = [];
  for (const type of Object.values(DomainEvent)) {
    engine.bus.on(type, payload => received.push({ type, payload }));
  }

  const entity = engine.create("cosmic.star-system", { name: "Events" });
  engine.setEntityProperty(entity.id, "name", "Updated Events");
  engine.commands.dispatch({ type: "AdvanceSimulationTime", deltaMs: 20 });
  engine.remove(entity.id);

  assert.deepEqual(received.map(event => event.type), [
    DomainEvent.EntityCreated,
    DomainEvent.EntityChanged,
    DomainEvent.TimeAdvanced,
    DomainEvent.EntityRemoved
  ]);
  assert.equal(received[0].payload.id, entity.id);
  assert.deepEqual(received[1].payload.properties, ["name"]);
  assert.deepEqual(received[2].payload, { previousTime: 0, currentTime: 20, deltaMs: 20 });
  assert.equal(received[3].payload.id, entity.id);
});

test("loading a snapshot does not republish historical events", () => {
  const source = createGenesisEngine();
  source.create("cosmic.star-system", { name: "Saved" });
  const snapshot = source.world.snapshot();
  const restored = createGenesisEngine({ empty: false });
  let count = 0;
  for (const type of Object.values(DomainEvent)) restored.bus.on(type, () => count++);

  restored.world.restore(snapshot);

  assert.equal(count, 0);
  assert.deepEqual(restored.world.history(), source.world.history());
});
