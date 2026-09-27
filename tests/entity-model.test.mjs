import test from "node:test";
import assert from "node:assert/strict";
import { createEntityRecord, createPlanetEntity, createStarEntity } from "../src/core/entity-model.js";
import { createGenesisEngine } from "../src/app.js";

test("star and planet factories expose canonical components without removing legacy fields", () => {
  const star = createStarEntity({ id: "star-persistent", properties: { name: "Helios", systemId: "system-1", massSolar: 1.2, positionAU: { x: 0, y: 0 } } });
  const planet = createPlanetEntity({ id: "planet-persistent", properties: { name: "Astra", systemId: "system-1", parentStarId: star.id, orbitId: "orbit-1", massEarth: 1, orbit: { semiMajorAxisAU: 1.4, eccentricity: 0.02, periodDays: 510, phaseRadians: 0.5, parentStarId: star.id } } });

  assert.equal(star.id, "star-persistent");
  assert.equal(star.massSolar, 1.2);
  assert.equal(star.components.identity.id, star.id);
  assert.deepEqual(star.components.transform.positionAU, { x: 0, y: 0 });
  assert.equal(star.components.physical.massSolar, 1.2);
  assert.deepEqual(planet.components.relations.parentIds, [star.id, "system-1"]);
  assert.equal(planet.components.orbit.orbitId, "orbit-1");
  assert.equal(planet.components.orbit.semiMajorAxisAU, 1.4);
});

test("entity IDs and component model survive the existing version 1 JSON snapshot round-trip", () => {
  const engine = createGenesisEngine();
  const system = engine.world.byType("cosmic.star-system")[0];
  const star = engine.usePower("CREATE_STAR", { systemId: system.id, templateId: "star.g-type" });
  const { planet } = engine.usePower("CREATE_PLANET", { systemId: system.id, parentStarId: star.id, templateId: "planet.terrestrial", semiMajorAxisAU: 1, periodDays: 365.25 });
  const snapshot = JSON.parse(JSON.stringify(engine.world.snapshot()));
  const restored = createGenesisEngine({ empty: false });
  restored.world.restore(snapshot);

  assert.equal(snapshot.version, 1);
  assert.equal(restored.world.get(star.id).components.identity.id, star.id);
  assert.equal(restored.world.get(planet.id).components.identity.id, planet.id);
  assert.deepEqual(restored.world.snapshot(), snapshot);
  assert.ok(restored.world.childrenOf(star.id).some(entity => entity.id === planet.id));
});

test("model supports visual-free future entity types and adapts old flat records", () => {
  const future = createEntityRecord({ id: "probe-1", type: "cosmic.probe", properties: { position: { x: 8, y: -3 }, massEarth: 0.0001, systemId: "system-1" } });
  const engine = createGenesisEngine();
  engine.world.add({ id: "legacy-planet", type: "cosmic.terrestrial-planet", systemId: "system-1", parentStarId: "legacy-star", massEarth: 2, orbit: { semiMajorAxisAU: 2, periodDays: 900 } });
  const adapted = engine.world.get("legacy-planet");

  assert.equal(future.type, "cosmic.probe");
  assert.equal(future.components.physical.massEarth, 0.0001);
  assert.deepEqual(future.components.transform.position, { x: 8, y: -3 });
  assert.equal(Object.hasOwn(future.components, "renderer"), false);
  assert.equal(adapted.components.identity.id, adapted.id);
  assert.equal(adapted.components.orbit.semiMajorAxisAU, 2);
  assert.deepEqual(engine.world.childrenOf("legacy-star").map(entity => entity.id), ["legacy-planet"]);
});
