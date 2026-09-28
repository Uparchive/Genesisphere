import test from "node:test";
import assert from "node:assert/strict";
import { createGenesisEngine } from "../src/game-engine.js";
import { DomainError } from "../src/core/command-bus.js";

test("entity creation, power execution, removal, and property changes use the Core command bus", () => {
  const engine = createGenesisEngine();
  const universe = engine.world.byType("cosmic.empty-space")[0];
  const system = engine.usePower("CREATE_SYSTEM", { universeId: universe.id, name: "Command System" });
  const star = engine.commands.dispatch({
    type: "CreateEntity",
    entityType: "cosmic.star",
    properties: { name: "Command Star", systemId: system.id }
  });

  assert.equal(star.name, "Command Star");
  assert.equal(engine.setEntityProperty(star.id, "name", "Updated Star").name, "Updated Star");
  assert.equal(engine.remove(star.id).name, "Updated Star");
  assert.equal(engine.world.has(star.id), false);
});

test("invalid commands and invalid power requests return stable domain errors without mutation", () => {
  const engine = createGenesisEngine();
  const before = engine.world.snapshot();

  assert.throws(
    () => engine.commands.dispatch({ type: "NotACommand" }),
    error => error instanceof DomainError && error.code === "UNKNOWN_COMMAND"
  );
  assert.throws(
    () => engine.usePower("CREATE_PLANET", {}),
    error => error instanceof DomainError && error.code === "POWER_VALIDATION_FAILED" && /Missing requirements for CREATE_PLANET:/.test(error.message)
  );
  assert.deepEqual(engine.world.snapshot(), before);
});

test("a failed multi-step command rolls back entities, history, and pending events", () => {
  const engine = createGenesisEngine();
  const before = engine.world.snapshot();
  const observed = [];
  engine.bus.on("entity:created", entity => observed.push(entity.id));
  engine.commands.register("FailAfterCreate", () => {
    engine.create("cosmic.star-system", { name: "Temporary" });
    throw new Error("planned failure");
  }, { transactional: true });

  assert.throws(
    () => engine.commands.dispatch({ type: "FailAfterCreate" }),
    error => error instanceof DomainError && error.code === "COMMAND_REJECTED" && error.message === "planned failure"
  );
  assert.deepEqual(engine.world.snapshot(), before);
  assert.deepEqual(observed, []);
});

test("unsupported or invalid property updates are rejected before state changes", () => {
  const engine = createGenesisEngine();
  const system = engine.world.byType("cosmic.star-system")[0];
  const before = engine.world.snapshot();

  assert.throws(() => engine.setEntityProperty(system.id, "rendererColor", "red"), error => error.code === "UNSUPPORTED_ENTITY_PROPERTY");
  assert.throws(() => engine.setEntityProperty(system.id, "position", { x: NaN, y: 0 }), error => error.code === "INVALID_PROPERTY_VALUE");
  assert.deepEqual(engine.world.snapshot(), before);
});

test("legacy time controls and frame advancement are routed through Core commands", () => {
  const engine = createGenesisEngine();
  engine.legacyUniverse.simulationTime = 10;
  engine.legacyUniverse.setTimeScale(3);
  engine.legacyUniverse.setPaused(true);
  assert.equal(engine.state.simulationTime, 10);
  assert.equal(engine.state.timeScale, 3);
  assert.equal(engine.state.paused, true);
  assert.throws(() => engine.commands.dispatch({ type: "AdvanceSimulationTime", deltaMs: -1 }), error => error.code === "INVALID_TIME_DELTA");
  assert.equal(engine.state.simulationTime, 10);
  engine.commands.dispatch({ type: "AdvanceSimulationTime", deltaMs: 25 });
  assert.equal(engine.state.simulationTime, 35);
});
