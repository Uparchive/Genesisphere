/** Presentation boundary. Implementations receive immutable view models only. */
export class Renderer {
  init() { throw new Error("Renderer.init must be implemented"); }
  update() { throw new Error("Renderer.update must be implemented"); }
  render() { throw new Error("Renderer.render must be implemented"); }
  dispose() { throw new Error("Renderer.dispose must be implemented"); }
}

export function createRenderViewModel({ entities, history = [], simulationTime, viewport, scene, camera }) {
  if (!Array.isArray(entities) || !Number.isFinite(simulationTime)) {
    throw new TypeError("Render view model requires entities and a finite simulationTime");
  }
  const freeze = value => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freeze(child);
    return Object.freeze(value);
  };
  return freeze(structuredClone({ entities, history, simulationTime, viewport, scene, camera }));
}
