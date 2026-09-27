import { createGenesisEngine } from "./game-engine.js";

export { createGenesisEngine };
export const genesis = createGenesisEngine();
globalThis.Genesisphere = genesis;
