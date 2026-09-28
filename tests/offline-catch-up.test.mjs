import test from "node:test";
import assert from "node:assert/strict";
import { MAX_OFFLINE_SIMULATION_STEP_MS, planOfflineCatchUp } from "../src/core/offline-catch-up.js";
import { TimeEngine } from "../src/core/time-engine.js";

function plan(overrides = {}) {
  return planOfflineCatchUp({
    now: 10_000,
    processedWallMs: 0,
    simulationTime: 500,
    snapshotSimulationTime: 500,
    timeScale: 1,
    ...overrides
  });
}

test("offline catch-up uses the persisted scale and TimeEngine conversion", () => {
  const scaled = plan({ timeScale: 4 });
  const expected = new TimeEngine({ simulationTime: 500, timeScale: 4 }).advance(scaled.processedRealMs);
  assert.equal(scaled.simulationTime, expected.simulationTime);
  assert.equal(scaled.processedWallMs, scaled.processedRealMs);
});

test("long downtime is processed in bounded deterministic stages", () => {
  const now = 24 * 60 * 60 * 1_000;
  let cursor = 0;
  let simulationTime = 500;
  let totalSimulationDelta = 0;
  let planCount = 0;
  while (cursor < now) {
    const step = plan({ now, processedWallMs: cursor, simulationTime, snapshotSimulationTime: simulationTime });
    assert.ok(step.simulationDeltaMs <= MAX_OFFLINE_SIMULATION_STEP_MS + 1e-7);
    assert.ok(step.processedRealMs > 0);
    cursor = step.processedWallMs;
    simulationTime = step.simulationTime;
    totalSimulationDelta += step.simulationDeltaMs;
    planCount += 1;
    assert.ok(planCount < 1_000);
  }
  const expected = new TimeEngine({ simulationTime: 500 }).advance(now);
  assert.equal(cursor, now);
  assert.ok(planCount > 1);
  assert.ok(Math.abs(simulationTime - expected.simulationTime) < 1e-7);
  assert.ok(Math.abs(totalSimulationDelta - (expected.simulationTime - 500)) < 1e-7);
});

test("retrying the same instant after its cursor was committed applies no interval twice", () => {
  const first = plan({ now: 1_000 });
  const retry = plan({ now: 1_000, processedWallMs: first.processedWallMs, simulationTime: first.simulationTime, snapshotSimulationTime: first.simulationTime });
  assert.equal(retry.processedRealMs, 0);
  assert.equal(retry.simulationDeltaMs, 0);
  assert.equal(retry.simulationTime, first.simulationTime);
});

test("paused universes move the wall cursor without advancing simulation", () => {
  const paused = plan({ now: 20_000, paused: true });
  assert.equal(paused.processedWallMs, 20_000);
  assert.equal(paused.remainingWallMs, 0);
  assert.equal(paused.simulationTime, 500);
  assert.equal(paused.simulationDeltaMs, 0);
});

test("invalid persisted clock data is rejected before a catch-up plan is produced", () => {
  assert.throws(() => plan({ now: -1 }), /Invalid persisted wall clock/);
  assert.throws(() => plan({ now: 1, processedWallMs: 2 }), /moved backwards/);
  assert.throws(() => plan({ simulationTime: 501 }), /does not match snapshot/);
  assert.throws(() => plan({ timeScale: 65 }), /Invalid persisted time scale/);
  assert.throws(() => plan({ paused: "false" }), /pause state/);
});
