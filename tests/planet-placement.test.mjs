import test from "node:test";
import assert from "node:assert/strict";
import {CosmosModule} from "../src/modules/cosmos.js";
import {CosmicPowersModule} from "../src/powers/cosmic-powers.js";

function engineFixture(){
  const types=new Map,entities=new Map,powers=new Map,events=[];
  let id=0;
  const engine={
    registry:{register:(type,definition)=>types.set(type,definition)},
    templates:{get:key=>key==="planet-template"?{category:"planet",baseProperties:{massEarth:1,radiusEarth:1}}:null},
    world:{get:key=>entities.get(key)||null,byType:type=>[...entities.values()].filter(entity=>entity.type===type)},
    bus:{emit:(type,data)=>events.push({type,data})},
    powers:{register:power=>powers.set(power.id,power)},
    create(type,properties={}){const entity={id:`entity-${++id}`,type,...types.get(type).create(properties)};entities.set(entity.id,entity);return entity},
    usePower(powerId,input){const power=powers.get(powerId),valid=power.validate({engine,input});if(valid!==true)throw new Error(valid);return power.execute({engine,input})},
    events
  };
  CosmosModule.install(engine);
  CosmicPowersModule.install(engine);
  return engine;
}

test("placing a planet preserves the chosen point as its orbital phase",()=>{
  const engine=engineFixture();
  const universe=engine.create("cosmic.empty-space");
  const system=engine.usePower("CREATE_SYSTEM",{universeId:universe.id,position:{x:.5,y:.5}});
  const star=engine.create("cosmic.star",{systemId:system.id,massSolar:1});
  const phaseRadians=1.2345;
  const result=engine.usePower("CREATE_PLANET",{
    systemId:system.id,parentStarId:star.id,templateId:"planet-template",
    semiMajorAxisAU:1.7,eccentricity:0,phaseRadians,periodDays:365.25*Math.sqrt(1.7**3)
  });
  assert.equal(result.planet.orbit.phaseRadians,phaseRadians);
  assert.equal(result.orbit.phaseRadians,phaseRadians);
});
