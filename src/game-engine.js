import { GenesisEngine } from "./core/engine.js";
import { CosmosModule } from "./modules/cosmos.js";
import { TemplateModule } from "./templates/template-module.js";
import { CosmicPowersModule } from "./powers/cosmic-powers.js";

export function createGenesisEngine({ empty = true } = {}) {
  const engine = new GenesisEngine();
  engine.use(CosmosModule).use(TemplateModule).use(CosmicPowersModule);
  if (empty) {
    const universe = engine.create("cosmic.empty-space", { name: "Genesisphere" });
    // Genesis is the player's empty starting system. Canonical entities such as Astra-1
    // remain available in their modules and are only introduced by future scenarios.
    engine.create("cosmic.star-system", { name: "Genesis", universeId: universe.id, position: { x: 0.5, y: 0.5 } });
  }
  return engine;
}
