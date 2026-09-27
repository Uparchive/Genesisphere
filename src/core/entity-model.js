const PHYSICAL_FIELDS = [
  "massSolar", "massEarth", "radiusSolar", "radiusEarth", "radiusAU",
  "temperatureK", "densityKgM3", "luminositySolar", "eventHorizonRadiusAU",
  "captureRadiusAU", "atmosphere", "earthLike", "life", "lifeStage"
];

/** Persistent identifier. A supplied id is retained exactly across adapters and saves. */
export function createEntityId(value) {
  if (value !== undefined && value !== null) {
    if (typeof value !== "string" || value.trim() === "") throw new Error("EntityId must be a non-empty string");
    return value;
  }
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== "function") throw new Error("A cryptographic UUID generator is required to create an EntityId");
  return randomUUID.call(globalThis.crypto);
}

function position(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y)
    ? Object.freeze({ x: value.x, y: value.y })
    : null;
}

/** Build the presentation-independent components while retaining the V1 flat fields. */
export function createEntityRecord({ id, type, schemaVersion = 1, createdAt = Date.now(), properties = {}, components = {} }) {
  if (typeof type !== "string" || type.trim() === "") throw new Error("Entity type must be a non-empty string");
  const entityId = createEntityId(id);
  const legacy = { ...properties };
  delete legacy.id;
  delete legacy.type;
  const parentIds = [...new Set([
    legacy.parentStarId,
    legacy.parentSystemId,
    legacy.systemId,
    legacy.universeId,
    legacy.regionId
  ].filter(value => typeof value === "string" && value.length > 0))];
  const physical = Object.fromEntries(PHYSICAL_FIELDS.filter(key => legacy[key] !== undefined).map(key => [key, legacy[key]]));
  const orbitSource = legacy.orbit && typeof legacy.orbit === "object" ? legacy.orbit : legacy;
  const hasOrbit = type === "cosmic.orbit" || type === "cosmic.terrestrial-planet" || legacy.orbitId != null;
  const modelComponents = {
    ...components,
    identity: Object.freeze({ id: entityId, type, schemaVersion, createdAt }),
    transform: Object.freeze({
      position: position(legacy.position),
      positionAU: position(legacy.positionAU),
      velocityAUPerSecond: position(legacy.velocityAUPerSecond),
      coordinateSystem: legacy.positionAU ? "AU" : "universe"
    }),
    physical: Object.freeze(physical),
    relations: Object.freeze({
      parentIds: Object.freeze(parentIds),
      parentId: parentIds[0] ?? null,
      systemId: legacy.systemId ?? null,
      universeId: legacy.universeId ?? null,
      regionId: legacy.regionId ?? null
    })
  };
  if (hasOrbit) {
    modelComponents.orbit = Object.freeze({
      orbitId: legacy.orbitId ?? (type === "cosmic.orbit" ? entityId : null),
      parentId: orbitSource.parentStarId ?? legacy.parentStarId ?? null,
      semiMajorAxisAU: orbitSource.semiMajorAxisAU ?? null,
      eccentricity: orbitSource.eccentricity ?? null,
      periodDays: orbitSource.periodDays ?? null,
      phaseRadians: orbitSource.phaseRadians ?? null
    });
  }
  return Object.freeze({
    id: entityId,
    type,
    schemaVersion,
    createdAt,
    ...legacy,
    components: Object.freeze(modelComponents)
  });
}

/** Compatibility factories for the current stellar and planetary records. */
export function createStarEntity({ id, schemaVersion = 1, createdAt, properties = {}, components }) {
  return createEntityRecord({ id, type: "cosmic.star", schemaVersion, createdAt, properties, components });
}

export function createPlanetEntity({ id, schemaVersion = 1, createdAt, properties = {}, components }) {
  return createEntityRecord({ id, type: "cosmic.terrestrial-planet", schemaVersion, createdAt, properties, components });
}

export function childEntitiesOf(world, parentId) {
  return world.all().filter(entity => entity.components?.relations?.parentIds?.includes(parentId)
    || (!entity.components?.relations && [entity.parentStarId, entity.parentSystemId, entity.systemId, entity.universeId, entity.regionId].includes(parentId)));
}
