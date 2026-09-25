// Deterministic gameplay collisions for planets orbiting the same star.
export const SAME_ORBIT_TOLERANCE_AU=0.01;
const TAU=Math.PI*2;
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
 return{x:Math.cos(angle)*axis,y:Math.sin(angle)*axis*Math.sqrt(1-eccentricity*eccentricity)};
}
const impactRadiusAU=planet=>.08*Math.cbrt(Math.max(.01,planet.radiusEarth||1));

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
   const impacts=[];
   for(let step=1;step<=steps;step++){
    const sampleTime=lastTime+elapsed*step/steps;
    const planets=engine.world.byType("cosmic.terrestrial-planet");
    const collided=new Set;
    for(let i=0;i<planets.length;i++){
     const first=planets[i];
     if(collided.has(first.id)||!engine.world.has(first.id))continue;
     for(let j=i+1;j<planets.length;j++){
      const second=planets[j];
      if(collided.has(second.id)||!engine.world.has(second.id)||first.systemId!==second.systemId||first.parentStarId!==second.parentStarId)continue;
      const a=positionAt(first,sampleTime),b=positionAt(second,sampleTime);
      const reach=impactRadiusAU(first)+impactRadiusAU(second);
      if(Math.hypot(a.x-b.x,a.y-b.y)>reach)continue;
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
