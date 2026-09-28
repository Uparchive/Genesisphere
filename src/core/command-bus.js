import { DomainEvent } from "./event-bus.js";

/** A stable, machine-readable failure returned by Core command validation. */
export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

/** Routes all supported canonical mutations through validated Core handlers. */
export class CommandBus {
  constructor(engine) {
    this.engine = engine;
    this.handlers = new Map();
    this.transactional = new Set(["ExecutePower"]);
    this.depth = 0;
    this.register("CreateEntity", command => this.engine.createEntity(command.entityType, command.properties));
    this.register("RemoveEntity", command => this.engine.removeEntity(command.entityId));
    this.register("SetEntityProperty", command => this.engine.updateEntityProperties(command.entityId, { [command.property]: command.value }));
    this.register("UpdateEntity", command => this.engine.updateEntityProperties(command.entityId, command.changes));
    this.register("RestoreWorldSnapshot", command => this.engine.world.restore(command.snapshot));
    this.register("ExecutePower", command => this.engine.executePower(command.powerId, command.input));
    this.register("StartBigBang", command => this.engine.bigBang.start(command.input));
    this.register("UpdateBigBang", command => this.engine.bigBang.update(command.input));
    this.register("RecordWorldEvent", command => this.engine.world.record(command.kind, command.details));
    this.register("SetSimulationTime", command => this.engine.state.setSimulationTime(command.value));
    this.register("SetTimeScale", command => this.engine.state.setTimeScale(command.value));
    this.register("SetPaused", command => { this.engine.state.paused = Boolean(command.value); return this.engine.state.paused; });
    this.register("AdvanceSimulationTime", command => {
      if (!Number.isFinite(command.deltaMs) || command.deltaMs < 0) throw new DomainError("INVALID_TIME_DELTA", "Simulation time delta must be a non-negative finite number", { deltaMs: command.deltaMs });
      const previousTime = this.engine.state.simulationTime;
      const currentTime = this.engine.state.setSimulationTime(previousTime + command.deltaMs);
      if (currentTime > previousTime) {
        this.engine.bus.emit(DomainEvent.TimeAdvanced, Object.freeze({
          previousTime,
          currentTime,
          deltaMs: currentTime - previousTime
        }));
      }
      return currentTime;
    });
    this.register("AdvanceRealTime", command => {
      if (!Number.isFinite(command.deltaMs) || command.deltaMs < 0) throw new DomainError("INVALID_TIME_DELTA", "Real time delta must be a non-negative finite number", { deltaMs: command.deltaMs });
      const advancement = this.engine.state.time.advance(command.deltaMs);
      if (advancement.simulationDeltaMs > 0) {
        this.engine.bus.emit(DomainEvent.TimeAdvanced, Object.freeze({
          previousTime: advancement.previousSimulationTime,
          currentTime: advancement.simulationTime,
          deltaMs: advancement.simulationDeltaMs,
          realTime: advancement.realTime,
          realDeltaMs: advancement.realDeltaMs
        }));
      }
      return advancement;
    });
  }

  register(type, handler, { transactional = false } = {}) {
    if (typeof type !== "string" || !type.trim() || typeof handler !== "function") {
      throw new TypeError("A command handler requires a type and function");
    }
    if (this.handlers.has(type)) throw new DomainError("COMMAND_HANDLER_EXISTS", `Command handler already registered: ${type}`, { type });
    this.handlers.set(type, handler);
    if (transactional) this.transactional.add(type);
    return this;
  }

  dispatch(command) {
    if (!command || typeof command.type !== "string") {
      throw new DomainError("INVALID_COMMAND", "A command requires a type");
    }
    const handler = this.handlers.get(command.type);
    if (!handler) throw new DomainError("UNKNOWN_COMMAND", `Unknown command: ${command.type}`, { type: command.type });

    const outermost = this.depth === 0;
    const atomic = outermost && this.transactional.has(command.type);
    const checkpoint = atomic ? this.engine.world.snapshot() : null;
    if (atomic) this.engine.bus.beginTransaction();
    this.depth += 1;
    let result;
    try {
      result = handler(Object.freeze({ ...command }));
    } catch (error) {
      this.depth -= 1;
      if (atomic) {
        this.engine.world.restore(checkpoint);
        this.engine.bus.rollbackTransaction();
      }
      if (error instanceof DomainError) throw error;
      throw new DomainError("COMMAND_REJECTED", error?.message || "Command was rejected", { type: command.type, cause: error?.name || "Error" });
    }
    this.depth -= 1;
    if (atomic) this.engine.bus.commitTransaction();
    return result;
  }
}
