import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';

const store=new BuildingStore(emptyProject());
store.execute({type:'floor.update',height:10,name:'開放與封閉地坪回歸'});
store.execute({type:'floorArea.add',points:[{x:-5,z:-2},{x:-1,z:-2},{x:-1,z:2},{x:-5,z:2}]});
const area=store.state.rooms.at(-1);
store.execute({type:'material',id:area.id,materialId:'concrete-polished'});
store.execute({type:'addRoom',x:1,z:-2,width:4,depth:4});const closed=store.state.rooms.at(-1);
assert.equal(area.boundaryMode,'area');assert.notEqual(closed.boundaryMode,'area');
const coarse=buildDesign(store.state,{coarse:true,levelHeight:10});
const openBounds=new THREE.Box3().setFromObject(coarse.byId.get(area.id)),closedBounds=new THREE.Box3().setFromObject(coarse.byId.get(closed.id));
assert(Math.abs(openBounds.max.y-openBounds.min.y)<1e-6,'open floor remains zero thickness when viewed from afar');
assert(Math.abs(openBounds.max.y-.002)<1e-6);assert.equal(coarse.byId.get(area.id).material.userData.materialId,'concrete-polished');
assert(Math.abs(closedBounds.min.y)<1e-6);assert(Math.abs(closedBounds.max.y-10)<1e-6,'enclosed room keeps its coarse building mass');coarse.dispose();

const onlyArea=new BuildingStore(emptyProject());onlyArea.execute({type:'floor.update',height:10,name:'開放地坪'});onlyArea.execute({type:'floorArea.add',points:[{x:-5,z:-2},{x:5,z:-2},{x:5,z:2},{x:-5,z:2}]});
const building=buildBuilding(onlyArea.building,{coarseLevels:new Set([onlyArea.building.activeLevelId]),roof:true});
const buildingBounds=new THREE.Box3().setFromObject(building.group);assert(Math.abs(buildingBounds.max.y-buildingBounds.min.y)<1e-6,'coarse building path must not add a roof or volume over an open area');assert(Math.abs(buildingBounds.max.y-.002)<1e-6);building.dispose();
console.log('PASS coarse areas: open floor remains flat with original material; enclosed room retains full-height mass; building coarse path adds no open-area box/roof.');
