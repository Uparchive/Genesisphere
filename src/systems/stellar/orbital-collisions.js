// Solid-body collisions for every star and planet in a stellar system.
import{earthMassesToSolar,effectiveStellarState}from"./stellar-state.js";
export const SAME_ORBIT_TOLERANCE_AU=0.01;
const TAU=Math.PI*2;
const ORBIT_RENDER_SCALE_PX_PER_AU=125;
const STAR_POSITION_AU_PER_NORMALIZED_UNIT=5;
const STELLAR_COLLISION_RADIUS_AU=38/ORBIT_RENDER_SCALE_PX_PER_AU;
const hash=value=>[...String(value)].reduce((sum,char)=>(31*sum+char.charCodeAt(0))>>>0,0);

export function findOrbitConflict(engine,{systemId,parentStarId,semiMajorAxisAU}){
 return engine.world.byType("cosmic.terrestrial-planet").find(planet=>
  planet.systemId===systemId&&planet.parentStarId===parentStarId&&
  Math.abs((planet.orbit?.semiMajorAxisAU??Infinity)-semiMajorAxisAU)<=SAME_ORBIT_TOLERANCE_AU
 )||null;
}

function starPositionAU(star){
 if(Number.isFinite(star.positionAU?.x)&&Number.isFinite(star.positionAU?.y))return star.positionAU;
 return{x:((star.position?.x??.5)-.5)*STAR_POSITION_AU_PER_NORMALIZED_UNIT,y:((star.position?.y??.5)-.5)*STAR_POSITION_AU_PER_NORMALIZED_UNIT};
}

function localPlanetPositionAt(planet,time){
 const orbit=planet.orbit||{},period=Math.max(.001,orbit.periodDays||365.25);
 const phase=Number.isFinite(orbit.phaseRadians)?orbit.phaseRadians:hash(planet.id)%628/100;
 const angle=phase+(time/1000*36/period)*TAU;
 const axis=orbit.semiMajorAxisAU||1;
 const eccentricity=Math.min(.999,Math.max(0,orbit.eccentricity||0));
 const distance=axis*(1-eccentricity*eccentricity)/(1+eccentricity*Math.cos(angle));
 return{x:Math.cos(angle)*distance,y:Math.sin(angle)*distance};
}

function planetPositionAt(engine,planet,time){
 const relative=localPlanetPositionAt(planet,time);
 const star=engine.world.get(planet.parentStarId);
 const center=star?starPositionAU(star):{x:0,y:0};
 return{x:center.x+relative.x,y:center.y+relative.y};
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

function replaceEntity(engine,entity,changes){
 engine.remove(entity.id);
 const updated=engine.world.add({...entity,...changes});
 engine.bus.emit("entity:created",updated);
 return updated;
}

function ingestPlanet(engine,planet,star,time){
 const massEarth=Math.max(.01,planet.massEarth||1),addedMassSolar=earthMassesToSolar(massEarth);
 if(planet.orbitId)engine.remove(planet.orbitId);
 engine.remove(planet.id);
 const event=Object.freeze({kind:"STELLAR_INGESTION",simulationTime:time,starId:star.id,parentStarId:planet.parentStarId,planetId:planet.id,systemId:planet.systemId,massEarth,addedMassSolar,starMassSolarBefore:star.massSolar||1});
 engine.world.record("STELLAR_INGESTION",event);
 engine.bus.emit("star:ingested-planet",event);
 return{kind:"STELLAR_INGESTION",starId:star.id,star,planet,massEarth,addedMassSolar,simulationTime:time,event};
}

function mergeStars(engine,first,second,time){
 const firstState=effectiveStellarState(engine,first),secondState=effectiveStellarState(engine,second);
 const firstMass=Math.max(.01,firstState.massSolar||1),secondMass=Math.max(.01,secondState.massSolar||1);
 const survivor=firstMass>=secondMass?first:second,absorbed=survivor===first?second:first;
 const survivorState=survivor===first?firstState:secondState,absorbedState=absorbed===first?firstState:secondState;
 const survivorMass=survivor===first?firstMass:secondMass,absorbedMass=absorbed===first?firstMass:secondMass;
 const survivorPosition=starPositionAU(survivor),absorbedPosition=starPositionAU(absorbed),totalMass=firstMass+secondMass;
 const positionAU={x:(survivorPosition.x*survivorMass+absorbedPosition.x*absorbedMass)/totalMass,y:(survivorPosition.y*survivorMass+absorbedPosition.y*absorbedMass)/totalMass};
 const updated=replaceEntity(engine,survivor,{
  positionAU,
  massSolar:totalMass,
  radiusSolar:Math.cbrt(Math.max(.01,survivorState.radiusSolar||1)**3+Math.max(.01,absorbedState.radiusSolar||1)**3),
  temperatureK:((firstMass*(firstState.temperatureK||5780)**4+secondMass*(secondState.temperatureK||5780)**4)/totalMass)**.25
 });
 engine.remove(absorbed.id);
 const affectedPlanets=engine.world.byType("cosmic.terrestrial-planet").filter(planet=>planet.parentStarId===absorbed.id);
 const updatedMass=updated.massSolar||1;
 for(const planet of affectedPlanets){
  const periodDays=365.25*Math.sqrt(Math.max(.001,planet.orbit?.semiMajorAxisAU||1)**3/Math.max(.01,updatedMass));
  replaceEntity(engine,planet,{parentStarId:updated.id,orbit:{...planet.orbit,parentStarId:updated.id,periodDays}});
  const orbit=planet.orbitId&&engine.world.get(planet.orbitId);
  if(orbit)replaceEntity(engine,orbit,{parentStarId:updated.id,periodDays});
 }
 const event=Object.freeze({kind:"STELLAR_MERGER",simulationTime:time,systemId:survivor.systemId,starId:updated.id,remnantStarId:updated.id,absorbedStarId:absorbed.id,massSolar:totalMass,positionAU});
 engine.world.record("STELLAR_MERGER",event);
 engine.bus.emit("star:merged",event);
 return{kind:"STELLAR_COLLISION",starId:updated.id,star:updated,survivor,absorbed,simulationTime:time,event};
}

function nearestStar(engine,systemId,position){
 return engine.world.byType("cosmic.star").filter(star=>star.systemId===systemId).reduce((nearest,star)=>{
  if(!nearest)return star;
  const point=starPositionAU(star),best=starPositionAU(nearest);
  return Math.hypot(point.x-position.x,point.y-position.y)<Math.hypot(best.x-position.x,best.y-position.y)?star:nearest;
 },null);
}

const ASTEROID_FRAGMENT_COUNT=8;

function planetVelocityAt(engine,planet,time){
 const before=planetPositionAt(engine,planet,time-500),after=planetPositionAt(engine,planet,time+500);
 return{x:after.x-before.x,y:after.y-before.y};
}

function shatterPlanets(engine,first,second,time,position){
 const firstMass=Math.max(.01,first.massEarth||1),secondMass=Math.max(.01,second.massEarth||1);
 const totalMass=firstMass+secondMass,fragmentMass=totalMass/ASTEROID_FRAGMENT_COUNT;
 const firstVelocity=planetVelocityAt(engine,first,time),secondVelocity=planetVelocityAt(engine,second,time);
 const centerVelocity={x:(firstVelocity.x*firstMass+secondVelocity.x*secondMass)/totalMass,y:(firstVelocity.y*firstMass+secondVelocity.y*secondMass)/totalMass};
 const relativeSpeed=Math.hypot(firstVelocity.x-secondVelocity.x,firstVelocity.y-secondVelocity.y);
 const ejectionSpeed=Math.max(.00001,relativeSpeed*1.5);
 const sourcePlanetIds=[first.id,second.id];
 for(const orbitId of new Set([first.orbitId,second.orbitId].filter(Boolean)))engine.remove(orbitId);
 engine.remove(first.id);engine.remove(second.id);
 const fragments=[];
 for(let index=0;index<ASTEROID_FRAGMENT_COUNT;index++){
  const angle=TAU*index/ASTEROID_FRAGMENT_COUNT+(hash(first.id+second.id)%628)/100;
  const speed=ejectionSpeed*(.72+.08*(index%5));
  const velocityAUPerSecond={x:centerVelocity.x+Math.cos(angle)*speed,y:centerVelocity.y+Math.sin(angle)*speed};
  const offset=planetCollisionRadiusAU(first)+planetCollisionRadiusAU(second);
  const positionAU={x:position.x+Math.cos(angle)*offset*.12,y:position.y+Math.sin(angle)*offset*.12};
  fragments.push(engine.create("cosmic.asteroid",{name:"Fragmento de colisão",systemId:first.systemId,positionAU,velocityAUPerSecond,epochSimulationTime:time,massEarth:fragmentMass,radiusAU:(planetCollisionRadiusAU(first)+planetCollisionRadiusAU(second))/(2*Math.cbrt(ASTEROID_FRAGMENT_COUNT)),sourcePlanetIds,seed:hash(first.id+second.id+index)}));
 }
 const event=Object.freeze({kind:"PLANET_COLLISION",at:time,simulationTime:time,systemId:first.systemId,firstPlanetId:first.id,secondPlanetId:second.id,firstParentStarId:first.parentStarId,secondParentStarId:second.parentStarId,massEarth:totalMass,fragmentCount:fragments.length,fragmentIds:fragments.map(fragment=>fragment.id),positionAU:position});
 engine.world.record("PLANET_COLLISION",event);
 engine.bus.emit("planet:collision",event);
 return{kind:"PLANET_COLLISION",first,second,fragments,position,event};
}

export function asteroidPositionAt(asteroid,time){
 const elapsedSeconds=(time-(asteroid.epochSimulationTime??0))/1000;
 return{x:asteroid.positionAU.x+asteroid.velocityAUPerSecond.x*elapsedSeconds,y:asteroid.positionAU.y+asteroid.velocityAUPerSecond.y*elapsedSeconds};
}

function ingestAsteroid(engine,asteroid,star,time){
 const massEarth=Math.max(0,asteroid.massEarth||0),addedMassSolar=earthMassesToSolar(massEarth);
 engine.remove(asteroid.id);
 const event=Object.freeze({kind:"STELLAR_INGESTION",simulationTime:time,starId:star.id,asteroidId:asteroid.id,bodyType:"cosmic.asteroid",systemId:asteroid.systemId,massEarth,addedMassSolar,starMassSolarBefore:star.massSolar||1});
 engine.world.record("STELLAR_INGESTION",event);
 engine.bus.emit("star:ingested-asteroid",event);
 return{kind:"ASTEROID_STELLAR_IMPACT",starId:star.id,star,asteroid,massEarth,positionAU:starPositionAU(star),simulationTime:time,event};
}

function checkAsteroidImpacts(engine,previousTime,time,onCollision,impacts){
 const asteroids=engine.world.byType("cosmic.asteroid");
 const planets=engine.world.byType("cosmic.terrestrial-planet");
 const stars=engine.world.byType("cosmic.star");
 for(const asteroid of asteroids){
  if(!engine.world.has(asteroid.id))continue;
  const previous=asteroidPositionAt(asteroid,previousTime),current=asteroidPositionAt(asteroid,time);
  let hit=null,hitType=null,hitDistance=Infinity;
  for(const star of stars){
   if(!engine.world.has(star.id)||star.systemId!==asteroid.systemId)continue;
   const center=starPositionAU(star);
   const distance=originDistanceAlongSegment({x:previous.x-center.x,y:previous.y-center.y},{x:current.x-center.x,y:current.y-center.y});
   if(distance<=STELLAR_COLLISION_RADIUS_AU+(asteroid.radiusAU||0)&&distance<hitDistance){hit=star;hitType="star";hitDistance=distance}
  }
  for(const planet of planets){
   if(!engine.world.has(planet.id)||planet.systemId!==asteroid.systemId)continue;
   const planetPrevious=planetPositionAt(engine,planet,previousTime),planetCurrent=planetPositionAt(engine,planet,time);
   const distance=sweptDistance(previous,planetPrevious,current,planetCurrent);
   if(distance<=planetCollisionRadiusAU(planet)+(asteroid.radiusAU||0)&&distance<hitDistance){hit=planet;hitType="planet";hitDistance=distance}
  }
  if(!hit)continue;
  let impact;
  if(hitType==="star")impact=ingestAsteroid(engine,asteroid,effectiveStellarState(engine,hit),time);
  else{
   engine.remove(asteroid.id);
   const event=Object.freeze({kind:"ASTEROID_PLANET_IMPACT",simulationTime:time,systemId:asteroid.systemId,asteroidId:asteroid.id,planetId:hit.id,massEarth:asteroid.massEarth||0,positionAU:current});
   engine.world.record("ASTEROID_PLANET_IMPACT",event);
   engine.bus.emit("planet:asteroid-impact",event);
   impact={kind:"ASTEROID_PLANET_IMPACT",asteroid,planet:hit,positionAU:current,simulationTime:time,event};
  }
  impacts.push(impact);onCollision(impact);
 }
}

function mergeOverlappingStars(engine,time,onCollision,impacts){
 const stars=engine.world.byType("cosmic.star");
 const collided=new Set;
 for(let i=0;i<stars.length;i++){
  const first=stars[i];
  if(collided.has(first.id)||!engine.world.has(first.id))continue;
  for(let j=i+1;j<stars.length;j++){
   const second=stars[j];
   if(collided.has(second.id)||!engine.world.has(second.id)||first.systemId!==second.systemId)continue;
   const a=starPositionAU(engine.world.get(first.id)),b=starPositionAU(engine.world.get(second.id));
   if(Math.hypot(a.x-b.x,a.y-b.y)>STELLAR_COLLISION_RADIUS_AU*2)continue;
   const impact=mergeStars(engine,engine.world.get(first.id),engine.world.get(second.id),time);
   collided.add(first.id);collided.add(second.id);impacts.push(impact);onCollision(impact);
  }
 }
}

function checkPlanetStarCollisions(engine,previousTime,time,onCollision,impacts){
 const planets=engine.world.byType("cosmic.terrestrial-planet");
 const stars=engine.world.byType("cosmic.star");
 for(const planet of planets){
  if(!engine.world.has(planet.id))continue;
  const previous=planetPositionAt(engine,planet,previousTime),current=planetPositionAt(engine,planet,time);
  let hit=null,hitDistance=Infinity;
  for(const star of stars){
   if(!engine.world.has(star.id)||star.systemId!==planet.systemId)continue;
   const center=starPositionAU(star),relativeStart={x:previous.x-center.x,y:previous.y-center.y},relativeEnd={x:current.x-center.x,y:current.y-center.y};
   const distance=originDistanceAlongSegment(relativeStart,relativeEnd);
   if(distance>STELLAR_COLLISION_RADIUS_AU+planetCollisionRadiusAU(planet)||distance>=hitDistance)continue;
   hit=star;hitDistance=distance;
  }
  if(!hit)continue;
  const effective=effectiveStellarState(engine,hit);
  const impact=ingestPlanet(engine,planet,effective,time);
  impacts.push(impact);onCollision(impact);
 }
}

function checkPlanetPlanetCollisions(engine,previousTime,time,onCollision,impacts){
 const planets=engine.world.byType("cosmic.terrestrial-planet");
 const collided=new Set;
 const currentPositions=new Map(planets.map(planet=>[planet.id,planetPositionAt(engine,planet,time)]));
 const previousPositions=new Map(planets.map(planet=>[planet.id,planetPositionAt(engine,planet,previousTime)]));
 for(let i=0;i<planets.length;i++){
  const first=planets[i];
  if(collided.has(first.id)||!engine.world.has(first.id))continue;
  for(let j=i+1;j<planets.length;j++){
   const second=planets[j];
   if(collided.has(second.id)||!engine.world.has(second.id)||first.systemId!==second.systemId)continue;
   const separation=sweptDistance(previousPositions.get(first.id),previousPositions.get(second.id),currentPositions.get(first.id),currentPositions.get(second.id));
   if(separation>planetCollisionRadiusAU(first)+planetCollisionRadiusAU(second))continue;
   const firstEnd=currentPositions.get(first.id),secondEnd=currentPositions.get(second.id);
   const position={x:(firstEnd.x+secondEnd.x)/2,y:(firstEnd.y+secondEnd.y)/2};
   const impact=shatterPlanets(engine,first,second,time,position);
   collided.add(first.id);collided.add(second.id);impacts.push(impact);onCollision(impact);
   break;
  }
 }
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
    mergeOverlappingStars(engine,sampleTime,onCollision,impacts);
    checkAsteroidImpacts(engine,previousTime,sampleTime,onCollision,impacts);
    checkPlanetStarCollisions(engine,previousTime,sampleTime,onCollision,impacts);
    checkPlanetPlanetCollisions(engine,previousTime,sampleTime,onCollision,impacts);
   }
   lastTime=time;
   return impacts;
  }
 });
}
