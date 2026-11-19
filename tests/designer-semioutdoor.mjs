import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {addSemiOutdoor,addWallCanopy} from '../src/frontend/designer/semioutdoor.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {createInteriorIndex,interiorState} from '../src/frontend/designer/interior-streaming.js';
import {walkSurface} from '../src/frontend/designer/stairs.js';
import {stepWalk,walkStart} from '../src/frontend/designer/walk.js';
import {planSvg} from '../src/frontend/designer/design-export.js';
for(const kind of ['corridor','arcade','shelter']){
 const store=new BuildingStore(emptyProject()),before=store.serialize();store.replace(addSemiOutdoor(store.building,{kind,x:-6,z:0,width:12,depth:3,clearance:2.6,spacing:3}));
 assert.equal(walkStart(store.building,store.building.activeLevelId).y,1.65);
 assert.equal(store.state.rooms.length,0);assert.equal(store.state.walls.length,0);assert.equal(walkSurface(store.building,{x:0,z:1},0),0);
 const built=buildBuilding(store.building);try{let p={x:-5.8,y:1.65,z:1.5};for(let i=0;i<110;i++){const q=stepWalk(store.building,p,.1,0,built.group);assert.ok(q,kind+' passage');p=q;}const ray=new THREE.Raycaster(new THREE.Vector3(0,1,1.5),new THREE.Vector3(0,1,0),0,3);assert.ok(ray.intersectObject(built.group,true).length>0,'actual overhead roof');}finally{built.dispose();}
 if(kind!=='arcade')assert.equal(walkSurface(store.building,{x:0,z:1},2.75),null,'canopy is not ground');
 store.undo();assert.equal(store.serialize(),before);store.redo();assert.ok(parseBuilding(store.serialize()));
}
const s=new BuildingStore(emptyProject());s.execute({type:'addRoom',x:0,z:0,width:8,depth:6});s.replace(addWallCanopy(s.building,{wallId:'wall-1',width:4,depth:1.5,clearance:2.3,slope:8}));let canopy=s.building.levels[0].elements[0];assert.ok(canopy.z<0);assert.equal(walkSurface(s.building,{x:4,z:-.7},canopy.elevation),null);
const oldx=canopy.x;s.execute({type:'wall.move',id:'wall-1',distance:.2});canopy=s.building.levels[0].elements[0];assert.equal(canopy.x,oldx);assert.ok(Math.abs(canopy.z-(-.65))<.2,'host follow');
assert.throws(()=>s.execute({type:'element.update',...canopy,id:canopy.id,x:canopy.x+1}));
s.execute({type:'canopy.detach',id:canopy.id});assert.equal(s.building.levels[0].elements[0].canopy.wallId,null);s.undo();
s.execute({type:'delete',id:'room-1'});assert.equal(s.building.levels[0].elements.length,0);s.undo();assert.equal(s.building.levels[0].elements.length,1);
const index=createInteriorIndex(s.building);assert.equal(interiorState(index,{x:4,y:1.65,z:-1}).active.size,0);
s.execute({type:'wall.move',id:'wall-1',distance:-.2});s.execute({type:'addOpening',wallId:'wall-1',kind:'door',at:.35});s.execute({type:'toggleOpening',id:s.state.openings[0].id});
// Connected facade and open arcade; no duplicate wall or fake enclosed room.
s.replace(addSemiOutdoor(s.building,{kind:'arcade',x:0,z:-3,width:8,depth:3,clearance:2.8,spacing:2.5}));
s.replace(addSemiOutdoor(s.building,{kind:'shelter',x:10,z:-3,width:8,depth:3,clearance:2.6,spacing:3}));
s.replace(addSemiOutdoor(s.building,{kind:'corridor',x:0,z:8,width:12,depth:3,clearance:2.6,spacing:3}));
const connected=buildBuilding(s.building);try{let p={x:2.8,y:1.65,z:-.7};for(let i=0;i<16;i++){const next=stepWalk(s.building,p,0,.1,connected.group);assert.ok(next,'arcade to building entrance');p=next;}}finally{connected.dispose();}
writeFileSync('output/semioutdoor-test.json',s.serialize());writeFileSync('output/semioutdoor-test.svg',planSvg(s.building,s.building.activeLevelId));
console.log('PASS open passage, floor support, roof exclusion, geometry, column collision path, canopy host following/detach/cascade, undo and persistence.');
