import{habitableBandAU,classifyOrbit}from"./habitability.js";
const CELL_SIZE=.18;
const GENERATION_INTERVAL_MS=650;
const FRONTIER_INTERVAL_MS=2200;
const MAX_CELLS_PER_FRAME=1;
const MAX_FRONTIER_STEPS_PER_FRAME=1;

function hashText(value){let hash=2166136261;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return hash>>>0}
function randomFor(seed){
 let state=seed>>>0;
 return()=>{state+=0x6d2b79f5;let value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return((value^(value>>>14))>>>0)/4294967296}
}
function spiral(index){
 if(index===0)return{x:0,y:0};
 const ring=Math.ceil((Math.sqrt(index+1)-1)/2),side=ring*2,max=(2*ring+1)**2-1,offset=max-index;
 if(offset<side)return{x:ring-offset,y:-ring};
 if(offset<2*side)return{x:-ring,y:-ring+(offset-side)};
 if(offset<3*side)return{x:-ring+(offset-2*side),y:ring};
 return{x:ring,y:ring-(offset-3*side)}
}
const roman=n=>["I","II","III","IV","V","VI","VII","VIII"][n-1]||String(n);

export function createBigBangController(engine){
 let process=null;
 const visited=new Set,queued=new Set,queue=[],lifeAges=new Map;
 let processedCells=0,createdSystems=0,createdPlanets=0,lifeWorlds=0;
 function enqueue(x,y){
  const key=x+","+y;
  if(visited.has(key)||queued.has(key))return;
  if(queue.length>=512)return;
  queued.add(key);queue.push({x,y,key});
 }
 function enqueueView(bounds){
  const minX=Math.floor(bounds.left/CELL_SIZE),maxX=Math.floor(bounds.right/CELL_SIZE);
  const minY=Math.floor(bounds.top/CELL_SIZE),maxY=Math.floor(bounds.bottom/CELL_SIZE);
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)enqueue(x,y);
 }
 function createPlanet(system,star,starIndex,planetIndex,planetCount,random){
  const templates=engine.templates.all("planet");
  if(!templates.length)return null;
  const band=habitableBandAU(star),hasLife=random()<.46;
  const protectedOrbit=planetIndex===0&&planetCount>1;
  const axis=protectedOrbit
   ?band.inner+random()*(band.outer-band.inner)
   :.3+planetIndex*.68+random()*.28;
  const eccentricity=random()*.16,periodDays=365.25*Math.sqrt(axis**3/Math.max(.03,star.massSolar||1));
  let template=templates[Math.floor(random()*templates.length)];
  if(hasLife)template=templates.filter(item=>item.baseProperties.kind!=="gas-giant")[Math.floor(random()*Math.max(1,templates.filter(item=>item.baseProperties.kind!=="gas-giant").length))]||template;
  const properties=template.baseProperties||{},phase=random()*Math.PI*2;
  const orbit=engine.create("cosmic.orbit",{systemId:system.id,parentStarId:star.id,semiMajorAxisAU:axis,eccentricity,periodDays,phaseRadians:phase});
  const thermal=classifyOrbit(star,axis),isAlive=hasLife&&thermal.habitabilityPotential&&properties.kind!=="gas-giant";
  const life=isAlive?"microbial":"none";
  const planet=engine.create("cosmic.terrestrial-planet",{
   ...properties,name:system.name+"-"+roman(planetIndex+1),systemId:system.id,parentStarId:star.id,
   orbitId:orbit.id,semiMajorAxisAU:axis,eccentricity,periodDays,phaseRadians:phase,
   environment:thermal,life,lifeStage:life,lifeAgeYears:0,lifePotential:thermal.habitabilityPotential
  });
  createdPlanets++;
  if(isAlive){lifeAges.set(planet.id,0);lifeWorlds++}
  return planet;
 }
 function generateCell(cell){
  visited.add(cell.key);queued.delete(cell.key);processedCells++;
  const cellSeed=hashText(process.seed+":"+cell.x+":"+cell.y),random=randomFor(cellSeed);
  if(random()>.68)return;
  const universe=engine.world.get(process.universeId);if(!universe)return;
  const planetsBefore=createdPlanets;
  const x=(cell.x+.18+random()*.64)*CELL_SIZE,y=(cell.y+.18+random()*.64)*CELL_SIZE;
  const coordinateKey=cell.x.toString(36)+"-"+cell.y.toString(36);
  const system=engine.create("cosmic.star-system",{
   name:"Gênese-"+coordinateKey,universeId:process.universeId,position:{x,y},
   metadata:{origin:"big-bang",seed:cellSeed,cell:cell.key}
  });
  createdSystems++;
  const starTemplates=engine.templates.all("star");
  if(!starTemplates.length)return;
  const starCount=random()<.14?2:1;
  const stars=[];
  for(let index=0;index<starCount;index++){
   const template=starTemplates[Math.floor(random()*starTemplates.length)];
   const star=engine.create("cosmic.star",{
    ...(template.baseProperties||{}),templateId:template.id,
    name:system.name+(starCount===2?(index===0?" A":" B"):""),
    systemId:system.id,position:{x:.5,y:.5},
    positionAU:index===0?{x:0,y:0}:{x:.12,y:0}
   });
   stars.push(star);
  }
  for(const star of stars){
   const count=2+Math.floor(random()*5);
   for(let index=0;index<count;index++)createPlanet(system,star,stars.indexOf(star),index,count,random);
  }
  if(random()<.035){
   const massSolar=4+random()*36,angle=random()*Math.PI*2,distance=14+random()*24;
   engine.create("cosmic.black-hole",{
    name:"Singularidade "+coordinateKey,systemId:system.id,massSolar,
    position:{x:.5,y:.5},positionAU:{x:Math.cos(angle)*distance,y:Math.sin(angle)*distance}
   });
  }
  engine.world.record("BIG_BANG_SYSTEM_CREATED",{systemId:system.id,universeId:process.universeId,cell:cell.key,seed:cellSeed,planetCount:createdPlanets-planetsBefore});
 }
 function updateLife(deltaSimulationMs){
  if(!(deltaSimulationMs>0))return;
  const years=deltaSimulationMs/1000*36/365.25;
  const thresholds=[["microbial",0],["simple",20],["complex",250],["intelligent",2500]];
  for(const[id,age]of lifeAges){
   const planet=engine.world.get(id);if(!planet){lifeAges.delete(id);continue}
   const nextAge=age+years;lifeAges.set(id,nextAge);
   let stage="microbial";
   for(const[candidate,threshold]of thresholds)if(nextAge>=threshold)stage=candidate;
   if(stage===planet.lifeStage)continue;
   engine.remove(id);
   const updated=engine.world.add({...planet,life:stage,lifeStage:stage,lifeAgeYears:nextAge});
   engine.bus.emit("planet:life-evolved",{planetId:id,systemId:planet.systemId,lifeStage:stage,lifeAgeYears:nextAge});
   engine.world.record("PLANET_LIFE_EVOLVED",{planetId:id,systemId:planet.systemId,lifeStage:stage,lifeAgeYears:nextAge});
  }
 }
 return Object.freeze({
  start({universeId,center={x:.5,y:.5},seed=Date.now()}){
   if(process?.active)return{...this.status(),alreadyActive:true};
   process={active:true,universeId,seed:String(seed),origin:{x:center.x,y:center.y},startedAtMs:Date.now(),originCell:{x:Math.floor(center.x/CELL_SIZE),y:Math.floor(center.y/CELL_SIZE)},spiralIndex:1,frontierElapsedMs:0,generationElapsedMs:GENERATION_INTERVAL_MS};
   enqueueView({left:center.x-CELL_SIZE,right:center.x+CELL_SIZE,top:center.y-CELL_SIZE,bottom:center.y+CELL_SIZE});
   engine.world.record("BIG_BANG_STARTED",{universeId,seed:process.seed,origin:process.origin});
   engine.bus.emit("universe:big-bang-started",this.status());
   return this.status();
  },
  update({center,bounds,deltaSimulationMs=0,deltaGenerationMs=deltaSimulationMs}={}){
   if(!process?.active)return this.status();
   updateLife(deltaSimulationMs);
   if(bounds)enqueueView(bounds);
   else if(center)enqueueView({left:center.x-CELL_SIZE,right:center.x+CELL_SIZE,top:center.y-CELL_SIZE,bottom:center.y+CELL_SIZE});
   if(deltaGenerationMs>0){
    process.frontierElapsedMs=Math.min(FRONTIER_INTERVAL_MS*2,process.frontierElapsedMs+deltaGenerationMs);
    let steps=0;
    while(process.frontierElapsedMs>=FRONTIER_INTERVAL_MS&&steps++<MAX_FRONTIER_STEPS_PER_FRAME){
     process.frontierElapsedMs-=FRONTIER_INTERVAL_MS;
     const offset=spiral(process.spiralIndex++);
     enqueue(process.originCell.x+offset.x,process.originCell.y+offset.y);
    }
    process.generationElapsedMs=Math.min(GENERATION_INTERVAL_MS*MAX_CELLS_PER_FRAME,process.generationElapsedMs+deltaGenerationMs);
    const budget=Math.min(MAX_CELLS_PER_FRAME,Math.floor(process.generationElapsedMs/GENERATION_INTERVAL_MS));
    for(let index=0;index<budget&&queue.length;index++){
     process.generationElapsedMs-=GENERATION_INTERVAL_MS;
     generateCell(queue.shift());
    }
   }
   return this.status();
  },
  status(){return Object.freeze({active:Boolean(process?.active),universeId:process?.universeId||null,seed:process?.seed||null,origin:process?.origin||null,burstProgress:process?Math.min(1,(Date.now()-process.startedAtMs)/4200):1,generatedCells:processedCells,systems:createdSystems,planets:createdPlanets,lifeWorlds})}
 });
}
