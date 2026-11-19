import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {sampleProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {stairWorld,walkSurface} from '../src/frontend/designer/stairs.js';
import {stepWalk} from '../src/frontend/designer/walk.js';
import {planSvg} from '../src/frontend/designer/design-export.js';
const store=new BuildingStore(sampleProject());for(const id of ['object-1','object-2'])store.execute({type:'delete',id});store.execute({type:'floor.add',copy:true});store.execute({type:'floor.select',id:'floor-1'});store.execute({type:'stair.add',x:0,z:0,width:1,length:4.2,rotation:90});
const building=store.building,stair=building.stairs[0],built=buildBuilding(building,{roof:true});
try{
 const floorMeshes=[];built.group.traverse(o=>{if(o.isMesh&&['room','slab'].includes(o.userData.kind))floorMeshes.push(o);});const ray=new THREE.Raycaster(new THREE.Vector3(0,3.21,0),new THREE.Vector3(0,-1,0),0,.3);assert.equal(ray.intersectObjects(floorMeshes).length,0,'上層地坪及實體樓板都有洞口');ray.ray.origin.set(0,3.21,1.2);assert.ok(ray.intersectObjects(floorMeshes).length>0,'洞口旁仍有地板');
 let position={x:-2.2,y:1.65,z:0};for(let i=0;i<88;i++){const next=stepWalk(building,position,.05,0,built.group);assert.ok(next,`可上樓 ${i}`);position=next;}assert.ok(Math.abs(position.y-4.85)<1e-6,'到達二樓');for(let i=0;i<88;i++){const next=stepWalk(building,position,-.05,0,built.group);assert.ok(next,`可下樓 ${i}`);position=next;}assert.ok(Math.abs(position.y-1.65)<1e-6);
 assert.equal(stepWalk(building,{x:2.7,y:1.65,z:1},.1,0,built.group),null,'牆面阻擋');assert.equal(walkSurface(building,{x:20,z:20},0),null,'無地板不可行走');assert.ok(planSvg(building,'floor-1').includes('樓梯 ↑'));assert.ok(planSvg(building,'floor-2').includes('樓梯洞口 ↓'));
}finally{built.dispose();}
const saved=store.serialize();store.execute({type:'stair.delete',id:stair.id});assert.equal(store.building.stairs.length,0);store.undo();assert.equal(store.serialize(),saved);assert.equal(parseBuilding(saved).version,10);assert.throws(()=>store.execute({type:'stair.update',id:stair.id,x:20,z:0,width:1,length:4.2,rotation:90}));assert.equal(store.serialize(),saved);writeFileSync('output/stair-test-design.json',saved);console.log('PASS stairs: actual slab/plan cutout, bidirectional walk, wall blocking, void rejection, SVG, deletion/undo, validation and persistence.');
const malicious=structuredClone(building);malicious.levels[0].name='<script>alert(1)</script>';const safeSvg=planSvg(malicious,'floor-1');assert.ok(!safeSvg.includes('<script>'));assert.ok(safeSvg.includes('&lt;script&gt;'));assert.ok(!/<(?:script|foreignObject|image)\b/.test(safeSvg));console.log('PASS SVG export escaping and fixed inert element vocabulary.');
