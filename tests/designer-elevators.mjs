import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {walkSurface} from '../src/frontend/designer/stairs.js';
import {WalkController,stepWalk} from '../src/frontend/designer/walk.js';
const s=new BuildingStore(emptyProject());s.execute({type:'addRoom',x:-4,z:-4,width:8,depth:8});s.execute({type:'floor.add',copy:true});s.execute({type:'floor.select',id:'floor-1'});s.execute({type:'stair.add',x:-2,z:0,width:1,length:4.2,rotation:0});s.execute({type:'lift.add',toId:'floor-2',x:2,z:0,width:1.6,depth:1.6,style:'home'});
const built=buildBuilding(s.building);try{const floors=[];built.group.traverse(o=>{if(o.isMesh&&['room','slab'].includes(o.userData.kind))floors.push(o);});const ray=new THREE.Raycaster(new THREE.Vector3(2,3.21,0),new THREE.Vector3(0,-1,0),0,.3);assert.equal(ray.intersectObjects(floors).length,0);assert.equal(walkSurface(s.building,{x:2,z:0},3.2,'floor-1'),null);assert.equal(walkSurface(s.building,{x:2,z:0},3.2,'floor-2'),3.2);assert.equal(stepWalk(s.building,{x:2.55,z:0,y:1.65},.1,0,built.group,'floor-1'),null,'轎廂側壁不可穿透');}finally{built.dispose();}
const view={building:s.building,camera:{position:new THREE.Vector3(2,1.65,0)},invalidate(){}};const walk=new WalkController(view);walk.active=true;walk.ride(1);assert.equal(view.camera.position.y,4.85);assert.equal(view.liftLevelId,'floor-2');assert.throws(()=>walk.ride(1));walk.ride(-1);assert.equal(view.camera.position.y,1.65);view.camera.position.x=0;assert.throws(()=>walk.ride(1));
const saved=s.serialize();assert.throws(()=>s.execute({type:'lift.update',id:'lift-1',toId:'floor-2',x:-2,z:0,width:1.6,depth:1.6,style:'home'}));assert.equal(s.serialize(),saved);s.execute({type:'lift.delete',id:'lift-1'});s.undo();assert.equal(s.serialize(),saved);assert.equal(parseBuilding(saved).elevators.length,1);writeFileSync('output/house-test-design.json',saved);console.log('PASS elevators: shaft holes, cabin-floor support, cabin wall collision, ride bounds/position, overlap rejection, undo and persistence.');
