import * as THREE from '../../../node_modules/three/build/three.module.js';
import {insidePolygon,objectPose} from './model.js';
export function liftOutline(e,margin=0){return [{x:e.x-e.width/2-margin,z:e.z-e.depth/2-margin},{x:e.x+e.width/2+margin,z:e.z-e.depth/2-margin},{x:e.x+e.width/2+margin,z:e.z+e.depth/2+margin},{x:e.x-e.width/2-margin,z:e.z+e.depth/2+margin}];}
export const liftContains=(e,p,margin=0)=>Math.abs(p.x-e.x)<e.width/2+margin&&Math.abs(p.z-e.z)<e.depth/2+margin;
export function liftRoom(design,e){const points=liftOutline(e,.15);return design.rooms.find(r=>r.type==='room'&&points.every(p=>insidePolygon(p,r.vertexIds.map(id=>design.vertices.find(v=>v.id===id)))));}
export function liftServes(building,e,id){const indices=[e.fromId,e.toId,id].map(id=>building.levels.findIndex(l=>l.id===id));return indices[2]>=indices[0]&&indices[2]<=indices[1];}

// Runtime passengers: keep design coordinates unchanged and retain cabin-relative height.
export const passengerKey=(levelId,id)=>JSON.stringify([levelId,id]);
export function moveCabinContents(building,lift,fromY,toY,previous=new Map()){
 const passengers=new Map(previous),delta=toY-fromY;let base=0;
 for(const level of building.levels){for(const o of level.design.objects){const key=passengerKey(level.id,o.id),old=previous.get(key);
  if(old){if(old.liftId===lift.id)passengers.set(key,{...old,offset:old.offset+delta,groundElevation:toY});continue;}
  if(o.trace?.anchorId)continue;
  const p=objectPose(level.design,o),rotation=new THREE.Euler((o.trace?.pitch||o.prop?.pitch||0)*Math.PI/180,-p.rotation*Math.PI/180,(o.trace?.roll||o.prop?.roll||0)*Math.PI/180,'YXZ');let contained=true;
  for(const x of [-p.width/2,p.width/2])for(const y of [0,p.height])for(const z of [-p.depth/2,p.depth/2]){const v=new THREE.Vector3(x,y,z).applyEuler(rotation);v.add(new THREE.Vector3(p.x,base+p.elevation,p.z));if(!liftContains(lift,v,-.06)||v.y<fromY-1e-6||v.y>fromY+2.1+1e-6)contained=false;}
  if(contained)passengers.set(key,{liftId:lift.id,offset:delta,groundElevation:toY});
 }
 // Attached traces travel only with a passenger host, never with a fixed shaft wall.
 for(const o of level.design.objects)if(o.trace?.anchorId&&!previous.has(passengerKey(level.id,o.id))){const host=passengers.get(passengerKey(level.id,o.trace.anchorId));if(host?.liftId===lift.id)passengers.set(passengerKey(level.id,o.id),{...host});}
 base+=level.height;}
 return passengers;
}
