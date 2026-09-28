import { createMechanicContext } from "../../core/mechanic-registry.js";

export const BIG_BANG_CELL_SIZE=.45;
export const BIG_BANG_SYSTEM_CHANCE=.07;
export const BIG_BANG_BLACK_HOLE_CHANCE=.004;
export const BIG_BANG_MAX_CELLS_PER_UPDATE=8;
const PLANET_COUNT_MIN=2,PLANET_COUNT_MAX=4;
function hashText(value){let hash=2166136261;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return hash>>>0}
function randomFor(seed){let state=seed>>>0;return()=>{state+=0x6d2b79f5;let value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return((value^(value>>>14))>>>0)/4294967296}}
function regionSystem(context,id){const item=context.query.entity(id);return item?.type==="cosmic.star-system"&&item.parentSystemId==null?item:null}
function cellRange(bounds,origin){const left=Math.min(bounds.left,bounds.right),right=Math.max(bounds.left,bounds.right),top=Math.min(bounds.top,bounds.bottom),bottom=Math.max(bounds.top,bounds.bottom);return{x0:Math.floor((left-origin.x)/BIG_BANG_CELL_SIZE),x1:Math.floor((right-origin.x)/BIG_BANG_CELL_SIZE),y0:Math.floor((top-origin.y)/BIG_BANG_CELL_SIZE),y1:Math.floor((bottom-origin.y)/BIG_BANG_CELL_SIZE)}}
function boundsCells(bounds,origin){const range=cellRange(bounds,origin),cells=[];for(let x=range.x0;x<=range.x1;x++)for(let y=range.y0;y<=range.y1;y++)cells.push({x,y,key:x+","+y});return cells}
function persistRegion(context,region,metadata){const changes={regionId:region.id,metadata:Object.freeze({...region.metadata,...metadata,role:"galaxy-region"})};return context.commands.dispatch({type:"UpdateEntity",entityId:region.id,changes})}
function addSystem(context,region,cell,random,seed){
 const starTemplates=context.query.templates("star"),planetTemplates=context.query.templates("planet");
 if(!starTemplates.length||!planetTemplates.length)return null;
 const x=region.position.x+(cell.x+.2+random()*.6)*BIG_BANG_CELL_SIZE,y=region.position.y+(cell.y+.2+random()*.6)*BIG_BANG_CELL_SIZE;
 const system=context.commands.dispatch({type:"CreateEntity",entityType:"cosmic.star-system",properties:{name:"Sistema "+(context.query.entitiesByType("cosmic.star-system").filter(item=>item.parentSystemId===region.id).length+1),universeId:region.id,parentSystemId:region.id,regionId:region.id,position:{x,y},metadata:{origin:"big-bang",seed,cell:cell.key}}});context.events.emit("system:created",system);
 const starTemplate=starTemplates[Math.floor(random()*starTemplates.length)],star=context.commands.dispatch({type:"ExecutePower",powerId:"CREATE_STAR",input:{systemId:system.id,templateId:starTemplate.id,name:"Estrela do sistema",positionAU:{x:0,y:0}}});
 const count=PLANET_COUNT_MIN+Math.floor(random()*(PLANET_COUNT_MAX-PLANET_COUNT_MIN+1));let axis=.35;
 for(let index=0;index<count;index++){
  axis*=1.65+random()*.35;
  const template=planetTemplates[Math.floor(random()*planetTemplates.length)],phaseRadians=random()*Math.PI*2,massSolar=Math.max(.03,star.massSolar||1),periodDays=365.25*Math.sqrt(axis**3/massSolar);
  context.commands.dispatch({type:"ExecutePower",powerId:"CREATE_PLANET",input:{systemId:system.id,parentStarId:star.id,templateId:template.id,name:"Planeta "+(index+1),semiMajorAxisAU:axis,eccentricity:random()*.12,phaseRadians,periodDays,metadata:{origin:"big-bang",seed,cell:cell.key}}});
 }
 return system;
}
function addBlackHole(context,region,cell,random,seed){
 const x=region.position.x+(cell.x+.2+random()*.6)*BIG_BANG_CELL_SIZE,y=region.position.y+(cell.y+.2+random()*.6)*BIG_BANG_CELL_SIZE;
 const positionAU={x:(x-region.position.x)*100,y:(y-region.position.y)*100};
 return context.commands.dispatch({type:"ExecutePower",powerId:"CREATE_BLACK_HOLE",input:{systemId:region.id,name:"Buraco negro distante",massSolar:4+random()*36,position:{x,y},positionAU,metadata:{origin:"big-bang",seed,cell:cell.key}}});
}
export function createBigBangController(engine){
 const context=createMechanicContext(engine);
 let process=null;const visitedByRegion=new Map;
 const status=()=>Object.freeze(process?{active:process.active,regionId:process.regionId,seed:process.seed,visitedCells:process.visited.size,systems:process.systems,blackHoles:process.blackHoles,reason:process.reason||null}:{active:false,regionId:null,seed:null,visitedCells:0,systems:0,blackHoles:0,reason:null});
 function finish(reason){if(!process||!process.active)return;process.active=false;process.reason=reason;const event=Object.freeze({regionId:process.regionId,seed:process.seed,visitedCells:process.visited.size,systems:process.systems,blackHoles:process.blackHoles,reason});context.commands.dispatch({type:"RecordWorldEvent",kind:"BIG_BANG_FINISHED",details:event});context.events.emit("region:big-bang-finished",event)}
 function generate(cell){
  const region=regionSystem(context,process.regionId);if(!region){finish("region-missing");return}
  const seed=process.seed+":"+cell.key,random=randomFor(hashText(seed));
  const roll=random();if(roll<BIG_BANG_SYSTEM_CHANCE){if(addSystem(context,region,cell,random,process.seed))process.systems++}
  else if(roll<BIG_BANG_SYSTEM_CHANCE+BIG_BANG_BLACK_HOLE_CHANCE){addBlackHole(context,region,cell,random,process.seed);process.blackHoles++}
 }
 return Object.freeze({
  start({systemId,seed=Date.now(),bounds}={}){
   if(process?.active)return{...status(),alreadyActive:true};
   const region=regionSystem(context,systemId);if(!region)throw new Error("BIG_BANG requires a top-level region");
   const updated=region.regionId===region.id?region:persistRegion(context,region,{bigBangEnabled:true});
   const visited=visitedByRegion.get(systemId)||new Set;visitedByRegion.set(systemId,visited);
   process={active:true,regionId:systemId,seed:String(seed),visited,systems:0,blackHoles:0,reason:null};
   if(bounds)for(const cell of boundsCells(bounds,updated.position))visited.add(cell.key);
   const event=Object.freeze({regionId:systemId,seed:process.seed,cellSize:BIG_BANG_CELL_SIZE,systemChance:BIG_BANG_SYSTEM_CHANCE,blackHoleChance:BIG_BANG_BLACK_HOLE_CHANCE});
   context.commands.dispatch({type:"RecordWorldEvent",kind:"BIG_BANG_STARTED",details:event});context.events.emit("region:big-bang-started",event);return status();
  },
  update({systemId:activeRegionId,bounds}={}){
   if(!process?.active||activeRegionId!==process.regionId||!bounds)return status();
   const region=regionSystem(context,process.regionId);if(!region){finish("region-missing");return status()}
   let count=0;
   for(const cell of boundsCells(bounds,region.position)){if(process.visited.has(cell.key))continue;process.visited.add(cell.key);generate(cell);if(++count>=BIG_BANG_MAX_CELLS_PER_UPDATE)break}
   return status();
  },
  status
 });
}
