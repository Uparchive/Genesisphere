import{GenesisEngine}from"./core/engine.js";import{CosmosModule}from"./modules/cosmos.js";import{TemplateModule}from"./templates/template-module.js";import{CosmicPowersModule}from"./powers/cosmic-powers.js";
export const genesis=new GenesisEngine();
genesis.use(CosmosModule).use(TemplateModule).use(CosmicPowersModule);
const universe=genesis.create("cosmic.empty-space",{name:"Genesisphere"});
// Genesis is the player's empty starting system. Canonical entities such as Astra-1
// remain available in their modules and are only introduced by future scenarios.
genesis.create("cosmic.star-system",{name:"Genesis",universeId:universe.id,position:{x:.5,y:.5}});
globalThis.Genesisphere=genesis;
