// WorldStore is the persistent, presentation-independent source of truth.
export class WorldStore{
 constructor(){this.entities=new Map();this.events=[]}
 add(entity){if(this.entities.has(entity.id))throw new Error("Entity id already exists");const frozen=Object.freeze({...entity});this.entities.set(entity.id,frozen);this.events.push(Object.freeze({kind:"ENTITY_CREATED",entity:frozen,at:Date.now()}));return frozen}
 remove(id){const entity=this.entities.get(id);if(!entity)return null;this.entities.delete(id);this.events.push(Object.freeze({kind:"ENTITY_DESTROYED",entity,at:Date.now()}));return entity}
 get(id){return this.entities.get(id)}
 has(id){return this.entities.has(id)}
 all(){return [...this.entities.values()]}
 byType(type){return this.all().filter(entity=>entity.type===type)}
 record(kind,details={}){const event=Object.freeze({kind,...details,at:Date.now()});this.events.push(event);return event}
 history(){return [...this.events]}
 snapshot(){return{version:1,entities:this.all(),events:this.events.slice(-500)}}
 restore(snapshot){
  if(!snapshot||snapshot.version!==1||!Array.isArray(snapshot.entities)||!Array.isArray(snapshot.events))throw new Error("Unsupported world snapshot");
  const entities=new Map();
  for(const entity of snapshot.entities){if(!entity||typeof entity.id!=="string"||typeof entity.type!=="string"||entities.has(entity.id))throw new Error("Invalid world snapshot entity");entities.set(entity.id,Object.freeze(structuredClone(entity)))}
  this.entities=entities;this.events=snapshot.events.slice(-500).map(event=>Object.freeze(structuredClone(event)));
 }
}
