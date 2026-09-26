import test from "node:test";
import assert from "node:assert/strict";
import { createOrbitalCollisionSystem } from "../src/systems/stellar/orbital-collisions.js";

function createEngine(seed) {
  const entities = new Map(seed.map(entity => [entity.id, Object.freeze({ ...entity })]));
  const events = [];
  let nextId = 0;
  const world = {
    get: id => entities.get(id),
    has: id => entities.has(id),
    byType: type => [...entities.values()].filter(entity => entity.type === type),
    history: () => [...events],
    add(entity) { entities.set(entity.id, Object.freeze({ ...entity })); return entities.get(entity.id); },
    record(kind, details = {}) {
      const event = Object.freeze({ kind, ...details, at: details.at ?? 0 });
      events.push(event);
      return event;
    }
  };
  return {
    world,
    events,
    bus: { emit() {} },
    remove(id) {
      const entity = entities.get(id) ?? null;
      entities.delete(id);
      return entity;
    },
    create(type, props = {}) {
      const entity = {
        id: `remnant-${++nextId}`,
        type,
        ...props,
        planetKind: props.kind ?? "terrestrial-planet"
      };
      return world.add(entity);
    }
  };
}

const star = (id = "star-1", systemId = "system-1") => ({
  id, type: "cosmic.star", systemId, massSolar: 1, radiusSolar: 1, temperatureK: 5780
});

const planet = (id, semiMajorAxisAU, options = {}) => ({
  id,
  type: "cosmic.terrestrial-planet",
  name: id,
  systemId: options.systemId ?? "system-1",
  parentStarId: options.parentStarId ?? "star-1",
  planetKind: options.planetKind ?? "terrestrial",
  massEarth: options.massEarth ?? 1,
  radiusEarth: options.radiusEarth ?? 1,
  orbit: {
    semiMajorAxisAU,
    periodDays: options.periodDays ?? 365.25,
    eccentricity: options.eccentricity ?? 0
  }
});

test("planet entering the rendered star collision radius is ingested and logged", () => {
  const engine = createEngine([star(), planet("inner-planet", 0.36)]);
  const impacts = [];
  const collisions = createOrbitalCollisionSystem(engine, impact => impacts.push(impact));

  collisions.update(0);
  collisions.update(16);

  assert.equal(engine.world.has("inner-planet"), false);
  assert.equal(engine.events.filter(event => event.kind === "STELLAR_INGESTION").length, 1);
  assert.equal(impacts[0]?.kind, "STELLAR_INGESTION");
});

test("a planet outside the rendered stellar contact radius remains in orbit", () => {
  const engine = createEngine([star(), planet("outer-planet", 0.5)]);
  const collisions = createOrbitalCollisionSystem(engine);

  collisions.update(0);
  collisions.update(16);

  assert.equal(engine.world.has("outer-planet"), true);
  assert.equal(engine.events.some(event => event.kind === "STELLAR_INGESTION"), false);
});

test("overlapping planets in the same system merge into a logged remnant", () => {
  // "Aa" and "BB" have the same deterministic orbital phase.
  const engine = createEngine([
    star(),
    planet("Aa", 0.5),
    planet("BB", 0.5, { massEarth: 2 })
  ]);
  const collisions = createOrbitalCollisionSystem(engine);

  collisions.update(0);
  collisions.update(16);

  assert.equal(engine.events.filter(event => event.kind === "PLANET_COLLISION").length, 1);
  assert.equal(engine.world.byType("cosmic.terrestrial-planet").length, 1);
  assert.equal(engine.world.byType("cosmic.terrestrial-planet")[0].massEarth, 3);
});

test("planets in different systems never merge", () => {
  const engine = createEngine([
    star("star-1", "system-1"),
    star("star-2", "system-2"),
    planet("Aa", 0.5),
    planet("BB", 0.5, { systemId: "system-2", parentStarId: "star-2" })
  ]);
  const collisions = createOrbitalCollisionSystem(engine);

  collisions.update(0);
  collisions.update(16);

  assert.equal(engine.events.some(event => event.kind === "PLANET_COLLISION"), false);
  assert.equal(engine.world.byType("cosmic.terrestrial-planet").length, 2);
});
