import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {sampleProject} from '../src/frontend/designer/model.js';
import {BuildingStore,parseBuilding,floorElevation} from '../src/frontend/designer/building-model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
const store=new BuildingStore(sampleProject());assert.equal(store.building.levels.length,1);
store.execute({type:'floor.add',copy:true});assert.equal(store.building.levels.length,2);assert.equal(floorElevation(store.building,'floor-2'),3.2);
const lower=JSON.stringify(store.building.levels[0].design);store.execute({type:'moveObject',id:'object-1',x:0,z:0});assert.equal(JSON.stringify(store.building.levels[0].design),lower);
store.execute({type:'floor.update',name:'二樓',height:3.5});store.execute({type:'floor.add',copy:false});assert.equal(store.state.rooms.length,0);assert.equal(floorElevation(store.building,'floor-3'),6.7);
store.execute({type:'floor.select',id:'floor-1'});store.execute({type:'floor.update',name:'一樓',height:4});assert.equal(floorElevation(store.building,'floor-3'),7.5);
const scene=buildBuilding(store.building);try{assert.equal(scene.group.children[1].position.y,4);const first=new THREE.Box3().setFromObject(scene.group.children[0]);assert.ok(first.min.y<=-.149);assert.ok(first.max.y<4);}finally{scene.dispose();}
const saved=store.serialize();store.execute({type:'floor.delete'});assert.equal(store.building.levels.length,2);store.undo();assert.equal(store.serialize(),saved);assert.equal(JSON.stringify(parseBuilding(saved)),JSON.stringify(store.building));
for(const cmd of [{type:'floor.update',name:'bad',height:2},{type:'floor.select',id:'missing'},{type:'floor.update',name:'',height:4}]){const before=store.serialize();assert.throws(()=>store.execute(cmd));assert.equal(store.serialize(),before);}
const invalid=JSON.parse(saved);invalid.levels[1].id=invalid.levels[0].id;assert.throws(()=>parseBuilding(JSON.stringify(invalid)));
const single=new BuildingStore(sampleProject());assert.throws(()=>single.execute({type:'floor.delete'}));for(let i=1;i<8;i++)single.execute({type:'floor.add',copy:false});assert.throws(()=>single.execute({type:'floor.add',copy:false}));
console.log('PASS floors: migration, isolated editing, cumulative heights, real slabs, copy, empty floor, deletion/undo, persistence, invalid inputs and 8-floor limit.');
