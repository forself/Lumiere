import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {walkSurface,stairHoles} from '../src/frontend/designer/stairs.js';
import {shaftRoom,shaftContains} from '../src/frontend/designer/shafts.js';
import {stepWalk,walkStart} from '../src/frontend/designer/walk.js';
import {planSvg} from '../src/frontend/designer/design-export.js';
const s=new BuildingStore(emptyProject());s.execute({type:'addRoom',x:-4,z:-4,width:8,depth:8});s.execute({type:'floor.add',copy:true,linked:true});s.execute({type:'floor.add',copy:true,linked:true});s.execute({type:'floor.select',id:'floor-1'});
const add={type:'shaft.add',toId:'floor-3',x:0,z:0,width:1.2,depth:1.2};s.execute(add);const saved=s.serialize();assert.equal(stairHoles(s.building,'floor-1').length,0);assert.equal(stairHoles(s.building,'floor-2').length,1);assert.equal(stairHoles(s.building,'floor-3').length,1);
for(const y of [0,3.2,6.4])assert.equal(walkSurface(s.building,{x:0,z:0},y),null);
const built=buildBuilding(s.building);try{const floors=[];built.group.traverse(o=>{if(o.isMesh&&['room','slab'].includes(o.userData.kind))floors.push(o);});for(const y of [3.2,6.4]){const ray=new THREE.Raycaster(new THREE.Vector3(0,y+.02,0),new THREE.Vector3(0,-1,0),0,.3);assert.equal(ray.intersectObjects(floors).length,0);}const bottom=new THREE.Raycaster(new THREE.Vector3(0,.1,0),new THREE.Vector3(0,-1,0),0,.3);assert.ok(bottom.intersectObjects(floors).length);assert.equal(stepWalk(s.building,{x:.9,y:1.65,z:0},-.1,0,built.group),null);}finally{built.dispose();}
assert.ok(!shaftContains(s.building.shafts[0],walkStart(s.building,'floor-1'),.3));assert.match(planSvg(s.building,'floor-2'),/管道間 shaft-1/);
assert.throws(()=>s.execute({...add,x:.5}));assert.throws(()=>s.execute({...add,x:3.6}));assert.throws(()=>s.execute({type:'lift.add',toId:'floor-3',x:0,z:0,width:1.6,depth:1.6,style:'home'}));assert.throws(()=>s.execute({type:'stair.add',x:0,z:0,width:1,length:4,rotation:0}));assert.equal(s.serialize(),saved);
s.execute({type:'shaft.delete',id:'shaft-1'});assert.equal(stairHoles(s.building,'floor-2').length,0);s.undo();assert.equal(s.serialize(),saved);s.redo();s.undo();assert.equal(parseBuilding(saved).shafts.length,1);
const old=JSON.parse(saved);old.version=6;delete old.shafts;for(const l of old.levels){delete l.elements;delete l.groups;delete l.editor;delete l.constraints;}assert.deepEqual(parseBuilding(JSON.stringify(old)).shafts,[]);
const bad=JSON.parse(saved);bad.shafts[0].toId='missing';assert.throws(()=>parseBuilding(JSON.stringify(bad)));
s.execute({type:'floor.select',id:'floor-2'});s.execute({...add,toId:'floor-3',x:2});assert.equal(s.building.shafts.length,2);s.undo();s.undo();
// Boundary segment inside the rectangle must be rejected, even when all four corners lie inside a concave room.
const concave=new BuildingStore(emptyProject());concave.execute({type:'addRoom',x:-4,z:-4,width:8,depth:8});const design=structuredClone(concave.state);design.walls.push({id:'test',startId:design.vertices[0].id,endId:design.vertices[1].id,thickness:.2});design.vertices[0].x=0;design.vertices[0].z=0;assert.equal(shaftRoom(design,s.building.shafts[0]),undefined);
const beforeDelete=s.serialize();assert.throws(()=>s.execute({type:'delete',id:s.state.rooms[0].id}));assert.equal(s.serialize(),beforeDelete,'linked source edit must fail atomically when it removes shaft support');
s.execute({type:'floor.select',id:'floor-3'});s.execute({type:'floor.delete'});assert.equal(s.building.shafts.length,0);s.undo();assert.equal(s.building.shafts.length,1);
writeFileSync('output/shafts-test.json',saved);console.log('PASS shafts: v6 migration, 3-floor holes/base slab, collision, spawn, overlap atomicity, linked floors, undo, persistence, SVG.');
