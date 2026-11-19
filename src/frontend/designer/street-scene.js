import * as THREE from '../../../node_modules/three/build/three.module.js';
import {buildBuilding} from './building-geometry.js';
import {buildDesign} from './geometry.js';
import {floorElevation} from './building-model.js';
import {objectPose} from './model.js';
import {passengerKey} from './elevators.js';

// Geometry residency only: design metadata and shared imported resources stay intact.
export function createStreetScene(building,initial={}){
 const group=new THREE.Group(),chunks=new Map(),cells=[],levelBounds=new Map(),empty=new Map(building.levels.map(l=>[l.id,new Set()]));
 let shell=null,shellKey='',coarseLevels=new Set(),disposed=false;
 for(const l of building.levels){
  const base=floorElevation(building,l.id),bounds=new THREE.Box3();
  for(const r of l.design.rooms)for(const id of r.vertexIds){const v=l.design.vertices.find(v=>v.id===id);bounds.expandByPoint(new THREE.Vector3(v.x,base,v.z));bounds.expandByPoint(new THREE.Vector3(v.x,base+l.height,v.z));}
  levelBounds.set(l.id,bounds);
  const buckets=new Map();
  for(const o of l.design.objects){const p=objectPose(l.design,o),key=`${l.id}:${Math.floor(p.x/12)}:${Math.floor(p.z/12)}`;if(!buckets.has(key))buckets.set(key,{key,level:l,base,objects:[],bounds:new THREE.Box3()});const cell=buckets.get(key),radius=Math.hypot(p.width,p.depth)/2;cell.objects.push(o);cell.bounds.expandByPoint(new THREE.Vector3(p.x-radius,base+p.elevation,p.z-radius));cell.bounds.expandByPoint(new THREE.Vector3(p.x+radius,base+p.elevation+p.height,p.z+radius));}
  cells.push(...buckets.values());
 }
 const result={group,byId:new Map(),handles:[],stats:{},update,dispose(){if(disposed)return;disposed=true;shell?.dispose();for(const c of chunks.values())c.part.dispose();chunks.clear();group.clear();}};
 function update(options){
  if(disposed)return;
  const observer=new THREE.Vector3(options.observer.x,options.observer.y,options.observer.z),full=options.streetMode==='full',only=options.onlyLevelId,offset=only?floorElevation(building,only):0,nextCoarse=new Set();
  for(const l of building.levels){if(only&&only!==l.id)continue;const selected=l.id===building.activeLevelId&&options.selectedId,dist=levelBounds.get(l.id).distanceToPoint(observer);if(!full&&!selected&&dist>(coarseLevels.has(l.id)?28:36))nextCoarse.add(l.id);}
  coarseLevels=nextCoarse;
  const nextShellKey=JSON.stringify([only,[...coarseLevels],options.selectedId,options.selectedRoomIds,options.roof,options.liftLevelId]);
  if(nextShellKey!==shellKey){if(shell){group.remove(shell.group);shell.dispose();}shell=buildBuilding(building,{...options,visibleObjects:empty,coarseLevels});group.add(shell.group);shellKey=nextShellKey;}
  const wanted=new Set();
  for(const cell of cells){const l=cell.level;if(only&&l.id!==only)continue;
   const forced=cell.objects.some(o=>(l.id===building.activeLevelId&&o.id===options.selectedId)||options.liftPassengers?.has(passengerKey(l.id,o.id)));
   if(!full&&!forced&&cell.bounds.distanceToPoint(observer)>(chunks.has(cell.key)?100:80))continue;
   const ids=cell.objects.filter(o=>!options.visibleObjects||options.visibleObjects.get(l.id)?.has(o.id)).map(o=>o.id);if(!ids.length)continue;
   wanted.add(cell.key);const selected=l.id===building.activeLevelId?options.selectedId:null,key=JSON.stringify([ids,selected,offset,ids.map(id=>options.liftPassengers?.get(passengerKey(l.id,id))?.offset||0)]),old=chunks.get(cell.key);
   if(old?.key===key)continue;
   if(old){group.remove(old.part.group);old.part.dispose();}
   const part=buildDesign(l.design,{...options,selectedId:selected,selectedRoomIds:[],visibleObjectIds:new Set(ids),includeStructure:false});part.group.position.y=cell.base-offset;part.group.userData.floorId=l.id;
   for(const id of ids){const passenger=options.liftPassengers?.get(passengerKey(l.id,id));if(passenger&&part.byId.has(id))part.byId.get(id).position.y+=passenger.offset;}
   group.add(part.group);chunks.set(cell.key,{key,part});
  }
  for(const [key,c] of chunks)if(!wanted.has(key)){group.remove(c.part.group);c.part.dispose();chunks.delete(key);}
  result.byId=new Map(shell.byId);result.handles=shell.handles;
  if(only)for(const c of chunks.values())for(const [id,root] of c.part.byId)result.byId.set(id,root);
  result.stats={coarseLevels:coarseLevels.size,loadedCells:chunks.size,totalCells:cells.length};group.updateMatrixWorld(true);
 }
 update(initial);return result;
}
