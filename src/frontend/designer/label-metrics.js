import {outdoorSurface,inUnderpassEntrance} from './outdoor.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import {insidePolygon,objectPose} from './model.js';
import {floorElevation} from './building-model.js';
import {stairLocal,stairHoles} from './stairs.js';
import {liftContains,liftServes,passengerKey} from './elevators.js';
import {elementContains} from './elements.js';
// 以物件外框的底部標高及垂直投影位置找最近下方地面，不把家具頂面視為地面。
// Match the rendered tread caps (including nosing), not the smooth walking ramp.
export function treadSurfaces(s,p,rise){
 const q=stairLocal(s,p),surfaces=[];
 const flight=(cx,width,start,end,low,high)=>{const n=Math.ceil((high-low)/.18),run=Math.abs(end-start),depth=run/n,sign=Math.sign(end-start);for(let i=0;i<n;i++)if(Math.abs(q.x-cx)<=width/2+.0125&&Math.abs(q.z-(start+sign*(i+.5)*depth))<=depth/2+.009)surfaces.push(low+(i+1)*(high-low)/n);};
 if(s.layout==='return'){const width=(s.width-.2)/2,cx=(width+.2)/2,turn=-s.length/2+width;flight(-cx,width,s.length/2,turn,0,rise/2);flight(cx,width,turn,s.length/2,rise/2,rise);if(Math.abs(q.x)<=s.width/2&&q.z>=-s.length/2&&q.z<=turn)surfaces.push(rise/2);}
 else flight(0,s.width,s.length/2,-s.length/2,0,rise);
 return surfaces;
}
export function labelMetrics(building,levelId,object,observer,view={}){
 const level=building.levels.find(l=>l.id===levelId),pose=objectPose(level.design,object),base=floorElevation(building,levelId)+(view.liftPassengers?.get(passengerKey(levelId,object.id))?.offset||0),rotation=new THREE.Euler((object.trace?.pitch||object.prop?.pitch||0)*Math.PI/180,-pose.rotation*Math.PI/180,(object.trace?.roll||object.prop?.roll||0)*Math.PI/180,'YXZ');
 const center=new THREE.Vector3(0,pose.height/2,0).applyEuler(rotation).add(new THREE.Vector3(pose.x,base+pose.elevation,pose.z));let bottom=Infinity;
 for(const x of [-pose.width/2,pose.width/2])for(const y of [0,pose.height])for(const z of [-pose.depth/2,pose.depth/2])bottom=Math.min(bottom,new THREE.Vector3(x,y,z).applyEuler(rotation).y+base+pose.elevation);
 const candidates=[],p={x:center.x,z:center.z};
 for(const l of building.levels){const elevation=floorElevation(building,l.id),holes=stairHoles(building,l.id);if(elevation<=bottom+1e-6&&l.design.rooms.some(r=>insidePolygon(p,r.vertexIds.map(id=>l.design.vertices.find(v=>v.id===id)))&&!holes.some(h=>h.roomId===r.id&&insidePolygon(p,h.points))))candidates.push(elevation);
  for(const o of l.design.objects){const y=outdoorSurface(o,p);if(y!==null&&elevation+y<=bottom+1e-6&&(o.assetId==='underpass'||!inUnderpassEntrance(l.design.objects,p,y,o)))candidates.push(elevation+y);}
  for(const slab of l.elements||[])if(slab.kind==='slab'&&elementContains(slab,p)&&elevation+slab.elevation<=bottom+1e-6&&!(l.elements||[]).some(e=>e.kind==='opening'&&Math.abs(e.elevation-slab.elevation)<1e-7&&elementContains(e,p)))candidates.push(elevation+slab.elevation);
 }
 for(const s of building.stairs){const level=building.levels.find(l=>l.id===s.fromId),base=floorElevation(building,s.fromId);for(const h of treadSurfaces(s,p,level.height))if(base+h<=bottom+1e-6)candidates.push(base+h);}
 for(const e of building.elevators){if(view.onlyLevelId&&!liftServes(building,e,view.onlyLevelId))continue;let cabin=view.onlyLevelId||view.liftLevelId||building.activeLevelId;if(!liftServes(building,e,cabin))cabin=e.fromId;const y=floorElevation(building,cabin);if(liftContains(e,p,-.06)&&y<=bottom+1e-6)candidates.push(y);}
 const ground=view.liftPassengers?.get(passengerKey(levelId,object.id))?.groundElevation??(candidates.length?Math.max(...candidates):null);
 return {groundHeight:ground===null?null:Math.max(0,bottom-ground),distance:observer?Math.hypot(center.x-observer.x,center.y-observer.y,center.z-observer.z):null,groundElevation:ground};
}
export const metricText=m=>`離地 ${m?.groundHeight==null?'未找到下方地面':m.groundHeight.toFixed(3)+' m'} · 距觀測點 ${m?.distance==null?'未取得':m.distance.toFixed(3)+' m'}`;
