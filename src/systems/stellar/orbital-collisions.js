// Planar Newtonian N-body gravity, stable fixed-step integration, and solid-body impacts.
import{earthMassesToSolar,effectiveStellarState}from"./stellar-state.js";
import{stellarLuminosity}from"./habitability.js";

export const SAME_ORBIT_TOLERANCE_AU=.01;
export const GRAVITATIONAL_CONSTANT_AU=4*Math.PI**2*(36**2)/(365.25**2);
const TAU=Math.PI*2;
const AU_PER_SYSTEM_COORDINATE=100;
const FIXED_STEP_SECONDS=1/120;
const MAX_STEPS_PER_UPDATE=2048;
const SOFTENING_AU=.001;
const ORBIT_RENDER_SCALE_PX_PER_AU=125;
const STAR_POSITION_AU_PER_NORMALIZED_UNIT=5;
const STELLAR_COLLISION_RADIUS_AU=38/ORBIT_RENDER_SCALE_PX_PER_AU;
const ASTEROID_FRAGMENT_COUNT=8;
const hash=value=>[...String(value)].reduce((sum,char)=>(31*sum+char.charCodeAt(0))>>>0,0);

export function findOrbitConflict(engine,{systemId,parentStarId,semiMajorAxisAU}){
 return engine.world.byType("cosmic.terrestrial-planet").find(planet=>
  planet.systemId===systemId&&planet.parentStarId===parentStarId&&
  Math.abs((planet.orbit?.semiMajorAxisAU??Infinity)-semiMajorAxisAU)<=SAME_ORBIT_TOLERANCE_AU
 )||null;
}

function originDistanceAlongSegment(start,end){
 const dx=end.x-start.x,dy=end.y-start.y,lengthSquared=dx*dx+dy*dy;
 if(lengthSquared===0)return Math.hypot(start.x,start.y);
 const t=Math.max(0,Math.min(1,-(start.x*dx+start.y*dy)/lengthSquared));
 return Math.hypot(start.x+t*dx,start.y+t*dy);
}
function sweptDistance(firstStart,secondStart,firstEnd,secondEnd){
 return originDistanceAlongSegment({x:firstStart.x-secondStart.x,y:firstStart.y-secondStart.y},{x:firstEnd.x-secondEnd.x,y:firstEnd.y-secondEnd.y});
}
function localPlanetPositionAt(planet,time){
 const orbit=planet.orbit||{},period=Math.max(.001,orbit.periodDays||365.25);
 const phase=Number.isFinite(orbit.phaseRadians)?orbit.phaseRadians:hash(planet.id)%628/100;
 const angle=phase+(time/1000*36/period)*TAU;
 const axis=orbit.semiMajorAxisAU||1,eccentricity=Math.min(.999,Math.max(0,orbit.eccentricity||0));
 const distance=axis*(1-eccentricity*eccentricity)/(1+eccentricity*Math.cos(angle));
 return{x:Math.cos(angle)*distance,y:Math.sin(angle)*distance,angle};
}
export function asteroidPositionAt(asteroid,time){
 const elapsedSeconds=(time-(asteroid.epochSimulationTime??0))/1000;
 return{x:asteroid.positionAU.x+asteroid.velocityAUPerSecond.x*elapsedSeconds,y:asteroid.positionAU.y+asteroid.velocityAUPerSecond.y*elapsedSeconds};
}
function entityMassSolar(engine,entity){
 if(entity.type==="cosmic.star")return Math.max(.0001,effectiveStellarState(engine,engine.world.get(entity.id)||entity).massSolar||1);
 if(entity.type==="cosmic.black-hole")return Math.max(.01,entity.massSolar||10);
 if(entity.type==="cosmic.terrestrial-planet")return earthMassesToSolar(entity.massEarth||1);
 if(entity.type==="cosmic.asteroid")return earthMassesToSolar(entity.massEarth||0);
 return 0;
}
function contactRadiusAU(entity){
 if(entity.type==="cosmic.star")return STELLAR_COLLISION_RADIUS_AU;
 if(entity.type==="cosmic.terrestrial-planet"){
  const renderedRadiusPx=Math.max(7,entity.planetKind==="gas-giant"?15:10);
  return renderedRadiusPx/ORBIT_RENDER_SCALE_PX_PER_AU*Math.cbrt(Math.max(.01,entity.radiusEarth||1));
 }
 if(entity.type==="cosmic.asteroid")return Math.max(0,entity.radiusAU||0);
 if(entity.type==="cosmic.black-hole")return Math.max(0,entity.captureRadiusAU||entity.eventHorizonRadiusAU||0);
 return 0;
}
function replaceEntity(engine,entity,changes){
 engine.remove(entity.id);
 const updated=engine.world.add({...entity,...changes});
 engine.bus.emit("entity:created",updated);
 return updated;
}
function liveEntities(engine){
 return [...engine.world.byType("cosmic.star"),...engine.world.byType("cosmic.black-hole"),...engine.world.byType("cosmic.terrestrial-planet"),...engine.world.byType("cosmic.asteroid")];
}

export function createGravitySystem(engine,onCollision=()=>{}){
 let lastTime=null;
 const states=new Map,trails=new Map,systemOrigins=new Map,habitability=new Map;
 const systemEntity=systemId=>engine.world.get(systemId)?.type==="cosmic.star-system"?engine.world.get(systemId):null;
 function systemOriginAU(systemId){
  if(systemOrigins.has(systemId))return systemOrigins.get(systemId);
  const system=systemEntity(systemId),position=system?.position||{x:.5,y:.5};
  const origin={x:((position.x??.5)-.5)*AU_PER_SYSTEM_COORDINATE,y:((position.y??.5)-.5)*AU_PER_SYSTEM_COORDINATE};
  systemOrigins.set(systemId,origin);return origin;
 }
 function gravityGroup(entity){
  const system=systemEntity(entity.systemId);
  return system?.universeId||entity.universeId||entity.systemId||"universe";
 }
 function positionOf(entityOrId){
  const id=typeof entityOrId==="string"?entityOrId:entityOrId.id;
  const state=states.get(id);
  if(state)return{x:state.x,y:state.y};
  const entity=typeof entityOrId==="string"?engine.world.get(entityOrId):entityOrId;
  if(!entity)return null;
  const origin=systemOriginAU(entity.systemId);
  if(entity.type==="cosmic.star"||entity.type==="cosmic.black-hole")return{x:origin.x+(entity.positionAU?.x??((entity.position?.x??.5)-.5)*STAR_POSITION_AU_PER_NORMALIZED_UNIT),y:origin.y+(entity.positionAU?.y??((entity.position?.y??.5)-.5)*STAR_POSITION_AU_PER_NORMALIZED_UNIT)};
  if(entity.type==="cosmic.asteroid")return{x:origin.x+(entity.positionAU?.x??0),y:origin.y+(entity.positionAU?.y??0)};
  if(entity.type==="cosmic.terrestrial-planet"){
   const star=states.get(entity.parentStarId),relative=localPlanetPositionAt(entity,lastTime??0);
   return{x:(star?.x??origin.x)+relative.x,y:(star?.y??origin.y)+relative.y};
  }
  return{x:origin.x,y:origin.y};
 }
 function initialState(entity,time){
  const origin=systemOriginAU(entity.systemId);
  if(entity.type==="cosmic.star"||entity.type==="cosmic.black-hole"){
   const position=entity.positionAU||{x:((entity.position?.x??.5)-.5)*STAR_POSITION_AU_PER_NORMALIZED_UNIT,y:((entity.position?.y??.5)-.5)*STAR_POSITION_AU_PER_NORMALIZED_UNIT};
   const velocity=entity.velocityAUPerSecond||{x:0,y:0};
   return{x:origin.x+position.x,y:origin.y+position.y,vx:velocity.x||0,vy:velocity.y||0,group:gravityGroup(entity)};
  }
  if(entity.type==="cosmic.asteroid"){
   const position=entity.positionAU||{x:0,y:0},velocity=entity.velocityAUPerSecond||{x:0,y:0};
   return{x:origin.x+position.x,y:origin.y+position.y,vx:velocity.x||0,vy:velocity.y||0,group:gravityGroup(entity)};
  }
  const star=states.get(entity.parentStarId)||positionOf(entity.parentStarId);
  const host=engine.world.get(entity.parentStarId),relative=localPlanetPositionAt(entity,time);
  const center=star||origin,angle=relative.angle,eccentricity=Math.min(.999,Math.max(0,entity.orbit?.eccentricity||0));
  const axis=Math.max(.0001,entity.orbit?.semiMajorAxisAU||1),mass=host?entityMassSolar(engine,host):1;
  const p=axis*(1-eccentricity**2),speedScale=Math.sqrt(GRAVITATIONAL_CONSTANT_AU*Math.max(.0001,mass)/Math.max(.000001,p));
  const radial=speedScale*eccentricity*Math.sin(angle),tangential=speedScale*(1+eccentricity*Math.cos(angle));
  const vx=radial*Math.cos(angle)-tangential*Math.sin(angle),vy=radial*Math.sin(angle)+tangential*Math.cos(angle);
  return{x:center.x+relative.x,y:center.y+relative.y,vx:(states.get(entity.parentStarId)?.vx||0)+vx,vy:(states.get(entity.parentStarId)?.vy||0)+vy,group:gravityGroup(entity)};
 }
 function syncNewBodies(time){
  for(const entity of liveEntities(engine))if(!states.has(entity.id))states.set(entity.id,initialState(entity,time));
  for(const id of [...states.keys()])if(!engine.world.has(id)){states.delete(id);trails.delete(id);habitability.delete(id)}
 }
 function groupBodies(bodies){
  const groups=new Map;
  for(const entity of bodies){const group=gravityGroup(entity),items=groups.get(group)||[];items.push(entity);groups.set(group,items)}
  return groups.values();
 }
 function receivesGravity(target,source,masses){
  if(target.type!=="cosmic.star")return true;
  if(source.type==="cosmic.black-hole")return true;
  return source.type==="cosmic.star"&&masses.get(source.id)>=masses.get(target.id);
 }
 function accelerationFor(bodies){
  const acceleration=new Map(bodies.map(entity=>[entity.id,{x:0,y:0}]));
  const masses=new Map(bodies.map(entity=>[entity.id,entityMassSolar(engine,entity)]));
  for(const group of groupBodies(bodies))for(let i=0;i<group.length;i++){
   const first=group[i],a=states.get(first.id);
   for(let j=i+1;j<group.length;j++){
    const second=group[j],b=states.get(second.id),dx=b.x-a.x,dy=b.y-a.y,r2=dx*dx+dy*dy+SOFTENING_AU**2;
    const inverseR3=1/(r2*Math.sqrt(r2)),factor=GRAVITATIONAL_CONSTANT_AU*inverseR3;
    const aa=acceleration.get(first.id),ab=acceleration.get(second.id);
    if(receivesGravity(first,second,masses)){aa.x+=factor*masses.get(second.id)*dx;aa.y+=factor*masses.get(second.id)*dy}
    if(receivesGravity(second,first,masses)){ab.x-=factor*masses.get(first.id)*dx;ab.y-=factor*masses.get(first.id)*dy}
   }
  }
  return acceleration;
 }
 function integrate(dt){
  const bodies=liveEntities(engine);if(!bodies.length)return;
  const before=new Map(bodies.map(entity=>{const s=states.get(entity.id);return[entity.id,{x:s.x,y:s.y}]}));
  const start=accelerationFor(bodies);
  for(const entity of bodies){const s=states.get(entity.id),a=start.get(entity.id);s.x+=s.vx*dt+.5*a.x*dt*dt;s.y+=s.vy*dt+.5*a.y*dt*dt}
  const end=accelerationFor(bodies);
  for(const entity of bodies){const s=states.get(entity.id),a0=start.get(entity.id),a1=end.get(entity.id);s.vx+=.5*(a0.x+a1.x)*dt;s.vy+=.5*(a0.y+a1.y)*dt}
  resolveCollisions(bodies,before);
 }
 function momentumMerge(first,second,m1,m2){
  const a=states.get(first.id),b=states.get(second.id),total=m1+m2;
  return{x:(a.x*m1+b.x*m2)/total,y:(a.y*m1+b.y*m2)/total,vx:(a.vx*m1+b.vx*m2)/total,vy:(a.vy*m1+b.vy*m2)/total};
 }
 function ingestPlanet(planet,star,time){
  // Planetary bodies do not displace stellar motion in this gameplay model.
  if(planet.orbitId)engine.remove(planet.orbitId);engine.remove(planet.id);states.delete(planet.id);trails.delete(planet.id);
  const massEarth=Math.max(.01,planet.massEarth||1),addedMassSolar=earthMassesToSolar(massEarth);
  const event=Object.freeze({kind:"STELLAR_INGESTION",simulationTime:time,starId:star.id,parentStarId:planet.parentStarId,planetId:planet.id,bodyType:"cosmic.terrestrial-planet",systemId:planet.systemId,massEarth,addedMassSolar,starMassSolarBefore:star.massSolar||1});
  engine.world.record("STELLAR_INGESTION",event);engine.bus.emit("star:ingested-planet",event);
  const impact={kind:"STELLAR_INGESTION",starId:star.id,star,planet,massEarth,addedMassSolar,simulationTime:time,event};onCollision(impact);
 }
 function ingestAsteroid(asteroid,star,time){
  const a=states.get(asteroid.id),s=states.get(star.id),starMass=entityMassSolar(engine,star),asteroidMass=entityMassSolar(engine,asteroid),total=starMass+asteroidMass;
  s.vx=(s.vx*starMass+a.vx*asteroidMass)/total;s.vy=(s.vy*starMass+a.vy*asteroidMass)/total;
  engine.remove(asteroid.id);states.delete(asteroid.id);trails.delete(asteroid.id);
  const massEarth=Math.max(0,asteroid.massEarth||0),addedMassSolar=earthMassesToSolar(massEarth);
  const event=Object.freeze({kind:"STELLAR_INGESTION",simulationTime:time,starId:star.id,asteroidId:asteroid.id,bodyType:"cosmic.asteroid",systemId:asteroid.systemId,massEarth,addedMassSolar,starMassSolarBefore:star.massSolar||1});
  engine.world.record("STELLAR_INGESTION",event);engine.bus.emit("star:ingested-asteroid",event);
  onCollision({kind:"ASTEROID_STELLAR_IMPACT",starId:star.id,star,asteroid,massEarth,positionAU:{x:s.x,y:s.y},simulationTime:time,event});
 }
 function mergeStars(first,second,time){
  const firstMass=entityMassSolar(engine,first),secondMass=entityMassSolar(engine,second),survivor=firstMass>=secondMass?first:second,absorbed=survivor===first?second:first;
  const survivorMass=survivor===first?firstMass:secondMass,absorbedMass=absorbed===first?firstMass:secondMass;
  const firstState=states.get(first.id),secondState=states.get(second.id),merged=momentumMerge(first,second,firstMass,secondMass);
  const origin=systemOriginAU(survivor.systemId);
  const updated=replaceEntity(engine,survivor,{positionAU:{x:merged.x-origin.x,y:merged.y-origin.y},velocityAUPerSecond:{x:merged.vx,y:merged.vy},massSolar:firstMass+secondMass,radiusSolar:Math.cbrt((first.radiusSolar||1)**3+(second.radiusSolar||1)**3),temperatureK:((firstMass*(first.temperatureK||5780)**4+secondMass*(second.temperatureK||5780)**4)/(firstMass+secondMass))**.25});
  states.delete(absorbed.id);trails.delete(absorbed.id);states.set(updated.id,{...merged,group:gravityGroup(updated)});
  engine.remove(absorbed.id);
  for(const planet of engine.world.byType("cosmic.terrestrial-planet").filter(item=>item.parentStarId===absorbed.id)){
   const periodDays=365.25*Math.sqrt(Math.max(.001,(planet.orbit?.semiMajorAxisAU||1)**3)/Math.max(.01,updated.massSolar||1));
   replaceEntity(engine,planet,{parentStarId:updated.id,orbit:{...planet.orbit,parentStarId:updated.id,periodDays}});
  }
  const event=Object.freeze({kind:"STELLAR_MERGER",simulationTime:time,systemId:survivor.systemId,starId:updated.id,remnantStarId:updated.id,absorbedStarId:absorbed.id,massSolar:firstMass+secondMass,positionAU:{x:merged.x,y:merged.y}});
  engine.world.record("STELLAR_MERGER",event);engine.bus.emit("star:merged",event);
  onCollision({kind:"STELLAR_COLLISION",starId:updated.id,star:updated,survivor,absorbed,simulationTime:time,event});
 }
 function absorbIntoBlackHole(body,blackHole,time){
  const bodyState=states.get(body.id),holeState=states.get(blackHole.id),bodyMass=entityMassSolar(engine,body),holeMass=entityMassSolar(engine,blackHole),totalMass=bodyMass+holeMass;
  const merged={x:(bodyState.x*bodyMass+holeState.x*holeMass)/totalMass,y:(bodyState.y*bodyMass+holeState.y*holeMass)/totalMass,vx:(bodyState.vx*bodyMass+holeState.vx*holeMass)/totalMass,vy:(bodyState.vy*bodyMass+holeState.vy*holeMass)/totalMass};
  if(body.type==="cosmic.terrestrial-planet"&&body.orbitId)engine.remove(body.orbitId);
  engine.remove(body.id);states.delete(body.id);trails.delete(body.id);
  const origin=systemOriginAU(blackHole.systemId),eventHorizonRadiusAU=1.974e-8*totalMass,captureRadiusAU=Math.max(eventHorizonRadiusAU,.02*Math.cbrt(totalMass));
  const updated=replaceEntity(engine,blackHole,{massSolar:totalMass,positionAU:{x:merged.x-origin.x,y:merged.y-origin.y},velocityAUPerSecond:{x:merged.vx,y:merged.vy},eventHorizonRadiusAU,captureRadiusAU});
  states.set(updated.id,{...merged,group:gravityGroup(updated)});
  const event=Object.freeze({kind:"BLACK_HOLE_ABSORPTION",simulationTime:time,systemId:updated.systemId,blackHoleId:updated.id,absorbedBodyId:body.id,absorbedBodyType:body.type,absorbedMassSolar:bodyMass,massSolarAfter:totalMass,eventHorizonRadiusAU,positionAU:{x:merged.x,y:merged.y}});
  engine.world.record("BLACK_HOLE_ABSORPTION",event);engine.bus.emit("black-hole:absorbed",event);
  onCollision({kind:"BLACK_HOLE_ABSORPTION",blackHole:updated,body,positionAU:event.positionAU,simulationTime:time,event});
 }
 function shatterPlanets(first,second,time){
  const a=states.get(first.id),b=states.get(second.id),m1=entityMassSolar(engine,first),m2=entityMassSolar(engine,second),total=m1+m2;
  const totalEarth=Math.max(.01,first.massEarth||1)+Math.max(.01,second.massEarth||1);
  const x=(a.x*m1+b.x*m2)/total,y=(a.y*m1+b.y*m2)/total,vx=(a.vx*m1+b.vx*m2)/total,vy=(a.vy*m1+b.vy*m2)/total;
  const relativeSpeed=Math.hypot(a.vx-b.vx,a.vy-b.vy),ejectionSpeed=Math.max(.005,relativeSpeed*.2),origin=systemOriginAU(first.systemId);
  for(const id of new Set([first.orbitId,second.orbitId].filter(Boolean)))engine.remove(id);
  engine.remove(first.id);engine.remove(second.id);states.delete(first.id);states.delete(second.id);trails.delete(first.id);trails.delete(second.id);
  const fragments=[];
  for(let index=0;index<ASTEROID_FRAGMENT_COUNT;index++){
   const angle=TAU*index/ASTEROID_FRAGMENT_COUNT+(hash(first.id+second.id)%628)/100,speed=ejectionSpeed*(.72+.08*(index%5));
   fragments.push(engine.create("cosmic.asteroid",{name:"Fragmento de colisão",systemId:first.systemId,positionAU:{x:x-origin.x,y:y-origin.y},velocityAUPerSecond:{x:vx+Math.cos(angle)*speed,y:vy+Math.sin(angle)*speed},epochSimulationTime:time,massEarth:totalEarth/ASTEROID_FRAGMENT_COUNT,radiusAU:(contactRadiusAU(first)+contactRadiusAU(second))/(2*Math.cbrt(ASTEROID_FRAGMENT_COUNT)),sourcePlanetIds:[first.id,second.id],seed:hash(first.id+second.id+index)}));
  }
  const positionAU={x,y};
  const event=Object.freeze({kind:"PLANET_COLLISION",at:time,simulationTime:time,systemId:first.systemId,firstPlanetId:first.id,secondPlanetId:second.id,firstParentStarId:first.parentStarId,secondParentStarId:second.parentStarId,massEarth:totalEarth,fragmentCount:fragments.length,fragmentIds:fragments.map(fragment=>fragment.id),positionAU});
  engine.world.record("PLANET_COLLISION",event);engine.bus.emit("planet:collision",event);
  onCollision({kind:"PLANET_COLLISION",first,second,fragments,position:positionAU,event});
 }
 function asteroidHitsPlanet(asteroid,planet,time){
  const a=states.get(asteroid.id),p=states.get(planet.id),mAsteroid=entityMassSolar(engine,asteroid),mPlanet=entityMassSolar(engine,planet),massEarth=Math.max(0,asteroid.massEarth||0),newMassEarth=(planet.massEarth||1)+massEarth,total=mPlanet+mAsteroid;
  p.vx=(p.vx*mPlanet+a.vx*mAsteroid)/total;p.vy=(p.vy*mPlanet+a.vy*mAsteroid)/total;
  const updated=replaceEntity(engine,planet,{massEarth:newMassEarth,radiusEarth:Math.cbrt(Math.max(.01,planet.radiusEarth||1)**3+massEarth),collisionCount:(planet.collisionCount||0)+1,lastCollisionAt:time});
  engine.remove(asteroid.id);states.delete(asteroid.id);trails.delete(asteroid.id);
  const event=Object.freeze({kind:"ASTEROID_PLANET_IMPACT",simulationTime:time,systemId:asteroid.systemId,asteroidId:asteroid.id,planetId:updated.id,massEarth,planetMassEarthAfter:newMassEarth,positionAU:{x:a.x,y:a.y}});
  engine.world.record("ASTEROID_PLANET_IMPACT",event);engine.bus.emit("planet:asteroid-impact",event);
  onCollision({kind:"ASTEROID_PLANET_IMPACT",asteroid,planet:updated,positionAU:event.positionAU,simulationTime:time,event});
 }
 function resolveCollisions(bodies,before){
  const handled=new Set,now=lastTime??0;
  for(const group of groupBodies(bodies))for(let i=0;i<group.length;i++){
   const first=group[i];if(handled.has(first.id)||!engine.world.has(first.id))continue;
   for(let j=i+1;j<group.length;j++){
    const second=group[j];if(handled.has(second.id)||!engine.world.has(second.id))continue;
    const a=states.get(first.id),b=states.get(second.id);if(!a||!b)continue;
    const firstStart=before.get(first.id)||a,secondStart=before.get(second.id)||b;
    const distance=sweptDistance(firstStart,secondStart,a,b),contact=contactRadiusAU(first)+contactRadiusAU(second);
    if(distance>contact)continue;
    const kinds=[first.type,second.type],star=kinds.includes("cosmic.star")?(first.type==="cosmic.star"?first:second):null;
    const planet=kinds.includes("cosmic.terrestrial-planet")?(first.type==="cosmic.terrestrial-planet"?first:second):null;
    const asteroid=kinds.includes("cosmic.asteroid")?(first.type==="cosmic.asteroid"?first:second):null;
    const blackHole=kinds.includes("cosmic.black-hole")?(first.type==="cosmic.black-hole"?first:second.type==="cosmic.black-hole"?second:null):null;
    if(blackHole){
     const body=blackHole===first?second:first;
     if(body.type==="cosmic.black-hole"&&entityMassSolar(engine,body)>entityMassSolar(engine,blackHole))absorbIntoBlackHole(blackHole,body,now);
     else absorbIntoBlackHole(body,blackHole,now);
     handled.add(first.id);handled.add(second.id);
    }
    else if(first.type==="cosmic.star"&&second.type==="cosmic.star"){mergeStars(first,second,now);handled.add(first.id);handled.add(second.id)}
    else if(star&&planet){ingestPlanet(planet,star,now);handled.add(planet.id)}
    else if(star&&asteroid){ingestAsteroid(asteroid,star,now);handled.add(asteroid.id)}
    else if(planet&&asteroid){asteroidHitsPlanet(asteroid,planet,now);handled.add(asteroid.id)}
    else if(first.type==="cosmic.terrestrial-planet"&&second.type==="cosmic.terrestrial-planet"){shatterPlanets(first,second,now);handled.add(first.id);handled.add(second.id)}
   }
  }
 }
 function updateHabitability(){
  const stars=engine.world.byType("cosmic.star");
  for(const planet of engine.world.byType("cosmic.terrestrial-planet")){
   const position=states.get(planet.id);if(!position)continue;
   let flux=0;
   for(const star of stars){
    if(gravityGroup(star)!==gravityGroup(planet))continue;
    const starState=states.get(star.id);if(!starState)continue;
    const distance=Math.max(.01,Math.hypot(position.x-starState.x,position.y-starState.y));
    flux+=stellarLuminosity(effectiveStellarState(engine,star))/(distance*distance);
   }
   let thermalClass="MUITO FRIO";
   if(flux>2.2)thermalClass="MUITO QUENTE";
   else if(flux>1.5)thermalClass="QUENTE";
   else if(flux>=.72)thermalClass="ZONA POTENCIALMENTE HABITÁVEL";
   else if(flux>=.22)thermalClass="FRIO";
   const previous=habitability.get(planet.id)||planet.environment?.thermalClass;
   if(previous===thermalClass)continue;
   const environment={...(planet.environment||{}),stellarFlux:Number(flux.toFixed(3)),thermalClass,habitabilityPotential:thermalClass==="ZONA POTENCIALMENTE HABITÁVEL"};
   const updated=replaceEntity(engine,planet,{environment});
   habitability.set(planet.id,thermalClass);
   const event=Object.freeze({kind:"PLANET_HABITABILITY_CHANGED",simulationTime:lastTime??0,planetId:planet.id,systemId:planet.systemId,stellarFlux:environment.stellarFlux,thermalClass,habitabilityPotential:environment.habitabilityPotential});
   engine.world.record("PLANET_HABITABILITY_CHANGED",event);engine.bus.emit("planet:habitability-changed",event);
  }
 }
 function appendTrails(){
  for(const entity of liveEntities(engine)){
   const state=states.get(entity.id);if(!state)continue;
   const trail=trails.get(entity.id)||[];trail.push({x:state.x,y:state.y});
   if(trail.length>180)trail.splice(0,trail.length-180);
   trails.set(entity.id,trail);
  }
 }
 return Object.freeze({
  update(time){
   if(lastTime===null){lastTime=time;syncNewBodies(time);updateHabitability();appendTrails();return[]}
   if(time<=lastTime)return[];
   syncNewBodies(lastTime);
   const elapsed=(time-lastTime)/1000,steps=Math.min(MAX_STEPS_PER_UPDATE,Math.max(1,Math.ceil(elapsed/FIXED_STEP_SECONDS))),dt=elapsed/steps;
   for(let step=0;step<steps;step++){integrate(dt);lastTime+=dt*1000;syncNewBodies(lastTime)}
   lastTime=time;updateHabitability();appendTrails();return[];
  },
  positionOf,
  velocityOf(id){const state=states.get(typeof id==="string"?id:id.id);return state?{x:state.vx,y:state.vy}:null},
  trailOf(id){return[...(trails.get(typeof id==="string"?id:id.id)||[])].map(point=>({...point}))},
  systemOriginAU
 });
}

export const createOrbitalCollisionSystem=createGravitySystem;
