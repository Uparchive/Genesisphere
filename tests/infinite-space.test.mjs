import test from "node:test";
import assert from "node:assert/strict";
import {panWorldCenter,screenAtWorld,starsForView,worldAtScreen,zoomWorldCenterAtScreen} from "../src/modules/infinite-space.js";

test("screen and world coordinates round-trip at arbitrary positions",()=>{
  const center={x:1000000.375,y:-98231.125},point={x:712,y:403};
  const world=worldAtScreen(point,center,1366,768,.6);
  const screen=screenAtWorld(world,center,1366,768,.6);
  assert.ok(Math.abs(screen.x-point.x)<1e-6);
  assert.ok(Math.abs(screen.y-point.y)<1e-6);
});

test("panning changes the view center by the exact world distance",()=>{
  const old={x:10.5,y:-3.25},next=panWorldCenter(old,{x:240,y:-120},1200,800,.75);
  assert.deepEqual(next,{x:10.233333333333333,y:-3.05});
  assert.deepEqual(worldAtScreen({x:600,y:400},next,1200,800,.75),next);
});

test("zooming around the pointer keeps its world coordinate fixed",()=>{
  const center={x:20.25,y:17.75},anchor={x:930,y:140};
  const before=worldAtScreen(anchor,center,1366,768,1.2);
  const next=zoomWorldCenterAtScreen(center,anchor,1366,768,1.2,4.5);
  const after=worldAtScreen(anchor,next,1366,768,4.5);
  assert.ok(Math.abs(before.x-after.x)<1e-12);
  assert.ok(Math.abs(before.y-after.y)<1e-12);
});

test("procedural stars are deterministic and preserve positions after leaving and returning",()=>{
  const first=starsForView({x:12.5,y:-8.25},1366,768,1);
  const repeat=starsForView({x:12.5,y:-8.25},1366,768,1);
  assert.deepEqual(repeat,first);
  assert.ok(first.length>300);
  const neighbor=starsForView({x:12.7,y:-8.25},1366,768,1);
  const returned=starsForView({x:12.5,y:-8.25},1366,768,1);
  assert.deepEqual(returned,first);
  assert.notDeepEqual(neighbor,first);
});

test("procedural stars cover the full visible height instead of a horizontal strip",()=>{
  const width=1366,height=768,stars=starsForView({x:.527236,y:.487771},width,height,.6);
  const bands=Array.from({length:8},(_,band)=>stars.filter(star=>star.y>=band*height/8&&star.y<(band+1)*height/8).length);
  assert.ok(stars.some(star=>star.y<height*.08));
  assert.ok(stars.some(star=>star.y>height*.92));
  assert.ok(bands.every(count=>count>0));
});

test("field generation remains bounded for supported zoom and common viewport sizes",()=>{
  const stars=starsForView({x:1e9,y:-1e9},3840,2160,.55);
  assert.ok(stars.length>1000&&stars.length<10000);
  assert.ok(stars.every(star=>Number.isFinite(star.x)&&Number.isFinite(star.y)));
});
