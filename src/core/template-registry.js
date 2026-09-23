// Recipes are registered here. They are never individual world entities.
export class TemplateRegistry{
 constructor(){this.templates=new Map()}
 register(template){if(!template?.id||!template.category)throw new Error("A template requires id and category");if(this.templates.has(template.id))throw new Error("Template already registered: "+template.id);this.templates.set(template.id,deepFreeze({...template}));return this}
 get(id){return this.templates.get(id)}
 has(id){return this.templates.has(id)}
 all(category){const list=[...this.templates.values()];return category?list.filter(template=>template.category===category):list}
}
function deepFreeze(value){if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.values(value).forEach(deepFreeze);Object.freeze(value)}return value}
