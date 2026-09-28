import test from"node:test";
import assert from"node:assert/strict";
import{createGenesisEngine}from"../src/game-engine.js";
import{BIG_BANG_BLACK_HOLE_CHANCE,BIG_BANG_CELL_SIZE,BIG_BANG_MAX_CELLS_PER_UPDATE,BIG_BANG_SYSTEM_CHANCE}from"../src/systems/stellar/big-bang.js";
const makeEngine=()=>createGenesisEngine({empty:false});
function createRegion(engine,name="Genesis"){
 const universe=engine.create("cosmic.empty-space"),region=engine.usePower("CREATE_SYSTEM",{universeId:universe.id,name,position:{x:.5,y:.5}});
 return{universe,region};
}
function moveInto(engine,region,seed){
 engine.usePower("BIG_BANG",{systemId:region.id,seed,bounds:{left:.5,right:.5,top:.5,bottom:.5}});
}
function visitSquare(engine,region,side=18){
 const bounds={left:.5,right:.5+(side+.5)*BIG_BANG_CELL_SIZE,top:.5,bottom:.5+(side+.5)*BIG_BANG_CELL_SIZE};
 for(let i=0;i<Math.ceil((side+1)**2/BIG_BANG_MAX_CELLS_PER_UPDATE)+5;i++)engine.commands.dispatch({type:"UpdateBigBang",input:{systemId:region.id,bounds}});
 return bounds;
}
test("Big Bang starts in a top-level region and rejects nested solar systems",()=>{
 const engine=makeEngine(),{region}=createRegion(engine);
 assert.throws(()=>engine.usePower("BIG_BANG",{systemId:"missing"}),/top-level region/);
 assert.equal(engine.usePower("BIG_BANG",{systemId:region.id,seed:"region-seed",bounds:{left:.5,right:.5,top:.5,bottom:.5}}).active,true);
 assert.equal(engine.world.get(region.id).regionId,region.id);
 assert.equal(engine.world.get(region.id).metadata.role,"galaxy-region");
 const solar=engine.create("cosmic.star-system",{universeId:region.id,parentSystemId:region.id,regionId:region.id});
 assert.throws(()=>engine.usePower("BIG_BANG",{systemId:solar.id}),/top-level region/);
});
test("manual star, planet, and black hole powers work in Genesis before Big Bang",()=>{
 const engine=makeEngine(),{region}=createRegion(engine);
 const star=engine.usePower("CREATE_STAR",{systemId:region.id,templateId:"star.g-type",positionAU:{x:0,y:0}});
 const planet=engine.usePower("CREATE_PLANET",{systemId:region.id,parentStarId:star.id,templateId:"planet.terrestrial",semiMajorAxisAU:1,periodDays:365.25});
 const hole=engine.usePower("CREATE_BLACK_HOLE",{systemId:region.id,positionAU:{x:8,y:0}});
 assert.equal(star.systemId,region.id);assert.equal(planet.planet.systemId,region.id);assert.equal(hole.systemId,region.id);
 assert.equal(engine.usePower("BIG_BANG",{systemId:region.id,seed:"with-manual-bodies",bounds:{left:.5,right:.5,top:.5,bottom:.5}}).active,true);
});
test("Big Bang primes visible cells once and does nothing while the player remains still",()=>{
 const engine=makeEngine(),{region}=createRegion(engine),bounds={left:.5,right:.5+BIG_BANG_CELL_SIZE*.8,top:.5,bottom:.5+BIG_BANG_CELL_SIZE*.8};
 moveInto(engine,region,"still-seed");
 const before=engine.bigBang.status().visitedCells;
 for(let i=0;i<120;i++)engine.commands.dispatch({type:"UpdateBigBang",input:{systemId:region.id,bounds}});
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
