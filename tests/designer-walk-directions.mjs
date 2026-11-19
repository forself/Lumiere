import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {WalkController} from '../src/frontend/designer/walk.js';

const store=new BuildingStore(emptyProject());
store.execute({type:'addRoom',x:-6,z:-6,width:12,depth:12});
const building=store.building,original=JSON.stringify(building),geometry=buildBuilding(building);
let checks=0;
const near=(actual,expected,label)=>{assert.ok(Math.abs(actual-expected)<1e-9,`${label}: ${actual} != ${expected}`);checks++;};
const makeWalk=yaw=>{
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,1.65,0);
 const view={building,camera,design:geometry,controls:{enabled:false},canvas:{focus(){}},invalidate(){}};
 const walk=new WalkController(view);walk.active=true;walk.body={x:0,y:1.65,z:0};walk.yaw=yaw;walk.look();
 return walk;
};
const key=(walk,name,down)=>{let prevented=false;walk.key({key:name,preventDefault(){prevented=true;}},down);return prevented;};
// Expectations are explicit world axes at each camera heading, independent of
// the controller's trigonometric transform. Forward follows the camera heading.
const headings=[
 {yaw:0,forward:[0,-1],right:[1,0]},
 {yaw:Math.PI/2,forward:[-1,0],right:[0,-1]},
 {yaw:Math.PI,forward:[0,1],right:[-1,0]},
 {yaw:Math.PI*1.5,forward:[1,0],right:[0,1]}
];
const travel=1.5*.016;
try{
 for(const heading of headings){
  for(const [name,direction]of [
   ['w',heading.forward],['ArrowUp',heading.forward],
   ['s',heading.forward.map(n=>-n)],['ArrowDown',heading.forward.map(n=>-n)],
   ['d',heading.right],['ArrowRight',heading.right],
   ['a',heading.right.map(n=>-n)],['ArrowLeft',heading.right.map(n=>-n)]
  ]){
   const walk=makeWalk(heading.yaw);
   assert.equal(key(walk,name,true),true,'行走時方向輸入應阻止瀏覽器預設行為');checks++;
   walk.update(16);
   near(walk.body.x,direction[0]*travel,`${name}／朝向 ${heading.yaw} 的 X 方向`);
   near(walk.body.z,direction[1]*travel,`${name}／朝向 ${heading.yaw} 的 Z 方向`);
   near(walk.body.y,1.65,'實際地坪維持眼高');
   near(Math.hypot(walk.body.x,walk.body.z),travel,'四個方向維持相同速度');
   const stopped={...walk.body};key(walk,name,false);walk.update(32);
   assert.deepEqual(walk.body,stopped,'放開方向鍵立即停止移動');checks++;
  }
  for(const names of [['w','s'],['ArrowUp','ArrowDown'],['w','ArrowDown'],['a','d'],['ArrowLeft','ArrowRight'],['w','s','a','d']]){
   const walk=makeWalk(heading.yaw);for(const name of names)key(walk,name,true);walk.update(16);
   assert.deepEqual(walk.body,{x:0,y:1.65,z:0},`對向輸入 ${names.join('+')} 相消`);checks++;
  }
  for(const names of [['w','d'],['ArrowUp','ArrowRight'],['w','ArrowRight']]){
   const walk=makeWalk(heading.yaw);for(const name of names)key(walk,name,true);walk.update(16);
   near(walk.body.x,(heading.forward[0]+heading.right[0])*travel/Math.SQRT2,'前進與右移合成 X 方向');
   near(walk.body.z,(heading.forward[1]+heading.right[1])*travel/Math.SQRT2,'前進與右移合成 Z 方向');
   near(Math.hypot(walk.body.x,walk.body.z),travel,'斜向移動正規化，速度不增加');
  }
 }
 const inactive=makeWalk(0);key(inactive,'w',true);inactive.stop();
 assert.equal(inactive.keys.size,0,'停止巡覽釋放已按住的方向鍵');checks++;
 assert.equal(key(inactive,'w',false),false,'停止後放鍵不攔截瀏覽器事件');checks++;
 assert.equal(key(inactive,'ArrowUp',true),false,'非巡覽模式不接收方向輸入');checks++;
 const position=inactive.view.camera.position.clone();inactive.update(100);
 assert.equal(inactive.keys.size,0,'非巡覽模式不累積按鍵');checks++;
 assert.deepEqual(inactive.view.camera.position,position,'非巡覽模式不改變相機');checks++;
 assert.equal(JSON.stringify(building),original,'方向控制不修改原生建物或地坪');checks++;
 console.log(`PASS walk directions: ${checks} assertions; camera-forward W/up and backward S/down under four headings, unchanged lateral movement, opposing inputs, normalized diagonal, key release and inactive cleanup on real native floor geometry.`);
}finally{geometry.dispose();}
