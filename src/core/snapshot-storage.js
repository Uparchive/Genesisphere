import { migrateUniverseSnapshot, validateUniverseSnapshot } from "./persistence.js";

function readValid(storage, key) {
  try {
    const value = storage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value);
    const snapshot = parsed?.format === "genesisphere-snapshot" ? parsed.snapshot : parsed;
    return { raw: value, snapshot: validateUniverseSnapshot(migrateUniverseSnapshot(snapshot)) };
  } catch {
    return null;
  }
}

/** Load the newest valid browser snapshot, falling back to the preserved prior copy. */
export function loadSnapshotWithRecovery(storage, key) {
  const current = readValid(storage, key);
  if (current) return { snapshot: current.snapshot, recovered: false };
  const previous = readValid(storage, `${key}:previous`);
  return previous ? { snapshot: previous.snapshot, recovered: true } : { snapshot: null, recovered: false };
}

/** Keep the last valid snapshot before replacing the current browser save. */
export function saveSnapshotWithRecovery(storage, key, value) {
  const snapshot = validateUniverseSnapshot(migrateUniverseSnapshot(value));
  const current = readValid(storage, key);
  if (current) storage.setItem(`${key}:previous`, current.raw);
  const record = { format: "genesisphere-snapshot", savedAt: new Date().toISOString(), simulationTime: snapshot.simulationTime, schemaVersion: snapshot.schemaVersion, snapshot };
  storage.setItem(key, JSON.stringify(record));
  return record;
}
