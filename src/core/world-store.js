// WorldStore is the persistent, presentation-independent source of truth.
export class WorldStore{
 constructor(){this.entities=new Map();this.events=[]}
 add(entity){if(this.entities.has(entity.id))throw new Error("Entity id already exists");const frozen=Object.freeze({...entity});this.entities.set(entity.id,frozen);this.events.push(Object.freeze({kind:"ENTITY_CREATED",entity:frozen,at:Date.now()}));return frozen}
 get(id){return this.entities.get(id)}
 has(id){return this.entities.has(id)}
 all(){return [...this.entities.values()]}
 byType(type){return this.all().filter(entity=>entity.type===type)}
 history(){return [...this.events]}
}
