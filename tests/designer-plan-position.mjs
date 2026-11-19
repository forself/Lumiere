import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {DesignViewport} from '../src/frontend/designer/DesignViewport.js';
import {DesignerPage} from '../src/frontend/designer/DesignerPage.js';
import {BuildingStore,floorElevation} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {WalkController} from '../src/frontend/designer/walk.js';

// A plan with a pan/zoom and page offset must land at the indicated world point.
const requests=[],plan=new DesignViewport({mode:'plan',onWalkTarget:p=>requests.push(p)});
Object.assign(plan,{width:800,height:600,center:{x:2,z:-3},zoom:50,tool:'select',canvas:{getBoundingClientRect:()=>({left:20,top:40})},invalidate(){}});
const click={button:0,clientX:480,clientY:435,timeStamp:1000,preventDefault(){},stopImmediatePropagation(){}};
plan.doubleClick(click);assert.deepEqual(requests,[{x:3.2,z:-1.1}]);
for(const state of [{tool:'door'},{tool:'polygon'},{tool:'select',calibrating:true},{tool:'select',calibrating:false,lastPlanDragAt:900}]){Object.assign(plan,state);plan.doubleClick(click);}
assert.equal(requests.length,1,'placement, calibration and a recent drag cannot trigger teleport');
plan.lastPlanDragAt=0;plan.doubleClick({...click,shiftKey:true});assert.equal(requests.length,1,'multi-selection does not teleport');

// Blink redraws only its overlay, follows motion and releases its timer on exit/destroy.
const saved={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,document:globalThis.document,cancelAnimationFrame:globalThis.cancelAnimationFrame};
const timers=new Map(),arcs=[],fills=[];let token=0,fullRedraws=0;
try{
 globalThis.setTimeout=fn=>{timers.set(++token,fn);return token;};globalThis.clearTimeout=id=>timers.delete(id);globalThis.document={hidden:false};globalThis.cancelAnimationFrame=()=>{};
 plan.positionContext={clearRect(){},save(){},restore(){},beginPath(){},arc(...args){arcs.push(args);},fill(){fills.push(this.globalAlpha);},fillText(){}};
 plan.invalidate=()=>fullRedraws++;plan.building={activeLevelId:'floor-1'};plan.textures={};plan.element={remove(){}};
 plan.setWalkPosition({x:3,z:-2,levelId:'floor-1',levelName:'一樓'});assert.equal(timers.size,1);assert.deepEqual(arcs.at(-1).slice(0,2),[450,350]);
 const first=timers.get(plan.positionTimer);timers.delete(plan.positionTimer);first();assert(fills.includes(.16),'dot has a dim blink phase');assert.equal(timers.size,1);
 plan.setWalkPosition({x:4,z:-1,levelId:'floor-1',levelName:'一樓'});assert.deepEqual(arcs.at(-1).slice(0,2),[500,400]);assert.equal(fullRedraws,0,'neither moving marker nor blinking requests a whole-plan/WebGL render');
 plan.setWalkPosition(null);assert.equal(timers.size,0);plan.setWalkPosition({x:0,z:0});assert.equal(timers.size,1);plan.destroy();assert.equal(timers.size,0);
}finally{for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}

// The page connects a real walker to the displayed plan without changing the design.
const store=new BuildingStore(emptyProject());store.execute({type:'addRoom',x:-3,z:-3,width:6,depth:6});
const markers=[],messages=[],view={renderer:{},building:store.building,camera:new THREE.PerspectiveCamera(),controls:{enabled:true},canvas:{focus(){}},width:800,height:600,invalidate(){},media:{clear(){}}};
view.walk=new WalkController(view);
const page=Object.assign(Object.create(DesignerPage.prototype),{store,views:[{mode:'plan',setWalkPosition:p=>markers.push(p)},view],allFloors:false,sync(){view.allFloors=this.allFloors;},message:m=>messages.push(m)});
const committed=store.serialize();page.teleportFromPlan({x:20,z:20});assert.equal(view.walk.active,false);assert.equal(page.allFloors,false);assert.equal(markers.length,0);
page.teleportFromPlan({x:1,z:1});assert.equal(view.walk.active,true);assert.equal(view.allFloors,true);assert.deepEqual(view.walk.body,{x:1,y:1.65,z:1});assert.deepEqual(markers.at(-1),{x:1,z:1,levelId:'floor-1',levelName:store.building.levels[0].name});assert.equal(store.serialize(),committed,'navigation does not mutate design/history');
store.execute({type:'floor.add',copy:true});const upper=store.building.levels.at(-1);page.updateWalkPosition({x:1,y:floorElevation(store.building,upper.id)+1.65,z:1});assert.equal(markers.at(-1).levelId,upper.id,'marker reports the observer floor while walking between levels');page.updateWalkPosition(null);assert.equal(markers.at(-1),null);
console.log('PASS plan navigation: transformed double-click, editing/drag guards, movement and blink without scene redraw, timer cleanup, page-to-walker integration and floor identity.');
