export const BIG_BANG_MAX_PLANETS_PER_SYSTEM=3;
export const BIG_BANG_PLANET_INTERVAL_MS=5000;
export const BIG_BANG_PLANET_CHANCE=.04;
export const BIG_BANG_MAX_ATTEMPTS=180;
const MIN_ORBIT_AU=24;
const MAX_ORBIT_AU=60;
const MIN_ORBIT_SEPARATION_AU=8;

function hashText(value){let hash=2166136261;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return hash>>>0}
function randomFor(seed){
 let state=seed>>>0;
 return()=>{state+=0x6d2b79f5;let value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return((value^(value>>>14))>>>0)/4294967296}
}
function generatedPlanetCount(engine,systemId){
 return engine.world.byType("cosmic.terrestrial-planet").filter(planet=>planet.systemId===systemId&&planet.metadata?.bigBangGenerated===true).length;
}
function distantOrbit(engine,systemId,parentStarId,random){
 const planets=engine.world.byType("cosmic.terrestrial-planet").filter(planet=>planet.systemId===systemId&&planet.parentStarId===parentStarId);
 for(let attempt=0;attempt<32;attempt++){
  const axis=MIN_ORBIT_AU+random()*(MAX_ORBIT_AU-MIN_ORBIT_AU);
  if(planets.every(planet=>Math.abs((planet.orbit?.semiMajorAxisAU??planet.semiMajorAxisAU??Infinity)-axis)>=MIN_ORBIT_SEPARATION_AU))return axis;
 }
 return null;
}
function stop(engine,process,reason){
 process.active=false;process.reason=reason;
 engine.world.record("BIG_BANG_FINISHED",{systemId:process.systemId,seed:process.seed,generatedPlanets:process.generatedPlanets,attempts:process.attempts,reason});
 engine.bus.emit("system:big-bang-finished",{systemId:process.systemId,generatedPlanets:process.generatedPlanets,attempts:process.attempts,reason});
}

export function createBigBangController(engine){
 let process=null;
 function status(){
  if(!process)return Object.freeze({active:false,systemId:null,seed:null,planets:0,systemPlanets:0,maxPlanets:BIG_BANG_MAX_PLANETS_PER_SYSTEM,attempts:0,maxAttempts:BIG_BANG_MAX_ATTEMPTS,reason:null});
  return Object.freeze({active:process.active,systemId:process.systemId,seed:process.seed,planets:process.generatedPlanets,systemPlanets:generatedPlanetCount(engine,process.systemId),maxPlanets:BIG_BANG_MAX_PLANETS_PER_SYSTEM,attempts:process.attempts,maxAttempts:BIG_BANG_MAX_ATTEMPTS,reason:process.reason||null});
 }
 function tryCreatePlanet(){
  const system=engine.world.get(process.systemId);
  if(!system||system.type!=="cosmic.star-system"){stop(engine,process,"system-missing");return}
  const stars=engine.world.byType("cosmic.star").filter(star=>star.systemId===process.systemId);
  const templates=engine.templates.all("planet");
  if(!stars.length||!templates.length){stop(engine,process,"no-valid-body");return}
  const random=randomFor(hashText(process.seed+":"+process.attempts));
  if(random()>=BIG_BANG_PLANET_CHANCE)return;
  const star=stars[Math.floor(random()*stars.length)];
  const semiMajorAxisAU=distantOrbit(engine,process.systemId,star.id,random);
  if(semiMajorAxisAU===null)return;
  const template=templates[Math.floor(random()*templates.length)];
  const massSolar=Math.max(.03,star.massSolar||1);
  const periodDays=365.25*Math.sqrt(semiMajorAxisAU**3/massSolar);
  const phaseRadians=random()*Math.PI*2;
  const nextNumber=generatedPlanetCount(engine,process.systemId)+1;
  const result=engine.usePower("CREATE_PLANET",{
   systemId:process.systemId,parentStarId:star.id,templateId:template.id,
   name:"Planeta distante "+nextNumber,semiMajorAxisAU,eccentricity:0,
   phaseRadians,periodDays,metadata:{bigBangGenerated:true,origin:"big-bang",seed:process.seed}
  });
  process.generatedPlanets++;
  const event=Object.freeze({systemId:process.systemId,planetId:result.planet.id,parentStarId:star.id,semiMajorAxisAU,seed:process.seed,attempt:process.attempts});
  engine.world.record("BIG_BANG_PLANET_CREATED",event);
  engine.bus.emit("planet:formed-by-big-bang",event);
 }
 return Object.freeze({
  start({systemId,seed=Date.now()}){
   if(process?.active)return{...status(),alreadyActive:true};
   const system=engine.world.get(systemId);
   if(!system||system.type!=="cosmic.star-system")throw new Error("BIG_BANG requires a selected star system");
   if(!engine.world.byType("cosmic.star").some(star=>star.systemId===systemId))throw new Error("BIG_BANG requires a star in the selected system");
   if(generatedPlanetCount(engine,systemId)>=BIG_BANG_MAX_PLANETS_PER_SYSTEM)throw new Error("BIG_BANG planet limit reached for this system");
   process={active:true,systemId,seed:String(seed),startedAtMs:Date.now(),elapsedMs:0,attempts:0,generatedPlanets:0,reason:null};
   const event=Object.freeze({systemId,seed:process.seed,maxPlanets:BIG_BANG_MAX_PLANETS_PER_SYSTEM,attemptIntervalMs:BIG_BANG_PLANET_INTERVAL_MS,creationChance:BIG_BANG_PLANET_CHANCE});
   engine.world.record("BIG_BANG_STARTED",event);
   engine.bus.emit("system:big-bang-started",event);
   return status();
  },
  update({systemId:activeSystemId,deltaGenerationMs=0}={}){
   if(!process?.active||activeSystemId!==process.systemId)return status();
   if(generatedPlanetCount(engine,process.systemId)>=BIG_BANG_MAX_PLANETS_PER_SYSTEM){stop(engine,process,"planet-limit");return status()}
   if(deltaGenerationMs>0){
    process.elapsedMs=Math.min(BIG_BANG_PLANET_INTERVAL_MS,process.elapsedMs+deltaGenerationMs);
    if(process.elapsedMs>=BIG_BANG_PLANET_INTERVAL_MS){
     process.elapsedMs-=BIG_BANG_PLANET_INTERVAL_MS;
     process.attempts++;
     tryCreatePlanet();
     if(process.active&&generatedPlanetCount(engine,process.systemId)>=BIG_BANG_MAX_PLANETS_PER_SYSTEM)stop(engine,process,"planet-limit");
     else if(process.active&&process.attempts>=BIG_BANG_MAX_ATTEMPTS)stop(engine,process,"attempt-limit");
    }
   }
   return status();
  },
  status
 });
}
