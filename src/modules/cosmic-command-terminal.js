export function findNearestStarInRegion({engine,collisions,regionId,coordinates,bigBangStatus}={}){
 if(!bigBangStatus?.active||!regionId||bigBangStatus.regionId!==regionId)return{ok:false,reason:"big-bang-inactive"};
 if(!Number.isFinite(coordinates?.x)||!Number.isFinite(coordinates?.y))return{ok:false,reason:"invalid-coordinates"};
 const target={x:(coordinates.x-.5)*100,y:(coordinates.y-.5)*100};
 let nearest=null;
 for(const star of engine.world.byType("cosmic.star")){
  const system=engine.world.get(star.systemId);
  if(!system||!(system.id===regionId||system.regionId===regionId))continue;
  const position=collisions.positionOf(star);
  if(!position)continue;
  const distanceAU=Math.hypot(position.x-target.x,position.y-target.y);
  if(!nearest||distanceAU<nearest.distanceAU)nearest={star,system,position,distanceAU};
 }
 return nearest?{ok:true,...nearest,coordinates:{x:.5+nearest.position.x/100,y:.5+nearest.position.y/100}}:{ok:false,reason:"no-stars"};
}
