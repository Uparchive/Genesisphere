const isEditableTarget=target=>target instanceof HTMLElement&&(target.isContentEditable||Boolean(target.closest("input, textarea, select, [contenteditable='true']")));

export class SpatialNavigationController{
  constructor({onMove,eventTarget=window}){
    this.onMove=onMove;
    this.keys=new Set;
    this.onKeyDown=this.handleKeyDown.bind(this);
    this.onKeyUp=this.handleKeyUp.bind(this);
    this.onBlur=this.clear.bind(this);
    eventTarget.addEventListener("keydown",this.onKeyDown);
    eventTarget.addEventListener("keyup",this.onKeyUp);
    eventTarget.addEventListener("blur",this.onBlur);
    this.eventTarget=eventTarget;
  }

  handleKeyDown(event){
    if(isEditableTarget(event.target))return;
    if(["KeyW","KeyA","KeyS","KeyD"].includes(event.code))this.keys.add(event.code);
  }

  handleKeyUp(event){
    if(["KeyW","KeyA","KeyS","KeyD"].includes(event.code))this.keys.delete(event.code);
  }

  clear(){this.keys.clear()}

  update(deltaSeconds,{zoom=1,enabled=true}={}){
    if(!enabled||!this.keys.size)return false;
    const horizontal=(this.keys.has("KeyA")?1:0)-(this.keys.has("KeyD")?1:0);
    const vertical=(this.keys.has("KeyW")?1:0)-(this.keys.has("KeyS")?1:0);
    if(!horizontal&&!vertical)return false;
    const magnitude=Math.hypot(horizontal,vertical);
    const speed=640/Math.max(.55,zoom);
    const distance=speed*Math.min(deltaSeconds,.05)/magnitude;
    this.onMove({x:horizontal*distance,y:vertical*distance});
    return true;
  }

  destroy(){
    this.eventTarget.removeEventListener("keydown",this.onKeyDown);
    this.eventTarget.removeEventListener("keyup",this.onKeyUp);
    this.eventTarget.removeEventListener("blur",this.onBlur);
    this.clear();
  }
}
