import { TimeEngine } from "./time-engine.js";

/** Maximum simulated time integrated during one Durable Object alarm. */
export const MAX_OFFLINE_SIMULATION_STEP_MS = 30_000;
const CLOCK_TOLERANCE_MS = 1e-7;

/**
 * Build one deterministic, bounded offline advancement from persisted clock data.
 * The returned wall-clock cursor is committed with the matching snapshot so a
 * retried alarm cannot apply the same interval twice.
 */
export function planOfflineCatchUp({
  now,
  processedWallMs,
  simulationTime,
  snapshotSimulationTime,
  timeScale,
  paused = false,
  maxSimulationStepMs = MAX_OFFLINE_SIMULATION_STEP_MS
}) {
  if (![now, processedWallMs].every(Number.isFinite) || now < 0 || processedWallMs < 0) {
    throw new Error("Invalid persisted wall clock");
  }
  if (now < processedWallMs) throw new Error("Wall clock moved backwards");
  if (!Number.isFinite(simulationTime) || simulationTime < 0
    || !Number.isFinite(snapshotSimulationTime) || snapshotSimulationTime < 0
    || Math.abs(simulationTime - snapshotSimulationTime) > CLOCK_TOLERANCE_MS) {
    throw new Error("Persisted simulation clock does not match snapshot");
  }
  if (!Number.isFinite(timeScale) || timeScale <= 0 || timeScale > 64) {
    throw new Error("Invalid persisted time scale");
  }
  if (typeof paused !== "boolean") throw new Error("Invalid persisted pause state");
  if (!Number.isFinite(maxSimulationStepMs) || maxSimulationStepMs <= 0) {
    throw new Error("Invalid catch-up step limit");
  }

  const elapsedWallMs = now - processedWallMs;
  const clock = new TimeEngine({ realTime: processedWallMs, simulationTime, timeScale, paused });
  // Ask TimeEngine for the configured simulation rate instead of duplicating
  // the game's reference scale conversion here.
  const unitRate = new TimeEngine({ timeScale, paused: false }).advance(1).simulationDeltaMs;
  const processedRealMs = paused ? elapsedWallMs : Math.min(elapsedWallMs, maxSimulationStepMs / unitRate);
  const advancement = clock.advance(processedRealMs);
  if (advancement.simulationTime > simulationTime + maxSimulationStepMs + CLOCK_TOLERANCE_MS) {
    throw new Error("Catch-up exceeded its simulation step limit");
  }
  return Object.freeze({
    processedWallMs: advancement.realTime,
    simulationTime: advancement.simulationTime,
    simulationDeltaMs: advancement.simulationDeltaMs,
    processedRealMs,
    elapsedWallMs,
    remainingWallMs: Math.max(0, now - advancement.realTime)
  });
}
