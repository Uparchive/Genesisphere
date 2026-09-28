const SNAPSHOT_SCHEMA_VERSION = 1;
const DERIVED_COMPONENTS = new Set(["identity", "transform", "physical", "relations", "orbit"]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Convert an Entity Model record into stable, storage-facing data. */
export function serializeEntity(entity) {
  if (!isRecord(entity) || typeof entity.id !== "string" || typeof entity.type !== "string") {
    throw new Error("Invalid entity for persistence");
  }
  const properties = Object.fromEntries(Object.entries(entity).filter(([key]) => !["id", "type", "schemaVersion", "createdAt", "components"].includes(key)));
  const components = Object.fromEntries(Object.entries(entity.components || {}).filter(([key]) => !DERIVED_COMPONENTS.has(key)));
  return cloneJson({ id: entity.id, type: entity.type, schemaVersion: entity.schemaVersion ?? 1, createdAt: entity.createdAt, properties, components });
}

/** Rebuild an Entity Model input; WorldStore recreates derived components. */
export function deserializeEntity(value) {
  return { id: value.id, type: value.type, schemaVersion: value.schemaVersion, createdAt: value.createdAt, ...cloneJson(value.properties), components: cloneJson(value.components || {}) };
}

export function serializeUniverseSnapshot({ simulationTime, timeScale = 1, paused = false, world, gravity }) {
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    simulationTime,
    timeScale,
    paused: Boolean(paused),
    world: { version: 1, entities: world.entities.map(serializeEntity), events: cloneJson(world.events || []) },
    gravity: cloneJson(gravity)
  };
  return validateUniverseSnapshot(snapshot);
}

/** Migrate the original untagged-by-schema version:1 save envelope to schema v1. */
export function migrateUniverseSnapshot(value) {
  if (!isRecord(value)) throw new Error("Invalid universe snapshot");
  if (value.schemaVersion === SNAPSHOT_SCHEMA_VERSION) return cloneJson(value);
  if (value.schemaVersion !== undefined) throw new Error(`Unsupported universe snapshot schema: ${value.schemaVersion}`);
  if (value.version !== 1) throw new Error("Unsupported legacy universe snapshot");
  const world = value.world;
  if (!isRecord(world) || !Array.isArray(world.entities)) throw new Error("Invalid legacy world snapshot");
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    simulationTime: value.simulationTime,
    timeScale: value.timeScale ?? 1,
    paused: value.paused ?? false,
    world: {
      version: 1,
      entities: world.entities.map(entity => {
        if (isRecord(entity) && isRecord(entity.properties)) return entity;
        const { id, type, schemaVersion = 1, createdAt, components, ...properties } = entity || {};
        const customComponents = Object.fromEntries(Object.entries(components || {}).filter(([key]) => !DERIVED_COMPONENTS.has(key)));
        return { id, type, schemaVersion, createdAt, properties, components: customComponents };
      }),
      events: world.events || []
    },
    gravity: value.gravity
  };
}

export function validateUniverseSnapshot(value) {
  if (!isRecord(value) || value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error("Unsupported universe snapshot schema");
  if (!Number.isFinite(value.simulationTime) || value.simulationTime < 0) throw new Error("Invalid snapshot simulation time");
  if (!Number.isFinite(value.timeScale) || value.timeScale <= 0 || value.timeScale > 64) throw new Error("Invalid snapshot time scale");
  if (typeof value.paused !== "boolean") throw new Error("Invalid snapshot paused flag");
  if (!isRecord(value.world) || value.world.version !== 1 || !Array.isArray(value.world.entities) || !Array.isArray(value.world.events)) throw new Error("Invalid snapshot world");
  const ids = new Set();
  for (const entity of value.world.entities) {
    if (!isRecord(entity) || typeof entity.id !== "string" || !entity.id.trim() || typeof entity.type !== "string" || !entity.type.trim() || !Number.isInteger(entity.schemaVersion) || entity.schemaVersion < 1 || !Number.isFinite(entity.createdAt) || !isRecord(entity.properties) || !isRecord(entity.components)) throw new Error("Invalid snapshot entity");
    if (ids.has(entity.id)) throw new Error("Duplicate snapshot entity id");
    ids.add(entity.id);
  }
  for (const entity of value.world.entities) {
    for (const field of ["universeId", "systemId", "parentSystemId", "parentStarId", "orbitId", "regionId"]) {
      const relation = entity.properties[field];
      if (relation !== undefined && relation !== null && typeof relation !== "string") throw new Error(`Invalid entity relation: ${field}`);
    }
  }
  if (value.world.events.length > 500) throw new Error("Snapshot event history exceeds limit");
  if (!isRecord(value.gravity) || value.gravity.version !== 1 || !Array.isArray(value.gravity.states) || !Array.isArray(value.gravity.trails) || !Array.isArray(value.gravity.habitability)) throw new Error("Invalid snapshot physics checkpoint");
  for (const collection of [value.gravity.states, value.gravity.trails, value.gravity.habitability]) {
    for (const entry of collection) if (!Array.isArray(entry) || typeof entry[0] !== "string") throw new Error("Invalid snapshot physics entry");
  }
  for (const [id, state] of value.gravity.states) if (!isRecord(state) || ![state.x, state.y, state.vx, state.vy].every(Number.isFinite)) throw new Error(`Invalid physics state for ${id}`);
  for (const [id, points] of value.gravity.trails) if (!Array.isArray(points) || points.length > 180 || points.some(point => !isRecord(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error(`Invalid physics trail for ${id}`);
  for (const [id, habitability] of value.gravity.habitability) if (typeof habitability !== "string") throw new Error(`Invalid habitability state for ${id}`);
  return cloneJson(value);
}

/** Decode the external contract into the current runtime's internal snapshot shape. */
export function deserializeUniverseSnapshot(value) {
  const snapshot = validateUniverseSnapshot(migrateUniverseSnapshot(value));
  return {
    version: 1,
    simulationTime: snapshot.simulationTime,
    timeScale: snapshot.timeScale,
    paused: snapshot.paused,
    world: { version: 1, entities: snapshot.world.entities.map(deserializeEntity), events: cloneJson(snapshot.world.events) },
    gravity: cloneJson(snapshot.gravity)
  };
}
