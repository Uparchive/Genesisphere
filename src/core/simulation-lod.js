export const SIMULATION_LEVELS = Object.freeze({
  ACTIVE: "active",
  APPROXIMATE: "approximate",
  DORMANT: "dormant"
});

const VALID_LEVELS = new Set(Object.values(SIMULATION_LEVELS));

function entityPosition(entity) {
  const au = entity.positionAU ?? entity.components?.transform?.positionAU;
  if (au && Number.isFinite(au.x) && Number.isFinite(au.y)) return { x: au.x, y: au.y, space: "AU" };
  const position = entity.position ?? entity.components?.transform?.position;
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return { x: position.x, y: position.y, space: "UU" };
  }
  return null;
}

function validPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y)
    ? { x: point.x, y: point.y, space: point.space ?? point.coordinateSpace ?? "UU" }
    : null;
}

/** Core-owned simulation scheduling state. It never changes or annotates entities. */
export class SimulationLOD {
  constructor(world, {
    activeRadius = 1,
    activeExitRadius = activeRadius * 1.25,
    approximateRadius = 10,
    approximateExitRadius = approximateRadius * 1.2
  } = {}) {
    if (!world || typeof world.all !== "function") throw new TypeError("SimulationLOD requires a world store");
    if (![activeRadius, activeExitRadius, approximateRadius, approximateExitRadius].every(Number.isFinite)
      || activeRadius < 0 || activeExitRadius < activeRadius
      || approximateRadius < activeRadius || approximateExitRadius < approximateRadius) {
      throw new TypeError("Simulation LOD radii must be finite, non-negative, and ordered");
    }
    this.world = world;
    this.radii = Object.freeze({ active: activeRadius, activeExit: activeExitRadius, approximate: approximateRadius, approximateExit: approximateExitRadius });
    this.levels = new Map();
    this.counters = { evaluations: 0, transitions: 0, promotions: 0, demotions: 0, considered: 0 };
    this.lastTransitions = [];
  }

  /** Classify all current entities against a Core-supplied focus and relevant IDs. */
  evaluate({ focus, relevantIds = [] } = {}) {
    const origin = validPoint(focus);
    if (!origin) throw new TypeError("Simulation LOD evaluation requires a finite focus point");
    if (!Array.isArray(relevantIds) && !(relevantIds instanceof Set)) throw new TypeError("relevantIds must be an array or Set");
    const relevant = relevantIds instanceof Set ? relevantIds : new Set(relevantIds);
    const entities = this.world.all();
    const present = new Set(entities.map(entity => entity.id));
    for (const id of this.levels.keys()) if (!present.has(id)) this.levels.delete(id);

    const transitions = [];
    for (const entity of entities) {
      const from = this.levels.get(entity.id) ?? SIMULATION_LEVELS.ACTIVE;
      const position = entityPosition(entity);
      const distance = position?.space === origin.space ? Math.hypot(position.x - origin.x, position.y - origin.y) : null;
      let to = from;
      if (relevant.has(entity.id) || distance === null) {
        to = SIMULATION_LEVELS.ACTIVE;
      } else if (from === SIMULATION_LEVELS.ACTIVE) {
        to = distance <= this.radii.activeExit ? SIMULATION_LEVELS.ACTIVE
          : distance <= this.radii.approximate ? SIMULATION_LEVELS.APPROXIMATE : SIMULATION_LEVELS.DORMANT;
      } else if (from === SIMULATION_LEVELS.APPROXIMATE) {
        to = distance <= this.radii.active ? SIMULATION_LEVELS.ACTIVE
          : distance <= this.radii.approximateExit ? SIMULATION_LEVELS.APPROXIMATE : SIMULATION_LEVELS.DORMANT;
      } else {
        to = distance <= this.radii.active ? SIMULATION_LEVELS.ACTIVE
          : distance <= this.radii.approximate ? SIMULATION_LEVELS.APPROXIMATE : SIMULATION_LEVELS.DORMANT;
      }
      this.levels.set(entity.id, to);
      if (from !== to) transitions.push(Object.freeze({ entityId: entity.id, from, to, distance }));
    }

    this.counters.evaluations++;
    this.counters.considered += entities.length;
    this.counters.transitions += transitions.length;
    this.counters.promotions += transitions.filter(item => this.#rank(item.to) < this.#rank(item.from)).length;
    this.counters.demotions += transitions.filter(item => this.#rank(item.to) > this.#rank(item.from)).length;
    this.lastTransitions = Object.freeze(transitions);
    return this.snapshot();
  }

  levelOf(entityOrId) {
    const id = typeof entityOrId === "string" ? entityOrId : entityOrId?.id;
    return this.levels.get(id) ?? SIMULATION_LEVELS.ACTIVE;
  }

  entitiesAt(level) {
    if (!VALID_LEVELS.has(level)) throw new TypeError(`Unknown simulation LOD level: ${level}`);
    return this.world.all().filter(entity => this.levelOf(entity.id) === level);
  }

  snapshot() {
    const counts = { active: 0, approximate: 0, dormant: 0 };
    for (const entity of this.world.all()) counts[this.levelOf(entity.id)]++;
    return Object.freeze({
      levels: Object.freeze(counts),
      metrics: Object.freeze({ ...this.counters, lastTransitionCount: this.lastTransitions.length }),
      transitions: this.lastTransitions
    });
  }

  #rank(level) { return level === SIMULATION_LEVELS.ACTIVE ? 0 : level === SIMULATION_LEVELS.APPROXIMATE ? 1 : 2; }
}
