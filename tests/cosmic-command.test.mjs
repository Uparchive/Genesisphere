import test from"node:test";
import assert from"node:assert/strict";
import{executeCosmicCommand,findNearestStarInRegion}from"../src/modules/cosmic-command-terminal.js";
const region={id:"region",regionId:"region"},solar={id:"solar",regionId:"region"},other={id:"other",regionId:"other"};
function context({active=true,regionId="region"}={}){
 const systems=new Map([[region.id,region],[solar.id,solar],[other.id,other]]),stars=[
  {id:"near",name:"Near",systemId:"solar"},
  {id:"far",name:"Far",systemId:"region"},
  {id:"unrelated",name:"Other Region",systemId:"other"}
 ],positions=new Map([["near",{x:3,y:4}],["far",{x:15,y:0}],["unrelated",{x:0,y:0}]]);
 return{engine:{world:{byType:type=>type==="cosmic.star"?stars:[],get:id=>systems.get(id)}},collisions:{positionOf:star=>positions.get(star.id)},regionId:"region",coordinates:{x:.5,y:.5},bigBangStatus:{active,regionId}};
}
test("returns the nearest star in the active Genesis region",()=>{
 const result=findNearestStarInRegion(context());
 assert.equal(result.ok,true);assert.equal(result.star.id,"near");assert.equal(result.distanceAU,5);
 assert.deepEqual(result.coordinates,{x:.53,y:.54});
});
test("does not show a star unless Big Bang is active in this region",()=>{
 assert.deepEqual(findNearestStarInRegion(context({active:false})),{ok:false,reason:"big-bang-inactive"});
 assert.deepEqual(findNearestStarInRegion(context({regionId:"another"})),{ok:false,reason:"big-bang-inactive"});
});
test("reports when this region has no generated stars",()=>{
 const input=context();input.engine.world.byType=()=>[];assert.deepEqual(findNearestStarInRegion(input),{ok:false,reason:"no-stars"});
});
test("dispatches the supported coordinate-star command and its English alias",()=>{
 const input=context();
 const localized=executeCosmicCommand({...input,raw:"coordenada estrela"});
 assert.equal(localized.ok,true);assert.equal(localized.command,"/coordenada estrela");assert.equal(localized.star.id,"near");
 const english=executeCosmicCommand({...input,raw:"/coordinate estrela"});
 assert.equal(english.ok,true);assert.equal(english.command,"/coordinate estrela");
});
test("rejects unsupported commands and returns clear inactive/no-star messages",()=>{
 const input=context();
 assert.deepEqual(executeCosmicCommand({...input,raw:"/planeta marte"}),{ok:false,reason:"invalid-command",command:"/planeta marte",message:"Use: /coordenada estrela"});
 assert.match(executeCosmicCommand({...input,raw:"/coordenada estrela",bigBangStatus:{active:false,regionId:"region"}}).message,/Ative o Big Bang/);
 input.engine.world.byType=()=>[];
 assert.match(executeCosmicCommand({...input,raw:"/coordenada estrela"}).message,/Nenhuma estrela/);
});
