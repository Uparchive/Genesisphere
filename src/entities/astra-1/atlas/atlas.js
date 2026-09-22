// Astra-1 canonical geography. Domain coordinates never depend on canvas pixels.
// Longitude: [-180, 180), latitude: [-90, 90]. Zero meridian and north pole
// are fixed in planet-local space; rendering/camera transforms are separate.
export const ASTRA_1_ATLAS = deepFreeze({
  id: "astra-1/atlas",
  schemaVersion: 1,
  coordinateSystem: {
    kind: "planetographic-degrees",
    longitude: { min: -180, maxExclusive: 180, wraps: true, unit: "degree" },
    latitude: { min: -90, max: 90, unit: "degree" },
    primeMeridianDegrees: 0,
    northPoleDegrees: 90,
  },
  // No canonical land or other geographic features are defined in mission 1.
  features: [],
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Longitude wraps at the antimeridian; latitude must be explicitly valid.
// These functions are pure and do not read time, randomness, viewport or DOM.
export function normalizeLongitude(longitude) {
  if (!Number.isFinite(longitude)) throw new RangeError("Longitude must be finite");
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function planetPoint(longitude, latitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError("Latitude must be finite and between -90 and 90");
  }
  return Object.freeze({ longitude: normalizeLongitude(longitude), latitude });
}

export function toNormalizedCoordinates(longitude, latitude) {
  const point = planetPoint(longitude, latitude);
  return Object.freeze({
    u: (point.longitude + 180) / 360,
    v: (90 - point.latitude) / 180,
  });
}
