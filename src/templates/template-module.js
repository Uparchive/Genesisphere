import{STAR_TEMPLATES}from"./stars/catalog.js";
import{PLANET_TEMPLATES}from"./planets/catalog.js";
export const TemplateModule={id:"templates",version:"1.0.0",install(engine){[...STAR_TEMPLATES,...PLANET_TEMPLATES].forEach(template=>engine.templates.register(template))}};
