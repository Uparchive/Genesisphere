// Dedicated renderer for Astra-1. No other planet inherits these visuals.
export function renderAstra1(ctx,{x,y,r,time=0,detail=1}){
 const v={ocean:"#176da0",oceanDeep:"#082b55",land:"#3f8053",landLight:"#79a35d",ice:"#e8f5f7",cloud:"rgba(245,252,255,.72)",atmosphere:"rgba(92,180,255,.55)"};
 ctx.save();ctx.translate(x,y);
 const atm=ctx.createRadialGradient(0,0,r*.72,0,0,r*1.18);atm.addColorStop(0,"rgba(50,130,210,0)");atm.addColorStop(.82,"rgba(70,155,235,.14)");atm.addColorStop(1,"rgba(70,155,235,0)");ctx.fillStyle=atm;ctx.beginPath();ctx.arc(0,0,r*1.18,0,Math.PI*2);ctx.fill();
 ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();
 const sea=ctx.createRadialGradient(-r*.35,-r*.4,r*.05,0,0,r);sea.addColorStop(0,"#54b7df");sea.addColorStop(.38,v.ocean);sea.addColorStop(1,v.oceanDeep);ctx.fillStyle=sea;ctx.fillRect(-r,-r,r*2,r*2);
 if(detail>.9){const rot=(time*.000018)%(Math.PI*2);ctx.fillStyle=v.land;for(let i=0;i<7;i++){const a=rot+i*.91,px=Math.sin(a)*r*.58,py=Math.sin(a*1.7+i)*r*.45,ww=r*(.28+(i%3)*.07),hh=r*(.16+(i%2)*.1);ctx.beginPath();ctx.ellipse(px,py,ww,hh,a*.35,0,Math.PI*2);ctx.fill()}ctx.fillStyle=v.landLight;ctx.globalAlpha=.42;for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(Math.sin(rot+i*1.4)*r*.5,Math.cos(rot*.7+i)*r*.35,r*.14,r*.07,i,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;ctx.fillStyle=v.ice;ctx.beginPath();ctx.ellipse(0,-r*.91,r*.42,r*.13,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(0,r*.92,r*.34,r*.1,0,0,Math.PI*2);ctx.fill()}
 if(detail>1.8){ctx.strokeStyle=v.cloud;ctx.lineWidth=Math.max(1,r*.025);ctx.globalAlpha=.5;for(let i=0;i<5;i++){const yy=(-.55+i*.27)*r;ctx.beginPath();ctx.arc(Math.sin(time*.000025+i)*r*.25,yy,r*(.45-i*.035),.15,2.75);ctx.stroke()}ctx.globalAlpha=1}
 const night=ctx.createLinearGradient(-r*.7,0,r*.8,0);night.addColorStop(0,"rgba(0,0,0,0)");night.addColorStop(.58,"rgba(0,0,0,.08)");night.addColorStop(1,"rgba(0,0,0,.72)");ctx.fillStyle=night;ctx.fillRect(-r,-r,r*2,r*2);
 ctx.restore();ctx.save();ctx.translate(x,y);ctx.strokeStyle=v.atmosphere;ctx.lineWidth=Math.max(1,r*.045);ctx.beginPath();ctx.arc(0,0,r*1.03,0,Math.PI*2);ctx.stroke();ctx.restore();
}