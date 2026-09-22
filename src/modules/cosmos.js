export const CosmosModule={
 id:"cosmos",version:"1.1.0",
 install(engine){
  engine.registry.register("cosmic.empty-space",{schemaVersion:1,create:p=>({name:p.name||"Genesisphere",kind:"space",metadata:{...p.metadata}})});
  engine.registry.register("cosmic.star",{schemaVersion:1,create:p=>({name:p.name||"Genesis-1",kind:"star",spectralType:p.spectralType||"G",massSolar:p.massSolar??1,radiusSolar:p.radiusSolar??1,temperatureK:p.temperatureK??5780})});
  engine.registry.register("cosmic.terrestrial-planet",{schemaVersion:1,create:p=>({name:p.name||"Astra-1",kind:"planet",earthLike:true,orbit:{semiMajorAxisAU:p.semiMajorAxisAU??1,periodDays:p.periodDays??365.25,eccentricity:p.eccentricity??0.0167},radiusEarth:p.radiusEarth??1,massEarth:p.massEarth??1,atmosphere:p.atmosphere??true,life:"undetected"})});
 }
};