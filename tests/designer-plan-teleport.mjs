import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore,floorElevation} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {stairHeight,stairWorld} from '../src/frontend/designer/stairs.js';
import {walkDestination,WalkController} from '../src/frontend/designer/walk.js';

const area=s=>s.execute({type:'floorArea.add',name:'通行區',points:[{x:-4,z:-4},{x:4,z:-4},{x:4,z:4},{x:-4,z:4}]});
const s=new BuildingStore(emptyProject());area(s);
s.execute({type:'wall.add',start:{x:0,z:-4},end:{x:0,z:4},thickness:.15,height:2.8,materialId:'plaster'});
s.execute({type:'addOpening',wallId:s.state.walls[0].id,kind:'door',at:.5});
assert.throws(()=>walkDestination(s.building,{x:0,z:0}),/占用/,'closed door is not a teleport landing');
s.execute({type:'toggleOpening',id:s.state.openings[0].id});
assert.equal(walkDestination(s.building,{x:0,z:0}).y,1.65,'open door threshold retains real floor support');
assert.throws(()=>walkDestination(s.building,{x:0,z:2}),/占用/,'independent partition blocks landings');
assert.throws(()=>walkDestination(s.building,{x:8,z:8}),/沒有可站立/,'outside the plan is not a destination');
assert.throws(()=>walkDestination(s.building,{x:3.9,z:2}),/空間不足/,'entire body needs support at an unguarded floor edge');
s.execute({type:'addObject',assetId:'table',x:2,z:1});
assert.throws(()=>walkDestination(s.building,{x:2,z:1}),/占用/,'cannot appear inside furniture');
assert.deepEqual(walkDestination(s.building,{x:-2,z:1}),{x:-2,y:1.65,z:1,levelId:'floor-1'});
assert.throws(()=>walkDestination(s.building,{x:NaN,z:0}),/有效座標/);

const levels=new BuildingStore(emptyProject());levels.execute({type:'addRoom',x:-5,z:-5,width:10,depth:10});levels.execute({type:'floor.add',copy:true});levels.execute({type:'floor.select',id:'floor-1'});
assert.equal(walkDestination(levels.building,{x:0,z:3},'floor-2').y,floorElevation(levels.building,'floor-2')+1.65,'overlapping floor plan selects the requested level');
levels.execute({type:'stair.add',x:-2,z:0,width:1.2,length:4.2,rotation:0});
const stair=levels.building.stairs[0],tread=stairWorld(stair,0,.8),treadY=stairHeight(stair,tread,levels.building.levels[0].height);
assert.equal(walkDestination(levels.building,tread,'floor-1').y,treadY+1.65,'clicked stair resolves actual tread height');
levels.execute({type:'lift.add',toId:'floor-2',x:2,z:0,width:1.8,depth:1.8,style:'home'});
assert.equal(walkDestination(levels.building,{x:2,z:0},'floor-2').y,floorElevation(levels.building,'floor-2')+1.65,'destination floor has cabin support');
assert.throws(()=>walkDestination(levels.building,{x:2.82,z:0},'floor-2'),/占用/,'lift cabin side wall blocks teleport');
const cabinOnly=structuredClone(levels.building);cabinOnly.stairs=[];
for(const l of cabinOnly.levels){l.design={...emptyProject(),rooms:[],walls:[],vertices:[],openings:[],objects:[]};l.elements=[];}
assert.equal(walkDestination(cabinOnly,{x:2,z:0},'floor-2').y,floorElevation(cabinOnly,'floor-2')+1.65,'standalone cabin bottom supports a landing without a room or slab');
assert.throws(()=>walkDestination(cabinOnly,{x:0,z:0},'floor-2'),/沒有可站立/,'a cabin-only reference does not invent surrounding floor');

// Both corners are supported, but their two flat ledges have different heights.
// They must not be accepted as one level landing merely because walkSurface can
// step between heights less than its normal 36 cm walking tolerance.
const ledges=new BuildingStore(emptyProject());
for(const [x,elevation] of [[-1,.25],[1,0]])ledges.execute({type:'element.add',kind:'slab',x,z:0,width:2,depth:4,height:.15,elevation,rotation:0,materialId:'stone'});
assert.equal(walkDestination(ledges.building,{x:-1,z:0}).y,1.9);
assert.throws(()=>walkDestination(ledges.building,{x:-.1,z:0}),/空間不足/,'body cannot straddle disconnected flat ledges at different heights');

// A valid landing may straddle equal-height outdoor tiles. The first source
// tile must not limit support that is supplied by its neighbour, in any order.
for(const rotation of [0,16.2,90])for(const reverse of [false,true]){
 const tiles=new BuildingStore(emptyProject()),a=rotation*Math.PI/180,world=(x,z)=>({x:x*Math.cos(a)-z*Math.sin(a),z:x*Math.sin(a)+z*Math.cos(a)});
 for(const x of reverse?[1,-1]:[-1,1]){
  tiles.execute({type:'addObject',assetId:x<0?'asphalt-road':'concrete-paving',...world(x,0)});
  tiles.execute({type:'transformObject',id:tiles.state.objects.at(-1).id,...world(x,0),width:2,depth:4,height:.12,elevation:0,rotation});
 }
 for(const x of [-.2,0,.2])assert(Math.abs(walkDestination(tiles.building,world(x,0)).y-1.77)<1e-9,'rotated touching paving supports the whole body across the seam');
 assert.throws(()=>walkDestination(tiles.building,world(1.9,0)),/空間不足/,'the outer edge still requires support for the whole body');
}
const gap=new BuildingStore(emptyProject());
for(const x of [-1.2,1.2]){
 gap.execute({type:'addObject',assetId:'concrete-paving',x,z:0});
 gap.execute({type:'dimensions',id:gap.state.objects.at(-1).id,width:2,depth:4,height:.12,elevation:0});
}
assert.throws(()=>walkDestination(gap.building,{x:-.25,z:0}),/空間不足/,'equal-height paving does not bridge a real unsupported gap');
const outdoorLedges=new BuildingStore(emptyProject());
for(const [x,elevation] of [[-1,0],[1,.08]]){
 outdoorLedges.execute({type:'addObject',assetId:'concrete-paving',x,z:0});
 outdoorLedges.execute({type:'dimensions',id:outdoorLedges.state.objects.at(-1).id,width:2,depth:4,height:.12,elevation});
}
assert.throws(()=>walkDestination(outdoorLedges.building,{x:-.1,z:0}),/空間不足|占用/,'different-height paving does not become one flat landing');
const tunnel=new BuildingStore(emptyProject());tunnel.execute({type:'addObject',assetId:'underpass',x:0,z:0});
const rampPoint={x:0,z:5.5},rampTop=-3+(1-(10-rampPoint.z)/6)*3;
assert(Math.abs(walkDestination(tunnel.building,rampPoint).y-rampTop-1.65)<1e-9,'underpass ramp retains its varying support profile');
assert.throws(()=>walkDestination(tunnel.building,{x:0,z:9.9}),/空間不足|占用/,'ramp entrance edge still requires full body support');

const view={building:s.building,camera:new THREE.PerspectiveCamera(12,1.5,.1,100),width:900,height:600,canvas:{focus(){}},controls:{enabled:true},invalidate(){}};
view.camera.setViewOffset(1600,900,100,0,1400,900);view.referenceCamera={saved:true};
const walk=new WalkController(view),land=walk.teleportTo(-2,1);
assert.equal(walk.active,true);assert.equal(view.controls.enabled,false);assert.equal(view.camera.fov,60);assert.equal(view.camera.view.enabled,false);assert.equal(view.referenceCamera,null);assert.deepEqual(view.camera.position.toArray(),[land.x,land.y,land.z]);
walk.yaw=.9;walk.pitch=-.2;walk.keys.add('w');walk.feedback.age=0;
walk.teleportTo(-2,-2);
assert.equal(walk.yaw,.9);assert.equal(walk.pitch,-.2);assert.equal(walk.keys.size,0);assert.equal(walk.feedback.active,false);assert.deepEqual(walk.body,{x:-2,y:1.65,z:-2});
const before={body:{...walk.body},position:view.camera.position.toArray(),yaw:walk.yaw,pitch:walk.pitch};
assert.throws(()=>walk.teleportTo(2,1),/占用/);
assert.deepEqual({body:walk.body,position:view.camera.position.toArray(),yaw:walk.yaw,pitch:walk.pitch},before,'invalid click leaves the current observer untouched');
console.log('PASS plan teleport: selected floor, actual stairs and cabin support; closed doors, partitions, furniture, cabin walls and voids reject; controller preserves look and failure state.');
