import test from "node:test";
import assert from "node:assert/strict";
import { RENDER_ORIGIN_CELL_SIZE, SpatialCoordinateSystem, UNIVERSE_UNIT, spatialCoordinates } from "../src/core/spatial-coordinate-system.js";
import { screenAtWorld, worldAtScreen } from "../src/modules/infinite-space.js";

test("canonical universe coordinates use zoom-independent Universe Units", () => {
  assert.equal(UNIVERSE_UNIT, "UU");
  const target = { x: 1.25, y: -3.5 };
  assert.deepEqual(spatialCoordinates.teleportTarget(target), target);
  assert.notEqual(spatialCoordinates.teleportTarget(target), target);
});

test("floating-origin render deltas remain stable after translating far from zero", () => {
  const baseCenter = { x: -400, y: 750 };
  const basePoint = { x: -399.875, y: 749.75 };
  const offset = 1e12;
  const shiftedCenter = { x: baseCenter.x + offset, y: baseCenter.y - offset };
  const shiftedPoint = { x: basePoint.x + offset, y: basePoint.y - offset };
  assert.deepEqual(spatialCoordinates.worldDelta(shiftedPoint, shiftedCenter), spatialCoordinates.worldDelta(basePoint, baseCenter));
  assert.deepEqual(screenAtWorld(shiftedPoint, shiftedCenter, 1200, 800, 1.4), screenAtWorld(basePoint, baseCenter, 1200, 800, 1.4));
});

test("cursor conversion and rendering remain inverse at a large canonical position", () => {
  const center = { x: 1e9 + 256, y: -1e9 - 512 };
  const cursor = { x: 913, y: 127 };
  const world = worldAtScreen(cursor, center, 1366, 768, 2.75);
  const screen = screenAtWorld(world, center, 1366, 768, 2.75);
  assert.ok(Math.abs(screen.x - cursor.x) < 0.01);
  assert.ok(Math.abs(screen.y - cursor.y) < 0.01);
});

test("render origin is camera-relative and rejects invalid canonical positions", () => {
  const space = new SpatialCoordinateSystem();
  const center = { x: -RENDER_ORIGIN_CELL_SIZE * 2.4, y: RENDER_ORIGIN_CELL_SIZE * 3.2 };
  assert.deepEqual(space.renderOrigin(center), { x: -2048, y: 3072 });
  assert.throws(() => space.teleportTarget({ x: Infinity, y: 0 }), /finite/);
});
