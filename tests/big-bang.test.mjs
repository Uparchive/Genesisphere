import test from"node:test";
import assert from"node:assert/strict";
import{CosmosModule}from"../src/modules/cosmos.js";
import{CosmicPowersModule}from"../src/powers/cosmic-powers.js";
import{TemplateModule}from"../src/templates/template-module.js";
import{BIG_BANG_BLACK_HOLE_CHANCE,BIG_BANG_CELL_SIZE,BIG_BANG_MAX_CELLS_PER_UPDATE,BIG_BANG_SYSTEM_CHANCE}from"../src/systems/stellar/big-bang.js";
function makeEngine(){
 const definitions=new Map,entities=new Map,powers=new Map,templates=new Map,events=[];let id=0;
 const engine={
  registry:{register:(type,definition)=>definitions.set(type,definition),get:type=>definitions.get(type)},
  templates:{register:item=>templates.set(item.id,item),get:key=>templates.get(key)||null,all:category=>[...templates.values()].filter(item=>!category||item.category===category)},
  world:{get:key=>entities.get(key)||null,has:key=>entities.has(key),all:()=>[...entities.values()],byType:type=>[...entities.values()].filter(item=>item.type===type),add(item){const value=Object.freeze({...item});entities.set(value.id,value);events.push({kind:"ENTITY_CREATED",entity:value});return value},remove(key){const value=entities.get(key)||null;entities.delete(key);if(value)events.push({kind:"ENTITY_DESTROYED",entity:value});return value},record:(kind,details={})=>{const event=Object.freeze({kind,...details});events.push(event);return event},history:()=>[...events]},
  bus:{emit:(kind,detail)=>events.push({kind,detail})},powers:{register:power=>powers.set(power.id,power)},
  create(type,props={}){const def=definitions.get(type);if(!def)throw Error("Unknown type "+type);return engine.world.add({id:"entity-"+(++id),type,...def.create(props)})},
  remove:key=>engine.world.remove(key),
  usePower(key,input={}){const power=powers.get(key),valid=power.validate({engine,input});if(valid!==true)throw new Error(valid);return power.execute({engine,input})}
 };
 CosmosModule.install(engine);TemplateModule.install(engine);CosmicPowersModule.install(engine);
 return engine;
}
function createRegion(engine,name="Genesis"){
 const universe=engine.create("cosmic.empty-space"),region=engine.usePower("CREATE_SYSTEM",{universeId:universe.id,name,position:{x:.5,y:.5}});
 return{universe,region};
}
function moveInto(engine,region,seed){
 engine.usePower("BIG_BANG",{systemId:region.id,seed,bounds:{left:.5,right:.5,top:.5,bottom:.5}});
}
function visitSquare(engine,region,side=18){
 const bounds={left:.5,right:.5+(side+.5)*BIG_BANG_CELL_SIZE,top:.5,bottom:.5+(side+.5)*BIG_BANG_CELL_SIZE};
 for(let i=0;i<Math.ceil((side+1)**2/BIG_BANG_MAX_CELLS_PER_UPDATE)+5;i++)engine.bigBang.update({systemId:region.id,bounds});
 return bounds;
}
test("Big Bang starts only in an empty top-level region, never in a solar system",()=>{
 const engine=makeEngine(),{region}=createRegion(engine);
 assert.throws(()=>engine.usePower("BIG_BANG",{systemId:"missing"}),/top-level empty region/);
 assert.equal(engine.usePower("BIG_BANG",{systemId:region.id,seed:"region-seed",bounds:{left:.5,right:.5,top:.5,bottom:.5}}).active,true);
 assert.equal(engine.world.get(region.id).regionId,region.id);
 assert.equal(engine.world.get(region.id).metadata.role,"galaxy-region");
 const solar=engine.create("cosmic.star-system",{universeId:region.id,parentSystemId:region.id,regionId:region.id});
 assert.throws(()=>engine.usePower("BIG_BANG",{systemId:solar.id}),/top-level empty region/);
});
test("Big Bang primes visible cells once and does nothing while the player remains still",()=>{
 const engine=makeEngine(),{region}=createRegion(engine),bounds={left:.5,right:.5+BIG_BANG_CELL_SIZE*.8,top:.5,bottom:.5+BIG_BANG_CELL_SIZE*.8};
 moveInto(engine,region,"still-seed");
 const before=engine.bigBang.status().visitedCells;
 for(let i=0;i<120;i++)engine.bigBang.update({systemId:region.id,bounds});
 assert.equal(engine.bigBang.status().visitedCells,before);
 assert.equal(engine.world.byType("cosmic.star-system").length,1);
});
test("new explored cells create sparse nested solar systems and deterministic bodies",()=>{
 const first=makeEngine(),second=makeEngine(),a=createRegion(first).region,b=createRegion(second).region;
 moveInto(first,a,"shared-seed");moveInto(second,b,"shared-seed");
 visitSquare(first,a,22);visitSquare(second,b,22);
 const systems=first.world.byType("cosmic.star-system").filter(item=>item.parentSystemId===a.id);
 const twins=second.world.byType("cosmic.star-system").filter(item=>item.parentSystemId===b.id);
 assert.ok(systems.length>0,"the explored area should eventually contain rare systems");
 assert.ok(systems.length<40,"solar systems remain sparse across hundreds of cells");
 assert.equal(systems.length,twins.length);
 assert.deepEqual(systems.map(item=>item.position),twins.map(item=>item.position));
 assert.ok(systems.every(item=>item.regionId===a.id&&item.universeId===a.id));
 assert.equal(first.world.byType("cosmic.star-system").filter(item=>!item.parentSystemId).length,1,"children stay inside Genesis instead of becoming galaxies");
 for(const system of systems){
  const stars=first.world.byType("cosmic.star").filter(item=>item.systemId===system.id),planets=first.world.byType("cosmic.terrestrial-planet").filter(item=>item.systemId===system.id);
  assert.equal(stars.length,1);
  assert.ok(planets.length>=2&&planets.length<=4);
  assert.ok(planets.every(planet=>planet.metadata.origin==="big-bang"));
 }
});
test("black holes are rarer than systems and remain in the region coordinate space",()=>{
 assert.ok(BIG_BANG_BLACK_HOLE_CHANCE<BIG_BANG_SYSTEM_CHANCE);
 assert.equal(BIG_BANG_CELL_SIZE,.45);
 const engine=makeEngine(),{region}=createRegion(engine);moveInto(engine,region,"hole-seed");visitSquare(engine,region,35);
 const holes=engine.world.byType("cosmic.black-hole").filter(item=>item.systemId===region.id);
 assert.ok(holes.every(hole=>Number.isFinite(hole.positionAU.x)&&Number.isFinite(hole.positionAU.y)));
 assert.ok(holes.length<engine.bigBang.status().visitedCells*.02);
});
