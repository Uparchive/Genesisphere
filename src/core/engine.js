import{EventBus}from"./event-bus.js";import{Registry}from"./registry.js";import{WorldStore}from"./world-store.js";import{TemplateRegistry}from"./template-registry.js";import{PowerRegistry}from"./power-registry.js";
export class GenesisEngine{
 constructor(){this.bus=new EventBus();this.registry=new Registry();this.world=new WorldStore();this.templates=new TemplateRegistry();this.powers=new PowerRegistry();this.modules=new Map()}
 use(module){if(this.modules.has(module.id))throw new Error("Module already installed: "+module.id);module.install?.(this);this.modules.set(module.id,Object.freeze({id:module.id,version:module.version||"1.0.0"}));this.bus.emit("module:installed",{id:module.id});return this}
 create(type,props={}){const def=this.registry.get(type);if(!def)throw new Error("Unknown creation type: "+type);const entity={id:crypto.randomUUID(),type,schemaVersion:def.schemaVersion||1,createdAt:Date.now(),...def.create(props)};const saved=this.world.add(entity);this.bus.emit("entity:created",saved);return saved}
 usePower(id,input={}){return this.powers.execute(id,this,input)}
}
