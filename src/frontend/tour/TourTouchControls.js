const KEYS={forward:'w',backward:'s',left:'a',right:'d'};
export const TOUR_TOUCH_ACTIONS=['forward','backward','left','right','turn-left','turn-right'];

// The pad supplies ordinary walk input. WalkController continues to own speed,
// floors and collision; no control changes the camera's world position directly.
export class TourTouchControls{
 constructor(view,{windowTarget=globalThis.window,documentTarget=globalThis.document,requestFrame=globalThis.requestAnimationFrame?.bind(globalThis),cancelFrame=globalThis.cancelAnimationFrame?.bind(globalThis)}={}){
  this.view=view;this.windowTarget=windowTarget;this.documentTarget=documentTarget;this.requestFrame=requestFrame;this.cancelFrame=cancelFrame;this.held=new Map();this.ownedKeys=new Set();this.buttons=new Map();this.listeners=[];this.pulseTimers=new Set();this.frame=null;this.lastTurn=null;this.blocked=false;
  this.listen(windowTarget,'blur',()=>this.reset());this.listen(documentTarget,'visibilitychange',()=>{if(documentTarget.hidden)this.reset();});
 }
 listen(target,event,fn){if(!target)return;target.addEventListener(event,fn);this.listeners.push(()=>target.removeEventListener(event,fn));}
 bind(button,action){
  if(!TOUR_TOUCH_ACTIONS.includes(action))throw new Error('未知的導覽方向。');this.buttons.set(button,action);button.setAttribute('aria-pressed','false');let suppressClickUntil=0;
  this.listen(button,'pointerdown',e=>{if(e.button!==0||button.disabled)return;e.preventDefault();suppressClickUntil=Date.now()+350;button.setPointerCapture?.(e.pointerId);this.press('pointer:'+e.pointerId,action,button);});
  const release=e=>{suppressClickUntil=Date.now()+350;this.release('pointer:'+e.pointerId);};this.listen(button,'pointerup',release);this.listen(button,'pointercancel',release);this.listen(button,'lostpointercapture',release);
  this.listen(button,'keydown',e=>{if(![' ','Enter'].includes(e.key)||button.disabled)return;e.preventDefault();suppressClickUntil=Date.now()+350;if(!e.repeat)this.press('key:'+action+':'+e.key,action,button);});
  this.listen(button,'keyup',e=>{if(![' ','Enter'].includes(e.key))return;e.preventDefault();suppressClickUntil=Date.now()+350;this.release('key:'+action+':'+e.key);});
  this.listen(button,'blur',()=>{suppressClickUntil=Date.now()+350;for(const [source,entry]of this.held)if(entry.button===button)this.held.delete(source);this.sync();});
  // Assistive technology can activate a button without pointer/key events.
  this.listen(button,'click',e=>{if(e.detail!==0||button.disabled||this.held.size||Date.now()<suppressClickUntil)return;const source='activate:'+action;this.press(source,action,button);const timer=setTimeout(()=>{this.pulseTimers.delete(timer);this.release(source);},160);this.pulseTimers.add(timer);});
 }
 press(source,action,button){if(this.blocked||!this.view.walk.active)return;this.held.set(source,{action,button});this.sync();}
 release(source){if(this.held.delete(source))this.sync();}
 sync(){
  const actions=new Set([...this.held.values()].map(e=>e.action)),wanted=new Set([...actions].map(a=>KEYS[a]).filter(Boolean));
  for(const key of this.ownedKeys)if(!wanted.has(key))this.view.walk.keys.delete(key);for(const key of wanted)this.view.walk.keys.add(key);this.ownedKeys=wanted;
  for(const [button,action]of this.buttons){const pressed=actions.has(action);button.setAttribute('aria-pressed',String(pressed));button.classList.toggle('is-selected',pressed);}
  if(!actions.has('turn-left')&&!actions.has('turn-right')){if(this.frame!==null)this.cancelFrame?.(this.frame);this.frame=null;this.lastTurn=null;}else if(this.frame===null)this.frame=this.requestFrame?.(now=>this.turn(now))??null;
  this.view.invalidate();
 }
 turn(now){
  this.frame=null;if(!this.view.walk.active||this.blocked){this.reset();return;}const actions=new Set([...this.held.values()].map(e=>e.action)),turn=Number(actions.has('turn-left'))-Number(actions.has('turn-right'));if(!actions.has('turn-left')&&!actions.has('turn-right'))return;
  const dt=Math.min(.05,this.lastTurn===null?.016:Math.max(0,(now-this.lastTurn)/1000));this.lastTurn=now;this.view.walk.yaw+=turn*dt*1.4;this.view.walk.look();this.view.invalidate();this.frame=this.requestFrame?.(time=>this.turn(time))??null;
 }
 setEnabled(enabled){this.blocked=!enabled;if(!enabled)this.reset();}
 reset(){for(const timer of this.pulseTimers)clearTimeout(timer);this.pulseTimers.clear();this.held.clear();this.sync();}
 destroy(){this.reset();this.listeners.splice(0).forEach(fn=>fn());this.buttons.clear();}
}
