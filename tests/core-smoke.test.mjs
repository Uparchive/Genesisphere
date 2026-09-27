import test from "node:test";
import assert from "node:assert/strict";
import { createGenesisEngine } from "../src/app.js";
import { createGravitySystem } from "../src/systems/stellar/orbital-collisions.js";

test("application startup composes the core and creates the initial Genesis universe", () => {
  const engine = createGenesisEngine();
  const universes = engine.world.byType("cosmic.empty-space");
  const systems = engine.world.byType("cosmic.star-system");

  assert.equal(universes.length, 1);
  assert.equal(universes[0].name, "Genesisphere");
  assert.equal(systems.length, 1);
  assert.equal(systems[0].name, "Genesis");
  assert.equal(systems[0].universeId, universes[0].id);
  assert.ok(engine.templates.get("star.g-type"));
  assert.ok(engine.powers);
});

test("engine creates a star and an orbiting planet through registered powers", () => {
  const engine = createGenesisEngine();
  const system = engine.world.byType("cosmic.star-system")[0];
  const star = engine.usePower("CREATE_STAR", {
    systemId: system.id,
    templateId: "star.g-type",
    name: "Regression Star",
    positionAU: { x: 0, y: 0 }
  });
  const { planet, orbit } = engine.usePower("CREATE_PLANET", {
    systemId: system.id,
    parentStarId: star.id,
    templateId: "planet.terrestrial",
    semiMajorAxisAU: 1,
    periodDays: 365.25,
    phaseRadians: 0
  });

  assert.equal(star.systemId, system.id);
  assert.equal(planet.systemId, system.id);
  assert.equal(planet.parentStarId, star.id);
  assert.equal(planet.orbitId, orbit.id);
  assert.equal(orbit.semiMajorAxisAU, 1);
});

test("simulation time advances an orbiting planet's canonical position", () => {
  const engine = createGenesisEngine();
  const system = engine.world.byType("cosmic.star-system")[0];
  const star = engine.usePower("CREATE_STAR", {
    systemId: system.id,
    templateId: "star.g-type",
    positionAU: { x: 0, y: 0 }
  });
  const { planet } = engine.usePower("CREATE_PLANET", {
    systemId: system.id,
    parentStarId: star.id,
    templateId: "planet.terrestrial",
    semiMajorAxisAU: 1,
    periodDays: 365.25,
    phaseRadians: 0
  });
  const gravity = createGravitySystem(engine);

  gravity.update(0);
  const initial = gravity.positionOf(planet);
  gravity.update(1000);
  const advanced = gravity.positionOf(planet);

  assert.ok(Math.hypot(advanced.x - initial.x, advanced.y - initial.y) > 0);
  assert.equal(engine.world.get(planet.id).id, planet.id);
});

test("JSON snapshot round-trip restores created celestial entities and history", () => {
  const source = createGenesisEngine();
  const system = source.world.byType("cosmic.star-system")[0];
  const star = source.usePower("CREATE_STAR", {
    systemId: system.id,
    templateId: "star.g-type",
    name: "Persisted Star",
    positionAU: { x: 0.2, y: -0.4 }
  });
  source.usePower("CREATE_PLANET", {
    systemId: system.id,
    parentStarId: star.id,
    templateId: "planet.terrestrial",
    semiMajorAxisAU: 1.25,
    periodDays: 510,
    phaseRadians: 0.4
  });
  const serialized = JSON.parse(JSON.stringify(source.world.snapshot()));
  const target = createGenesisEngine({ empty: false });

  target.world.restore(serialized);

  assert.deepEqual(target.world.all(), source.world.all());
  assert.deepEqual(target.world.history(), source.world.history());
  assert.equal(target.world.byType("cosmic.star")[0].name, "Persisted Star");
  assert.equal(target.world.byType("cosmic.terrestrial-planet")[0].orbit.phaseRadians, 0.4);
});
