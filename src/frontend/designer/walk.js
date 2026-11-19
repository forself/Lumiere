import {outdoorSurface} from './outdoor.js';
import {elementContains,elementOutline} from './elements.js';
import {shaftContains,shaftServes} from './shafts.js';
import {liftContains,liftServes,moveCabinContents} from './elevators.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import {floorElevation} from './building-model.js';
import {insidePolygon,objectPose,wallFrame,wallSections,chartSectorContains} from './model.js';
import {openingParts} from './openings.js';
import {walkSurface,stairContains,stairHeight,stairLocal} from './stairs.js';
// Test the object's footprint and vertical extent, not a circle whose radius is
// half its longest side (a long thin wall otherwise blocks an entire room).
export function objectBlocksWalkStart(project,raw,p,ground=0){
 if(raw.trace||raw.assetId==='text-panel')return false;
 const o=objectPose(project,raw),pitch=(raw.prop?.pitch||0)*Math.PI/180,roll=(raw.prop?.roll||0)*Math.PI/180,yaw=-o.rotation*Math.PI/180;
 if(!pitch&&!roll){
  if(o.elevation>=ground+1.8||o.elevation+o.height<=ground+.01)return false;
  const dx=p.x-o.x,dz=p.z-o.z,c=Math.cos(yaw),s=Math.sin(yaw);
  if(raw.assetId==='chart-sector')return chartSectorContains(o,p,.3);
  return Math.abs(c*dx-s*dz)<o.width/2+.3&&Math.abs(s*dx+c*dz)<o.depth/2+.3;
 }
 const bounds=new THREE.Box3(),rotation=new THREE.Euler(pitch,yaw,roll,'YXZ');
 for(const x of [-o.width/2,o.width/2])for(const y of [0,o.height])for(const z of [-o.depth/2,o.depth/2])bounds.expandByPoint(new THREE.Vector3(x,y,z).applyEuler(rotation).add(new THREE.Vector3(o.x,o.elevation,o.z)));
 return bounds.max.y>ground+.01&&bounds.min.y<ground+1.8&&p.x>bounds.min.x-.3&&p.x<bounds.max.x+.3&&p.z>bounds.min.z-.3&&p.z<bounds.max.z+.3;
}
// Area floors can extend under independent partitions. A valid floor point is
// not a safe spawn until the wall solids and current door leaves are checked.
export function wallBlocksWalkStart(project,wall,p,ground=0){
 const f=wallFrame(project,wall),dx=p.x-f.a.x,dz=p.z-f.a.z,x=dx*f.dx+dz*f.dz,z=-dx*f.dz+dz*f.dx,margin=.3;
 const bodyIntersects=(bottom,top)=>top>ground+.01&&bottom<ground+1.8;
 if(wall.type==='rail')return bodyIntersects(0,wall.height)&&x> -margin&&x<f.length+margin&&Math.abs(z)<wall.thickness/2+margin;
 if(wallSections(project,wall).some(s=>bodyIntersects(s.bottom,s.top)&&x>s.from-margin&&x<s.to+margin&&Math.abs(z)<wall.thickness/2+margin))return true;
 for(const opening of project.openings.filter(o=>o.wallId===wall.id))for(const part of openingParts(opening,wall).parts){
  const tilt=part.rotationX||0,depth=part.depth??(opening.kind==='window'?.018:.045),halfHeight=(Math.abs(Math.cos(tilt))*part.height+Math.abs(Math.sin(tilt))*depth)/2;
  if(!bodyIntersects(part.y-halfHeight,part.y+halfHeight))continue;
  const rx=x-opening.at*f.length-part.x,rz=z-part.z,c=Math.cos(part.rotation),s=Math.sin(part.rotation),halfDepth=(Math.abs(Math.cos(tilt))*depth+Math.abs(Math.sin(tilt))*part.height)/2;
  if(Math.abs(c*rx-s*rz)<part.width/2+margin&&Math.abs(s*rx+c*rz)<halfDepth+margin)return true;
 }
 return false;
}
function outdoorWalkStart(building,level,elevation){
 // Search the actual rotated surface with room for the body, starting centrally.
 const offsets=size=>{const edge=size/2-.35;if(edge<0)return [];const values=[0];for(let n=.4;n<edge;n+=.4)values.push(-n,n);if(edge>0)values.push(-edge,edge);return values;};
 for(const surface of level.design.objects){
  if(!surface.outdoor||outdoorSurface(surface,surface)===null)continue;
  const angle=surface.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),xs=offsets(surface.width),zs=offsets(surface.depth);
  for(const z of zs)for(const x of xs){
   const p={x:surface.x+x*c-z*s,z:surface.z+x*s+z*c},ground=outdoorSurface(surface,p,{smooth:true});
   if(ground===null)continue;
   if(level.design.objects.some(o=>{
    // The tunnel's overall bounds include its walkable interior, not a solid box.
    if(o===surface&&o.assetId==='underpass')return ground+1.8>o.elevation+o.height-.15;
    return objectBlocksWalkStart(level.design,o,p,ground);
   }))continue;
   if(level.design.walls.some(w=>wallBlocksWalkStart(level.design,w,p,ground)))continue;
   if((level.elements||[]).some(e=>['column','beam'].includes(e.kind)&&e.elevation<ground+1.8&&e.elevation+e.height>ground+.01&&elementContains(e,p,.3)))continue;
   if((building.shafts||[]).some(q=>shaftServes(building,q,level.id)&&shaftContains(q,p,.3)))continue;
   // The road may contain a tunnel entrance cutout; require support under the body.
   const support=walkSurface(building,p,elevation+ground);
   if(support===null||Math.abs(support-elevation-ground)>.01)continue;
   if([[-.3,-.3],[-.3,.3],[.3,-.3],[.3,.3]].some(([dx,dz])=>walkSurface(building,{x:p.x+dx,z:p.z+dz},elevation+ground)===null))continue;
   return {...p,y:elevation+ground+1.65};
  }
 }
 return null;
}
export function walkStart(building,id){
 const level=building.levels.find(l=>l.id===id),y=floorElevation(building,id),clear=p=>level.design.objects.every(o=>!objectBlocksWalkStart(level.design,o,p))&&level.design.walls.every(w=>!wallBlocksWalkStart(level.design,w,p));
 for(const room of level.design.rooms){
  const polygon=room.vertexIds.map(id=>level.design.vertices.find(v=>v.id===id)),xs=polygon.map(v=>v.x),zs=polygon.map(v=>v.z);
  for(let z=Math.min(...zs)+.5;z<Math.max(...zs)-.3;z+=.4)for(let x=Math.min(...xs)+.5;x<Math.max(...xs)-.3;x+=.4){
   const p={x,z};
   if(!(level.elements||[]).some(e=>((['column','beam'].includes(e.kind)&&e.elevation<1.8)||(e.kind==='opening'&&e.elevation===0))&&elementContains(e,p,.3))&&!(building.shafts||[]).some(s=>shaftServes(building,s,id)&&shaftContains(s,p,.3))&&insidePolygon(p,polygon)&&!building.stairs.some(s=>[s.fromId,s.toId].includes(id)&&stairContains(s,p,.3))&&clear(p))return {x,y:y+1.65,z};
  }
 }
 for(const slab of level.elements.filter(e=>e.kind==='slab'&&e.elevation===0)){
  const points=elementOutline(slab);
  for(let z=Math.min(...points.map(p=>p.z))+.4;z<Math.max(...points.map(p=>p.z))-.3;z+=.4)for(let x=Math.min(...points.map(p=>p.x))+.4;x<Math.max(...points.map(p=>p.x))-.3;x+=.4){
   const p={x,z};if(elementContains(slab,p,-.25)&&!level.elements.some(e=>((e.kind==='column'||e.kind==='beam')&&e.elevation<1.8||e.kind==='opening'&&e.elevation===0)&&elementContains(e,p,.3))&&clear(p))return {x,z,y:y+1.65};
  }
 }
 const outdoor=outdoorWalkStart(building,level,y);if(outdoor)return outdoor;
 throw new Error('此層沒有可用的起點，請新增房間、半戶外地坪或清出通道。');
}
// A plan click has no height. Resolve support on the displayed level first,
// then check the same body clearance used when finding an automatic walk start.
export function walkDestination(building,p,levelId=building.activeLevelId,{passengers=new Map()}={}){
 const level=building.levels.find(l=>l.id===levelId);
 if(!level)throw new Error('所選樓層不存在。');
 if(!Number.isFinite(p?.x)||!Number.isFinite(p?.z))throw new Error('巡覽位置必須是有效座標。');
 const base=floorElevation(building,levelId),candidates=[],lifts=(building.elevators||[]).filter(e=>liftServes(building,e,levelId));
 const add=(ground,surface=null)=>{if(!candidates.some(c=>Math.abs(c.ground-ground)<1e-9))candidates.push({ground,surface});};
 for(const s of building.stairs.filter(s=>[s.fromId,s.toId].includes(levelId))){const from=building.levels.find(l=>l.id===s.fromId),stairBase=floorElevation(building,s.fromId),h=stairHeight(s,p,from.height);if(h!==null)add(stairBase+h,q=>{const y=stairHeight(s,q,from.height);return y===null?null:stairBase+y;});}
 if(level.design.rooms.some(r=>insidePolygon(p,r.vertexIds.map(id=>level.design.vertices.find(v=>v.id===id)))))add(base);
 for(const e of level.elements||[])if(e.kind==='slab'&&e.elevation<=level.height-1.8&&elementContains(e,p))add(base+e.elevation);
 // Flat paving tiles share one landing surface at the same height. Only ramps
 // need their own profile; otherwise the first tile can reject a valid seam.
 for(const o of level.design.objects){const ground=outdoorSurface(o,p,{smooth:true});if(ground!==null)add(base+ground,['footbridge','underpass'].includes(o.assetId)?q=>{const y=outdoorSurface(o,q,{smooth:true});return y===null?null:base+y;}:null);}
 // Cabin bottoms are real support even if an imported reference has no room polygon.
 if(lifts.some(e=>liftContains(e,p,-.06)))add(base);
 const supportAt=(q,previous)=>{const y=walkSurface(building,q,previous,levelId),cabin=Math.abs(base-previous)<.36&&lifts.some(e=>liftContains(e,q,-.06))?base:null;return y===null?cabin:cabin!==null&&Math.abs(cabin-previous)<Math.abs(y-previous)?cabin:y;};
 let supported=false;
 for(const candidate of candidates){
  const ground=supportAt(p,candidate.ground);if(ground===null||Math.abs(ground-candidate.ground)>.01)continue;supported=true;
  if([[-.3,-.3],[-.3,.3],[.3,-.3],[.3,.3]].some(([dx,dz])=>{const q={x:p.x+dx,z:p.z+dz},y=supportAt(q,ground),expected=candidate.surface?candidate.surface(q):ground;return y===null||expected===null||Math.abs(y-expected)>.01;}))continue;
  let blocked=false,elevation=0;
  for(const l of building.levels){
   const localGround=ground-elevation;
   if(l.design.objects.some(raw=>{const passenger=passengers.get(JSON.stringify([l.id,raw.id])),o=passenger?{...raw,elevation:raw.elevation+passenger.offset}:raw;if(o.assetId==='underpass'&&Math.abs((outdoorSurface(o,p,{smooth:true})??Infinity)-localGround)<.01)return localGround+1.8>o.elevation+o.height-.15;return objectBlocksWalkStart(l.design,o,p,localGround);})||l.design.walls.some(w=>wallBlocksWalkStart(l.design,w,p,localGround))||(l.elements||[]).some(e=>{
    const bottom=['slab','canopy'].includes(e.kind)?e.elevation-e.height:e.elevation,top=['slab','canopy'].includes(e.kind)?e.elevation:e.elevation+e.height;
    return ['column','beam','slab','canopy'].includes(e.kind)&&top>localGround+.01&&bottom<localGround+1.8&&elementContains(e,p,.3);
   })||(building.shafts||[]).some(s=>shaftServes(building,s,l.id)&&elevation+l.height>ground&&elevation<ground+1.8&&shaftContains(s,p,.3))){blocked=true;break;}
   elevation+=l.height;
  }
  if(blocked)continue;
  for(const s of building.stairs){const from=building.levels.find(l=>l.id===s.fromId),h=stairHeight(s,p,from.height);if(h===null||Math.abs(floorElevation(building,s.fromId)+h-ground)>.01)continue;const q=stairLocal(s,p),turn=-s.length/2+(s.width-.2)/2;if(Math.abs(q.x)>s.width/2-.3||s.layout==='return'&&q.z>turn&&Math.abs(q.x)<.4){blocked=true;break;}}
  const boxBlocks=(x,z,width,depth)=>Math.abs(p.x-x)<width/2+.3&&Math.abs(p.z-z)<depth/2+.3;
  for(const e of building.elevators||[]){if(!liftServes(building,e,levelId)||ground>=base+2.1||ground+1.8<=base)continue;if([-1,1].some(side=>boxBlocks(e.x+side*(e.width/2-.06),e.z,.06,e.depth-.12)||boxBlocks(e.x+side*(e.width/2-.08),e.z+e.depth/2,.16,.12))||boxBlocks(e.x,e.z-e.depth/2+.06,e.width-.12,.06)){blocked=true;break;}}
  if(!blocked)return {x:p.x,y:ground+1.65,z:p.z,levelId};
 }
 throw new Error(supported?'此處空間不足或被牆、門窗、家具占用，請雙擊附近空地。':'此處沒有可站立的地坪，請雙擊房間、陽台或通道內。');
}
export function stepWalk(building,position,dx,dz,group,liftLevelId){const next={x:position.x+dx,z:position.z+dz},foot=position.y-1.65,y=walkSurface(building,next,foot,liftLevelId);if(y===null)return null;
 const length=Math.hypot(dx,dz);if(length>0&&group){const direction=new THREE.Vector3(dx/length,0,dz/length),ray=new THREE.Raycaster(),meshes=[];group.traverse(o=>{if(o.isMesh&&!o.userData.nonBlocking&&(!['stair','room','slab','roof','opening-marker','outdoor-ground'].includes(o.userData.kind)&&!o.userData.ignorePicking||['stair-rail','lift-frame','lift-cabin','shaft-wall','structure'].includes(o.userData.kind)))meshes.push(o);});for(const h of [.35,1.5]){ray.set(new THREE.Vector3(position.x,Math.max(foot,y)+h,position.z),direction);ray.far=length+.22;if(ray.intersectObjects(meshes,false).length)return null;}const bounds=new THREE.Box3();for(const mesh of meshes.filter(m=>m.userData.chartSector)){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();bounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);const bottom=Math.max(Math.max(foot,y)+.01,bounds.min.y),top=Math.min(Math.max(foot,y)+1.8,bounds.max.y);if(top<=bottom)continue;ray.set(new THREE.Vector3(position.x,(bottom+top)/2,position.z),direction);ray.far=length+.22;if(ray.intersectObject(mesh,false).length)return null;}}
 return {x:next.x,y:y+1.65,z:next.z};}
// Camera-only feedback; collision and floor selection always use the unshifted body position.
export class StairFeedback{
 constructor(){this.enabled=true;this.reset();}
 reset(){this.age=.24;this.offset=0;}
 update(building,from,to,dt){
  if(!this.enabled){this.reset();return 0;}
  let crossed=false;
  if(Math.hypot(to.x-from.x,to.z-from.z)>1e-7&&Math.abs(to.y-from.y)>1e-7){
   for(const s of building.stairs){const level=building.levels.find(l=>l.id===s.fromId),base=floorElevation(building,s.fromId),height=level.height;
    if(![from,to].some(p=>stairContains(s,p,.051)&&p.y-1.65>=base-.01&&p.y-1.65<=base+height+.01))continue;
    const count=Math.ceil(height/(s.layout==='return'?.36:.18))*(s.layout==='return'?2:1),index=p=>Math.floor(Math.max(0,Math.min(count,(p.y-1.65-base)/height*count))+1e-7);
    if(index(from)!==index(to)){crossed=true;break;}
   }
  }
  this.age=crossed?0:Math.min(.24,this.age+dt);const phase=this.age/.24;
  this.offset=phase<1?-.025*Math.sin(Math.PI*phase)*Math.exp(-2*phase):0;return this.offset;
 }
 get active(){return this.age<.24;}
}
export class WalkController{
 constructor(view){this.view=view;this.keys=new Set();this.yaw=0;this.pitch=0;this.active=false;this.last=0;this.feedback=new StairFeedback();this.body=null;}
 ride(direction){if(!this.active)throw new Error('請先進入走動模式並走進電梯轎廂。');const b=this.view.building,p=this.view.camera.position,e=b.elevators.find(e=>liftContains(e,p,-.15));if(!e)throw new Error('請先走進電梯轎廂。');const index=b.levels.findIndex(l=>Math.abs(floorElevation(b,l.id)-(p.y-1.65))<.15),target=b.levels[index+direction];if(!target||!liftServes(b,e,target.id))throw new Error('已到達電梯服務範圍邊界。');for(const cabin of b.elevators){const current=this.view.liftLevelId||b.activeLevelId,from=liftServes(b,cabin,current)?current:cabin.fromId,to=liftServes(b,cabin,target.id)?target.id:cabin.fromId;this.view.liftPassengers=moveCabinContents(b,cabin,floorElevation(b,from),floorElevation(b,to),this.view.liftPassengers);}this.view.liftLevelId=target.id;this.view.rebuild=true;p.y=floorElevation(b,target.id)+1.65;this.body={x:p.x,y:p.y,z:p.z};this.feedback.reset();this.keys.clear();this.view.invalidate();}
 start(){
  const view=this.view,p=walkStart(view.building,view.building.activeLevelId);
  this.place(p,view.building.activeLevelId);
 }
 teleportTo(x,z,levelId=this.view.building.activeLevelId){
  const view=this.view,building=view.building,preserveLook=this.active,passengers=preserveLook?new Map(view.liftPassengers||[]):new Map();
  // Keep movable cabin contents attached when the destination level calls a lift.
  for(const e of building.elevators||[]){const current=view.liftLevelId||building.activeLevelId,from=liftServes(building,e,current)?current:e.fromId,to=liftServes(building,e,levelId)?levelId:e.fromId;const moved=moveCabinContents(building,e,floorElevation(building,from),floorElevation(building,to),passengers);passengers.clear();for(const [key,value] of moved)passengers.set(key,value);}
  const p=walkDestination(building,{x,z},levelId,{passengers});
  this.place(p,levelId,preserveLook,passengers);return p;
 }
 place(p,levelId,preserveLook=false,passengers=new Map()){
  const view=this.view;
  // A photo's long lens and principal-point offset are only for source matching.
  // The reference overlay retains its saved view so comparison can be restored.
  view.referenceCamera=null;view.camera.clearViewOffset();view.camera.fov=60;
  const width=view.width||view.canvas.clientWidth,height=view.height||view.canvas.clientHeight;
  if(width>0&&height>0)view.camera.aspect=width/height;
  view.camera.updateProjectionMatrix();
  view.liftPassengers=passengers;view.rebuild=true;this.body={x:p.x,y:p.y,z:p.z};this.feedback.reset();this.active=true;view.liftLevelId=levelId;view.controls.enabled=false;view.camera.position.set(p.x,p.y,p.z);if(!preserveLook){this.yaw=Math.PI;this.pitch=0;}this.keys.clear();this.last=0;this.look();view.canvas.focus();view.invalidate();
 }
 stop(){this.view.liftPassengers=new Map();this.view.rebuild=true;this.view.invalidate();if(this.active&&this.body)this.view.camera.position.set(this.body.x,this.body.y,this.body.z);this.feedback.reset();this.body=null;this.active=false;this.keys.clear();this.view.controls.enabled=true;}
 look(){this.view.camera.rotation.order='YXZ';this.view.camera.rotation.set(this.pitch,this.yaw,0);}
 setStairMotion(enabled){this.feedback.enabled=enabled;this.feedback.reset();if(this.active&&this.body)this.view.camera.position.set(this.body.x,this.body.y,this.body.z);this.view.invalidate();}
 key(e,down){if(!this.active)return;if(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(down)this.keys.add(e.key);else this.keys.delete(e.key);this.view.invalidate();}}
 // W／↑ 與觸控前進均沿目前面向前行，S／↓ 與觸控後退反向。
 update(now){if(!this.active)return;const dt=Math.min(.05,this.last?(now-this.last)/1000:.016);this.last=now;let forward=Number(this.keys.has('w')||this.keys.has('ArrowUp'))-Number(this.keys.has('s')||this.keys.has('ArrowDown')),side=Number(this.keys.has('d')||this.keys.has('ArrowRight'))-Number(this.keys.has('a')||this.keys.has('ArrowLeft'));const previous=this.body||{x:this.view.camera.position.x,y:this.view.camera.position.y,z:this.view.camera.position.z};this.body={...previous};const len=Math.hypot(forward,side);if(len){forward*=1.5*dt/len;side*=1.5*dt/len;const dx=-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side,dz=-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side,p=stepWalk(this.view.building,this.body,dx,dz,this.view.design.group,this.view.liftLevelId);if(p)this.body=p;this.view.invalidate();}const offset=this.feedback.update(this.view.building,previous,this.body,dt);this.view.camera.position.set(this.body.x,this.body.y+offset,this.body.z);if(this.feedback.active)this.view.invalidate();this.look();}
}
