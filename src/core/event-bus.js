export class EventBus{
 constructor(){this.listeners=new Map();this.transactions=[];this.listenerErrors=[]}
 on(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);return()=>this.listeners.get(type)?.delete(fn)}
 emit(type,payload){if(this.transactions.length){this.transactions.at(-1).push([type,payload]);return}this.publish(type,payload)}
 beginTransaction(){this.transactions.push([])}
 commitTransaction(){const events=this.transactions.pop();if(!events)return;if(this.transactions.length)this.transactions.at(-1).push(...events);else for(const[type,payload]of events)this.publish(type,payload)}
 rollbackTransaction(){this.transactions.pop()}
 publish(type,payload){for(const fn of this.listeners.get(type)||[])try{fn(payload)}catch(error){this.listenerErrors.push(Object.freeze({type,error,at:Date.now()}));if(this.listenerErrors.length>100)this.listenerErrors.shift()}}
}
