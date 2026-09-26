// Deterministic, viewport-independent coordinates and procedural starfield.
const STAR_CELL_SIZE=1/32;

export function worldAtScreen(point,{x:centerX,y:centerY},width,height,zoom){
  const scale=Math.max(Number.EPSILON,zoom);
  return{x:centerX+(point.x-width/2)/(width*scale),y:centerY+(point.y-height/2)/(height*scale)};
}

export function screenAtWorld(point,{x:centerX,y:centerY},width,height,zoom){
  return{x:width/2+(point.x-centerX)*width*zoom,y:height/2+(point.y-centerY)*height*zoom};
}

export function panWorldCenter(center,delta,width,height,zoom){
  return{x:center.x-delta.x/(width*zoom),y:center.y-delta.y/(height*zoom)};
}

export function zoomWorldCenterAtScreen(center,point,width,height,oldZoom,newZoom){
  const anchor=worldAtScreen(point,center,width,height,oldZoom);
  return{x:anchor.x-(point.x-width/2)/(width*newZoom),y:anchor.y-(point.y-height/2)/(height*newZoom)};
}

function random(seed){
  let value=seed>>>0;
  return()=>{value+=0x6d2b79f5;let next=value;next=Math.imul(next^(next>>>15),next|1);next^=next+Math.imul(next^(next>>>7),next|61);return((next^(next>>>14))>>>0)/4294967296};
}

function cellSeed(x,y){
  const fold=value=>{const high=Math.floor(value/4294967296),low=value-high*4294967296;return(Math.imul(low|0,0x45d9f3b)^Math.imul(high|0,0x27d4eb2d))>>>0};
  let seed=(fold(x)^Math.imul(fold(y),0x27d4eb2d))>>>0;
  seed=Math.imul(seed^(seed>>>16),0x45d9f3b)>>>0;
  return(seed^(seed>>>16))>>>0;
}

/** Generate the same stars for the same world coordinates at any viewport size. */
export function starsForView(center,width,height,zoom){
  if(!(width>0&&height>0&&zoom>0))return[];
  const halfX=.5/zoom,halfY=height/(2*width*zoom);
  const left=center.x-halfX, right=center.x+halfX;
  const top=center.y-halfY, bottom=center.y+halfY;
  const minX=Math.floor(left/STAR_CELL_SIZE),maxX=Math.floor(right/STAR_CELL_SIZE);
  const minY=Math.floor(top/STAR_CELL_SIZE),maxY=Math.floor(bottom/STAR_CELL_SIZE);
  const stars=[];
  for(let cellX=minX;cellX<=maxX;cellX++)for(let cellY=minY;cellY<=maxY;cellY++){
    const seed=cellSeed(cellX,cellY),roll=random(seed),count=2+(seed&1);
    for(let index=0;index<count;index++){
      const worldX=(cellX+roll())*STAR_CELL_SIZE;
      const worldY=(cellY+roll())*STAR_CELL_SIZE;
      stars.push({x:width/2+(worldX-center.x)*width*zoom,y:height/2+(worldY-center.y)*height*zoom,r:.3+roll()*.85,a:.15+roll()*.7});
    }
  }
  return stars;
}
