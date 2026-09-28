import test from "node:test";
import assert from "node:assert/strict";
import { createGenesisEngine } from "../src/game-engine.js";

const createEngine=()=>createGenesisEngine();

test("the create black hole power registers an entity with mass and horizon data",()=>{
  const engine=createEngine();
  const events=[];engine.bus.on("black-hole:created",event=>events.push(event));
  const universe=engine.create("cosmic.empty-space");
  const system=engine.usePower("CREATE_SYSTEM",{universeId:universe.id,position:{x:.5,y:.5}});
  const blackHole=engine.usePower("CREATE_BLACK_HOLE",{
    systemId:system.id,massSolar:10,positionAU:{x:1.25,y:-.5},name:"Sagittarius A*"
  });
  assert.equal(blackHole.type,"cosmic.black-hole");
  assert.equal(blackHole.massSolar,10);
  assert.ok(blackHole.eventHorizonRadiusAU>0);
  assert.ok(blackHole.captureRadiusAU>blackHole.eventHorizonRadiusAU);
  assert.equal(events.length,1);
});

test("the create black hole power rejects invalid masses",()=>{
  const engine=createEngine();
  const universe=engine.create("cosmic.empty-space");
  const system=engine.usePower("CREATE_SYSTEM",{universeId:universe.id,position:{x:.5,y:.5}});
  assert.throws(()=>engine.usePower("CREATE_BLACK_HOLE",{systemId:system.id,massSolar:0,positionAU:{x:0,y:0}}),/CREATE_BLACK_HOLE requires/);
});
