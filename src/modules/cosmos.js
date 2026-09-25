export const CosmosModule={
 id:"cosmos",version:"1.2.0",
 install(engine){
  engine.registry.register("cosmic.empty-space",{schemaVersion:1,create:p=>({name:p.name||"Genesisphere",kind:"space",metadata:{...p.metadata}})});
  engine.registry.register("cosmic.star",{schemaVersion:1,create:p=>({name:p.name||"Genesis-1",kind:"star",systemId:p.systemId||null,templateId:p.templateId||null,position:{x:p.position?.x??.5,y:p.position?.y??.5},spectralType:p.spectralType||"G",massSolar:p.massSolar??1,radiusSolar:p.radiusSolar??1,temperatureK:p.temperatureK??5780})});
  engine.registry.register("cosmic.terrestrial-planet",{schemaVersion:1,create:p=>({name:p.name||"Astra-1",entityKey:p.entityKey||null,kind:"planet",planetKind:p.kind||"terrestrial",templateId:p.templateId||null,systemId:p.systemId||null,parentStarId:p.parentStarId||null,orbitId:p.orbitId||null,earthLike:p.earthLike??true,orbit:{semiMajorAxisAU:p.semiMajorAxisAU??1,periodDays:p.periodDays??365.25,eccentricity:p.eccentricity??0.0167,parentStarId:p.parentStarId||null},environment:p.environment?{...p.environment}:null,radiusEarth:p.radiusEarth??1,massEarth:p.massEarth??1,atmosphere:p.atmosphere??true,life:p.life||"undetected",collisionCount:p.collisionCount??0,lastCollisionAt:p.lastCollisionAt??null})});
  engine.registry.register("cosmic.star-system",{schemaVersion:1,create:p=>({name:p.name||"Unnamed System",kind:"star-system",universeId:p.universeId||null,position:{x:p.position?.x??.5,y:p.position?.y??.5},metadata:{...p.metadata}})});
  engine.registry.register("cosmic.orbit",{schemaVersion:1,create:p=>({kind:"orbit",systemId:p.systemId,parentStarId:p.parentStarId,semiMajorAxisAU:p.semiMajorAxisAU,eccentricity:p.eccentricity??0,periodDays:p.periodDays,metadata:{...p.metadata}})});
 }
};
