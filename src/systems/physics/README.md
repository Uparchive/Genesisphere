# Physics Engine

`physics-engine.js` owns the current movement integration, gravity, orbital motion, collision detection/resolution, and derived habitability updates. It has no Canvas, DOM, renderer, or input-control dependency and can run against a headless Core engine.

## Boundary

```js
const physics = createPhysicsEngine(engine, onCollision?, options?);
physics.update(simulationTimeMs);
physics.positionOf(entityOrId);
physics.velocityOf(entityOrId);
physics.snapshot();
physics.restore(snapshot);
```

The engine requires the Core world read/write API (`get`, `has`, `byType`, `record`, `add`), the Core event bus (`emit`), and entity creation/removal/update operations used by collision outcomes. Integration reads the Entity Model identity, transform, physical, relation, and orbit components, with flat V1 properties retained as a compatibility fallback. Physics facts are recorded in the world and collision outcomes are published through `DomainEvent.CollisionOccurred`; `onCollision` is an optional presentation adapter for transient effects.

Future force, integrator, or collision policies can be introduced behind this boundary as injected strategies. This mission keeps the existing gravity and collision rules and does not add new physical behaviors. The former `systems/stellar/orbital-collisions.js` path remains a re-export adapter for existing imports.
