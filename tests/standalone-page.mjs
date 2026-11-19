import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {WalkController} from '../src/frontend/designer/walk.js';
import {TourPage} from '../src/frontend/tour/TourPage.js';
import {restoreStandaloneView} from '../src/frontend/tour/standalone-entry.js';
import {validateToolPageDefinition} from '../lib/page-generator/ToolPageDefinition.js';

const definition=JSON.parse(await readFile('definitions/tour.page.json','utf8'));
assert.equal(validateToolPageDefinition(definition).valid,true,'獨立模式沿用有效的 B4A 頁面定義');
const find=(n,id)=>n?.id===id?n:(n?.children||[]).map(n=>find(n,id)).find(Boolean);
assert.equal(find(definition.root||definition.page||definition,'tour-export-html')?.events?.onClick,'source.export.html');
const store=new BuildingStore(emptyProject());store.execute({type:'addRoom',x:-4,z:-4,width:8,depth:8});
const building=store.building,before=JSON.stringify(building),geometry=buildBuilding(building);
const camera=new THREE.PerspectiveCamera(),controls={enabled:true,target:new THREE.Vector3(),update(){}},scene={building,camera,controls,design:geometry,width:800,height:600,canvas:{focus(){}},invalidate(){}};
scene.walk=new WalkController(scene);
const notices=[],positions=[],page=new TourPage({definition,standalone:true});
Object.assign(page,{building,scene,syncViews(){},syncControls(){},observe:p=>positions.push(p),message:m=>notices.push(m),startWalk(){scene.walk.start();}});
const saved={mode:'walk',levelId:'floor-1',position:[1,1.65,-1],target:[0,0,0],yaw:.7,pitch:-.2,roof:true,showPlan:true,showLabels:false,detail:'auto'};
try{
 restoreStandaloneView(page,saved);
 assert.deepEqual(scene.walk.body,{x:1,y:1.65,z:-1});assert.equal(scene.walk.yaw,.7);assert.equal(scene.walk.pitch,-.2);assert.equal(scene.walk.active,true);
 assert.equal(page.roof,true);assert.equal(page.showLabels,false);assert.equal(page.detail,'auto');assert.equal(positions.at(-1).x,1);
 assert.equal(page.standaloneView().mode,'walk');assert.deepEqual(page.standaloneView().position,[1,1.65,-1]);
 const orbit={...saved,mode:'orbit',position:[8,7,9],target:[1,1,0]};restoreStandaloneView(page,orbit);
 assert.equal(scene.walk.active,false);assert.deepEqual(camera.position.toArray(),orbit.position);assert.deepEqual(controls.target.toArray(),orbit.target);
 const facing=camera.getWorldDirection(new THREE.Vector3()),expected=new THREE.Vector3().fromArray(orbit.target).sub(camera.position).normalize();assert(facing.distanceTo(expected)<1e-10);
 assert.throws(()=>restoreStandaloneView(page,{...saved,position:[NaN,1,1]}),/座標/);
 assert.throws(()=>restoreStandaloneView(page,{...saved,levelId:'missing'}),/視點/);
 const current=camera.position.clone();restoreStandaloneView(page,null);assert.deepEqual(camera.position,current);
 page.leave();await page.applyAndLeave();assert.match(notices.at(-1),/獨立網頁沒有設計器入口/);
 assert.equal(JSON.stringify(building),before,'保存視角、獨立模式導覽與離開不修改建築模型');
 assert.equal(new TourPage().options.standalone,undefined,'原網站預設流程不變');
 console.log('PASS standalone page: registered B4A export button, embedded definition, real walk/orbit restore, safe viewpoint rejection, offline route guard and source retention.');
}finally{geometry.dispose();}
