import { WorldStore } from "./world-store.js";

/** Canonical, presentation-independent state for one running universe. */
export class UniverseState {
  constructor({ world = new WorldStore(), simulationTime = 0, timeScale = 1, paused = false } = {}) {
    this.world = world;
    this.setSimulationTime(simulationTime);
    this.setTimeScale(timeScale);
    this.paused = Boolean(paused);
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
}

/** Compatibility surface for the current UI and authentication adapter. */
export function createLegacyUniverseAdapter(state) {
  return Object.freeze({
    state,
    world: state.world,
    get simulationTime() { return state.simulationTime; },
    set simulationTime(value) { state.setSimulationTime(value); },
    get timeScale() { return state.timeScale; },
    set timeScale(value) { state.setTimeScale(value); },
    get paused() { return state.paused; },
    set paused(value) { state.paused = Boolean(value); },
    getSimulationTime: () => state.simulationTime,
    setSimulationTime: value => state.setSimulationTime(value),
    getPaused: () => state.paused,
    setPaused: value => { state.paused = Boolean(value); return state.paused; },
    getTimeScale: () => state.timeScale,
    setTimeScale: value => state.setTimeScale(value)
  });
}
