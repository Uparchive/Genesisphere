// Gameplay-oriented stellar energy estimate. It is deliberately simple, explicit
// and independent from Canvas, camera and input coordinates.
export function stellarLuminosity(star){return (star.radiusSolar??1)**2*((star.temperatureK??5778)/5778)**4}
export function classifyOrbit(star,semiMajorAxisAU){
 if(!(semiMajorAxisAU>0))throw new RangeError("semiMajorAxisAU must be positive");
 const stellarFlux=stellarLuminosity(star)/(semiMajorAxisAU**2);
 let thermalClass="MUITO FRIO";
 if(stellarFlux>2.2)thermalClass="MUITO QUENTE";
 else if(stellarFlux>1.5)thermalClass="QUENTE";
 else if(stellarFlux>=.72)thermalClass="ZONA POTENCIALMENTE HABITÁVEL";
 else if(stellarFlux>=.22)thermalClass="FRIO";
 return Object.freeze({stellarFlux:Number(stellarFlux.toFixed(3)),thermalClass,habitabilityPotential:thermalClass==="ZONA POTENCIALMENTE HABITÁVEL"});
}
export function habitableBandAU(star){const luminosity=stellarLuminosity(star);return Object.freeze({inner:Math.sqrt(luminosity/1.5),outer:Math.sqrt(luminosity/.72)})}
