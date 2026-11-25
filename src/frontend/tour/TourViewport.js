import {DesignViewport} from '../designer/DesignViewport.js';
import {hitLabel} from '../designer/balloon-labels.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import {outdoorSurface} from '../designer/outdoor.js';
import {tourHints,touchPrimary} from './tour-hints.js';

// 一般手勢維持環繞、轉頭、平面平移與選取；只有明確啟用放置模式才送出放置點。
export class TourViewport extends DesignViewport{
 invalidate(){
  if(!this.headset?.ownsFrames)super.invalidate();
 }
 frame(now){
  if(this.headset?.ownsFrames){this.frameId=null;return;}
  // 陀螺儀轉頭與其他導覽畫面同樣受 30 fps 上限。30 在 60／90／120 Hz 螢幕都能整除成等距畫格；
  // 實機（90 Hz）量測 24 fps 上限實得 22.5 fps，提高到 60 則只得 45 fps。
  const sensing=!!this.orientation?.apply(now);
  super.frame(now);
  // 手機轉動期間連續出畫格，不等個別感測事件，節奏才會固定；停下後即停止。
  if(sensing&&this.orientation.moving(now))this.invalidate();
 }
 // 頭顯以自己的相機繪製場景；在 VR 中開關門或換樓層後，仍需桌面畫格才會執行的幾何重建。
 // 頭顯中一律載入完整場景：自動細節是依桌面相機位置篩選家具，而頭顯畫格不會隨頭部位置重新篩選；
 // 頁面在 VR 中重設細節模式（例如開關門後的 syncViews）也不影響這裡。
 syncHeadsetScene(){
  const project=this.preview||this.project;if(!this.rebuild||!this.renderer||!project)return false;
  const interior=this.interiorMode,street=this.streetMode;this.interiorMode=this.streetMode='full';
  try{this.syncDesign(project);}finally{this.interiorMode=interior;this.streetMode=street;}
  return true;
 }
 // 觸控裝置的提示不提滾輪、滑鼠按鍵或鍵盤。
 setInputMode(touch){
  const hints=tourHints(touch);this.planHint=this.mode==='plan'?hints.planHint:null;
  if(this.canvas)this.canvas.title=this.mode==='scene'?hints.sceneTitle:hints.planTitle;
  this.invalidate();
 }
 destroy(){
  if(!this.headset){super.destroy();return;}
  // Three must finish detaching the XR framebuffer before disposing WebGL.
  const headset=this.headset;
  if(headset.disposed)return;
  if(!headset.session){headset.destroy();super.destroy();return;}
  headset.destroy().finally(()=>super.destroy());
 }
 resize(){
  if(this.headset?.ownsFrames)return;
  const beforeWidth=this.width,beforeHeight=this.height;super.resize();
  if(this.mode==='plan'&&this.project&&this.width>1&&this.height>1&&(this.width!==beforeWidth||this.height!==beforeHeight))this.fit();
 }
 mount(container){
  const result=super.mount(container);this.canvas.setAttribute('aria-label',this.mode==='scene'?'3D 場景導覽，環繞檢視或自由走動':'2D 平面定位，雙擊地坪移動至該處');
  this.setInputMode(touchPrimary());return result;
 }
 pick(e){
  if(this.mode!=='scene')return super.pick(e);if(!this.project)return null;
  const r=this.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();this.camera.updateMatrixWorld(true);ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
  const hits=ray.intersectObject(this.design?.group||new THREE.Group(),true).filter(h=>h.object.isMesh&&this.isVisible(h.object)&&(!h.object.userData.ignorePicking||this.coreHit(h.object)||this.placement&&h.object.userData.kind==='slab')),hit=hits.find(h=>h.object.userData.kind==='vertex')||hits[0];if(!hit)return null;
  let levelId=null;for(let object=hit.object;object;object=object.parent)if(object.userData.floorId){levelId=object.userData.floorId;break;}
  return {...(this.coreHit(hit.object)||(hit.object.userData.kind==='outdoor-ground'?{...hit.object.userData,kind:'object'}:hit.object.userData)),levelId,point:hit.point,normal:hit.face?.normal.clone().transformDirection(hit.object.matrixWorld)};
 }
 pointerDown(e){
  if(!this.project)return;this.pendingLabel=null;this.navigationPress={x:e.clientX,y:e.clientY,moved:false,button:e.button,placing:!!this.placement};
  if(e.button===0&&!this.placement){const r=this.canvas.getBoundingClientRect(),g=hitLabel(this.labelGroups||[],e.clientX-r.left,e.clientY-r.top);if(g){e.preventDefault();e.stopImmediatePropagation();this.pendingLabel={items:g.items,point:{x:e.clientX,y:e.clientY}};this.navigationPress=null;return;}}
  if(this.walk?.active){super.pointerDown(e);return;}
  if(this.mode==='plan'){
   e.preventDefault();e.stopImmediatePropagation();this.canvas.focus();
   if(e.button!==0){this.drag={type:'pan',start:{x:e.clientX,y:e.clientY},center:{...this.center}};this.canvas.setPointerCapture(e.pointerId);}
  }
 }
 pointerMove(e){
  if(this.navigationPress&&Math.hypot(e.clientX-this.navigationPress.x,e.clientY-this.navigationPress.y)>=4)this.navigationPress.moved=true;
  if(this.lookDrag&&this.walk?.active||this.drag?.type==='pan')super.pointerMove(e);
 }
 pointerUp(e){
  const press=this.navigationPress;this.navigationPress=null;
  if(this.lookDrag||this.drag?.type==='pan')super.pointerUp(e);
  if(press&&!press.moved&&press.button===0){if(press.placing){this.placementClickUntil=performance.now()+600;this.placeAtEvent(e);}else this.options.onPick?.(this.pick(e));}
 }
 placeAtEvent(e){
  if(this.mode==='plan'){const point=this.pointer(e);if(point)this.options.onPlace?.({...point,levelId:this.building.activeLevelId});return;}
  const hit=this.pick(e),level=this.building?.levels.find(l=>l.id===hit?.levelId)||this.building?.levels.find(l=>l.id===this.building.activeLevelId),object=level?.design.objects.find(o=>o.id===hit?.id);
  if(!hit?.point||hit.normal?.y<.65||!['room','slab'].includes(hit.kind)&&!(object&&outdoorSurface(object,hit.point)!==null)){this.options.onMessage?.('請點選可見地坪；牆面與家具表面不作為地坪放置點。');return;}
  this.options.onPlace?.({x:hit.point.x,y:hit.point.y,z:hit.point.z,levelId:level.id});
 }
 doubleClick(e){if(this.placement||performance.now()<(this.placementClickUntil||0)){e.preventDefault();e.stopImmediatePropagation();return;}super.doubleClick(e);}
 cancelDrag(){this.navigationPress=null;this.lookDrag=null;this.drag=null;this.preview=null;this.planPress=null;if(this.controls&&!this.walk?.active)this.controls.enabled=true;this.invalidate();}
}
