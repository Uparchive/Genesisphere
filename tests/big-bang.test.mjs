import test from"node:test";
import assert from"node:assert/strict";
import{CosmosModule}from"../src/modules/cosmos.js";
import{CosmicPowersModule}from"../src/powers/cosmic-powers.js";
import{TemplateModule}from"../src/templates/template-module.js";

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

const view={left:.32,right:.68,top:.32,bottom:.68};

test("Big Bang power starts only once for an existing universe",()=>{
 const engine=makeEngine(),universe=engine.create("cosmic.empty-space");
 const state=engine.usePower("BIG_BANG",{universeId:universe.id,seed:"seed-1",center:{x:.5,y:.5}});
 assert.equal(state.active,true);
 assert.equal(engine.bigBang.status().active,true);
 assert.throws(()=>engine.usePower("BIG_BANG",{universeId:universe.id}),/BIG_BANG requires/);
 assert.throws(()=>engine.usePower("BIG_BANG",{universeId:"missing"}),/BIG_BANG requires/);
 assert.ok(engine.world.history().some(event=>event.kind==="BIG_BANG_STARTED"));
});

test("Big Bang creates deterministic systems, planets, black holes, and evolving life progressively",()=>{
 const first=makeEngine(),second=makeEngine();
 const universeA=first.create("cosmic.empty-space"),universeB=second.create("cosmic.empty-space");
 first.usePower("BIG_BANG",{universeId:universeA.id,seed:"same-cosmos",center:{x:.5,y:.5}});
 second.usePower("BIG_BANG",{universeId:universeB.id,seed:"same-cosmos",center:{x:.5,y:.5}});
 first.bigBang.update({center:{x:.5,y:.5},bounds:view,deltaSimulationMs:100_000});
 second.bigBang.update({center:{x:.5,y:.5},bounds:view,deltaSimulationMs:100_000});
 assert.equal(first.bigBang.status().generatedCells,1,"generation is capped to one cell per rendered update");
 for(let frame=0;frame<250;frame++){
  first.bigBang.update({center:{x:.5,y:.5},bounds:view,deltaSimulationMs:650});
  second.bigBang.update({center:{x:.5,y:.5},bounds:view,deltaSimulationMs:650});
 }
 const state=first.bigBang.status();
 assert.ok(state.generatedCells>20);
 assert.ok(state.systems>0);
 assert.ok(state.planets>state.systems);
 assert.ok(state.lifeWorlds>0);
 assert.ok(first.world.byType("cosmic.black-hole").length>0);
 const summarize=engine=>engine.world.byType("cosmic.star-system").map(system=>({
  name:system.name,position:system.position,
  stars:engine.world.byType("cosmic.star").filter(star=>star.systemId===system.id).map(star=>star.templateId),
  planets:engine.world.byType("cosmic.terrestrial-planet").filter(planet=>planet.systemId===system.id).map(planet=>({name:planet.name,life:planet.life,axis:planet.orbit.semiMajorAxisAU}))
 }));
 assert.deepEqual(summarize(first),summarize(second));
 first.bigBang.update({center:{x:.5,y:.5},bounds:view,deltaSimulationMs:30_000_000});
 assert.ok(first.world.byType("cosmic.terrestrial-planet").some(planet=>planet.lifeStage==="intelligent"));
});

test("moving the camera materializes new procedural regions",()=>{
 const engine=makeEngine(),universe=engine.create("cosmic.empty-space");
 engine.usePower("BIG_BANG",{universeId:universe.id,seed:"travel",center:{x:.5,y:.5}});
 for(let frame=0;frame<30;frame++)engine.bigBang.update({center:{x:.5,y:.5},bounds:view,deltaSimulationMs:650});
 const before=engine.bigBang.status().generatedCells;
 engine.bigBang.update({center:{x:8,y:-3},bounds:{left:7.8,right:8.2,top:-3.2,bottom:-2.8},deltaSimulationMs:650});
 assert.ok(engine.bigBang.status().generatedCells>before);
});
