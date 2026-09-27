import { WorldStore } from "./world-store.js";
import { TimeEngine } from "./time-engine.js";

/** Canonical, presentation-independent state for one running universe. */
export class UniverseState {
  constructor({ world = new WorldStore(), simulationTime = 0, timeScale = 1, paused = false, realTime = 0 } = {}) {
    this.world = world;
    this.time = new TimeEngine({ simulationTime, timeScale, paused, realTime });
  }

  get realTime() { return this.time.realTime; }
  get simulationTime() { return this.time.simulationTime; }
  get timeScale() { return this.time.timeScale; }
  get paused() { return this.time.paused; }
  set paused(value) { this.time.setPaused(value); }
  setSimulationTime(value) {
    return this.time.setSimulationTime(value);
  }

  setTimeScale(value) {
    return this.time.setTimeScale(value);
  }
}

/** Compatibility surface for the current UI and authentication adapter. */
export function createLegacyUniverseAdapter(state, dispatch = null) {
  return Object.freeze({
    state,
    world: state.world,
    get simulationTime() { return state.simulationTime; },
    set simulationTime(value) { if (dispatch) dispatch({ type: "SetSimulationTime", value }); else state.setSimulationTime(value); },
    get realTime() { return state.realTime; },
    get timeScale() { return state.timeScale; },
    set timeScale(value) { if (dispatch) dispatch({ type: "SetTimeScale", value }); else state.setTimeScale(value); },
    get paused() { return state.paused; },
    set paused(value) { if (dispatch) dispatch({ type: "SetPaused", value }); else state.paused = Boolean(value); },
    getSimulationTime: () => state.simulationTime,
    getRealTime: () => state.realTime,
    setSimulationTime: value => dispatch ? dispatch({ type: "SetSimulationTime", value }) : state.setSimulationTime(value),
    getPaused: () => state.paused,
    setPaused: value => dispatch ? dispatch({ type: "SetPaused", value }) : (state.paused = Boolean(value)),
    getTimeScale: () => state.timeScale,
    setTimeScale: value => dispatch ? dispatch({ type: "SetTimeScale", value }) : state.setTimeScale(value)
  });
}
