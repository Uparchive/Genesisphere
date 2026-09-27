/** Uniform-grid index over canonical universe coordinates (UU). */
export class SpatialIndex {
  constructor({ cellSize = 1 } = {}) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new TypeError("Spatial cellSize must be positive and finite");
    this.cellSize = cellSize;
    this.entities = new Map();
    this.cells = new Map();
    this.regions = new Map();
    this.systemEntities = new Map();
    this.systemRegions = new Map();
    this.systemsByRegion = new Map();
    this.activeRegionId = null;
  }

  cellAt(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError("Spatial point must contain finite x and y coordinates");
    const x = Math.floor(point.x / this.cellSize), y = Math.floor(point.y / this.cellSize);
    return { x, y, id: `${x}:${y}` };
  }

  upsert(entity) {
    this.remove(entity.id);
    const point = entity.position ?? entity.components?.transform?.position;
    const cell = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? this.cellAt(point) : null;
    const record = { entity, cellId: cell?.id ?? null, regionId: entity.regionId ?? null, systemId: entity.type === "cosmic.star-system" ? entity.id : entity.systemId ?? null };
    this.entities.set(entity.id, record);
    if (cell) this.#add(this.cells, cell.id, entity.id);
    if (record.regionId) this.#add(this.regions, record.regionId, entity.id);
    if (record.systemId && entity.type !== "cosmic.star-system") this.#add(this.systemEntities, record.systemId, entity.id);
    if (entity.type === "cosmic.star-system") {
      const previous = this.systemRegions.get(entity.id);
      if (previous) this.#delete(this.systemsByRegion, previous, entity.id);
      this.#add(this.systemsByRegion, entity.id, entity.id);
      if (record.regionId) this.#add(this.systemsByRegion, record.regionId, entity.id);
      this.systemRegions.set(entity.id, record.regionId);
    }
  }

  remove(id) {
    const old = this.entities.get(id);
    if (!old) return;
    if (old.cellId) this.#delete(this.cells, old.cellId, id);
    if (old.regionId) this.#delete(this.regions, old.regionId, id);
    if (old.systemId && old.entity.type !== "cosmic.star-system") this.#delete(this.systemEntities, old.systemId, id);
    if (old.systemId && old.entity.type === "cosmic.star-system") {
      this.#delete(this.systemsByRegion, id, id);
      if (old.regionId) this.#delete(this.systemsByRegion, old.regionId, id);
      this.systemRegions.delete(id);
    }
    this.entities.delete(id);
  }

  update(entity) { this.upsert(entity); }

  regionAt(point) { return `region:${this.cellAt(point).id}`; }

  entitiesInRegion(regionId, { type } = {}) {
    const ids = new Set(this.regions.get(regionId) ?? []);
    if (typeof regionId === "string" && regionId.startsWith("region:")) {
      for (const id of this.cells.get(regionId.slice("region:".length)) ?? []) ids.add(id);
    }
    for (const systemId of this.systemsByRegion.get(regionId) ?? []) {
      for (const id of this.systemEntities.get(systemId) ?? []) ids.add(id);
    }
    return this.#records(ids, type);
  }

  nearby(point, radius, { regionId, type } = {}) {
    if (!Number.isFinite(radius) || radius < 0) throw new TypeError("Spatial radius must be finite and non-negative");
    const min = this.cellAt({ x: point.x - radius, y: point.y - radius });
    const max = this.cellAt({ x: point.x + radius, y: point.y + radius });
    const candidates = new Set();
    for (let x = min.x; x <= max.x; x++) for (let y = min.y; y <= max.y; y++) {
      for (const id of this.cells.get(`${x}:${y}`) ?? []) candidates.add(id);
    }
    return this.#records(candidates, type).filter(entity => {
      if (regionId && entity.regionId !== regionId && entity.systemId !== regionId && this.systemRegions.get(entity.systemId) !== regionId) return false;
      const position = entity.position ?? entity.components?.transform?.position;
      return Math.hypot(position.x - point.x, position.y - point.y) <= radius;
    });
  }

  nearest(point, { regionId, type, positionOf = entity => entity.position ?? entity.components?.transform?.position } = {}) {
    const candidates = regionId ? this.entitiesInRegion(regionId, { type }) : this.#records(this.entities.keys(), type);
    let nearest = null;
    for (const entity of candidates) {
      const position = positionOf(entity);
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
      const distance = Math.hypot(position.x - point.x, position.y - point.y);
      if (!nearest || distance < nearest.distance) nearest = { entity, position, distance };
    }
    return nearest;
  }

  setActiveRegion(regionId) { this.activeRegionId = regionId ?? null; }
  activeEntities(options) { return this.activeRegionId ? this.entitiesInRegion(this.activeRegionId, options) : []; }

  #records(ids, type) {
    const result = [];
    for (const id of ids) {
      const entity = this.entities.get(id)?.entity;
      if (entity && (!type || entity.type === type)) result.push(entity);
    }
    return result;
  }
  #add(map, key, id) { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(id); }
  #delete(map, key, id) { const values = map.get(key); if (!values) return; values.delete(id); if (!values.size) map.delete(key); }
}
