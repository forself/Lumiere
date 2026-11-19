import {insidePolygon,objectPose} from './model.js';
import {floorElevation} from './building-model.js';
import {passengerKey} from './elevators.js';
const roomKey=(levelId,roomId)=>JSON.stringify([levelId,roomId]);
function distanceToBoundary(p,polygon){return Math.min(...polygon.map((a,i)=>{const b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}));}
// Cache classification once per immutable design revision; keep metadata for labels/2D.
export function createInteriorIndex(building){
 const levels=new Map(),rooms=[];
 for(const level of building.levels){const base=floorElevation(building,level.id),localRooms=level.design.rooms.filter(r=>r.type!=='balcony').map(r=>({key:roomKey(level.id,r.id),levelId:level.id,id:r.id,base,height:level.height,polygon:r.vertexIds.map(id=>level.design.vertices.find(v=>v.id===id))})),owners=new Map();rooms.push(...localRooms);
 for(const o of level.design.objects){const p=objectPose(level.design,o),room=localRooms.find(r=>p.elevation+p.height/2>=0&&p.elevation+p.height/2<level.height&&insidePolygon(p,r.polygon));owners.set(o.id,room?.key||null);}
 levels.set(level.id,{owners,rooms:localRooms});
 }
 return {levels,rooms};
}
export function interiorState(index,observer,{onlyLevelId=null,selectedId=null,selectionLevelId=null,previous=new Set(),passengers=new Map()}={}){
 const active=new Set();
 for(const r of index.rooms){if(onlyLevelId&&r.levelId!==onlyLevelId)continue;const inHeight=observer.y>=r.base-.2&&observer.y<r.base+r.height;
 // Doorway preloading (35 cm) prevents movement into unloaded furniture; wider exit band avoids churn.
 if(inHeight&&(insidePolygon(observer,r.polygon)||distanceToBoundary(observer,r.polygon)<(previous.has(r.key)?.6:.35)))active.add(r.key);
 if(r.levelId===selectionLevelId&&(selectedId===r.id||index.levels.get(r.levelId).owners.get(selectedId)===r.key))active.add(r.key);
 }
 const allowed=new Map();for(const [levelId,l] of index.levels){const ids=new Set();for(const [id,owner] of l.owners)if(!owner||active.has(owner)||passengers.has(passengerKey(levelId,id)))ids.add(id);allowed.set(levelId,ids);}
 return {active,allowed,key:JSON.stringify([...active].sort())+'|'+JSON.stringify([...passengers.keys()].sort())};
}
