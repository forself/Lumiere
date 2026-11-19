import assert from 'node:assert/strict';
import {sampleProject} from '../src/frontend/designer/model.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {labelMetrics,metricText} from '../src/frontend/designer/label-metrics.js';
const s=new BuildingStore(sampleProject());s.execute({type:'addObject',assetId:'cup',x:0,z:0,elevation:.8});const id=s.state.objects.at(-1).id;
let o=s.state.objects.find(o=>o.id===id),m=labelMetrics(s.building,'floor-1',o,{x:0,y:2,z:0});assert.ok(Math.abs(m.groundHeight-.8)<1e-9);assert.ok(Math.abs(m.distance-1.145)<1e-9);
s.execute({type:'floor.add',copy:true});o=s.state.objects.find(o=>o.id===id);m=labelMetrics(s.building,'floor-2',o,{x:0,y:5.2,z:0});assert.ok(Math.abs(m.groundHeight-.8)<1e-9);assert.ok(Math.abs(m.distance-1.145)<1e-9);assert.equal(m.groundElevation,3.2);
const b=structuredClone(s.building);b.levels[1].elements.push({id:'element-1',kind:'opening',x:0,z:0,width:1,depth:1,height:.15,elevation:0,rotation:0,materialId:'stone'});m=labelMetrics(b,'floor-2',o,{x:0,y:5.2,z:0});assert.ok(Math.abs(m.groundHeight-4)<1e-9);assert.equal(m.groundElevation,0);
const missing={...o,x:30,z:30};assert.equal(labelMetrics(s.building,'floor-2',missing,null).groundHeight,null);assert.match(metricText(labelMetrics(s.building,'floor-2',missing,null)),/未找到下方地面/);
const slab=structuredClone(s.building);slab.levels[1].elements.push({id:'element-1',kind:'slab',x:0,z:0,width:1,depth:1,height:.15,elevation:.5,rotation:0,materialId:'stone'});assert.ok(Math.abs(labelMetrics(slab,'floor-2',o,null).groundHeight-.3)<1e-9);
assert.notEqual(labelMetrics(s.building,'floor-2',o,{x:10,y:5.2,z:0}).distance,m.distance);
console.log('PASS label metrics: bottom-ground height, center-camera distance, multi-floor coordinates, holes, raised slabs, missing ground and observer changes.');
import * as THREE from '../node_modules/three/build/three.module.js';
import {buildStair} from '../src/frontend/designer/stair-geometry.js';
import {stairWorld} from '../src/frontend/designer/stairs.js';
import {treadSurfaces} from '../src/frontend/designer/label-metrics.js';
for(const layout of ['straight','return']){
 const stair={x:0,z:0,width:layout==='return'?2.4:1,length:2.2,rotation:90,layout,fromId:'floor-1',toId:'floor-2'};
 const geometry=buildStair(stair,3.2);geometry.group.updateMatrixWorld(true);
 try{for(const [x,z] of layout==='return'?[[-.65,.5],[.65,.5],[0,-.8],[0,.5]]:[[0,.5],[0,.2],[0,-.5],[.8,0]]){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0));const hits=ray.intersectObjects(geometry.group.children.filter(m=>m.userData.kind==='stair'));const p=stairWorld(stair,x,z),heights=treadSurfaces(stair,p,3.2);
  assert.equal(heights.length>0,hits.length>0);if(hits.length)assert.ok(Math.abs(Math.max(...heights)-hits[0].point.y)<1e-6,'tread matches rendered top');
  const b=structuredClone(s.building);b.stairs=[stair];const item={...o,...p,elevation:1};const actual=labelMetrics(b,'floor-2',item,null);if(heights.length)assert.ok(Math.abs(actual.groundElevation-Math.max(...heights))<1e-6,'nearest stair surface');
 }}finally{geometry.dispose();}
}
const liftBuilding=structuredClone(s.building);liftBuilding.elevators=[{id:'lift-1',x:0,z:0,width:1.5,depth:1.5,fromId:'floor-1',toId:'floor-2'}];
assert.equal(labelMetrics(liftBuilding,'floor-2',o,null,{liftLevelId:'floor-2'}).groundElevation,3.2);
assert.equal(labelMetrics(liftBuilding,'floor-2',o,null,{liftLevelId:'floor-1'}).groundElevation,0);
assert.equal(labelMetrics(liftBuilding,'floor-2',o,null,{onlyLevelId:'floor-2',liftLevelId:'floor-1'}).groundElevation,3.2);
assert.equal(labelMetrics(liftBuilding,'floor-1',o,null,{liftLevelId:'floor-2'}).groundElevation,0,'cabin above object is not ground below');
assert.equal(labelMetrics(liftBuilding,'floor-2',{...o,x:.72},null,{liftLevelId:'floor-2'}).groundElevation,0,'outside cabin floor footprint');
console.log('PASS rendered stair treads, rotated return flights, landing, central void, cabin level changes and footprint.');
import {moveCabinContents,passengerKey} from '../src/frontend/designer/elevators.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
const transport=structuredClone(liftBuilding),lift=transport.elevators[0];
transport.levels[1].design.objects=[];
const cup={...o,id:'passenger',x:0,z:0,elevation:.8};transport.levels[0].design.objects=[cup,{...cup,id:'outside',x:2}];
const original=JSON.stringify(transport),key=passengerKey('floor-1',cup.id);
const passengers=moveCabinContents(transport,lift,0,3.2);
assert.equal(passengers.get(key).offset,3.2);assert.equal(passengers.has(passengerKey('floor-1','outside')),false);
const before=labelMetrics(transport,'floor-1',cup,{x:0,y:1.65,z:0},{liftLevelId:'floor-1'});
const after=labelMetrics(transport,'floor-1',cup,{x:0,y:4.85,z:0},{liftLevelId:'floor-2',liftPassengers:passengers});
assert.ok(Math.abs(before.groundHeight-after.groundHeight)<1e-9);assert.ok(Math.abs(before.distance-after.distance)<1e-9,'observer riding with object');
assert.notEqual(before.distance,labelMetrics(transport,'floor-1',cup,{x:0,y:1.65,z:0},{liftLevelId:'floor-2',liftPassengers:passengers}).distance,'fixed observer distance changes');
const builtTransport=buildBuilding(transport,{liftLevelId:'floor-2',liftPassengers:passengers});
try{const part=builtTransport.group.children.find(g=>g.userData.floorId==='floor-1');assert.ok(part.children.some(g=>Math.abs(g.position.y-4)<1e-9),'mesh follows cabin');}finally{builtTransport.dispose();}
const back=moveCabinContents(transport,lift,3.2,0,passengers);assert.equal(back.get(key).offset,0);assert.equal(JSON.stringify(transport),original,'runtime transport preserves saved design');
console.log('PASS cabin passenger height invariant, moving/fixed observer distance, rendered object transport, round trip and unchanged design.');
import {WalkController} from '../src/frontend/designer/walk.js';
const rideView={building:transport,camera:{position:new THREE.Vector3(0,1.65,0)},controls:{enabled:false},invalidate(){}};
transport.activeLevelId='floor-1';const rider=new WalkController(rideView);rider.active=true;rider.ride(1);
assert.equal(rideView.liftPassengers.get(key).offset,3.2);rider.ride(-1);assert.equal(rideView.liftPassengers.get(key).offset,0);rider.stop();assert.equal(rideView.liftPassengers.size,0);
console.log('PASS actual ride controller passenger integration and reset.');
