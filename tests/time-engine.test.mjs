import test from "node:test";
import assert from "node:assert/strict";
import {
  REAL_DAY_MS,
  SIMULATION_MS_PER_REAL_MS,
  SIMULATED_DAYS_PER_SIMULATION_SECOND,
  SIMULATED_YEARS_PER_REAL_DAY,
  TimeEngine
} from "../src/core/time-engine.js";
import { createGenesisEngine } from "../src/game-engine.js";

test("the reference rate maps one real day to 1,000 simulated years", () => {
  const elapsed = new TimeEngine().advance(REAL_DAY_MS);
  const simulatedSeconds = elapsed.simulationDeltaMs / 1_000;
  const simulatedYears = simulatedSeconds * SIMULATED_DAYS_PER_SIMULATION_SECOND / 365.25;
  assert.ok(Math.abs(simulatedYears - SIMULATED_YEARS_PER_REAL_DAY) < 1e-9);
});

test("simulation advancement is equivalent across different real-time delta partitions", () => {
  const singleStep = new TimeEngine({ timeScale: 2.5 }).advance(90_000);
  const partitioned = new TimeEngine({ timeScale: 2.5 });
  for (const delta of [16, 34, 9_950, 40_000, 40_000]) partitioned.advance(delta);

  assert.equal(partitioned.realTime, singleStep.realTime);
  assert.ok(Math.abs(partitioned.simulationTime - singleStep.simulationTime) < 1e-8);
});

test("pause advances the real clock while leaving simulation time unchanged", () => {
  const clock = new TimeEngine({ simulationTime: 500, paused: true });
  const result = clock.advance(2_000);
  assert.equal(result.realTime, 2_000);
  assert.equal(result.simulationDeltaMs, 0);
  assert.equal(result.simulationTime, 500);
});

test("speed changes affect simulation time without changing elapsed real time", () => {
  const clock = new TimeEngine();
  clock.advance(1_000);
  clock.setTimeScale(4);
  clock.advance(1_000);

  assert.equal(clock.realTime, 2_000);
  assert.equal(clock.simulationTime, 5_000 * SIMULATION_MS_PER_REAL_MS);
});

test("the Core command advances through TimeEngine and emits logical time deltas", () => {
  const engine = createGenesisEngine();
  const events = [];
  engine.bus.on("time:advanced", event => events.push(event));
  const result = engine.commands.dispatch({ type: "AdvanceRealTime", deltaMs: 1_000 });

  assert.equal(result.realTime, 1_000);
  assert.equal(engine.state.simulationTime, result.simulationTime);
  assert.equal(events.length, 1);
  assert.equal(events[0].realDeltaMs, 1_000);
  assert.equal(events[0].deltaMs, result.simulationDeltaMs);
});
