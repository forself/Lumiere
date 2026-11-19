import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {stairWorld,stairPath} from '../src/frontend/designer/stairs.js';
import {stepWalk} from '../src/frontend/designer/walk.js';
for(const rotation of [0,90,180,270]){
const s=new BuildingStore(emptyProject());s.execute({type:'addRoom',x:-4,z:-4,width:8,depth:8});s.execute({type:'floor.add',copy:true});s.execute({type:'floor.select',id:'floor-1'});s.execute({type:'stair.add',x:0,z:0,width:2.4,length:4.2,rotation,layout:'return',finish:'oak'});
const stair=s.building.stairs[0],built=buildBuilding(s.building),path=stairPath(stair);
try{for(const reverse of [false,true]){const route=reverse?[...path].reverse():path;let p={...route[0],y:1.65+(reverse?3.2:0)};for(let k=1;k<route.length;k++){const a=route[k-1],b=route[k],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.04);for(let i=0;i<n;i++){const next=stepWalk(s.building,p,(b.x-a.x)/n,(b.z-a.z)/n,built.group);assert.ok(next,`return walk rotation ${rotation}, reverse ${reverse}, segment ${k}, step ${i}`);p=next;}}assert.ok(Math.abs(p.y-(reverse?1.65:4.85))<.001);}
const meshes=[];built.group.traverse(o=>{if(o.isMesh&&o.userData.kind==='stair-rail')meshes.push(o)});assert.ok(meshes.length<=2,'rails batched by material');
}finally{built.dispose();}
const saved=s.serialize();assert.throws(()=>s.execute({type:'stair.update',...stair,width:1}));assert.equal(s.serialize(),saved);assert.equal(parseBuilding(saved).stairs[0].layout,'return');if(rotation===0)writeFileSync('output/residential-stairs-test.json',saved);
}
console.log('PASS return stairs: four rotations, bidirectional landing traversal, batched rails, validation, persistence.');
