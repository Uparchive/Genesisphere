// Stellar properties are derived from immutable base entities and world events.
const EARTH_MASSES_PER_SOLAR=332946;
const stateCache=new WeakMap;

export function effectiveStellarState(engine,star){
 const history=engine.world.history();
 let cached=stateCache.get(engine);
 if(!cached||cached.version!==history.length){cached={version:history.length,states:new Map};stateCache.set(engine,cached)}
 if(cached.states.has(star.id))return cached.states.get(star.id);
 let baselineIndex=-1;
 for(let i=history.length-1;i>=0;i--){
  if(history[i].kind==="STELLAR_MERGER"&&history[i].starId===star.id){baselineIndex=i;break}
 }
 const ingestions=history.slice(baselineIndex+1).filter(event=>event.kind==="STELLAR_INGESTION"&&event.starId===star.id);
 if(!ingestions.length){cached.states.set(star.id,star);return star}
 const ingestedMassEarth=ingestions.reduce((sum,event)=>sum+(event.massEarth||0),0);
 const baseMass=Math.max(.01,star.massSolar||1),massSolar=baseMass+ingestedMassEarth/EARTH_MASSES_PER_SOLAR;
 const ratio=massSolar/baseMass;
 const state=Object.freeze({...star,massSolar,radiusSolar:(star.radiusSolar||1)*ratio**.8,temperatureK:(star.temperatureK||5780)*ratio**.475,ingestedMassEarth,ingestionCount:ingestions.length,lastIngestionAt:ingestions.at(-1).at,accretionFlashUntil:ingestions.at(-1).simulationTime+4200});
 cached.states.set(star.id,state);
 return state;
}

export function stellarRadiusAU(star){return Math.max(.0001,star.radiusSolar||1)*.00465047}
export function earthRadiusAU(planet){return Math.max(.01,planet.radiusEarth||1)*.000042635}
export function earthMassesToSolar(massEarth){return Math.max(0,massEarth||0)/EARTH_MASSES_PER_SOLAR}
