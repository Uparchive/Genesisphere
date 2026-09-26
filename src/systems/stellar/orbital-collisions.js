// Deterministic collisions and stellar ingestion, derived from orbital state.
import{earthMassesToSolar,effectiveStellarState}from"./stellar-state.js";
export const SAME_ORBIT_TOLERANCE_AU=0.01;
const TAU=Math.PI*2;
// Keep gameplay contacts in the same base coordinate scale as the system renderer:
// 125 px per AU and a nominal 38 px rendered star radius.
const ORBIT_RENDER_SCALE_PX_PER_AU=125;
const STELLAR_COLLISION_RADIUS_AU=38/ORBIT_RENDER_SCALE_PX_PER_AU;
const hash=value=>[...String(value)].reduce((sum,char)=>(31*sum+char.charCodeAt(0))>>>0,0);

export function findOrbitConflict(engine,{systemId,parentStarId,semiMajorAxisAU}){
 return engine.world.byType("cosmic.terrestrial-planet").find(planet=>
  planet.systemId===systemId&&planet.parentStarId===parentStarId&&
  Math.abs((planet.orbit?.semiMajorAxisAU??Infinity)-semiMajorAxisAU)<=SAME_ORBIT_TOLERANCE_AU
 )||null;
}

function positionAt(planet,time){
 const orbit=planet.orbit||{},period=Math.max(.001,orbit.periodDays||365.25);
 const angle=hash(planet.id)%628/100+(time/1000*36/period)*TAU;
 const axis=orbit.semiMajorAxisAU||1;
 const eccentricity=Math.min(.999,Math.max(0,orbit.eccentricity||0));
 const distance=axis*(1-eccentricity*eccentricity)/(1+eccentricity*Math.cos(angle));
 return{x:Math.cos(angle)*distance,y:Math.sin(angle)*distance};
}

function planetCollisionRadiusAU(planet){
 const renderedRadiusPx=Math.max(7,planet.planetKind==="gas-giant"?15:10);
 return renderedRadiusPx/ORBIT_RENDER_SCALE_PX_PER_AU*Math.cbrt(Math.max(.01,planet.radiusEarth||1));
}

function originDistanceAlongSegment(start,end){
 const dx=end.x-start.x,dy=end.y-start.y,lengthSquared=dx*dx+dy*dy;
 if(lengthSquared===0)return Math.hypot(start.x,start.y);
 const t=Math.max(0,Math.min(1,-(start.x*dx+start.y*dy)/lengthSquared));
 return Math.hypot(start.x+t*dx,start.y+t*dy);
}

function sweptDistance(firstStart,secondStart,firstEnd,secondEnd){
 return originDistanceAlongSegment(
  {x:firstStart.x-secondStart.x,y:firstStart.y-secondStart.y},
  {x:firstEnd.x-secondEnd.x,y:firstEnd.y-secondEnd.y}
 );
}

function ingestPlanet(engine,planet,star,time){
 const massEarth=Math.max(.01,planet.massEarth||1),addedMassSolar=earthMassesToSolar(massEarth);
 if(planet.orbitId)engine.remove(planet.orbitId);
 engine.remove(planet.id);
 const event=Object.freeze({kind:"STELLAR_INGESTION",simulationTime:time,starId:star.id,planetId:planet.id,systemId:planet.systemId,massEarth,addedMassSolar,starMassSolarBefore:star.massSolar||1});
 engine.world.record("STELLAR_INGESTION",event);
 engine.bus.emit("star:ingested-planet",event);
 return{kind:"STELLAR_INGESTION",starId:star.id,star,planet,massEarth,addedMassSolar,simulationTime:time,event};
}
function merge(engine,first,second,time){
 const firstMass=Math.max(.01,first.massEarth||1),secondMass=Math.max(.01,second.massEarth||1);
 const survivor=firstMass>=secondMass?first:second,absorbed=survivor===first?second:first;
 const collisionCount=(survivor.collisionCount||0)+(absorbed.collisionCount||0)+1;
 const survivorRadius=Math.max(.01,survivor.radiusEarth||1),absorbedRadius=Math.max(.01,absorbed.radiusEarth||1);
 const massEarth=firstMass+secondMass;
 const radiusEarth=Math.cbrt(survivorRadius**3+absorbedRadius**3);
 if(absorbed.orbitId&&absorbed.orbitId!==survivor.orbitId)engine.remove(absorbed.orbitId);
 engine.remove(absorbed.id);
 engine.remove(survivor.id);
 const remnant=engine.create("cosmic.terrestrial-planet",{
  name:survivor.name+" Remanescente",
  entityKey:survivor.entityKey,
  kind:survivor.planetKind,
  templateId:survivor.templateId,
  systemId:survivor.systemId,
  parentStarId:survivor.parentStarId,
  orbitId:survivor.orbitId,
  orbit:{...survivor.orbit},
  environment:survivor.environment,
  massEarth,
  radiusEarth,
  atmosphere:survivor.atmosphere,
  life:"disrupted",
  collisionCount,
  lastCollisionAt:time
 });
 const position=positionAt(remnant,time);
 const event=Object.freeze({kind:"PLANET_COLLISION",at:time,systemId:survivor.systemId,survivorPlanetId:survivor.id,absorbedPlanetId:absorbed.id,remnantPlanetId:remnant.id,massEarth,radiusEarth});
 engine.world.record("PLANET_COLLISION",event);
 engine.bus.emit("planet:collision",event);
 return{survivor,absorbed,remnant,position,event};
}

export function createOrbitalCollisionSystem(engine,onCollision=()=>{}){
 let lastTime=null;
 return Object.freeze({
  update(time){
   if(lastTime===null){lastTime=time;return[]}
   if(time<=lastTime)return[];
   const elapsed=time-lastTime;
   const steps=Math.min(128,Math.max(1,Math.ceil(elapsed/16)));
   const stepDuration=elapsed/steps;
   const impacts=[];
   for(let step=1;step<=steps;step++){
    const sampleTime=lastTime+stepDuration*step;
    const previousTime=sampleTime-stepDuration;
    const planets=engine.world.byType("cosmic.terrestrial-planet");
    const collided=new Set;
    for(const planet of planets){
     if(collided.has(planet.id)||!engine.world.has(planet.id))continue;
     const rawStar=engine.world.get(planet.parentStarId);
     if(!rawStar||rawStar.type!=="cosmic.star")continue;
     const star=effectiveStellarState(engine,rawStar);
     const previous=positionAt(planet,previousTime),current=positionAt(planet,sampleTime);
     const contact=STELLAR_COLLISION_RADIUS_AU+planetCollisionRadiusAU(planet);
     if(originDistanceAlongSegment(previous,current)>contact)continue;
     const impact=ingestPlanet(engine,planet,star,sampleTime);
     collided.add(planet.id);impacts.push(impact);onCollision(impact);
    }
    for(let i=0;i<planets.length;i++){
     const first=planets[i];
     if(collided.has(first.id)||!engine.world.has(first.id))continue;
     for(let j=i+1;j<planets.length;j++){
      const second=planets[j];
      if(collided.has(second.id)||!engine.world.has(second.id)||first.systemId!==second.systemId||first.parentStarId!==second.parentStarId)continue;
      const reach=planetCollisionRadiusAU(first)+planetCollisionRadiusAU(second);
      const previousFirst=positionAt(first,previousTime),previousSecond=positionAt(second,previousTime);
      const currentFirst=positionAt(first,sampleTime),currentSecond=positionAt(second,sampleTime);
      if(sweptDistance(previousFirst,previousSecond,currentFirst,currentSecond)>reach)continue;
      const impact=merge(engine,first,second,sampleTime);
      collided.add(first.id);collided.add(second.id);impacts.push(impact);onCollision(impact);
      break;
     }
    }
   }
   lastTime=time;
   return impacts;
  }
 });
}
