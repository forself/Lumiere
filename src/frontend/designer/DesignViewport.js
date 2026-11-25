import {applyReferenceProjection} from './reference-camera.js';
import {drawReference} from './reference-overlay.js';
import {drawVehiclePlan} from './vehicle-geometry.js';
import {createStreetScene} from './street-scene.js';
import {createInteriorIndex,interiorState} from './interior-streaming.js';
import {drawOutdoorPlan} from './outdoor.js';
import {manualLabel,clusterLabels,drawLabels,hitLabel} from './balloon-labels.js';
import {floorElevation} from './building-model.js';
import {surfaceInfo} from './surface-load.js';
import {disposeIfcReference} from './ifc-reference.js';
import {RoomEnvironment} from '../../../node_modules/three/examples/jsm/environments/RoomEnvironment.js';
import {disposeMaterialTextures} from './material-pack.js';
import {disposeImportedAsset,checkAssetBudget} from './imported-assets.js';
import {elementOutline,elementContains,ELEMENT_LABELS} from './elements.js';
import {snapDesignPoint} from './snapping.js';
import {liftOutline,liftServes,liftContains,passengerKey} from './elevators.js';
import {WalkController} from './walk.js';
import {stairOutline,stairWorld,stairPath,stairContains} from './stairs.js';
import {downloadBlob} from './design-export.js';
import {MediaRuntime} from './media-runtime.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import {OrbitControls} from '../../../node_modules/three/examples/jsm/controls/OrbitControls.js';
import {wallFrame,entity,snap,insidePolygon,polygonArea,objectPose,chartSectorContains} from './model.js';
import {MATERIALS,ASSETS} from './catalog.js';
import {buildDesign,createMaterialTextures} from './geometry.js';
import {openingParts,openingStyle} from './openings.js';

export function materialEnvironmentNeeded(building,project,entries=[],assets=new Map()){
  if(assets?.size||entries.some(m=>m.channel!=='color'))return true;
  const levels=building?.levels||[{design:project,elements:[]}];
  for(const level of levels){
    const design=level.design;if(!design)continue;
    for(const item of [...design.rooms,...design.walls,...design.objects,...(level.elements||[])]){
      const material=MATERIALS[item.materialId];
      if(material&&(material.metalness>0||material.transmission>0||material.clearcoat>0||material.sheen>0))return true;
    }
  }
  return false;
}

// 方位預設依實際可見幾何取景；大型空地不應把主要構件縮成畫面中央的小點。
export function presetViewBounds(group){
  const all=new THREE.Box3(),meaningful=new THREE.Box3(),box=new THREE.Box3(),size=new THREE.Vector3();
  group?.updateWorldMatrix(true,true);
  group?.traverse(object=>{
    if(!object.isMesh||!object.geometry||['vertex','opening-marker'].includes(object.userData.kind))return;
    for(let node=object;node;node=node.parent)if(!node.visible)return;
    if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
    if(!object.geometry.boundingBox)return;box.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);all.union(box);box.getSize(size);
    if(['room','slab','outdoor-ground'].includes(object.userData.kind)&&size.y<=.3)return;
    meaningful.union(box);
  });
  return meaningful.isEmpty()?all:meaningful;
}

export function framePresetCamera(camera,controls,bounds,value){
  if(bounds.isEmpty()||!['front','side','top'].includes(value))return false;
  const target=bounds.getCenter(new THREE.Vector3()),direction=(value==='front'?new THREE.Vector3(0,.1,1):value==='side'?new THREE.Vector3(1,.1,0):new THREE.Vector3(0,1,.001)).normalize();
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right),delta=new THREE.Vector3();
  let halfWidth=0,halfHeight=0,halfDepth=0;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    delta.set(x,y,z).sub(target);halfWidth=Math.max(halfWidth,Math.abs(delta.dot(right)));halfHeight=Math.max(halfHeight,Math.abs(delta.dot(up)));halfDepth=Math.max(halfDepth,Math.abs(delta.dot(direction)));
  }
  const tangent=Math.tan(camera.getEffectiveFOV()*Math.PI/360),aspect=Number.isFinite(camera.aspect)&&camera.aspect>0?camera.aspect:1;
  const distance=Math.max(controls.minDistance||0,Math.max(halfWidth/(tangent*aspect),halfHeight/tangent)*1.1+halfDepth,camera.near+halfDepth+.01);
  if(Number.isFinite(controls.maxDistance)&&distance>controls.maxDistance)controls.maxDistance=distance;
  controls.target.copy(target);camera.up.set(0,1,0);camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);
  if(camera.far<distance+halfDepth+1){camera.far=(distance+halfDepth+1)*1.1;camera.updateProjectionMatrix();}
  controls.update();camera.updateMatrixWorld(true);return true;
}

export class DesignViewport{
  constructor(options={}){this.options=options;this.mode=options.mode||'plan';this.listeners=[];this.zoom=42;this.center={x:0,z:0};this.lastRender=-Infinity;this.disposed=false;}
  mount(container){
    this.element=document.createElement('div');this.element.className='design-viewport';
    this.canvas=document.createElement('canvas');this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label',this.mode==='plan'?'2D 平面設計畫布':'3D 空間設計畫布');this.element.appendChild(this.canvas);container.appendChild(this.element);
    if(this.mode==='scene'){
      this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false,powerPreference:'default'});this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));this.renderer.transmissionResolutionScale=.5;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#e8e9e2');
      this.scene.add(new THREE.HemisphereLight(0xffffff,0x9c9d8d,2.3));const sun=new THREE.DirectionalLight(0xfff5df,2.6);sun.position.set(-3,9,5);this.scene.add(sun);this.sun=sun;
      this.grid=new THREE.GridHelper(80,160,0xb4bbb0,0xd2d6cc);this.grid.position.y=-.015;this.scene.add(this.grid);
      this.camera=new THREE.PerspectiveCamera(45,1,.1,200);this.camera.position.set(9,10,12);
      this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=true;this.controls.maxPolarAngle=Math.PI*.48;this.controls.minDistance=3;this.controls.maxDistance=80;this.controls.target.set(0,0,0);this.controls.update();
      this.controls.addEventListener('change',()=>this.invalidate());this.textures=createMaterialTextures();this.media=new MediaRuntime(this);this.walk=new WalkController(this);
    }else this.context=this.canvas.getContext('2d');
    this.labelCanvas=document.createElement('canvas');this.labelCanvas.setAttribute('aria-hidden','true');this.labelCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';this.element.appendChild(this.labelCanvas);this.labelContext=this.labelCanvas.getContext('2d');
    if(this.mode==='plan'){this.positionCanvas=document.createElement('canvas');this.positionCanvas.className='design-walk-position';this.positionCanvas.setAttribute('aria-hidden','true');this.positionCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';this.element.appendChild(this.positionCanvas);this.positionContext=this.positionCanvas.getContext('2d');this.canvas.title='選取模式下，左鍵雙擊地坪移至該處；閃爍紅點代表巡覽位置。';}
    const motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');if(this.mode==='plan'&&motion){this.reducePositionMotion=motion.matches;this.on(motion,'change',e=>{this.reducePositionMotion=e.matches;clearTimeout(this.positionTimer);this.positionTimer=null;this.positionBright=true;this.drawWalkPosition();this.schedulePositionBlink();});}
    this.on(this.canvas,'pointerdown',e=>this.pointerDown(e),{capture:true});
    this.on(this.canvas,'dblclick',e=>this.doubleClick(e));
    this.on(this.canvas,'click',e=>{const pending=this.pendingLabel;this.pendingLabel=null;if(!pending)return;e.preventDefault();e.stopImmediatePropagation();this.options.onLabelGroup?.(pending.items,pending.point);},{capture:true});
    this.on(this.canvas,'pointermove',e=>this.pointerMove(e));
    this.on(this.canvas,'pointerup',e=>this.pointerUp(e));
    this.on(this.canvas,'pointercancel',()=>this.cancelDrag());
    this.on(this.canvas,'lostpointercapture',()=>{if(this.drag)this.cancelDrag();});
    this.on(this.canvas,'contextmenu',e=>{e.preventDefault();if(this.walk?.active||this.mode==='scene'&&this.allFloors)return;const hit=this.contextHit;if(hit&&hit.kind!=='vertex'){this.cancelDrag();this.options.onContext?.(hit,{x:e.clientX,y:e.clientY});}});
    this.on(this.canvas,'keydown',e=>{if(this.tool==='polygon'&&['Enter','Backspace'].includes(e.key)){e.preventDefault();if(e.key==='Backspace')this.polygonPoints?.pop();else if(this.polygonPoints?.length>=3){this.options.onCommand?.({type:'addPolygon',points:this.polygonPoints.map(p=>({...p}))});}this.invalidate();return;}this.walk?.key(e,true);if(e.key==='Escape'){this.walk?.stop();this.lookDrag=null;this.cancelDrag();}});this.on(this.canvas,'keyup',e=>this.walk?.key(e,false));this.on(this.canvas,'blur',()=>this.walk?.keys.clear());
    if(this.mode==='plan')this.on(this.canvas,'wheel',e=>{e.preventDefault();this.zoom=THREE.MathUtils.clamp(this.zoom*Math.exp(-e.deltaY*.001),12,110);this.invalidate();},{passive:false});
    this.on(document,'visibilitychange',()=>{this.walk?.keys.clear();if(document.hidden){clearTimeout(this.positionTimer);this.positionTimer=null;}else{this.invalidate();this.schedulePositionBlink();}});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.element);this.resize();
    return this;
  }
  on(target,event,handler,options){target.addEventListener(event,handler,options);this.listeners.push(()=>target.removeEventListener(event,handler,options));}
  setDesign(project,selection,tool){
    this.traceAbort?.abort();this.project=project;this.selection=selection;this.tool=tool;
    if(this.renderer&&this.scene)this.updateEnvironment();
    if(this.drag&&!this.drag.previewing)this.cancelDrag();
    this.rebuild=true;this.invalidate();
  }
  resize(){
    const rect=this.element.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);
    if(this.renderer){this.renderer.setSize(this.width,this.height,false);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();}
    else{const ratio=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(this.width*ratio);this.canvas.height=Math.round(this.height*ratio);this.context.setTransform(ratio,0,0,ratio,0,0);}
    if(this.labelCanvas){const ratio=Math.min(devicePixelRatio||1,2);this.labelCanvas.width=Math.round(this.width*ratio);this.labelCanvas.height=Math.round(this.height*ratio);this.labelContext.setTransform(ratio,0,0,ratio,0,0);}
    if(this.positionCanvas){const ratio=Math.min(devicePixelRatio||1,2);this.positionCanvas.width=Math.round(this.width*ratio);this.positionCanvas.height=Math.round(this.height*ratio);this.positionContext.setTransform(ratio,0,0,ratio,0,0);this.drawWalkPosition();}
    this.invalidate();
  }
  fit(){
    const points=[...(this.allFloors&&this.mode==='scene'?this.building.levels.flatMap(l=>l.design.vertices):(this.project?.vertices||[])),...(this.project?.objects||[]).flatMap(raw=>{const o=objectPose(this.project,raw);if(!raw.outdoor)return [o];const a=o.rotation*Math.PI/180;return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>({x:o.x+x*o.width/2*Math.cos(a)-z*o.depth/2*Math.sin(a),z:o.z+x*o.width/2*Math.sin(a)+z*o.depth/2*Math.cos(a)}));}),...(this.building?.levels.filter(l=>this.allFloors||l.id===this.building.activeLevelId).flatMap(l=>(l.elements||[]).flatMap(e=>elementOutline(e)))||[])];
    if(!points.length)return;
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
    const x=(minX+maxX)/2,z=(minZ+maxZ)/2,total=this.allFloors&&this.mode==='scene'?this.building.levels.reduce((s,l)=>s+l.height,0):0,span=Math.max(6,maxX-minX,maxZ-minZ,total);
    if(this.controls){this.controls.target.set(x,total/2,z);this.camera.position.set(x+span*.65,total/2+span*1.65,z+span*.85);this.controls.update();}
    else{this.center={x,z};this.zoom=Math.min(80,this.width/(maxX-minX+3),this.height/(maxZ-minZ+3));}
    this.invalidate();
  }
  invalidate(){if(!this.disposed&&this.frameId==null)this.frameId=requestAnimationFrame(now=>this.frame(now));}
  frame(now){
    this.frameId=null;if(this.disposed||document.hidden||this.exporting&&!this.rebuild)return;
    if(now-this.lastRender<1000/30-.5){this.invalidate();return;}this.lastRender=now;
    const project=this.preview||this.project;if(!project)return;
    if(this.renderer){
      this.syncDesign(project);
      if(!this.allFloors&&!this.walk.active)for(const [id,root] of this.design.byId)root.visible=!this.hiddenIds?.has(id);
      if(this.walk.active)this.walk.update(now);else this.controls.update();if(!this.allFloors)this.media.update(project,this.camera,now);if(this.referenceCamera)applyReferenceProjection(this.camera,this.referenceCamera,this.width,this.height);this.renderer.render(this.scene,this.camera);if(this.media.playing)this.invalidate();
    }else this.drawPlan(project);
    this.drawBalloons(project);if(this.mode==='scene'){this.options.onLabelFrame?.();this.options.onWalkPosition?.(this.walk.active?this.walk.body||this.camera.position:null);}
  }
  // Brings the 3D design group up to date without drawing it, so a camera other
  // than the desktop one (a headset) can render the same scene.
  syncDesign(project){
    if(this.building&&this.interiorMode!=='full'){
      if(this.interiorBuilding!==this.building){this.interiorBuilding=this.building;this.interiorIndex=createInteriorIndex(this.building);this.interiorActive=new Set();this.interiorKey=null;}
      const observer={x:this.camera.position.x,y:this.camera.position.y+(this.allFloors?0:floorElevation(this.building,this.building.activeLevelId)),z:this.camera.position.z},state=interiorState(this.interiorIndex,observer,{onlyLevelId:this.allFloors?null:this.building.activeLevelId,selectedId:this.walk.active?null:this.selection,selectionLevelId:this.building.activeLevelId,previous:this.interiorActive,passengers:this.liftPassengers});
      if(this.interiorKey!==state.key){this.interiorKey=state.key;}this.interiorActive=state.active;this.visibleObjects=state.allowed;
    }else{if(this.visibleObjects){this.interiorKey=null;}this.visibleObjects=null;}
    const streetOptions={textures:this.textures,importedAssets:this.renderAssets||this.importedAssets,selectedRoomIds:this.zoneRoomIds,selectedId:this.walk.active?null:this.selection,onlyLevelId:this.allFloors?null:this.building?.activeLevelId,roof:!!this.roof,liftLevelId:this.liftLevelId,liftPassengers:this.liftPassengers,visibleObjects:this.visibleObjects,streetMode:this.streetMode||'auto',observer:{x:this.camera.position.x,y:this.camera.position.y+(this.allFloors||!this.building?0:floorElevation(this.building,this.building.activeLevelId)),z:this.camera.position.z}};
    if(this.rebuild){let renderAssets=this.importedAssets;try{if(this.building)checkAssetBudget(this.building,renderAssets);}catch(e){renderAssets=new Map();this.options.onMessage?.(e.message+'；目前先顯示內建外觀。');}this.renderAssets=renderAssets;streetOptions.importedAssets=renderAssets;if(this.design){this.scene.remove(this.design.group);this.design.dispose();}this.design=this.building?createStreetScene(this.building,streetOptions):buildDesign(project,{selectedId:this.selection,textures:this.textures,importedAssets:renderAssets});this.scene.add(this.design.group);this.rebuild=false;}else this.design?.update?.(streetOptions);
  }
  setWalkPosition(position){
    if(this.mode!=='plan')return;
    const next=position&&Number.isFinite(position.x)&&Number.isFinite(position.z)?{x:position.x,z:position.z,levelId:position.levelId,levelName:position.levelName,...(Number.isFinite(position.heading)?{heading:Math.atan2(Math.sin(position.heading),Math.cos(position.heading))}:{})}:null,old=this.walkPosition;
    if(old===null&&next===null||old&&next&&old.x===next.x&&old.z===next.z&&old.levelId===next.levelId&&old.levelName===next.levelName&&old.heading===next.heading)return;
    this.walkPosition=next;if(!old&&next)this.positionBright=true;
    this.drawWalkPosition();
    if(next)this.schedulePositionBlink();else{clearTimeout(this.positionTimer);this.positionTimer=null;}
  }
  schedulePositionBlink(){
    if(this.disposed||this.reducePositionMotion||this.positionTimer!=null||!this.walkPosition||globalThis.document?.hidden)return;
    this.positionTimer=setTimeout(()=>{this.positionTimer=null;if(this.disposed||globalThis.document?.hidden)return;this.positionBright=!this.positionBright;this.drawWalkPosition();this.schedulePositionBlink();},450);
  }
  drawWalkPosition(){
    const c=this.positionContext;if(!c)return;c.clearRect(0,0,this.width,this.height);if(!this.walkPosition)return;
    const p=this.screen(this.walkPosition);c.save();
    // 方位角以平面上方（-Z）為零，向右（+X）為正；面向標記保持可見。
    if(Number.isFinite(this.walkPosition.heading)){
      const dx=Math.sin(this.walkPosition.heading),dy=-Math.cos(this.walkPosition.heading),px=-dy,py=dx;
      const triangle=(tip,base,halfWidth,color)=>{c.fillStyle=color;c.beginPath();c.moveTo(p.x+dx*tip,p.y+dy*tip);c.lineTo(p.x+dx*base+px*halfWidth,p.y+dy*base+py*halfWidth);c.lineTo(p.x+dx*base-px*halfWidth,p.y+dy*base-py*halfWidth);c.closePath();c.fill();};
      c.globalAlpha=1;triangle(25,10,8,'#ffffff');triangle(23,12,5,'#e02525');
    }
    c.globalAlpha=this.positionBright?1:.16;c.fillStyle='#e02525';c.beginPath();c.arc(p.x,p.y,12,0,Math.PI*2);c.globalAlpha*=.22;c.fill();c.globalAlpha=this.positionBright?1:.16;c.fillStyle='#ffffff';c.beginPath();c.arc(p.x,p.y,8,0,Math.PI*2);c.fill();c.fillStyle='#e02525';c.beginPath();c.arc(p.x,p.y,6,0,Math.PI*2);c.fill();
    if(this.walkPosition.levelId!==this.building?.activeLevelId&&this.walkPosition.levelName){c.globalAlpha=1;c.font='12px Microsoft JhengHei';c.textAlign='left';c.fillText('位置：'+this.walkPosition.levelName,p.x+14,p.y-8);}c.restore();
  }
  drawBalloons(project){
    const c=this.labelContext;c.clearRect(0,0,this.width,this.height);if(this.mode==='scene')drawReference(c,this.referenceOverlay,this.width,this.height);if(this.showLabels===false){this.labelGroups=[];return;}const levels=this.mode==='scene'&&this.allFloors?this.building.levels:[{id:this.building?.activeLevelId||'',name:this.building?.levels.find(l=>l.id===this.building.activeLevelId)?.name||'',design:project}],points=[];
    for(const level of levels)for(const o of level.design.objects){const label=manualLabel(o);if(!label||(this.allFloors?level.editor?.hidden?.includes(o.id):this.hiddenIds?.has(o.id)))continue;const pose=objectPose(level.design,o);let p;
      if(this.mode==='scene'){const v=new THREE.Vector3(pose.x,pose.elevation+pose.height+(this.liftPassengers?.get(passengerKey(level.id,o.id))?.offset||0)+(this.allFloors?floorElevation(this.building,level.id):0),pose.z).project(this.camera);if(v.z < -1||v.z>1)continue;p={x:(v.x+1)*this.width/2,y:(1-v.y)*this.height/2};}else p=this.screen(pose);
      points.push({...p,id:o.id,levelId:level.id,levelName:level.name,label,type:ASSETS[o.assetId].name,width:pose.width,depth:pose.depth,height:pose.height});
    }
    if(this.mode==='scene'&&this.referenceOverlay?.mode==='photo'){this.labelGroups=[];return;}this.labelGroups=clusterLabels(points,this.width,this.height);drawLabels(c,this.labelGroups);
  }
  screen(p){return {x:this.width/2+(p.x-this.center.x)*this.zoom,y:this.height/2+(p.z-this.center.z)*this.zoom};}
  pointer(e,y=0){
    const r=this.canvas.getBoundingClientRect();
    if(this.mode==='plan')return {x:(e.clientX-r.left-this.width/2)/this.zoom+this.center.x,z:(e.clientY-r.top-this.height/2)/this.zoom+this.center.z};
    this.camera.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
    const p=new THREE.Vector3();return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),p)?{x:p.x,z:p.z}:null;
  }
  nearestWall(p){
    let best=null;
    for(const wall of this.project.walls){const f=wallFrame(this.project,wall);const distance=(p.x-f.a.x)*f.dx+(p.z-f.a.z)*f.dz,at=Math.max(0,Math.min(1,distance/f.length)),x=f.a.x+f.dx*at*f.length,z=f.a.z+f.dz*at*f.length,error=Math.hypot(p.x-x,p.z-z);if(!best||error<best.distance)best={id:wall.id,kind:'wall',wallId:wall.id,at,distance:error};}
    return best&&best.distance<Math.max(.25,10/this.zoom)?best:null;
  }
  pick(e){
    if(!this.project)return null;
    if(this.mode==='scene'){
      const r=this.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();this.camera.updateMatrixWorld(true);
      ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
      const hits=ray.intersectObject(this.design?.group||new THREE.Group(),true).filter(h=>h.object.isMesh&&this.isVisible(h.object)&&(!h.object.userData.ignorePicking||this.coreHit(h.object)));
      const hit=hits.find(h=>h.object.userData.kind==='vertex')||hits[0];return hit?{...(this.coreHit(hit.object)||(hit.object.userData.kind==='outdoor-ground'?{...hit.object.userData,kind:'object'}:hit.object.userData)),point:hit.point,normal:hit.face?.normal.clone().transformDirection(hit.object.matrixWorld)}:null;
    }
    const p=this.pointer(e),selected=this.project.walls.find(w=>w.id===this.selection),area=this.project.rooms.find(r=>r.id===this.selection&&r.boundaryMode==='area');
    for(const id of selected?[selected.startId,selected.endId]:area?.vertexIds||[]){const v=this.project.vertices.find(v=>v.id===id);if(Math.hypot(v.x-p.x,v.z-p.z)<10/this.zoom)return {id,kind:'vertex'};}
    for(const raw of [...this.project.objects].reverse()){if(this.hiddenIds?.has(raw.id))continue;
      const o=objectPose(this.project,raw);
      if(ASSETS[o.assetId].shape==='chart-sector'){if(chartSectorContains(o,p))return {id:o.id,kind:'object'};continue;}
      const angle=o.rotation*Math.PI/180,dx=p.x-o.x,dz=p.z-o.z,x=dx*Math.cos(angle)+dz*Math.sin(angle),z=-dx*Math.sin(angle)+dz*Math.cos(angle);
      if(Math.abs(x)<=Math.max(o.width/2,raw.trace||raw.prop||ASSETS[raw.assetId].shape==='marking-group'?8/this.zoom:0)&&Math.abs(z)<=Math.max(o.depth/2,raw.trace||raw.prop||ASSETS[raw.assetId].shape==='marking-group'?8/this.zoom:0))return {id:o.id,kind:'object'};
    }
    for(const e of this.building?.levels.find(l=>l.id===this.building.activeLevelId)?.elements||[])if(elementContains(e,p))return {id:e.id,kind:'element'};
    for(const [key,kind] of [['stairs','stair'],['elevators','lift'],['shafts','shaft']])for(const item of this.building?.[key]||[]){const serves=kind==='stair'?[item.fromId,item.toId].includes(this.building.activeLevelId):liftServes(this.building,item,this.building.activeLevelId);if(serves&&(kind==='stair'?stairContains(item,p):liftContains(item,p)))return {id:item.id,kind};}
    const wall=this.nearestWall(p);
    if(wall){const length=wallFrame(this.project,this.project.walls.find(w=>w.id===wall.id)).length;const opening=this.project.openings.find(o=>o.wallId===wall.id&&Math.abs(o.at-wall.at)*length<o.width/2);return opening?{id:opening.id,kind:opening.kind,wallId:wall.id}:wall;}
    for(const room of this.project.rooms)if(insidePolygon(p,room.vertexIds.map(id=>this.project.vertices.find(v=>v.id===id))))return {id:room.id,kind:'room'};
    return null;
  }
  isVisible(object){for(let o=object;o;o=o.parent)if(!o.visible)return false;return true;}
  coreHit(object){for(let o=object;o;o=o.parent)for(const [key,kind] of [['stairId','stair'],['liftId','lift'],['shaftId','shaft'],['elementId','element']])if(o.userData?.[key])return {id:o.userData[key],kind};return null;}
  snapPoint(p,excludeId=null){return snapDesignPoint(this.project,p,this.snapMode||'grid',excludeId);}
  doubleClick(e){
    if(this.mode!=='plan'||e.button!==0||(this.tool||'select')!=='select'||this.calibrating||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey||e.timeStamp-this.lastPlanDragAt<500)return;
    const r=this.canvas.getBoundingClientRect();if(hitLabel(this.labelGroups||[],e.clientX-r.left,e.clientY-r.top))return;
    const p=this.pointer(e);if(!p)return;e.preventDefault();e.stopImmediatePropagation();this.pendingLabel=null;this.cancelDrag();this.options.onDismissContext?.();this.options.onWalkTarget?.(p);
  }
  pointerDown(e){
    if(!this.project)return;
    this.planPress=this.mode==='plan'&&e.button===0&&(this.tool||'select')==='select'?{x:e.clientX,y:e.clientY}:null;
    this.pendingLabel=null;
    if(e.button===0&&(this.tool||'select')==='select'&&!this.calibrating){const r=this.canvas.getBoundingClientRect(),g=hitLabel(this.labelGroups||[],e.clientX-r.left,e.clientY-r.top);if(g){e.preventDefault();e.stopImmediatePropagation();this.walk?.stop();this.pendingLabel={items:g.items,point:{x:e.clientX,y:e.clientY}};return;}}
    if(this.mode==='plan'&&this.calibrating&&e.button===0){e.preventDefault();e.stopImmediatePropagation();this.options.onCalibrationPoint?.(this.pointer(e));return;}
    if(this.walk?.active){e.preventDefault();e.stopImmediatePropagation();this.canvas.focus();this.lookDrag={x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);return;}
    if(this.mode==='scene'&&this.allFloors)return;
    if(e.button===2){this.contextHit=this.pick(e);if(this.contextHit){e.preventDefault();e.stopImmediatePropagation();return;}}
    this.options.onDismissContext?.();
    if(this.mode==='plan'&&e.button!==0){e.preventDefault();this.drag={type:'pan',start:{x:e.clientX,y:e.clientY},center:{...this.center}};this.canvas.setPointerCapture(e.pointerId);return;}
    if(e.button!==0)return;
    const hit=this.pick(e),tool=this.tool||'select';
    if(this.mode==='scene'&&tool==='select'&&!hit)return;
    e.preventDefault();e.stopImmediatePropagation();this.canvas.focus();
    const p=this.pointer(e);if(!p)return;
    if(this.mode==='plan'&&tool==='select'&&e.shiftKey&&hit?.kind!=='object'){this.drag={type:'marquee',start:p,end:p};this.canvas.setPointerCapture(e.pointerId);return;}
    if(tool==='polygon'){if(this.mode!=='plan'){this.options.onMessage?.('請在 2D 平面逐點繪製；完成後同步產生 3D。');return;}this.polygonPoints??=[];const point=this.snapPoint(p),last=this.polygonPoints.at(-1);if(!last||Math.hypot(last.x-point.x,last.z-point.z)>.01)this.polygonPoints.push(point);this.options.onMessage?.(`已標示 ${this.polygonPoints.length} 個角點；Enter 完成、Backspace 移除末點、Esc 取消。`);this.invalidate();return;}
    if(tool==='stair'){this.options.onCommand?.({type:'stair.place',...this.snapPoint(p)});return;}
    if(tool==='room')this.drag={type:'room',start:{...this.snapPoint(p)}};
    else if(tool==='door'||tool==='window'){
      const wallId=hit?.wallId||(hit?.kind==='wall'?hit.id:null),wall=this.project.walls.find(w=>w.id===wallId);
      if(!wall){this.options.onMessage?.('請點選牆面放置門窗。');return;}
      const f=wallFrame(this.project,wall),target=hit.point||p,at=((target.x-f.a.x)*f.dx+(target.z-f.a.z)*f.dz)/f.length;
      this.options.onCommand?.({type:'addOpening',wallId,kind:tool,at:Math.round(at*1000)/1000});return;
    }else if(tool.startsWith('asset:')){
      const assetId=tool.slice(6);
      if(ASSETS[assetId]?.prop&&this.mode==='scene'&&hit?.point&&hit.normal?.y>.98){this.options.onCommand?.({type:'addObject',assetId,x:hit.point.x,z:hit.point.z,elevation:hit.point.y+.001});return;}
      if(ASSETS[assetId]?.trace&&this.mode==='scene'&&hit?.point){
        const normal=hit.normal||new THREE.Vector3(0,1,0),point=hit.point.clone().addScaledVector(normal,.002),angles=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal),'YXZ'),host=entity(this.project,hit.id);
        this.options.onCommand?.({type:'addObject',assetId,x:point.x,z:point.z,tracePlacement:{anchorId:host&&host.kind!=='vertices'&&!host.item.trace?host.item.id:null,elevation:point.y,rotation:-angles.y*180/Math.PI,pitch:angles.x*180/Math.PI,roll:angles.z*180/Math.PI}});
      }else this.options.onCommand?.({type:'addObject',assetId,...this.snapPoint(p)});return;
    }
    else{
      if(['stair','lift','shaft','element'].includes(hit?.kind)){this.options.onCoreSelect?.(hit);const key={stair:'stairs',lift:'elevators',shaft:'shafts'}[hit.kind],item=(hit.kind==='element'?this.building.levels.find(l=>l.id===this.building.activeLevelId).elements:this.building[key]).find(o=>o.id===hit.id);this.drag={type:'core',kind:hit.kind,id:hit.id,item,start:p,planeY:0};if(this.controls)this.controls.enabled=false;this.canvas.setPointerCapture(e.pointerId);return;}
      if(hit?.kind!=='vertex')this.options.onSelect?.(hit?.id||null,!!e.shiftKey);
      const independentWall=hit?.kind==='wall'&&entity(this.project,hit.id)?.item.independent,area=hit?.kind==='room'&&entity(this.project,hit.id)?.item.boundaryMode==='area';
      if(!hit||!['vertex','object','door','window'].includes(hit.kind)&&!independentWall&&!area)return;
      if(this.lockedIds?.has(hit.id)||e.shiftKey)return;
      if(hit.kind==='object'&&entity(this.project,hit.id)?.item.hostId)return;
      const rawItem=entity(this.project,hit.id)?.item,item=rawItem?.trace?objectPose(this.project,rawItem):rawItem,planeY=hit.kind==='vertex'&&this.mode==='scene'?hit.point.y:0,start=this.pointer(e,planeY);
      if(!start)return;this.drag={type:hit.kind,id:hit.id,start,item,planeY,ids:hit.kind==='object'&&this.multiIds?.includes(hit.id)?[...this.multiIds]:[hit.id]};
      if(independentWall||area){const anchor=this.project.vertices.find(v=>v.id===(independentWall?item.startId:item.vertexIds[0]));this.drag.anchor={x:anchor.x,z:anchor.z};}
    }
    if(this.controls)this.controls.enabled=false;this.canvas.setPointerCapture(e.pointerId);
  }
  pointerMove(e){
    if(this.lookDrag&&this.walk?.active){this.walk.yaw-=(e.clientX-this.lookDrag.x)*.005;this.walk.pitch=Math.max(-1.3,Math.min(1.3,this.walk.pitch-(e.clientY-this.lookDrag.y)*.005));this.lookDrag={x:e.clientX,y:e.clientY};this.walk.look();this.invalidate();return;}
    const drag=this.drag;if(!drag)return;
    if(drag.type==='pan'){this.center={x:drag.center.x-(e.clientX-drag.start.x)/this.zoom,z:drag.center.z-(e.clientY-drag.start.y)/this.zoom};this.invalidate();return;}
    if(this.planPress&&drag.type!=='marquee'){if(!drag.moved&&Math.hypot(e.clientX-this.planPress.x,e.clientY-this.planPress.y)<4)return;drag.moved=true;this.lastPlanDragAt=e.timeStamp;}
    const p=this.pointer(e,drag.planeY||0);if(!p)return;
    if(drag.type==='marquee'){drag.end=p;this.invalidate();return;}
    let command;
    if(drag.anchor){const end=this.snapPoint({x:drag.anchor.x+p.x-drag.start.x,z:drag.anchor.z+p.z-drag.start.z});command={type:drag.type==='wall'?'wall.translate':'floorArea.translate',id:drag.id,dx:end.x-drag.anchor.x,dz:end.z-drag.anchor.z};}
    else if(drag.type==='object'&&drag.ids?.length>1){const end=this.snapPoint({x:drag.item.x+p.x-drag.start.x,z:drag.item.z+p.z-drag.start.z});command={type:'objects.batch',ids:drag.ids,action:'move',dx:end.x-drag.item.x,dz:end.z-drag.item.z};}
    else if(drag.type==='core'){command={...drag.item,type:drag.kind+'.update',...this.snapPoint({x:drag.item.x+p.x-drag.start.x,z:drag.item.z+p.z-drag.start.z})};}
    else if(drag.type==='room'){
      const end=this.snapPoint(p);command={type:'addRoom',x:Math.min(end.x,drag.start.x),z:Math.min(end.z,drag.start.z),width:Math.abs(end.x-drag.start.x),depth:Math.abs(end.z-drag.start.z)};
    }else if(drag.type==='vertex'||drag.type==='object')command={type:drag.type==='vertex'?'moveVertex':'moveObject',id:drag.id,...this.snapPoint({x:drag.item.x+p.x-drag.start.x,z:drag.item.z+p.z-drag.start.z},drag.type==='vertex'?drag.id:null)};
    else{
      const wall=this.project.walls.find(w=>w.id===drag.item.wallId),f=wallFrame(this.project,wall),delta=(p.x-drag.start.x)*f.dx+(p.z-drag.start.z)*f.dz;
      command={type:'moveOpening',id:drag.id,at:(Math.round((drag.item.at*f.length+delta)/(this.snapMode==='fine'?.01:.1))*(this.snapMode==='fine'?.01:.1))/f.length};
    }
    try{
      const building=this.options.previewBuilding?.(command);this.preview=building?building.levels.find(l=>l.id===building.activeLevelId).design:this.options.preview(command);drag.command=command;drag.previewing=true;if(building)this.options.onPreviewBuilding?.(building);else this.options.onPreview?.(this.preview,this);
      this.rebuild=true;this.invalidate();
    }catch(error){drag.command=null;this.options.onMessage?.(error.message);}
  }
  pointerUp(e){
    this.planPress=null;
    if(this.lookDrag){this.lookDrag=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);return;}
    if(!this.drag)return;if(this.drag.type==='marquee'){const {start,end}=this.drag;this.drag=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);this.options.onMultiSelect?.(this.project.objects.filter(o=>!o.hostId&&!o.trace?.anchorId&&!this.hiddenIds?.has(o.id)&&o.x>=Math.min(start.x,end.x)&&o.x<=Math.max(start.x,end.x)&&o.z>=Math.min(start.z,end.z)&&o.z<=Math.max(start.z,end.z)).map(o=>o.id));this.invalidate();return;}const command=this.drag.command;this.drag=null;this.preview=null;
    if(this.controls)this.controls.enabled=true;
    if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
    this.options.onPreview?.(null,this);if(command)this.options.onCommand?.(command);this.rebuild=true;this.invalidate();
  }
  cancelDrag(){this.planPress=null;this.drag=null;this.preview=null;if(this.controls)this.controls.enabled=true;this.options.onPreview?.(null,this);this.rebuild=true;this.invalidate();}
  drawPlan(project){
    const c=this.context,sourcePlan=project.version>=9;c.clearRect(0,0,this.width,this.height);c.fillStyle='#fafaf6';c.fillRect(0,0,this.width,this.height);
    const grid=.5,limit=40;c.lineWidth=1;
    for(let value=-limit;value<=limit;value+=grid){const p=this.screen({x:value,z:value});c.strokeStyle=value===0?'#c1c8be':'#e9ece5';c.beginPath();c.moveTo(p.x,0);c.lineTo(p.x,this.height);c.moveTo(0,p.y);c.lineTo(this.width,p.y);c.stroke();}
    if(this.underlay){const u=this.underlay,p=this.screen(u);c.save();c.globalAlpha=u.opacity;c.translate(p.x,p.y);c.rotate(u.rotation*Math.PI/180);c.drawImage(u.image,0,0,u.width*this.zoom,u.width*u.image.height/u.image.width*this.zoom);c.restore();}
    for(const room of project.rooms){
      const vertices=room.vertexIds.map(id=>project.vertices.find(v=>v.id===id));c.beginPath();vertices.forEach((v,i)=>{const p=this.screen(v);if(i===0)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);});c.closePath();c.fillStyle=(room.id===this.selection||this.zoneRoomIds?.includes(room.id))?'#e8d9bd':MATERIALS[room.materialId].color;c.save();if(this.underlay)c.globalAlpha=.25;c.fill();c.restore();
      const point={x:vertices.reduce((s,v)=>s+v.x,0)/vertices.length,z:vertices.reduce((s,v)=>s+v.z,0)/vertices.length},center=this.screen(point);c.fillStyle='#788272';c.font='12px Segoe UI, Microsoft JhengHei';c.textAlign='center';
      if(sourcePlan){
        if(this.underlay&&room.id!==this.selection)continue;
        const halfWidth=(c.measureText(room.name).width+12)/(2*this.zoom),halfHeight=10/this.zoom;
        if(room.id!==this.selection&&![[ -halfWidth,-halfHeight],[halfWidth,-halfHeight],[halfWidth,halfHeight],[-halfWidth,halfHeight]].every(([x,z])=>insidePolygon({x:point.x+x,z:point.z+z},vertices)))continue;
        c.fillText(room.name,center.x,center.y);
      }else{c.fillText(`${room.name} · ${polygonArea(vertices).toFixed(2)} m²`,center.x,center.y);c.fillText(MATERIALS[room.materialId].name,center.x,center.y+16);}
    }
    const drawElement=e=>{const points=elementOutline(e).map(p=>this.screen(p)),overhead=e.kind==='slab'&&e.elevation>=1.8;c.save();c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle=e.kind==='opening'?'#fafaf6':e.kind==='slab'?'#e5ddcc':'#a5aaa2';c.globalAlpha=e.kind==='canopy'?.15:e.kind==='beam'?.5:1;if(!overhead)c.fill();c.globalAlpha=1;c.strokeStyle=e.id===this.selection?'#c87535':'#566354';c.lineWidth=2;if(e.kind==='opening'||e.kind==='canopy'||overhead)c.setLineDash([4,3]);c.stroke();if(e.kind!=='slab'||e.id===this.selection){const p=this.screen(e);c.fillStyle='#344338';c.font='10px Microsoft JhengHei';c.textAlign='center';c.fillText(overhead?'上方樓板（虛線）':ELEMENT_LABELS[e.kind],p.x,p.y);}c.restore();};
    const elements=this.building?.levels.find(l=>l.id===this.building.activeLevelId)?.elements||[];
    for(const e of elements.filter(e=>e.kind==='slab'))drawElement(e);
    for(const wall of project.walls){
      const f=wallFrame(project,wall),a=this.screen(f.a),b=this.screen(f.b);c.strokeStyle=wall.id===this.selection?'#c87535':'#566354';c.lineWidth=Math.max(sourcePlan&&wall.independent?1.25:5,wall.thickness*this.zoom);c.lineCap='square';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
      if(wall.type==='rail'){
        c.strokeStyle=wall.id===this.selection?'#c87535':'#659995';c.lineWidth=1.5;
        const offset=.08;for(const sign of [-1,1]){const p=this.screen({x:f.a.x+f.nx*offset*sign,z:f.a.z+f.nz*offset*sign}),q=this.screen({x:f.b.x+f.nx*offset*sign,z:f.b.z+f.nz*offset*sign});c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();}
      }
      if(!sourcePlan||wall.id===this.selection||!this.underlay&&this.zoom>=80&&f.length*this.zoom>=70){const label=this.screen({x:(f.a.x+f.b.x)/2-f.nx*.34,z:(f.a.z+f.b.z)/2-f.nz*.34});c.font='11px Segoe UI';c.textAlign='center';c.fillStyle='#566354';c.fillText(`${wall.type==='rail'?'欄杆 ':''}${f.length.toFixed(2)} m`,label.x,label.y);}
      for(const o of project.openings.filter(o=>o.wallId===wall.id)){
        const center={x:f.a.x+f.dx*o.at*f.length,z:f.a.z+f.dz*o.at*f.length},p=this.screen(center);
        c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(f.dz,f.dx));c.fillStyle='#fafaf6';c.fillRect(-o.width*this.zoom/2,-wall.thickness*this.zoom/2-1,o.width*this.zoom,wall.thickness*this.zoom+2);
        c.globalAlpha=1;c.strokeStyle=(o.id===this.selection||this.multiIds?.includes(o.id))?'#c87535':o.kind==='door'?'#a88455':'#659995';c.lineWidth=2;
        const layout=openingParts(o,wall),spec=openingStyle(o),scale=this.zoom;
        for(const part of layout.parts){
          if(part.role==='rolled')continue;
          if(part.role==='slat'){if(part!==layout.parts[0])continue;c.strokeRect(-o.width*scale/2,-3,o.width*scale,6);continue;}
          c.save();c.translate(part.x*scale,part.z*scale);c.rotate(-part.rotation);c.strokeRect(-part.width*scale/2,-1.5,part.width*scale,3);c.restore();
        }
        if(spec.transom){c.save();c.font='10px sans-serif';c.fillText('上氣窗',-o.width*scale/2,-6);c.restore();}
        c.setLineDash([3,3]);
        for(const swing of layout.swings){
          const start=swing.run>0?0:Math.PI,end=swing.direction>0?Math.PI/2:-Math.PI/2;
          c.beginPath();c.arc(swing.pivot*scale,0,swing.width*scale,start,end,swing.run*swing.direction<0);c.stroke();
        }
        c.setLineDash([]);
        if(spec.motion==='slide'||spec.motion==='sash'){
          const direction=spec.motion==='slide'?spec.travel*o.side:o.side,tip=direction*o.width*scale*.35;
          c.beginPath();c.moveTo(-tip,-9);c.lineTo(tip,-9);c.lineTo(tip-direction*5,-13);c.moveTo(tip,-9);c.lineTo(tip-direction*5,-5);c.stroke();
        }
        if(spec.motion==='double-slide')for(const direction of [-1,1]){const tip=direction*o.width*scale*.4;c.beginPath();c.moveTo(0,-9);c.lineTo(tip,-9);c.lineTo(tip-direction*5,-13);c.moveTo(tip,-9);c.lineTo(tip-direction*5,-5);c.stroke();}
        if(spec.motion==='rollup'){c.font='10px Segoe UI, Microsoft JhengHei';c.fillStyle=c.strokeStyle;c.fillText(o.open?'捲起':'捲門',0,-8);}
        if(o.id===this.selection){
          const tip=o.side*27;c.strokeStyle='#c87535';c.beginPath();c.moveTo(0,0);c.lineTo(0,tip);c.lineTo(-4,tip-o.side*6);c.moveTo(0,tip);c.lineTo(4,tip-o.side*6);c.stroke();c.fillStyle='#c87535';c.font='10px Microsoft JhengHei';c.fillText('內側',0,tip+o.side*12);
        }
        c.restore();
      }
    }
    for(const host of [...project.rooms,...project.objects]){if(!host.surfaceLoad||this.hiddenIds?.has(host.id))continue;const info=surfaceInfo(project,host),v=host.surfaceLoad,pose=host.vertexIds?{x:info.x,z:info.z,rotation:0}:objectPose(project,host),a=pose.rotation*Math.PI/180,offset=info.kind==='cavity'?{x:0,z:0}:v,p=this.screen({x:pose.x+offset.x*Math.cos(a)-offset.z*Math.sin(a),z:pose.z+offset.x*Math.sin(a)+offset.z*Math.cos(a)}),r=info.kind==='cavity'&&info.shape==='ellipse'?(info.r0+(info.r1-info.r0)*v.fill)*2:1,w=info.kind==='cavity'?info.width*r:v.width,d=info.kind==='cavity'?info.depth*r:v.depth;c.save();c.translate(p.x,p.y);c.rotate(a);c.globalAlpha=.7;c.fillStyle=v.color;if((info.kind==='cavity'?info.shape:v.shape)==='ellipse'){c.beginPath();c.ellipse(0,0,w*this.zoom/2,d*this.zoom/2,0,0,Math.PI*2);c.fill();}else c.fillRect(-w*this.zoom/2,-d*this.zoom/2,w*this.zoom,d*this.zoom);c.restore();}
    for(const raw of project.objects){if(this.hiddenIds?.has(raw.id))continue;const o=objectPose(project,raw),p=this.screen(o);c.save();c.translate(p.x,p.y);c.rotate(o.rotation*Math.PI/180);c.setLineDash(o.installation==='concealed'?[4,3]:[]);c.globalAlpha=raw.surfaceLoad?.35:1;c.fillStyle=ASSETS[o.assetId].color||o.prop?.color||MATERIALS[o.materialId].color;if(ASSETS[o.assetId].shape==='chart-sector'){c.beginPath();c.moveTo(0,0);c.arc(0,0,o.width*this.zoom/2,-o.sector.startAngle*Math.PI/180,-o.sector.endAngle*Math.PI/180,true);c.closePath();c.fill();}else if(ASSETS[o.assetId].shape==='placeholder-ellipse'){c.beginPath();c.ellipse(0,0,o.width*this.zoom/2,o.depth*this.zoom/2,0,0,Math.PI*2);c.fill();}else if(!['crosswalk','lane-dashed-white','lane-double-yellow'].includes(o.assetId))c.fillRect(-o.width*this.zoom/2,-o.depth*this.zoom/2,o.width*this.zoom,o.depth*this.zoom);c.globalAlpha=1;c.strokeStyle=(o.id===this.selection||this.multiIds?.includes(o.id))?'#c87535':'#99876f';c.lineWidth=2;if(['placeholder-ellipse','chart-sector'].includes(ASSETS[o.assetId].shape))c.stroke();else if(!['crosswalk','lane-dashed-white','lane-double-yellow'].includes(o.assetId)||o.id===this.selection||this.multiIds?.includes(o.id))c.strokeRect(-o.width*this.zoom/2,-o.depth*this.zoom/2,o.width*this.zoom,o.depth*this.zoom);c.setLineDash([]);if(o.outdoor)drawOutdoorPlan(c,o,this.zoom);drawVehiclePlan(c,o,this.zoom);c.fillStyle='#4f5b4f';c.font='9px Microsoft JhengHei';c.textAlign='center';if(raw.trace){c.strokeStyle='#a34b31';c.beginPath();c.arc(0,0,6,0,Math.PI*2);c.moveTo(-9,0);c.lineTo(9,0);c.moveTo(0,-9);c.lineTo(0,9);c.stroke();}const objectText=((raw.trace?.label||raw.prop?.label)?(raw.trace?.label||raw.prop?.label)+' · ':'')+ASSETS[o.assetId].name+(raw.deviceState?` (${raw.deviceState.power?'開':'關'})`:'');if(o.id===this.selection||ASSETS[o.assetId].shape!=='chart-sector'&&(raw.trace?.label||raw.prop?.label||(o.width*this.zoom>=c.measureText(objectText).width+8&&o.depth*this.zoom>=16)))c.fillText(objectText,0,-o.depth*this.zoom/2-4);c.restore();}
    const wall=project.walls.find(w=>w.id===this.selection),area=project.rooms.find(r=>r.id===this.selection&&r.boundaryMode==='area');
    for(const id of wall?[wall.startId,wall.endId]:area?.vertexIds||[]){const p=this.screen(project.vertices.find(v=>v.id===id));c.fillStyle='#c87535';c.fillRect(p.x-5,p.y-5,10,10);c.strokeStyle='#ffffff';c.lineWidth=2;c.strokeRect(p.x-5,p.y-5,10,10);}
    for(const e of elements.filter(e=>e.kind!=='slab'))drawElement(e);
    for(const e of this.building?.elevators||[]){if(!liftServes(this.building,e,this.building.activeLevelId))continue;const points=liftOutline(e).map(p=>this.screen(p));c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle='#bdced4';c.fill();c.strokeStyle='#547482';c.stroke();const p=this.screen(e);c.fillStyle='#314e5c';c.fillText('電梯 '+e.id,p.x,p.y);}
    for(const e of this.building?.shafts||[]){if(!liftServes(this.building,e,this.building.activeLevelId))continue;const points=liftOutline(e).map(p=>this.screen(p));c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle='#d8dac5';c.fill();c.strokeStyle='#737e50';c.stroke();const p=this.screen(e);c.fillStyle='#314e5c';c.save();c.textAlign='center';c.font='10px Microsoft JhengHei';c.fillText('管道間',p.x,p.y-3);c.fillText(e.id.replace('shaft-','#'),p.x,p.y+9);c.restore();}
    for(const stair of this.building?.stairs||[]){if(![stair.fromId,stair.toId].includes(this.building.activeLevelId))continue;const points=stairOutline(stair).map(p=>this.screen(p));c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle='#d6bc8d';c.fill();c.strokeStyle='#986b36';c.stroke();const route=stairPath(stair).map(p=>this.screen(p)),b=route.at(-1);c.beginPath();route.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();c.fillStyle='#604522';c.font='11px sans-serif';c.fillText(stair.id+' ↑',b.x,b.y);}
    if(this.calibrationAnchor){const p=this.screen(this.calibrationAnchor);c.save();c.strokeStyle='#c87535';c.lineWidth=2;c.beginPath();c.moveTo(p.x-7,p.y);c.lineTo(p.x+7,p.y);c.moveTo(p.x,p.y-7);c.lineTo(p.x,p.y+7);c.stroke();c.restore();}
    if(this.tool==='polygon'&&this.polygonPoints?.length){const points=this.polygonPoints.map(p=>this.screen(p));c.save();c.strokeStyle='#c87535';c.lineWidth=2;c.setLineDash([5,4]);c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(points.length>2)c.closePath();c.stroke();c.setLineDash([]);for(const p of points){c.fillStyle='#c87535';c.fillRect(p.x-4,p.y-4,8,8);}c.restore();}
    if(this.drag?.type==='marquee'){const a=this.screen(this.drag.start),b=this.screen(this.drag.end);c.save();c.setLineDash([5,4]);c.strokeStyle='#c87535';c.fillStyle='#c8753522';c.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);c.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);c.restore();}
    c.textAlign='left';c.fillStyle='#7b8477';c.font='11px Segoe UI, Microsoft JhengHei';c.fillText(this.planHint||'選取模式雙擊巡覽 · 滾輪縮放 · 右鍵空白平移',16,this.height-16);this.drawWalkPosition();
  }
  updateEnvironment(){const needed=materialEnvironmentNeeded(this.building,this.project,this.materialEntries||[],this.importedAssets);if(!needed){this.scene.environment=null;this.environmentTarget?.dispose();this.environmentTarget=null;return;}if(this.environmentTarget)return;const room=new RoomEnvironment(),generator=new THREE.PMREMGenerator(this.renderer);try{this.environmentTarget=generator.fromScene(room,.04,.1,100,{size:256});this.scene.environment=this.environmentTarget.texture;this.scene.environmentIntensity=.45;}finally{room.dispose();generator.dispose();}}
  setImportedAsset(id,entry){this.traceAbort?.abort();this.importedAssets??=new Map();disposeImportedAsset(this.importedAssets.get(id));if(entry)this.importedAssets.set(id,entry);else this.importedAssets.delete(id);this.updateEnvironment();this.rebuild=true;this.invalidate();}
  setLighting(value){const settings={day:[2.6,'#fff5df',[-3,9,5],1],warm:[1.8,'#ffcf94',[6,3,2],1.1],soft:[.8,'#ffffff',[-3,9,5],1.15]};const s=settings[value];if(!s)return;this.sun.intensity=s[0];this.sun.color.set(s[1]);this.sun.position.set(...s[2]);this.renderer.toneMappingExposure=s[3];this.invalidate();}
  setMaterials(entries,merge=false){this.traceAbort?.abort();
    const incoming=new Set(entries.map(m=>m.id+':'+m.channel)),retained=merge?(this.materialEntries||[]).filter(m=>!incoming.has(m.id+':'+m.channel)):[];
    for(const m of this.materialEntries||[])if(!retained.includes(m))m.image.close();
    this.materialEntries=[...retained,...entries];disposeMaterialTextures(this.textures);this.textures=createMaterialTextures();
    const maps={normal:'normalMap',roughness:'roughnessMap',metalness:'metalnessMap'};
    for(const m of [...this.materialEntries].sort((a,b)=>(a.channel==='color'?-1:1)-(b.channel==='color'?-1:1))){
      const t=new THREE.Texture(m.image);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=m.channel==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;t.repeat.set(1/m.tileMetres,1/m.tileMetres);t.needsUpdate=true;
      if(m.channel==='color'){
        const previous=this.textures[m.id];for(const key of Object.values(maps))if(previous?.userData[key])t.userData[key]=previous.userData[key];
        previous?.dispose();t.userData.custom=true;this.textures[m.id]=t;
      }else{
        if(!this.textures[m.id]){const carrier=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);carrier.colorSpace=THREE.SRGBColorSpace;carrier.wrapS=carrier.wrapT=THREE.RepeatWrapping;carrier.needsUpdate=true;this.textures[m.id]=carrier;}
        this.textures[m.id].userData[maps[m.channel]]?.dispose();this.textures[m.id].userData[maps[m.channel]]=t;
      }
      this.textures[m.id].userData.customCoordinates=true;
    }
    this.updateEnvironment();this.rebuild=true;this.invalidate();
  }
  async exportRender({mode='perspective',width=1920,cut=0}={}){
    if(!['perspective','front','side','section-x','section-z'].includes(mode)||![1920,3840].includes(width)||!Number.isFinite(cut)||Math.abs(cut)>40)throw new Error('渲染輸出設定錯誤。');
    if(this.exporting)throw new Error('正在輸出渲染圖。');this.exporting=true;
    if(this.rebuild)this.frame(performance.now()+100);const oldWidth=this.width,oldHeight=this.height,ratio=this.renderer.getPixelRatio(),aspect=this.camera.aspect,grid=this.grid.visible,planes=this.renderer.clippingPlanes,helpers=[];this.design.group.traverse(o=>{if(o.type==='BoxHelper'||['vertex','opening-marker'].includes(o.userData.kind)){helpers.push([o,o.visible]);o.visible=false;}});
    try{this.grid.visible=false;const height=width*9/16;this.renderer.setPixelRatio(1);this.renderer.setSize(width,height,false);let camera=this.camera;
      if(mode==='perspective'){camera.aspect=16/9;camera.updateProjectionMatrix();}else{const bounds=new THREE.Box3().setFromObject(this.design.group);if(bounds.isEmpty())throw new Error('模型沒有可輸出的幾何。');const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),axis=mode==='side'||mode==='section-x'?'x':'z',span=Math.max(size.y,(axis==='x'?size.z:size.x)*9/16,1)*1.15;camera=new THREE.OrthographicCamera(-span*8/9,span*8/9,span/2,-span/2,.01,500);camera.position.copy(center);camera.position[axis]+=Math.max(size.length(),10)+10;camera.lookAt(center);camera.updateMatrixWorld(true);if(mode.startsWith('section'))this.renderer.clippingPlanes=[new THREE.Plane(axis==='x'?new THREE.Vector3(-1,0,0):new THREE.Vector3(0,0,-1),cut)];}
      this.renderer.render(this.scene,camera);const blob=await new Promise(resolve=>this.canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('渲染圖輸出失敗。');downloadBlob(blob,'lumiere-'+mode+'.png');
    }finally{for(const [o,visible] of helpers)o.visible=visible;this.renderer.clippingPlanes=planes;this.renderer.setPixelRatio(ratio);this.renderer.setSize(oldWidth,oldHeight,false);this.camera.aspect=aspect;this.camera.updateProjectionMatrix();this.grid.visible=grid;this.exporting=false;this.invalidate();}
  }
  preset(value){this.walk.stop();if(!['front','side','top'].includes(value)){this.fit();return;}if(this.rebuild&&this.renderer)this.frame(performance.now()+100);if(!framePresetCamera(this.camera,this.controls,presetViewBounds(this.design?.group),value))this.fit();this.invalidate();}
  destroy(){
    if(this.disposed)return;this.disposed=true;clearTimeout(this.positionTimer);this.positionTimer=null;this.traceAbort?.abort();disposeIfcReference(this.ifcReference);cancelAnimationFrame(this.frameId);this.observer?.disconnect();this.listeners.forEach(fn=>fn());this.media?.destroy();this.controls?.dispose();this.design?.dispose();this.grid?.geometry.dispose();this.grid?.material.dispose();disposeMaterialTextures(this.textures);this.environmentTarget?.dispose();this.renderer?.dispose();this.importedAssets?.forEach(disposeImportedAsset);this.renderer?.forceContextLoss();this.materialEntries?.forEach(m=>m.image.close());this.element?.remove();
  }
}
