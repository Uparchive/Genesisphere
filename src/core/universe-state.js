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
export function createLegacyUniverseAdapter(state, dispatch = null) {
  return Object.freeze({
    state,
    world: state.world,
    get simulationTime() { return state.simulationTime; },
    set simulationTime(value) { if (dispatch) dispatch({ type: "SetSimulationTime", value }); else state.setSimulationTime(value); },
    get timeScale() { return state.timeScale; },
    set timeScale(value) { if (dispatch) dispatch({ type: "SetTimeScale", value }); else state.setTimeScale(value); },
    get paused() { return state.paused; },
    set paused(value) { if (dispatch) dispatch({ type: "SetPaused", value }); else state.paused = Boolean(value); },
    getSimulationTime: () => state.simulationTime,
    setSimulationTime: value => dispatch ? dispatch({ type: "SetSimulationTime", value }) : state.setSimulationTime(value),
    getPaused: () => state.paused,
    setPaused: value => dispatch ? dispatch({ type: "SetPaused", value }) : (state.paused = Boolean(value)),
    getTimeScale: () => state.timeScale,
    setTimeScale: value => dispatch ? dispatch({ type: "SetTimeScale", value }) : state.setTimeScale(value)
  });
}
