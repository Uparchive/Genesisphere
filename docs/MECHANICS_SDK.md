# Mechanics SDK

The Mechanics SDK is the Core-facing extension contract for new Genesisphere mechanics, systems and powers. SDK definitions must not import a renderer, Cloudflare adapter, database client, or persistence gateway. Canonical mutations go through the Command Bus; observable facts are domain events.

## Contract
Register a definition with `id`, `version`, `sdk: true`, `requirements`, `validate({ context, input })`, and `execute({ context, input })`. Validation returns `true` or a failure message and always runs before execution.

The restricted context exposes only `context.query.entity(id)`, `context.query.entitiesByType(type)`, `context.query.template(id)`, `context.query.templates(category)`, `context.commands.dispatch(command)`, and `context.events.emit(type, payload)`. It deliberately has no renderer, persistence repository, database, or mutable engine.

## Power presentation and availability
Powers may include a `presentation` record with UI-only fields such as `label`, `icon`, `description`, `surface`, `interaction`, and `shortcut`. Keep these fields separate from `validate()` and `execute()`. `PowerRegistry.catalog()` returns only the registered IDs and presentation fields, so the UI does not receive the implementation functions. `PowerRegistry.checkAvailability(id, engine, input)` runs the Core requirements and validator without executing the power or mutating the world; the UI uses its result to show a disabled state and the Core-provided reason. Power execution still validates the actual request before any mutation.

`surface: "inventory"` adds the power to the construction inventory; `surface: "selection"` makes it available in the selected-entity actions. `interaction` selects a presentation flow already supported by the interface, while `shortcut` optionally provides a keyboard shortcut. Simple powers can use `interaction: "invoke"` and an optional presentation `input` as their default request.

## Minimal template
```js
engine.powers.register({
  id: "EXAMPLE_POWER", version: "1.0.0", sdk: true, requirements: ["entityId"],
  validate: ({ context, input }) => context.query.entity(input.entityId) ? true : "valid entity required",
  execute: ({ context, input }) => {
    const updated = context.commands.dispatch({type:"SetEntityProperty",entityId:input.entityId,property:"name",value:input.name});
    context.events.emit("example:applied",{entityId:updated.id});
    return updated;
  }
});
```

## Guarantees
`ExecutePower` is transactional. Requirements and validation happen before mutation. A failed execution restores the world checkpoint and discards queued events. Persistence remains outside mechanics and reacts through adapters.

## Migration proof
`CREATE_BLACK_HOLE` and `DESTROY_PLANET` use the SDK. Legacy powers remain supported for incremental migration; new powers should use `sdk: true`.
