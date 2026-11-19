import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {walkSurface} from '../src/frontend/designer/stairs.js';
import {stepWalk,walkStart} from '../src/frontend/designer/walk.js';
const s=new BuildingStore(emptyProject());s.execute({type:'addRoom',x:-4,z:-4,width:8,depth:8});const base={type:'element.add',x:0,z:0,width:1,depth:1,height:.15,elevation:0,rotation:0,materialId:'stone'};
s.execute({...base,kind:'opening'});assert.equal(walkSurface(s.building,{x:0,z:0},0),null);s.execute({...base,kind:'column',x:2,height:2.8,width:.4,depth:.4});s.execute({...base,kind:'beam',x:1,z:1,width:3,depth:.3,height:.3,elevation:2.4});s.execute({...base,kind:'slab',x:6,width:3,depth:3});assert.equal(walkSurface(s.building,{x:6,z:0},0),0);
s.execute({...base,kind:'opening',x:6});assert.equal(walkSurface(s.building,{x:6,z:0},0),null);
const built=buildBuilding(s.building);try{const floors=[];built.group.traverse(o=>{if(o.isMesh&&['room','slab'].includes(o.userData.kind))floors.push(o);});for(const x of [0,6])assert.equal(new THREE.Raycaster(new THREE.Vector3(x,.1,0),new THREE.Vector3(0,-1,0),0,.5).intersectObjects(floors).length,0);assert.equal(stepWalk(s.building,{x:1.5,y:1.65,z:0},.15,0,built.group),null);}finally{built.dispose();}
assert.ok(walkStart(s.building,'floor-1'));const saved=s.serialize();assert.throws(()=>s.execute({...base,kind:'opening',x:20}));assert.throws(()=>s.execute({...base,kind:'slab',x:0}));assert.throws(()=>s.execute({type:'element.delete',id:'element-4'}));assert.equal(s.serialize(),saved);
s.execute({type:'floor.add',copy:true,linked:true});assert.equal(s.building.levels[1].elements.length,5);assert.throws(()=>s.execute({...base,kind:'column'}));s.execute({type:'floor.select',id:'floor-1'});s.execute({type:'element.update',...s.building.levels[0].elements[1],x:2.5});assert.equal(s.building.levels[1].elements[1].x,2.5);s.undo();assert.equal(s.building.levels[1].elements[1].x,2);assert.equal(parseBuilding(s.serialize()).version,10);
const old=JSON.parse(saved);old.version=7;old.levels.forEach(l=>{delete l.elements;delete l.groups;delete l.editor;delete l.constraints;});assert.deepEqual(parseBuilding(JSON.stringify(old)).levels[0].elements,[]);writeFileSync('output/elements-test.json',saved);console.log('PASS elements: columns/beams/slabs/openings, actual holes, walk support/collision, atomic invalid deletion, standard-floor propagation, migration and undo.');
