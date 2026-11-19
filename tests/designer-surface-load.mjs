import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {DesignStore,sampleProject,parseProject,copyRoomGroup} from '../src/frontend/designer/model.js';
import {surfaceInfo} from '../src/frontend/designer/surface-load.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
const value={kind:'liquid',color:'#509bbd',fill:.6,width:.1,depth:.1,thickness:.005,x:0,z:0,shape:'ellipse'};
for(const assetId of ['bowl','plate','cup','basin','bath','table','placeholder-box','placeholder-ellipse']){
 const s=new DesignStore(sampleProject());s.execute({type:'addObject',assetId,x:0,z:0});const o=s.state.objects.at(-1),id=o.id,info=surfaceInfo(s.state,o);assert.ok(info,assetId);
 s.execute({type:'surface.load',id,value});assert.deepEqual(parseProject(s.serialize()),s.state);
 const built=buildDesign(s.state);let load;built.byId.get(id).traverse(m=>{if(m.userData.surfaceLoad)load=m;});assert.ok(load,assetId);const bounds=new THREE.Box3().setFromObject(load);if(info.kind==='cavity'){assert.ok(bounds.min.y>=info.base-1e-6);assert.ok(bounds.max.y<o.height);assert.ok(bounds.max.x<=o.width/2);assert.ok(bounds.max.z<=o.depth/2);}else assert.ok(bounds.min.y>=o.height);
 let disposed=false;load.geometry.addEventListener('dispose',()=>disposed=true);built.dispose();assert.ok(disposed);
 s.execute({type:'moveObject',id,x:2,z:1});const moved=buildDesign(s.state);try{assert.equal(moved.byId.get(id).position.x,2);assert.ok(moved.byId.get(id).children.some(c=>c.userData.surfaceLoad));}finally{moved.dispose();}
 const before=s.serialize();for(const bad of [{fill:2},{width:NaN},{color:'url(x)'},{kind:'gas'}]){assert.throws(()=>s.execute({type:'surface.load',id,value:{...value,...bad}}));assert.equal(s.serialize(),before);}
 s.execute({type:'surface.load',id,value:{...value,kind:'solid'}});s.execute({type:'surface.load',id,value:null});assert.ok(!s.state.objects.at(-1).surfaceLoad);s.undo();assert.equal(s.state.objects.at(-1).surfaceLoad.kind,'solid');
}
const s=new DesignStore(sampleProject());s.execute({type:'surface.load',id:'room-1',value});assert.throws(()=>s.execute({type:'surface.load',id:'room-1',value:{...value,x:20}}));const c=copyRoomGroup(s.state,['room-1'],{dx:10,dz:0}).design;assert.equal(c.rooms.at(-1).surfaceLoad.kind,'liquid');
s.execute({type:'addObject',assetId:'bowl',x:0,z:0});const o=s.state.objects.at(-1);s.execute({type:'surface.load',id:o.id,value});assert.throws(()=>s.execute({type:'prop.configure',id:o.id,...o,pitch:45,roll:0,color:o.prop.color,label:''}));
console.log('PASS surface loads: cavities bounded by inner profiles, flat surfaces, floor containment, movement, persistence, copy, undo, invalid inputs and cleanup.');
