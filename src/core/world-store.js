// WorldStore is the persistent, presentation-independent source of truth.
export class WorldStore{
 constructor(){this.entities=new Map();this.events=[]}
 add(entity){if(this.entities.has(entity.id))throw new Error("Entity id already exists");const frozen=Object.freeze({...entity});this.entities.set(entity.id,frozen);this.events.push(Object.freeze({kind:"ENTITY_CREATED",entity:frozen,at:Date.now()}));return frozen}
 remove(id){const entity=this.entities.get(id);if(!entity)return null;this.entities.delete(id);this.events.push(Object.freeze({kind:"ENTITY_DESTROYED",entity,at:Date.now()}));return entity}
 get(id){return this.entities.get(id)}
 has(id){return this.entities.has(id)}
 all(){return [...this.entities.values()]}
 byType(type){return this.all().filter(entity=>entity.type===type)}
 history(){return [...this.events]}
}
