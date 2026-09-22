// Generic planet-focus interaction. Applies to any planet renderer registered by the presentation layer.
export class PlanetFocusController{
 constructor(){this.focused=null}
 enter(planet){this.focused=planet}
 exit(){this.focused=null}
 get active(){return this.focused!==null}
}
