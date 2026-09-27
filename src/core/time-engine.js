/**
 * Session clock for deterministic universe advancement.
 * Simulation time is measured in the existing simulation milliseconds used by
 * orbital systems. At 1x, one real day represents 1,000 simulated years.
 */
export const SIMULATED_YEARS_PER_REAL_DAY = 1_000;
export const SIMULATED_DAYS_PER_SIMULATION_SECOND = 36;
export const REAL_DAY_MS = 24 * 60 * 60 * 1_000;
export const SIMULATION_MS_PER_REAL_MS =
  (SIMULATED_YEARS_PER_REAL_DAY * 365.25 / SIMULATED_DAYS_PER_SIMULATION_SECOND)
  / (REAL_DAY_MS / 1_000);

export class TimeEngine {
  constructor({ simulationTime = 0, timeScale = 1, paused = false, realTime = 0 } = {}) {
    this.setSimulationTime(simulationTime);
    this.setTimeScale(timeScale);
    this.setRealTime(realTime);
    this.paused = Boolean(paused);
  }

  setRealTime(value) {
    if (!Number.isFinite(value) || value < 0) throw new Error("Real time must be a non-negative finite number");
    this.realTime = value;
    return value;
  }

  setSimulationTime(value) {
    if (!Number.isFinite(value) || value < 0) throw new Error("Simulation time must be a non-negative finite number");
    this.simulationTime = value;
    return value;
  }

  setTimeScale(value) {
    if (!Number.isFinite(value) || value <= 0) throw new Error("Time scale must be a positive finite number");
    this.timeScale = value;
    return value;
  }

  setPaused(value) {
    this.paused = Boolean(value);
    return this.paused;
  }

  /** Advance from an explicit real-time interval; does not read timers or UI state. */
  advance(realDeltaMs) {
    if (!Number.isFinite(realDeltaMs) || realDeltaMs < 0) {
      throw new Error("Real time delta must be a non-negative finite number");
    }
    const previousSimulationTime = this.simulationTime;
    const simulationDeltaMs = this.paused
      ? 0
      : realDeltaMs * SIMULATION_MS_PER_REAL_MS * this.timeScale;
    if (!Number.isFinite(this.realTime + realDeltaMs) || !Number.isFinite(this.simulationTime + simulationDeltaMs)) {
      throw new Error("Time advancement exceeds the finite clock range");
    }
    this.realTime += realDeltaMs;
    this.simulationTime += simulationDeltaMs;
    return Object.freeze({
      realTime: this.realTime,
      simulationTime: this.simulationTime,
      realDeltaMs,
      simulationDeltaMs,
      previousSimulationTime
    });
  }
}
