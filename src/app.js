import{GenesisEngine}from"./core/engine.js";import{CosmosModule}from"./modules/cosmos.js";import{TemplateModule}from"./templates/template-module.js";import{CosmicPowersModule}from"./powers/cosmic-powers.js";import{Astra1}from"./entities/astra-1/astra-1.js";
export const genesis=new GenesisEngine();
genesis.use(CosmosModule).use(TemplateModule).use(CosmicPowersModule);
const universe=genesis.create("cosmic.empty-space",{name:"Genesisphere"});
const genesisSystem=genesis.create("cosmic.star-system",{name:"Sistema Genesis",universeId:universe.id});
const genesisStar=genesis.create("cosmic.star",{name:"Genesis-1",systemId:genesisSystem.id,templateId:"star.g-type"});
const astraOrbit=genesis.create("cosmic.orbit",{systemId:genesisSystem.id,parentStarId:genesisStar.id,semiMajorAxisAU:1,eccentricity:.0167,periodDays:365.25});
Astra1.create(genesis,{systemId:genesisSystem.id,parentStarId:genesisStar.id,orbitId:astraOrbit.id});
globalThis.Genesisphere=genesis;
