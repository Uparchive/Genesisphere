/** Domain event names published by Core. Existing event names remain stable. */
export const DomainEvent = Object.freeze({
  EntityCreated: "entity:created",
  EntityRemoved: "entity:destroyed",
  EntityChanged: "entity:updated",
  CollisionOccurred: "collision:occurred",
  TimeAdvanced: "time:advanced"
});

/** Synchronous, dependency-free event channel for Core facts and external adapters. */
export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.transactions = [];
    this.listenerErrors = [];
  }

  on(type, listener) {
    if (typeof type !== "string" || !type.trim() || typeof listener !== "function") {
      throw new TypeError("An event subscription requires a type and listener");
    }
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    const listeners = this.listeners.get(type);
    listeners.add(listener);
    return () => {
      const removed = listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(type);
      return removed;
    };
  }

  off(type, listener) {
    const listeners = this.listeners.get(type);
    if (!listeners) return false;
    const removed = listeners.delete(listener);
    if (listeners.size === 0) this.listeners.delete(type);
    return removed;
  }

  emit(type, payload) {
    if (typeof type !== "string" || !type.trim()) throw new TypeError("An event requires a type");
    if (this.transactions.length) {
      this.transactions.at(-1).push([type, payload]);
      return;
    }
    this.publish(type, payload);
  }

  beginTransaction() {
    this.transactions.push([]);
  }

  commitTransaction() {
    const events = this.transactions.pop();
    if (!events) return;
    if (this.transactions.length) this.transactions.at(-1).push(...events);
    else for (const [type, payload] of events) this.publish(type, payload);
  }

  rollbackTransaction() {
    return this.transactions.pop() !== undefined;
  }

  publish(type, payload) {
    // Snapshot the set so changes made by a listener apply to the next event.
    for (const listener of [...(this.listeners.get(type) || [])]) {
      try {
        listener(payload);
      } catch (error) {
        this.listenerErrors.push(Object.freeze({ type, error, at: Date.now() }));
        if (this.listenerErrors.length > 100) this.listenerErrors.shift();
      }
    }
  }
}
