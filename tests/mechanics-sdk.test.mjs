import test from "node:test";import assert from "node:assert/strict";import{createGenesisEngine}from"../src/game-engine.js";import{DomainError}from"../src/core/command-bus.js";
test("SDK validates requirements before mutation",()=>{const engine=createGenesisEngine(),before=engine.world.snapshot();let executed=false;engine.powers.register({id:"SDK_REQ",sdk:true,requirements:["targetId"],validate:()=>true,execute:()=>{executed=true}});assert.throws(()=>engine.usePower("SDK_REQ",{}),e=>e instanceof DomainError&&e.code==="POWER_VALIDATION_FAILED");assert.equal(executed,false);assert.deepEqual(engine.world.snapshot(),before)});
test("SDK context is restricted",()=>{const engine=createGenesisEngine();let keys;engine.powers.register({id:"SDK_CONTEXT",sdk:true,validate:({context})=>{keys=Object.keys(context).sort();return true},execute:()=>"ok"});assert.equal(engine.usePower("SDK_CONTEXT"),"ok");assert.deepEqual(keys,["commands","events","query"])});
test("two representative powers use SDK",()=>{const engine=createGenesisEngine(),system=engine.world.byType("cosmic.star-system")[0],hole=engine.usePower("CREATE_BLACK_HOLE",{systemId:system.id,positionAU:{x:2,y:0}});assert.equal(hole.type,"cosmic.black-hole");assert.equal(engine.powers.get("CREATE_BLACK_HOLE").sdk,true);const star=engine.usePower("CREATE_STAR",{systemId:system.id,templateId:"star.g-type"}),created=engine.usePower("CREATE_PLANET",{systemId:system.id,parentStarId:star.id,templateId:"planet.terrestrial",semiMajorAxisAU:1,periodDays:365.25}),destroyed=engine.usePower("DESTROY_PLANET",{planetId:created.planet.id});assert.equal(destroyed.planet.id,created.planet.id);assert.equal(engine.world.has(created.planet.id),false);assert.equal(engine.world.has(created.orbit.id),false);assert.equal(engine.powers.get("DESTROY_PLANET").sdk,true)});

test("every existing player power uses the SDK and dispatches mutations through Core commands",()=>{
  const engine=createGenesisEngine(),ids=["BIG_BANG","CREATE_BLACK_HOLE","CREATE_PLANET","CREATE_STAR","CREATE_SYSTEM","DESTROY_PLANET"];
  assert.deepEqual(engine.powers.all().map(power=>power.id).sort(),ids);
  assert.ok(engine.powers.all().every(power=>power.sdk));
  const commands=[],dispatch=engine.commands.dispatch.bind(engine.commands);
  engine.commands.dispatch=command=>{commands.push(command.type);return dispatch(command)};
  const universe=engine.world.byType("cosmic.empty-space")[0];
  const system=engine.usePower("CREATE_SYSTEM",{universeId:universe.id,position:{x:.52,y:.48}});
  const star=engine.usePower("CREATE_STAR",{systemId:system.id,templateId:"star.g-type"});
  const planet=engine.usePower("CREATE_PLANET",{systemId:system.id,parentStarId:star.id,templateId:"planet.terrestrial",semiMajorAxisAU:1,periodDays:365.25});
  engine.usePower("CREATE_BLACK_HOLE",{systemId:system.id,positionAU:{x:4,y:0}});
  engine.usePower("DESTROY_PLANET",{planetId:planet.planet.id});
  engine.usePower("BIG_BANG",{systemId:system.id,seed:"sdk-route",bounds:{left:.52,right:.52,top:.48,bottom:.48}});
  engine.commands.dispatch({type:"UpdateBigBang",input:{systemId:system.id,bounds:null}});
  assert.ok(commands.includes("CreateEntity"));
  assert.ok(commands.includes("RemoveEntity"));
  assert.ok(commands.includes("StartBigBang"));
  assert.ok(commands.includes("UpdateBigBang"));
  assert.ok(commands.filter(type=>type==="ExecutePower").length>=6);
});

test("power catalog exposes presentation metadata for newly registered powers",()=>{
  const engine=createGenesisEngine();
  engine.powers.register({id:"UI_EXTENSION",presentation:{label:"Pulso",icon:"✦",description:"Uma ação visual genérica.",surface:"inventory",interaction:"invoke"},validate:()=>true,execute:()=>"ok"});

  const power=engine.powers.catalog().find(item=>item.id==="UI_EXTENSION");
  assert.deepEqual(power,{id:"UI_EXTENSION",label:"Pulso",icon:"✦",description:"Uma ação visual genérica.",surface:"inventory",interaction:"invoke"});
  assert.equal("execute" in power,false);
  assert.deepEqual(engine.powers.getPresentation("UI_EXTENSION"),power);
});

test("power availability uses Core validation without mutating state",()=>{
  const engine=createGenesisEngine(),universe=engine.world.byType("cosmic.empty-space")[0],before=engine.world.snapshot();
  engine.powers.register({id:"UI_VALIDATION",sdk:true,requirements:["targetId"],validate:({context,input})=>context.query.entity(input.targetId)?.type==="cosmic.empty-space"||"Choose a valid universe",execute:()=>{throw new Error("availability must not execute")}});

  assert.equal(engine.powers.checkAvailability("UI_VALIDATION",engine,{}).available,false);
  assert.match(engine.powers.checkAvailability("UI_VALIDATION",engine,{targetId:"missing"}).reason,/valid universe/);
  assert.deepEqual(engine.powers.checkAvailability("UI_VALIDATION",engine,{targetId:universe.id}),{available:true,reason:"",code:null});
  assert.deepEqual(engine.world.snapshot(),before);
});
