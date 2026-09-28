import { DomainError } from "./command-bus.js";
import { MechanicRegistry } from "./mechanic-registry.js";

export class PowerRegistry extends MechanicRegistry {
  constructor() {
    super({ kind: "power" });
  }

  /** Return only the UI contract for powers that opt into a presentation. */
  catalog() {
    return this.all()
      .filter(power => power.presentation)
      .map(power => Object.freeze({ id: power.id, ...power.presentation }));
  }

  getPresentation(id) {
    const power = this.get(id);
    return power?.presentation ? Object.freeze({ id: power.id, ...power.presentation }) : null;
  }

  /** Ask the Core validator whether a concrete power request can run. */
  checkAvailability(id, engine, input = {}) {
    const power = this.get(id);
    if (!power) return Object.freeze({ available: false, reason: `Unknown power: ${id}`, code: "UNKNOWN_POWER" });

    if (power.sdk) {
      const missing = power.requirements
        .filter(requirement => requirement.required && (
          input?.[requirement.key] === undefined ||
          input?.[requirement.key] === null ||
          input?.[requirement.key] === ""
        ))
        .map(requirement => requirement.key);
      if (missing.length) {
        return Object.freeze({ available: false, reason: `Missing requirements: ${missing.join(", ")}`, code: "POWER_VALIDATION_FAILED" });
      }
    }

    const context = this.createContext(engine);
    const args = power.sdk ? { context, input } : { engine, input };
    try {
      const result = power.validate(args);
      return result === true
        ? Object.freeze({ available: true, reason: "", code: null })
        : Object.freeze({ available: false, reason: typeof result === "string" ? result : `Validation failed: ${id}`, code: "POWER_VALIDATION_FAILED" });
    } catch (error) {
      return Object.freeze({ available: false, reason: error?.message || `Validation failed: ${id}`, code: error?.code || "POWER_VALIDATION_FAILED" });
    }
  }

  execute(id, engine, input = {}) {
    try {
      const result = super.execute(id, engine, input);
      const power = this.get(id);
      engine.bus.emit("power:used", Object.freeze({
        powerId: power.id,
        powerVersion: power.version || "1.0.0",
        input: { ...input },
        result,
        at: Date.now()
      }));
      return result;
    } catch (error) {
      if (error instanceof DomainError && ["UNKNOWN_MECHANIC", "MECHANIC_REQUIREMENTS_FAILED", "MECHANIC_VALIDATION_FAILED"].includes(error.code)) {
        throw new DomainError(
          error.code === "UNKNOWN_MECHANIC" ? "UNKNOWN_POWER" : "POWER_VALIDATION_FAILED",
          error.message,
          { ...error.details, powerId: id }
        );
      }
      throw error;
    }
  }
}
