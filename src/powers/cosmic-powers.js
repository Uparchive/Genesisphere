import { classifyOrbit } from "../systems/stellar/habitability.js";
import { createBigBangController } from "../systems/stellar/big-bang.js";
import { SAME_ORBIT_TOLERANCE_AU } from "../systems/physics/physics-engine.js";

const entity = (context, id) => context.query.entity(id);
const template = (context, id, category) => {
  const result = context.query.template(id);
  return result?.category === category ? result : null;
};
const registerSDKPower = (engine, power) => engine.powers.register({ ...power, sdk: true });
const emitCreated = (context, entity, type) => {
  context.events.emit(type, entity);
  return entity;
};

export const CosmicPowersModule = {
  id: "cosmic-powers",
  version: "1.4.0",
  install(engine) {
    engine.bigBang = createBigBangController(engine);

    registerSDKPower(engine, {
      id: "BIG_BANG", name: "Big Bang regional", version: "3.0.0",
      presentation: { label: "Big Bang raro", icon: "✹", description: "Povoar uma região à medida que você explora.", surface: "inventory", interaction: "bigbang", shortcut: "5" },
      requirements: ["systemId"],
      validate: ({ context, input }) => {
        const region = entity(context, input.systemId);
        if (region?.type !== "cosmic.star-system" || region.parentSystemId) return "BIG_BANG requires a top-level region";
        if (context.query.bigBangStatus()?.active) return "BIG_BANG is already active";
        return true;
      },
      execute: ({ context, input }) => context.commands.dispatch({
        type: "StartBigBang", input: { systemId: input.systemId, seed: input.seed ?? Date.now(), bounds: input.bounds }
      })
    });

    registerSDKPower(engine, {
      id: "CREATE_SYSTEM", name: "Criar sistema estelar", version: "1.0.0",
      presentation: { label: "Criar sistema", icon: "✦", description: "Posicione um novo sistema no universo.", surface: "inventory", interaction: "system", shortcut: "1" },
      requirements: ["universeId"],
      validate: ({ context, input }) => entity(context, input.universeId)?.type === "cosmic.empty-space" || "CREATE_SYSTEM requires a valid universeId",
      execute: ({ context, input }) => emitCreated(context, context.commands.dispatch({
        type: "CreateEntity", entityType: "cosmic.star-system", properties: input
      }), "system:created")
    });

    registerSDKPower(engine, {
      id: "CREATE_STAR", name: "Adicionar estrela", version: "1.0.0",
      presentation: { label: "Adicionar estrela", icon: "☀", description: "Escolha um tipo de estrela e posicione-o.", surface: "inventory", interaction: "star", shortcut: "2" },
      requirements: ["systemId", "templateId"],
      validate: ({ context, input }) => entity(context, input.systemId)?.type === "cosmic.star-system" && Boolean(template(context, input.templateId, "star")) || "CREATE_STAR requires a valid systemId and star template",
      execute: ({ context, input }) => {
        const recipe = template(context, input.templateId, "star");
        const star = context.commands.dispatch({
          type: "CreateEntity", entityType: "cosmic.star",
          properties: { ...recipe.baseProperties, ...input, templateId: recipe.id }
        });
        return emitCreated(context, star, "star:created");
      }
    });

    registerSDKPower(engine, {
      id: "CREATE_BLACK_HOLE", name: "Criar buraco negro", version: "2.0.0",
      presentation: { label: "Adicionar buraco negro", icon: "◌", description: "Posicione um buraco negro no sistema atual.", surface: "inventory", interaction: "blackhole", shortcut: "4" },
      requirements: ["systemId", "positionAU"],
      validate: ({ context, input }) => entity(context, input.systemId)?.type === "cosmic.star-system" && Number.isFinite(input.massSolar ?? 10) && (input.massSolar ?? 10) > 0 && Number.isFinite(input.positionAU?.x) && Number.isFinite(input.positionAU?.y) || "CREATE_BLACK_HOLE requires a system, positive mass, and AU coordinates",
      execute: ({ context, input }) => emitCreated(context, context.commands.dispatch({
        type: "CreateEntity", entityType: "cosmic.black-hole", properties: { ...input, massSolar: input.massSolar ?? 10 }
      }), "black-hole:created")
    });

    registerSDKPower(engine, {
      id: "CREATE_PLANET", name: "Criar planeta", version: "1.1.0",
      presentation: { label: "Adicionar planeta", icon: "◉", description: "Escolha um planeta e defina sua órbita.", surface: "inventory", interaction: "planet", shortcut: "3" },
      requirements: ["systemId", "parentStarId", "templateId", "semiMajorAxisAU", "periodDays"],
      validate: ({ context, input }) => {
        if (entity(context, input.systemId)?.type !== "cosmic.star-system") return "CREATE_PLANET requires a valid systemId";
        const star = entity(context, input.parentStarId);
        if (star?.type !== "cosmic.star" || star.systemId !== input.systemId) return "CREATE_PLANET requires a star in the selected system";
        if (!template(context, input.templateId, "planet")) return "CREATE_PLANET requires a planet template";
        const eccentricity = input.eccentricity ?? 0;
        if (!(input.semiMajorAxisAU > 0) || !(input.periodDays > 0) || eccentricity < 0 || eccentricity >= 1) return "CREATE_PLANET requires valid orbital parameters";
        const conflict = context.query.entitiesByType("cosmic.terrestrial-planet").find(planet =>
          planet.systemId === input.systemId && planet.parentStarId === input.parentStarId &&
          Math.abs((planet.orbit?.semiMajorAxisAU ?? Infinity) - input.semiMajorAxisAU) <= SAME_ORBIT_TOLERANCE_AU
        );
        if (conflict) return "CREATE_PLANET requires an unoccupied orbit";
        return true;
      },
      execute: ({ context, input }) => {
        const star = entity(context, input.parentStarId);
        const recipe = template(context, input.templateId, "planet");
        const orbit = context.commands.dispatch({ type: "CreateEntity", entityType: "cosmic.orbit", properties: input });
        const environment = classifyOrbit(star, orbit.semiMajorAxisAU);
        const planet = context.commands.dispatch({
          type: "CreateEntity", entityType: "cosmic.terrestrial-planet",
          properties: {
            ...recipe.baseProperties, ...input, templateId: recipe.id,
            systemId: input.systemId, parentStarId: input.parentStarId, orbitId: orbit.id, environment,
            orbit: {
              semiMajorAxisAU: orbit.semiMajorAxisAU, eccentricity: orbit.eccentricity,
              phaseRadians: orbit.phaseRadians, periodDays: orbit.periodDays, parentStarId: orbit.parentStarId
            }
          }
        });
        context.events.emit("planet:created", planet);
        context.events.emit("planet:placed", Object.freeze({ planetId: planet.id, orbitId: orbit.id, systemId: input.systemId, parentStarId: input.parentStarId }));
        return Object.freeze({ planet, orbit });
      }
    });

    registerSDKPower(engine, {
      id: "DESTROY_PLANET", name: "Destruir planeta", version: "2.0.0",
      presentation: { label: "Destruir planeta", icon: "✕", description: "Remover o planeta selecionado e sua órbita.", surface: "selection", interaction: "destroy-selected" },
      requirements: ["planetId"],
      validate: ({ context, input }) => entity(context, input.planetId)?.type === "cosmic.terrestrial-planet" || "DESTROY_PLANET requires a valid planetId",
      execute: ({ context, input }) => {
        const planet = entity(context, input.planetId);
        const removedPlanet = context.commands.dispatch({ type: "RemoveEntity", entityId: planet.id });
        const removedOrbit = planet.orbitId ? context.commands.dispatch({ type: "RemoveEntity", entityId: planet.orbitId }) : null;
        const result = Object.freeze({ planet: removedPlanet, orbit: removedOrbit });
        context.events.emit("planet:destroyed", result);
        return result;
      }
    });
  }
};
