import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {DesignStore,sampleProject,emptyProject,validateProject,applyCommand,parseProject,wallFrame,polygonArea} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
import {validateToolPageDefinition} from '../lib/page-generator/ToolPageDefinition.js';

let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const near=(actual,expected,label)=>check(Math.abs(actual-expected)<1e-6,`${label}: ${actual} / ${expected}`);
const rejects=(fn,label)=>{assert.throws(fn,undefined,label);checks++;};
const sample=sampleProject(),store=new DesignStore(sample),initial=store.serialize();
check(validateProject(emptyProject()).rooms.length===0,'空白設計合法');
check(sample.walls.length===4&&sample.rooms.length===1&&sample.openings.length===2,'範例包含四面牆、門與窗');
near(polygonArea(sample.vertices),24,'獨立已知6×4m房間面積');
rejects(()=>{store.state.walls[0].height=100;},'外部無法直接改寫共用資料');
store.execute({type:'dimensions',id:'wall-1',width:7,height:3,depth:.15});
const changed=store.serialize(),wall=store.state.walls[0],frame=wallFrame(store.state,wall);
near(frame.length,7,'牆長依命令變更');
near(store.state.vertices.find(v=>v.id===wall.endId).x,4,'共用角點移到指定長度');
check(store.state.walls[1].startId===wall.endId,'相鄰牆持續共享同一個角點');
near(store.state.openings[0].at,.25,'門保留原牆相對位置');
near(frame.a.x+frame.length*.25,-1.25,'3D及2D門中心由相同牆資料推導');
store.undo();check(store.serialize()===initial,'復原完整恢復初始資料');store.redo();check(store.serialize()===changed,'重做恢復全部關係');
const roundtrip=parseProject(store.serialize());check(JSON.stringify(roundtrip)===JSON.stringify(store.state),'JSON儲存重開不遺失尺寸及ID');
const before=store.serialize(),history=store.past.length;
rejects(()=>store.execute({type:'dimensions',id:'wall-1',width:.7,height:3,depth:.15}),'牆縮到容不下門時拒絕');
check(store.serialize()===before&&store.past.length===history,'拒絕的命令不改資料及歷史');
rejects(()=>store.execute({type:'addOpening',wallId:'wall-1',kind:'window',at:.25}),'門窗重疊拒絕');
rejects(()=>store.execute({type:'moveVertex',id:'vertex-2',x:-4,z:0}),'自交輪廓拒絕');
rejects(()=>store.execute({type:'delete',id:'wall-1'}),'單獨刪牆不破壞封閉輪廓');
rejects(()=>store.execute({type:'addRoom',x:0,z:0,width:2,depth:2}),'重疊房間拒絕');
const preview=store.preview({type:'moveObject',id:'object-1',x:1,z:1});
check(preview.objects[0].x===1&&store.serialize()===before,'拖曳預覽不提交或污染歷史');
store.execute({type:'moveObject',id:'object-1',x:1,z:1});store.undo();store.execute({type:'rotateObject',id:'object-1'});
check(!store.future.length,'復原後新修改清除重做分支');
store.execute({type:'delete',id:'room-1'});
check(!store.state.vertices.length&&!store.state.walls.length&&!store.state.openings.length&&store.state.objects.length===2,'刪房間清理門窗與牆，保留獨立家具');store.undo();
for(const mutate of [
 p=>{p.version=99;},p=>{p.units='px';},p=>{p.walls[0].height=NaN;},p=>{p.walls[0].startId='missing';},p=>{p.vertices[1].id=p.vertices[0].id;},p=>{p.openings[0].wallId='missing';},p=>{p.objects[0].assetId='constructor';},p=>{p.walls[0].materialId='remote-script';},p=>{p.extra='unknown';},p=>{p.openings[1].open=true;},p=>{p.openings[1].sill=2.7;},p=>{p.rooms[0].wallIds.reverse();},
]){const invalid=structuredClone(sample);mutate(invalid);rejects(()=>validateProject(invalid),'拒絕錯誤設計或外部欄位');}
rejects(()=>parseProject('{"__proto__":{}}'),'拒絕未允許外部資料');
rejects(()=>parseProject(' '.repeat(262145)),'拒絕過大檔案');

// 實際幾何射線，預期位置獨立寫出，不從牆段生成器反推。
function hits(built,origin,direction,filter=()=>true){const ray=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,1);return ray.intersectObject(built.group,true).filter(h=>h.object.isMesh&&filter(h.object.userData));}
function audit(built){
  let ok=true;
  for(const x of [-2.8,-2.1,-.8,0,1,2.8])for(const y of [.25,1.4,2.6])ok&&=hits(built,[x,y,-2.45],[0,0,1],d=>d.kind==='wall').length>0;
  for(const x of [-2.95,-2,0,2,2.95])for(const y of [.25,1.4,2.6])ok&&=hits(built,[x,y,2.45],[0,0,-1],d=>d.kind==='wall').length>0;
  for(const z of [-1.95,-1,0,1,1.95])for(const y of [.25,1.4,2.6])ok&&=hits(built,[-3.45,y,z],[1,0,0],d=>d.kind==='wall').length>0;
  for(const z of [-1.95,-1,1,1.95])for(const y of [.25,1.4,2.6])ok&&=hits(built,[3.45,y,z],[-1,0,0],d=>d.kind==='wall').length>0;
  ok&&=hits(built,[-1.5,1,-2.45],[0,0,1],d=>d.kind==='wall').length===0;
  ok&&=hits(built,[-1.5,2.5,-2.45],[0,0,1],d=>d.kind==='wall').length>0;
  ok&&=hits(built,[3.45,1.5,0],[-1,0,0],d=>d.kind==='wall').length===0;
  ok&&=hits(built,[3.45,.4,0],[-1,0,0],d=>d.kind==='wall').length>0;
  ok&&=hits(built,[3.45,2.5,0],[-1,0,0],d=>d.kind==='wall').length>0;
  return ok;
}
const built=buildDesign(sample);
try{
  check(audit(built),'實牆、門楣、窗臺與實際挖洞符合獨立來源點');
  check(hits(built,[-1.5,1,-2.45],[0,0,1],d=>d.kind==='door').length>0,'關閉門扇實際封住門洞');
  check(hits(built,[3.45,1.5,0],[-1,0,0],d=>d.kind==='window').length>0,'窗洞包含玻璃而非空洞');
  const removed=built.byId.get('wall-1');built.group.remove(removed);check(!audit(built),'移除實牆的負向測試能抓到缺漏');built.group.add(removed);
  const intruder=new THREE.Mesh(new THREE.BoxGeometry(.8,2,.2),new THREE.MeshBasicMaterial());intruder.position.set(-1.5,1,-2);intruder.userData.kind='wall';built.group.add(intruder);built.group.updateMatrixWorld(true);
  check(!audit(built),'誤封門洞的負向測試能抓到缺陷');built.group.remove(intruder);intruder.geometry.dispose();intruder.material.dispose();
}finally{built.dispose();}
const opened=buildDesign(applyCommand(sample,{type:'toggleDoor',id:'door-1'}));
try{check(hits(opened,[-1.5,1,-2.45],[0,0,1],d=>d.kind==='door'||d.kind==='wall').length===0,'開門後實際中心通道空出');}finally{opened.dispose();}
const restored=buildDesign(parseProject(JSON.stringify(sample)));try{check(audit(restored),'JSON重開後幾何與開口仍正確');}finally{restored.dispose();}

const definition=JSON.parse(readFileSync(new URL('../definitions/designer.page.json',import.meta.url),'utf8'));
const validation=validateToolPageDefinition(definition);assert.equal(validation.valid,true,JSON.stringify(validation.errors));checks++;
console.log(`PASS designer: ${checks} assertions; atomic commands, shared vertices, door anchors, history, strict import, real wall openings and negative geometry controls.`);
