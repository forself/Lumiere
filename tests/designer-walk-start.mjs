import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
import {outdoorLocal,outdoorSurface} from '../src/frontend/designer/outdoor.js';
import {objectBlocksWalkStart,stepWalk,walkStart,WalkController} from '../src/frontend/designer/walk.js';
import {DesignViewport} from '../src/frontend/designer/DesignViewport.js';
import {ReferenceOverlay} from '../src/frontend/designer/reference-overlay.js';
import {captureReferenceView} from '../src/frontend/designer/reference-workspace.js';
import {applyReferenceProjection} from '../src/frontend/designer/reference-camera.js';

const add=(store,assetId,x,z,dimensions={})=>{
 store.execute({type:'addObject',assetId,x,z});const o=store.state.objects.at(-1);
 if(Object.keys(dimensions).length)store.execute({type:'dimensions',id:o.id,width:o.width,depth:o.depth,height:o.height,elevation:o.elevation,...dimensions});
 return o.id;
};

// A road's centre is not a safe spawn when the photographed traffic occupies it.
for(const rotation of [0,90])for(const elevation of [0,2]){
 const store=new BuildingStore(emptyProject());
 const roadId=add(store,'asphalt-road',0,0,{width:8,depth:14,height:.12,elevation});
 if(rotation)store.execute({type:'rotateObject',id:roadId});
 for(const offset of [-2,0,2]){
  const id=add(store,'vehicle-sedan',rotation?0:offset,rotation?offset:0,{elevation:elevation+.12});
  if(rotation)store.execute({type:'rotateObject',id});
 }
 const start=walkStart(store.building,store.building.activeLevelId),road=store.state.objects.find(o=>o.id===roadId),ground=elevation+.12;
 assert(Math.hypot(start.x,start.z)>1.2,'spawn must leave the occupied road centre');
 assert(Math.abs(start.y-ground-1.65)<1e-9,'eye height follows the actual road surface');
 const local=outdoorLocal(road,start);
 assert(Math.abs(local.x)<=road.width/2-.3&&Math.abs(local.z)<=road.depth/2-.3,'entire body remains on the rotated road');
 assert.equal(outdoorSurface(road,start),ground);
 for(const vehicle of store.state.objects.filter(o=>o.assetId==='vehicle-sedan'))assert.equal(objectBlocksWalkStart(store.state,vehicle,start,ground),false,'no vehicle overlap');
 const geometry=buildDesign(store.state);geometry.group.updateMatrixWorld(true);
 try{assert(stepWalk(store.building,start,rotation?-.08:0,rotation?0:.08,geometry.group),'spawn can take a step beside the actual vehicle meshes');}finally{geometry.dispose();}
}

const blocked=new BuildingStore(emptyProject());
add(blocked,'asphalt-road',0,0,{width:2,depth:3});add(blocked,'vehicle-box-truck',0,0);
assert.throws(()=>walkStart(blocked.building,blocked.building.activeLevelId),/沒有可用的起點/,'a completely occupied road must not spawn inside a vehicle');

for(const assetId of ['footbridge','underpass']){
 const store=new BuildingStore(emptyProject());add(store,assetId,0,0);
 const start=walkStart(store.building,store.building.activeLevelId);
 assert.equal(start.y,outdoorSurface(store.state.objects[0],start)+1.65,'passage remains a valid walking surface');
}

for(const kind of ['room','slab']){
 const store=new BuildingStore(emptyProject());
 if(kind==='room')store.execute({type:'addRoom',x:-2,z:-2,width:4,depth:4});
 else store.execute({type:'element.add',kind:'slab',x:0,z:0,width:4,depth:4,height:.15,elevation:0,rotation:0,materialId:'stone'});
 const before=walkStart(store.building,store.building.activeLevelId);
 add(store,'asphalt-road',10,0);
 assert.deepEqual(walkStart(store.building,store.building.activeLevelId),before,'existing '+kind+' start takes precedence unchanged');
}
console.log('PASS outdoor walk start avoids crowded traffic, preserves surface rotation/elevation and body clearance, rejects blocked roads, and retains room/slab/passage starts.');

// Loading a source camera must not turn subsequent walking into a telephoto view.
const store=new BuildingStore(emptyProject());add(store,'asphalt-road',0,0);
const view=new DesignViewport({mode:'scene'}),camera=new THREE.PerspectiveCamera(45,1.5,.1,1000);
let viewportSize={width:1200,height:800},renders=0;
Object.assign(view,{
 building:store.building,project:store.state,camera,width:1200,height:800,allFloors:true,interiorMode:'full',
 canvas:{focus(){}},controls:{enabled:true,target:new THREE.Vector3(),update(){camera.lookAt(this.target);}},
 element:{getBoundingClientRect:()=>viewportSize},renderer:{setSize(){},render(){renders++;}},
 scene:new THREE.Scene(),design:{group:new THREE.Group(),byId:new Map()},media:{playing:false},
 invalidate(){},drawBalloons(){}
});
view.walk=new WalkController(view);
const messages=[],page={views:[view],store,sync(){},message(message){messages.push(message);}},overlay=new ReferenceOverlay(page);
const sourceImage={image:{width:2000,height:1333},opacity:.25,scale:1,x:0,y:0,rotation:0,mode:'overlay'};
overlay.image=sourceImage;
const photoCamera={format:'lumiere-reference-camera',version:1,width:2000,height:1333,focal:7000,cx:1050,cy:700,position:[0,3,-12],target:[0,1,0]};
await overlay.loadCamera(new Blob([JSON.stringify(photoCamera)],{type:'application/json'}));
assert.deepEqual(view.referenceCamera,photoCamera,'reference camera imports through the real overlay path');
assert(camera.fov<12&&camera.view.enabled,'fixture uses a long lens and shifted principal point');
const savedView=structuredClone(overlay.savedView);
view.walk.start();
assert.equal(view.referenceCamera,null,'render loop must no longer reapply the photo camera');
assert.equal(camera.view.enabled,false,'walk uses an unshifted perspective');
assert.equal(camera.fov,60);assert.equal(camera.aspect,1.5);
assert.deepEqual(overlay.savedView,savedView,'entering walk preserves the photo comparison viewpoint');
assert.equal(overlay.image,sourceImage,'entering walk preserves the photo itself');

const previousDocument=globalThis.document;
try{
 globalThis.document={hidden:false};viewportSize={width:900,height:900};view.resize();
 // Geometry construction is covered above; exercise the real resize/render path.
 view.rebuild=false;view.frame(100);
 assert.equal(renders,1);assert.equal(camera.aspect,1);assert.equal(camera.fov,60);
 assert.equal(camera.view.enabled,false);assert.equal(view.referenceCamera,null,'resize/render do not resurrect the source projection');
 overlay.restoreView();
 assert.equal(view.walk.active,false);assert.deepEqual(view.referenceCamera,photoCamera);
 assert.equal(camera.view.enabled,true);assert.deepEqual(camera.position.toArray(),savedView.position);
 const expected=new THREE.PerspectiveCamera(45,1,camera.near,camera.far);applyReferenceProjection(expected,photoCamera,900,900);
 assert.deepEqual(camera.projectionMatrix.elements,expected.projectionMatrix.elements,'return to comparison restores photo intrinsics at the new viewport size');
 assert.deepEqual(captureReferenceView(view).referenceCamera,photoCamera);
 assert.deepEqual(overlay.savedView,savedView);assert.equal(overlay.image,sourceImage);
}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
console.log('PASS imported telephoto camera switches to normal walk perspective, survives resize/render, and restores the preserved photo viewpoint.');
