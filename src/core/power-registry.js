import{DomainError}from"./command-bus.js";
// Powers are player actions. They are separate from physics and rendering.
export class PowerRegistry{
 constructor(){this.powers=new Map()}
 register(power){if(!power?.id||typeof power.validate!=="function"||typeof power.execute!=="function")throw new Error("A power requires id, validate() and execute()");if(this.powers.has(power.id))throw new Error("Power already registered: "+power.id);this.powers.set(power.id,Object.freeze({...power}));return this}
 get(id){return this.powers.get(id)}
 execute(id,engine,input={}){const power=this.get(id);if(!power)throw new DomainError("UNKNOWN_POWER","Unknown power: "+id,{powerId:id});const validation=power.validate({engine,input});if(validation!==true)throw new DomainError("POWER_VALIDATION_FAILED",typeof validation==="string"?validation:"Power validation failed: "+id,{powerId:id});const result=power.execute({engine,input});engine.bus.emit("power:used",Object.freeze({powerId:power.id,powerVersion:power.version||"1.0.0",input:{...input},result,at:Date.now()}));return result}
}
