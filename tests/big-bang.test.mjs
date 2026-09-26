import test from"node:test";
import assert from"node:assert/strict";
import{CosmosModule}from"../src/modules/cosmos.js";
import{CosmicPowersModule}from"../src/powers/cosmic-powers.js";
import{TemplateModule}from"../src/templates/template-module.js";
import{BIG_BANG_MAX_ATTEMPTS,BIG_BANG_MAX_PLANETS_PER_SYSTEM,BIG_BANG_PLANET_CHANCE,BIG_BANG_PLANET_INTERVAL_MS}from"../src/systems/stellar/big-bang.js";

function makeEngine(){
 const definitions=new Map,entities=new Map,powers=new Map,templates=new Map,events=[];
 let id=0;
 const engine={
  registry:{register:(type,definition)=>definitions.set(type,definition),get:type=>definitions.get(type)},
  templates:{register:item=>templates.set(item.id,item),get:key=>templates.get(key)||null,all:category=>[...templates.values()].filter(item=>!category||item.category===category)},
  world:{
   get:key=>entities.get(key)||null,has:key=>entities.has(key),all:()=>[...entities.values()],
   byType:type=>[...entities.values()].filter(item=>item.type===type),
   add(item){const value=Object.freeze({...item});entities.set(value.id,value);events.push({kind:"ENTITY_CREATED",entity:value});return value},
   remove(key){const value=entities.get(key)||null;entities.delete(key);if(value)events.push({kind:"ENTITY_DESTROYED",entity:value});return value},
   record:(kind,details={})=>{const event=Object.freeze({kind,...details});events.push(event);return event},
   history:()=>[...events]
  },
  bus:{emit:(kind,detail)=>events.push({kind,detail})},
  powers:{register:power=>powers.set(power.id,power)},
  create(type,props={}){const def=definitions.get(type);if(!def)throw Error("Unknown type "+type);return engine.world.add({id:"entity-"+(++id),type,...def.create(props)})},
  remove:key=>engine.world.remove(key),
  usePower(key,input={}){const power=powers.get(key),valid=power.validate({engine,input});if(valid!==true)throw new Error(valid);return power.execute({engine,input})}
 };
 CosmosModule.install(engine);TemplateModule.install(engine);CosmicPowersModule.install(engine);
 return engine;
}

function createSelectedSystem(engine,{withStar=true,name="Selected"}={}){
 const universe=engine.create("cosmic.empty-space");
 const system=engine.usePower("CREATE_SYSTEM",{universeId:universe.id,name,position:{x:.5,y:.5}});
 const star=withStar?engine.create("cosmic.star",{name:"Primary",systemId:system.id,massSolar:1,positionAU:{x:0,y:0}}):null;
 return{universe,system,star};
}
function tick(engine,systemId,count=1,deltaGenerationMs=BIG_BANG_PLANET_INTERVAL_MS){
 for(let i=0;i<count&&engine.bigBang.status().active;i++)engine.bigBang.update({systemId,deltaGenerationMs});
}
function generatedPlanets(engine,systemId){
 return engine.world.byType("cosmic.terrestrial-planet").filter(planet=>planet.systemId===systemId&&planet.metadata?.bigBangGenerated===true);
}

test("Big Bang requires a selected system with a star and only starts once",()=>{
 const engine=makeEngine(),{universe,system}=createSelectedSystem(engine,{withStar:false});
 assert.throws(()=>engine.usePower("BIG_BANG",{universeId:universe.id}),/selected star system/);
 assert.throws(()=>engine.usePower("BIG_BANG",{systemId:system.id}),/requires a star/);
 const star=engine.create("cosmic.star",{systemId:system.id,massSolar:1});
 const state=engine.usePower("BIG_BANG",{systemId:system.id,seed:"seed-1"});
 assert.equal(state.active,true);
 assert.equal(state.systemId,system.id);
 assert.throws(()=>engine.usePower("BIG_BANG",{systemId:system.id}),/already active/);
 assert.ok(engine.world.history().some(event=>event.kind==="BIG_BANG_STARTED"&&event.systemId===system.id));
 assert.ok(star.id);
});

test("Big Bang creates only a few rare, widely spaced planets inside the selected system",()=>{
 const first=makeEngine(),second=makeEngine(),a=createSelectedSystem(first),b=createSelectedSystem(second);
 assert.equal(BIG_BANG_MAX_PLANETS_PER_SYSTEM,3);
 assert.equal(BIG_BANG_PLANET_CHANCE,.04);
 assert.equal(BIG_BANG_PLANET_INTERVAL_MS,5000);
 first.usePower("BIG_BANG",{systemId:a.system.id,seed:"rare-cosmos"});
 second.usePower("BIG_BANG",{systemId:b.system.id,seed:"rare-cosmos"});
 first.bigBang.update({systemId:a.system.id,deltaGenerationMs:BIG_BANG_PLANET_INTERVAL_MS-1});
 assert.equal(first.bigBang.status().attempts,0,"no roll occurs before the rare interval");
 first.bigBang.update({systemId:a.system.id,deltaGenerationMs:1});
 assert.equal(first.bigBang.status().attempts,1);
 for(let i=0;i<BIG_BANG_MAX_ATTEMPTS&&first.bigBang.status().active;i++)first.bigBang.update({systemId:a.system.id,deltaGenerationMs:BIG_BANG_PLANET_INTERVAL_MS});
 for(let i=0;i<BIG_BANG_MAX_ATTEMPTS&&second.bigBang.status().active;i++)second.bigBang.update({systemId:b.system.id,deltaGenerationMs:BIG_BANG_PLANET_INTERVAL_MS});
 for(let round=0;round<4&&(generatedPlanets(first,a.system.id).length<BIG_BANG_MAX_PLANETS_PER_SYSTEM||generatedPlanets(second,b.system.id).length<BIG_BANG_MAX_PLANETS_PER_SYSTEM);round++){
  if(generatedPlanets(first,a.system.id).length<BIG_BANG_MAX_PLANETS_PER_SYSTEM){first.usePower("BIG_BANG",{systemId:a.system.id,seed:"rare-retry-"+round});tick(first,a.system.id,BIG_BANG_MAX_ATTEMPTS)}
  if(generatedPlanets(second,b.system.id).length<BIG_BANG_MAX_PLANETS_PER_SYSTEM){second.usePower("BIG_BANG",{systemId:b.system.id,seed:"rare-retry-"+round});tick(second,b.system.id,BIG_BANG_MAX_ATTEMPTS)}
 }
 const planets=generatedPlanets(first,a.system.id),planetTwin=generatedPlanets(second,b.system.id);
 assert.equal(planets.length,BIG_BANG_MAX_PLANETS_PER_SYSTEM,"generation has a hard lifetime limit for each system");
 assert.equal(first.world.byType("cosmic.star-system").length,1,"Big Bang must not create new systems");
 assert.ok(planets.every(planet=>planet.orbit.semiMajorAxisAU>=24&&planet.orbit.semiMajorAxisAU<=60));
 for(const parentStarId of new Set(planets.map(planet=>planet.parentStarId))){
  const axes=planets.filter(planet=>planet.parentStarId===parentStarId).map(planet=>planet.orbit.semiMajorAxisAU).sort((x,y)=>x-y);
  for(let i=1;i<axes.length;i++)assert.ok(axes[i]-axes[i-1]>=8,"new planets must be widely spaced");
 }
 assert.ok(planets.every(planet=>planet.systemId===a.system.id&&planet.parentStarId===a.star.id));
 assert.deepEqual(planetTwin.map(planet=>planet.orbit.semiMajorAxisAU),generatedPlanets(second,b.system.id).map(planet=>planet.orbit.semiMajorAxisAU),"the same seed gives the same gradual sequence");
 assert.throws(()=>first.usePower("BIG_BANG",{systemId:a.system.id,seed:"over-limit"}),/limit reached/);
});

test("Big Bang pauses outside its selected system and ignores time acceleration backlog",()=>{
 const engine=makeEngine(),a=createSelectedSystem(engine),b=createSelectedSystem(engine,{name:"Other"});
 engine.usePower("BIG_BANG",{systemId:a.system.id,seed:"pause"});
 engine.bigBang.update({systemId:b.system.id,deltaGenerationMs:1_000_000});
 assert.equal(engine.bigBang.status().attempts,0,"a different viewed system cannot receive planets");
 engine.bigBang.update({systemId:a.system.id,deltaGenerationMs:1_000_000});
 assert.equal(engine.bigBang.status().attempts,1,"a large time step still produces at most one rarity roll per rendered update");
 assert.equal(engine.world.byType("cosmic.star-system").length,2);
});
