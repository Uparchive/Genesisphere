/**
 * Canonical universe coordinates are dimensionless Universe Units (UU).
 * Existing saved positions remain numbers in UU; astronomical system-local
 * positions continue to use AU and are never converted implicitly.
 *
 * Rendering uses a camera-relative, 1024 UU floating origin. Canonical values
 * remain independent of viewport size, zoom, canvas and DOM.
 */
export const UNIVERSE_UNIT = "UU";
export const RENDER_ORIGIN_CELL_SIZE = 1024;

function assertPoint(point, name = "point") {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${name} must contain finite x and y coordinates`);
  }
  return point;
}

function splitCoordinate(value) {
  const cell = Math.trunc(value / RENDER_ORIGIN_CELL_SIZE);
  return { cell, offset: value - cell * RENDER_ORIGIN_CELL_SIZE };
}

function relativeCoordinate(value, origin) {
  const a = splitCoordinate(value);
  const b = splitCoordinate(origin);
  return (a.cell - b.cell) * RENDER_ORIGIN_CELL_SIZE + (a.offset - b.offset);
}

/** Core-facing spatial API. It has no browser or renderer dependencies. */
export class SpatialCoordinateSystem {
  renderOrigin(center) {
    assertPoint(center, "center");
    return {
      x: Math.trunc(center.x / RENDER_ORIGIN_CELL_SIZE) * RENDER_ORIGIN_CELL_SIZE,
      y: Math.trunc(center.y / RENDER_ORIGIN_CELL_SIZE) * RENDER_ORIGIN_CELL_SIZE
    };
  }

  /** Return a short camera-relative delta before converting to screen pixels. */
  worldDelta(point, center) {
    assertPoint(point);
    assertPoint(center, "center");
    const origin = this.renderOrigin(center);
    return {
      x: relativeCoordinate(point.x, origin.x) - relativeCoordinate(center.x, origin.x),
      y: relativeCoordinate(point.y, origin.y) - relativeCoordinate(center.y, origin.y)
    };
  }

  addDelta(center, delta) {
    assertPoint(center, "center");
    assertPoint(delta, "delta");
    return {
      x: center.x + delta.x,
      y: center.y + delta.y
    };
  }

  teleportTarget(coordinates) {
    return { ...assertPoint(coordinates, "coordinates") };
  }
}

export const spatialCoordinates = new SpatialCoordinateSystem();
