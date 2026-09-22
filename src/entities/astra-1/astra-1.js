// Astra-1 is an individual entity module. Rules here apply ONLY to Astra-1.
export const Astra1={
 id:"astra-1",version:"1.0.0",
 profile:Object.freeze({
  name:"Astra-1",kind:"planet",earthLike:true,
  orbit:{semiMajorAxisAU:1,periodDays:365.25,eccentricity:.0167},
  radiusEarth:1,massEarth:1,atmosphere:true,life:"undetected",
  visual:{ocean:"#176da0",oceanDeep:"#082b55",land:"#3f8053",landLight:"#79a35d",ice:"#e8f5f7",cloud:"rgba(245,252,255,.72)",atmosphere:"rgba(92,180,255,.55)"}
 }),
 create(engine){return engine.create("cosmic.terrestrial-planet",this.profile)}
};