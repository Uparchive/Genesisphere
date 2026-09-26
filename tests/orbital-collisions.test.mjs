import test from "node:test";
import assert from "node:assert/strict";
import { asteroidPositionAt, createOrbitalCollisionSystem } from "../src/systems/stellar/orbital-collisions.js";
import { effectiveStellarState } from "../src/systems/stellar/stellar-state.js";

function createEngine(seed) {
  const entities = new Map(seed.map(entity => [entity.id, Object.freeze({ ...entity })]));
  const events = [];
  let nextId = 0;
  const world = {
    get: id => entities.get(id),
    has: id => entities.has(id),
    byType: type => [...entities.values()].filter(entity => entity.type === type),
    history: () => [...events],
    add(entity) {
      const saved = Object.freeze({ ...entity });
      entities.set(saved.id, saved);
      events.push({ kind: "ENTITY_CREATED", entity: saved, at: 0 });
      return saved;
    },
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
      if (entity) events.push({ kind: "ENTITY_DESTROYED", entity, at: 0 });
      entities.delete(id);
      return entity;
    },
    create(type, props = {}) {
      const entity = {
        id: `created-${++nextId}`,
        type,
        ...props,
        planetKind: props.kind ?? "terrestrial"
      };
      return world.add(entity);
    }
  };
}

const star = (id, options = {}) => ({
  id,
  type: "cosmic.star",
  systemId: options.systemId ?? "system-1",
  position: options.position ?? { x: 0.5, y: 0.5 },
  positionAU: options.positionAU ?? { x: 0, y: 0 },
  massSolar: options.massSolar ?? 1,
  radiusSolar: options.radiusSolar ?? 1,
  temperatureK: options.temperatureK ?? 5780,
  templateId: "star.g-type"
});

const planet = (id, semiMajorAxisAU, options = {}) => ({
  id,
  type: "cosmic.terrestrial-planet",
  name: options.name ?? id,
  systemId: options.systemId ?? "system-1",
  parentStarId: options.parentStarId ?? "star-1",
  planetKind: options.planetKind ?? "terrestrial",
  massEarth: options.massEarth ?? 1,
  radiusEarth: options.radiusEarth ?? 1,
  atmosphere: true,
  orbitId: options.orbitId ?? `orbit-${id}`,
  orbit: {
    semiMajorAxisAU,
    periodDays: options.periodDays ?? 365.25,
    eccentricity: options.eccentricity ?? 0,
    ...(options.phaseRadians === undefined ? {} : { phaseRadians: options.phaseRadians })
  }
});

const step = collisions => { collisions.update(0); return collisions.update(16); };

test("a planet is absorbed by any star it physically contacts in its system", () => {
  const engine = createEngine([
    star("star-1", { positionAU: { x: 0, y: 0 } }),
    star("star-2", { positionAU: { x: 0.7, y: 0 } }),
    planet("approaching-planet", 0.5, { phaseRadians: 0 })
  ]);
  const impacts = [];
  const collisions = createOrbitalCollisionSystem(engine, impact => impacts.push(impact));

  step(collisions);

  assert.equal(engine.world.has("approaching-planet"), false);
  assert.equal(engine.events.find(event => event.kind === "STELLAR_INGESTION")?.starId, "star-2");
  assert.equal(impacts[0]?.kind, "STELLAR_INGESTION");
});

test("a planet outside all stellar contact radii remains in orbit", () => {
  const engine = createEngine([
    star("star-1", { positionAU: { x: 0, y: 0 } }),
    planet("outer-planet", 0.5)
  ]);
  const collisions = createOrbitalCollisionSystem(engine);

  step(collisions);

  assert.equal(engine.world.has("outer-planet"), true);
  assert.equal(engine.events.some(event => event.kind === "STELLAR_INGESTION"), false);
});

test("overlapping planets shatter into moving asteroids with conserved mass", () => {
  // "Aa" and "BB" have the same deterministic orbital phase.
  const engine = createEngine([
    star("star-1"),
    planet("Aa", 0.5),
    planet("BB", 0.5, { massEarth: 2 })
  ]);
  const collisions = createOrbitalCollisionSystem(engine);

  step(collisions);

  const fragments = engine.world.byType("cosmic.asteroid");
  assert.equal(engine.events.filter(event => event.kind === "PLANET_COLLISION").length, 1);
  assert.equal(engine.world.has("Aa"), false);
  assert.equal(engine.world.has("BB"), false);
  assert.equal(fragments.length, 8);
  assert.ok(Math.abs(fragments.reduce((sum, fragment) => sum + fragment.massEarth, 0) - 3) < 1e-10);
  const before = fragments[0].positionAU;
  const after = asteroidPositionAt(fragments[0], 1016);
  assert.notDeepEqual(after, before);
  assert.equal(engine.events.find(event => event.kind === "PLANET_COLLISION").fragmentCount, 8);
});

test("planets orbiting different stars in one system shatter into asteroids", () => {
  const engine = createEngine([
    star("star-1", { positionAU: { x: 0, y: 0 } }),
    star("star-2", { positionAU: { x: 0.8, y: 0 } }),
    planet("planet-a", 0.4, { parentStarId: "star-1", phaseRadians: 0 }),
    planet("planet-b", 0.4, { parentStarId: "star-2", phaseRadians: Math.PI, massEarth: 2 })
  ]);
  const collisions = createOrbitalCollisionSystem(engine);

  step(collisions);

  const fragments = engine.world.byType("cosmic.asteroid");
  const event = engine.events.find(item => item.kind === "PLANET_COLLISION");
  assert.equal(engine.world.byType("cosmic.terrestrial-planet").length, 0);
  assert.equal(fragments.length, 8);
  assert.equal(event?.firstParentStarId, "star-1");
  assert.equal(event?.secondParentStarId, "star-2");
});

test("nearby stars merge and reparent planets from the absorbed star", () => {
  const engine = createEngine([
    star("star-1", { positionAU: { x: 0, y: 0 }, massSolar: 1 }),
    star("star-2", { positionAU: { x: 0.5, y: 0 }, massSolar: 2 }),
    planet("planet-b", 1, { parentStarId: "star-1" })
  ]);
  const collisions = createOrbitalCollisionSystem(engine);

  step(collisions);

  const stars = engine.world.byType("cosmic.star");
  const mergedPlanet = engine.world.get("planet-b");
  assert.equal(stars.length, 1);
  assert.equal(stars[0].id, "star-2");
  assert.equal(stars[0].massSolar, 3);
  assert.equal(mergedPlanet.parentStarId, "star-2");
  assert.ok(mergedPlanet.orbit.periodDays < 365.25);
  assert.ok(engine.events.some(event => event.kind === "STELLAR_MERGER"));
});

test("bodies in different systems do not collide", () => {
  const engine = createEngine([
    star("star-1", { systemId: "system-1", positionAU: { x: 0, y: 0 } }),
    star("star-2", { systemId: "system-2", positionAU: { x: 0.1, y: 0 } }),
    planet("Aa", 0.5, { systemId: "system-1", parentStarId: "star-1" }),
    planet("BB", 0.5, { systemId: "system-2", parentStarId: "star-2" })
  ]);
  const collisions = createOrbitalCollisionSystem(engine);

  step(collisions);

  assert.equal(engine.world.byType("cosmic.star").length, 2);
  assert.equal(engine.world.byType("cosmic.terrestrial-planet").length, 2);
  assert.equal(engine.events.some(event => event.kind === "PLANET_COLLISION" || event.kind === "STELLAR_MERGER"), false);
});

test("stellar ingestion before a merger is folded into the merger baseline only once", () => {
  const engine = createEngine([star("star-1", { massSolar: 1 })]);
  engine.world.record("STELLAR_INGESTION", { starId: "star-1", massEarth: 332946, at: 1, simulationTime: 1 });
  const mergedStar = { ...engine.world.get("star-1"), massSolar: 2 };
  engine.remove("star-1");
  engine.world.add(mergedStar);
  engine.world.record("STELLAR_MERGER", { starId: "star-1", massSolar: 2, at: 2, simulationTime: 2 });

  assert.equal(effectiveStellarState(engine, engine.world.get("star-1")).massSolar, 2);
});

const asteroid = (id, positionAU, velocityAUPerSecond, systemId = "system-1") => ({
  id, type: "cosmic.asteroid", systemId, positionAU, velocityAUPerSecond,
  epochSimulationTime: 0, massEarth: 0.25, radiusAU: 0.005
});

test("an asteroid is consumed when it crosses a star", () => {
  const engine = createEngine([
    star("star-1"),
    asteroid("rock", { x: 0.5, y: 0 }, { x: -20, y: 0 })
  ]);
  const collisions = createOrbitalCollisionSystem(engine);
  step(collisions);
  assert.equal(engine.world.has("rock"), false);
  assert.ok(engine.events.some(event => event.kind === "STELLAR_INGESTION" && event.asteroidId === "rock"));
});

test("an asteroid is destroyed by a planet impact while the planet survives", () => {
  const engine = createEngine([
    star("star-1"),
    planet("target", 0.5, { phaseRadians: 0 }),
    asteroid("rock", { x: 0.5, y: -1 }, { x: 0, y: 62.5 })
  ]);
  const collisions = createOrbitalCollisionSystem(engine);
  step(collisions);
  assert.equal(engine.world.has("rock"), false);
  assert.equal(engine.world.has("target"), true);
  assert.ok(engine.events.some(event => event.kind === "ASTEROID_PLANET_IMPACT" && event.planetId === "target"));
});
