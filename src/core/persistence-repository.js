import { migrateUniverseSnapshot, validateUniverseSnapshot } from "./persistence.js";

function keyFor(userId, universeId) {
  if (typeof userId !== "string" || !userId.trim()) throw new TypeError("userId is required");
  if (typeof universeId !== "string" || !universeId.trim() || universeId.length > 128) throw new TypeError("universeId is required");
  return JSON.stringify([userId, universeId]);
}

function copySnapshot(snapshot) {
  return validateUniverseSnapshot(migrateUniverseSnapshot(structuredClone(snapshot)));
}

/** Stable application-facing persistence contract. Implementations never own Core state. */
export class PersistenceRepository {
  async load(_scope) { throw new Error("PersistenceRepository.load must be implemented"); }
  async save(_request) { throw new Error("PersistenceRepository.save must be implemented"); }
}

/** Isolated, deterministic repository for Core and application tests. */
export class InMemoryPersistenceRepository extends PersistenceRepository {
  #records = new Map();

  async load({ userId, universeId }) {
    const record = this.#records.get(keyFor(userId, universeId));
    return record ? { snapshot: copySnapshot(record.snapshot), revision: record.revision } : { snapshot: null, revision: 0 };
  }

  async save({ userId, universeId, snapshot, expectedRevision = 0, operationId }) {
    const key = keyFor(userId, universeId);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new TypeError("expectedRevision must be a non-negative integer");
    if (typeof operationId !== "string" || !operationId.trim()) throw new TypeError("operationId is required");
    const existing = this.#records.get(key);
    if (existing?.operationId === operationId) return { saved: true, revision: existing.revision, idempotent: true };
    const currentRevision = existing?.revision || 0;
    if (currentRevision !== expectedRevision) {
      const error = new Error("Persistence revision conflict");
      error.code = "PERSISTENCE_CONFLICT";
      error.currentRevision = currentRevision;
      throw error;
    }
    const safeSnapshot = copySnapshot(snapshot);
    const revision = currentRevision + 1;
    this.#records.set(key, { snapshot: safeSnapshot, revision, operationId });
    return { saved: true, revision, idempotent: false };
  }
}

export function persistenceScopeKey(userId, universeId) {
  return keyFor(userId, universeId);
}
