import test from "node:test";
import assert from "node:assert/strict";
import { CosmosModule } from "../src/modules/cosmos.js";
import { CosmicPowersModule } from "../src/powers/cosmic-powers.js";

function createEngine(){
  const entityTypes=new Map,entities=new Map,powers=new Map,events=[];
  let nextId=0;
  const engine={
    registry:{register(type,definition){entityTypes.set(type,definition)}},
    templates:{get(){return null}},
    world:{
      get:id=>entities.get(id)||null,
      byType:type=>[...entities.values()].filter(entity=>entity.type===type)
    },
    bus:{emit:(kind,details)=>events.push({kind,details})},
    powers:{register(power){powers.set(power.id,power)}},
    create(type,props={}){
      const definition=entityTypes.get(type);
      if(!definition)throw new Error("Unknown type "+type);
      const entity={id:"entity-"+(++nextId),type,...definition.create(props)};
      entities.set(entity.id,entity);return entity;
    },
    usePower(id,input){
      const power=powers.get(id);
      const validation=power.validate({engine,input});
      if(validation!==true)throw new Error(validation);
      return power.execute({engine,input});
    },
    events
  };
  CosmosModule.install(engine);
  CosmicPowersModule.install(engine);
  return engine;
}

test("the create black hole power registers an entity with mass and horizon data",()=>{
  const engine=createEngine();
  const universe=engine.create("cosmic.empty-space");
  const system=engine.usePower("CREATE_SYSTEM",{universeId:universe.id,position:{x:.5,y:.5}});
  const blackHole=engine.usePower("CREATE_BLACK_HOLE",{
    systemId:system.id,massSolar:10,positionAU:{x:1.25,y:-.5},name:"Sagittarius A*"
  });
  assert.equal(blackHole.type,"cosmic.black-hole");
  assert.equal(blackHole.massSolar,10);
  assert.ok(blackHole.eventHorizonRadiusAU>0);
  assert.ok(blackHole.captureRadiusAU>blackHole.eventHorizonRadiusAU);
  assert.ok(engine.events.some(event=>event.kind==="black-hole:created"));
});

test("the create black hole power rejects invalid masses",()=>{
  const engine=createEngine();
  const universe=engine.create("cosmic.empty-space");
  const system=engine.usePower("CREATE_SYSTEM",{universeId:universe.id,position:{x:.5,y:.5}});
  assert.throws(()=>engine.usePower("CREATE_BLACK_HOLE",{systemId:system.id,massSolar:0,positionAU:{x:0,y:0}}),/CREATE_BLACK_HOLE requires/);
});
