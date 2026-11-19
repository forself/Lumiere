import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {DesignStore,sampleProject,emptyProject,applyCommand,parseProject,validateProject,wallRooms,polygonArea} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const rejects=(fn,label)=>{assert.throws(fn,undefined,label);checks++;};
const sample=sampleProject(),initial=JSON.stringify(sample);
const p=applyCommand(sample,{type:'attachRoom',wallId:'wall-1',depth:3});
check(p.rooms.length===2&&p.walls.length===7&&p.vertices.length===6,'兩房僅七面牆及六個共用角點');
check(wallRooms(p,'wall-1').length===2,'共用牆保留同一 ID');
check(p.rooms[1].vertexIds[0]===p.rooms[0].vertexIds[1],'鄰房反向引用共用邊');
check(JSON.stringify(p.openings)===JSON.stringify(sample.openings),'原門窗 ID、方向、位置及狀態皆保留');
check(JSON.stringify(sample)===initial,'新增房間不改來源資料');
check(polygonArea(p.rooms[1].vertexIds.map(id=>p.vertices.find(v=>v.id===id)))===18,'向外6×3m來源面積');
for(const wallId of ['wall-1','wall-2','wall-3','wall-4']){
  const attached=applyCommand(sample,{type:'attachRoom',wallId,depth:3});
  check(attached.walls.length===7&&wallRooms(attached,wallId).length===2,`四個方向皆可向外接房 ${wallId}`);
}
const drawn=applyCommand(sample,{type:'addRoom',x:-3,z:-5,width:6,depth:3});
check(drawn.walls.length===7&&wallRooms(drawn,'wall-1').length===2,'直接畫房間也會合併完整重合牆');
const store=new DesignStore(p),before=store.serialize();
rejects(()=>store.execute({type:'attachRoom',wallId:'wall-1',depth:3}),'不允許共用牆第三側房間');
rejects(()=>store.execute({type:'addRoom',x:-3,z:-2,width:6,depth:4}),'完全重疊房間拒絕');
rejects(()=>store.execute({type:'addRoom',x:3,z:-1,width:2,depth:2}),'局部接牆拒絕，不暗中切分門窗');
rejects(()=>store.execute({type:'addRoom',x:-1,z:-1,width:2,depth:2}),'內含房間拒絕');
rejects(()=>store.execute({type:'addRoom',x:-4,z:-1,width:8,depth:2}),'十字穿越輪廓拒絕');
check(store.serialize()===before&&store.past.length===0,'拒絕後共用拓樸與歷史不變');
store.execute({type:'moveVertex',id:'vertex-2',x:4,z:-2});
const areas=store.state.rooms.map(r=>polygonArea(r.vertexIds.map(id=>store.state.vertices.find(v=>v.id===id))));
check(areas[0]===26&&areas[1]===19.5,'同一角點同時更新兩側房間面積');
check(store.state.openings[0].at===.25,'共用牆變形保留門的相對位置');
store.undo();check(store.serialize()===before,'共用角點變形可完整復原');store.redo();check(store.state.vertices.find(v=>v.id==='vertex-2').x===4,'可重做');
store.execute({type:'material',id:'wall-1',materialId:'stone'});
check(store.state.walls.filter(w=>w.id==='wall-1'&&w.materialId==='stone').length===1,'兩側材質使用唯一牆資料');
store.execute({type:'delete',id:'room-1'});
check(store.state.walls.length===4&&store.state.vertices.length===4&&store.state.rooms.length===1,'刪除一間只清除無歸屬牆與角點');
check(store.state.openings.some(o=>o.id==='door-1')&&!store.state.openings.some(o=>o.id==='window-1'),'共用門保留，已刪獨有牆的窗移除');
const remaining=store.serialize();
store.undo();check(store.state.rooms.length===2&&store.state.openings.length===2,'刪房可復原全部關聯');
store.redo();check(store.serialize()===remaining,'刪房可重做');
const reattached=applyCommand(store.state,{type:'attachRoom',wallId:'wall-1',depth:2});
check(reattached.rooms.length===2,'原房刪除後，依剩餘房間方向向外接房');
const legacy=structuredClone(sample);legacy.version=1;for(const o of legacy.objects){delete o.elevation;delete o.hostId;delete o.installation;delete o.controls;delete o.targets;delete o.deviceState;delete o.media;}for(const r of legacy.rooms)delete r.type;for(const w of legacy.walls){delete w.type;delete w.railStyle;}for(const o of legacy.openings){delete o.styleId;delete o.side;}
const legacyText=JSON.stringify(legacy),upgraded=parseProject(legacyText);
check(upgraded.version===8&&upgraded.walls[0].id==='wall-1'&&upgraded.openings[0].at===.25,'第1版檔案遷移保留ID及門窗');
check(JSON.stringify(legacy)===legacyText,'遷移不改呼叫端舊資料');
check(parseProject(JSON.stringify(p)).rooms[1].wallIds[0]==='wall-1','第2版共用關係JSON往返');
const clockwise=structuredClone(legacy),r=clockwise.rooms[0];r.vertexIds=[r.vertexIds[0],...r.vertexIds.slice(1).reverse()];r.wallIds.reverse();
check(parseProject(JSON.stringify(clockwise)).version===8,'舊版反向輪廓遷移至一致方向');
const duplicate=structuredClone(p);duplicate.vertices.push({...duplicate.vertices[0],id:'vertex-99'});
rejects(()=>validateProject(duplicate),'匯入拒絕異ID重合角點');
let grid=emptyProject();for(const [x,z] of [[0,0],[3,0],[0,3],[3,3]])grid=applyCommand(grid,{type:'addRoom',x,z,width:3,depth:3});
check(grid.rooms.length===4&&grid.walls.length===12&&grid.vertices.length===9,'四房交會僅一中央角點，四面共用牆');
check(grid.walls.filter(w=>wallRooms(grid,w.id).length===2).length===4,'四房鄰接關係正確');

// 獨立預期：原房 x[-3,3], z[-2,2]；鄰房 x[-3,3], z[-5,-2]。
const hits=(built,origin,direction,kind)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,1).intersectObject(built.group,true).filter(h=>h.object.isMesh&&h.object.userData.kind===kind);
function audit(built){
  for(const z of [-4.8,-4,-3,-1,1,1.8])for(const x of [-3.45,3.45])if(!hits(built,[x,1.4,z],[x<0?1:-1,0,0],'wall').length)return false;
  for(const x of [-2.8,0,2.8])for(const z of [-5.45,2.45])if(!hits(built,[x,1.4,z],[0,0,z<0?1:-1],'wall').length)return false;
  for(const z of [-2.45,-1.55]){
    const direction=[0,0,z<-2?1:-1];
    if(hits(built,[-1.5,1,z],direction,'wall').length||!hits(built,[0,1,z],direction,'wall').length)return false;
  }
  return true;
}
const built=buildDesign(p);
try{
  check(audit(built),'兩房外牆、共用牆與門洞兩側實際幾何正確');
  check(built.group.children.filter(child=>child===built.byId.get('wall-1')).length===1,'共用牆只建立一次場景根節點');
  for(const z of [-2.45,-1.55])check(hits(built,[-1.5,1,z],[0,0,z<-2?1:-1],'door').length>0,'關門後兩側射線皆碰到門扇');
  const removed=built.byId.get('wall-1');built.group.remove(removed);check(!audit(built),'移除共用隔間的負向控制能抓到漏牆');built.group.add(removed);
}finally{built.dispose();}
const opened=buildDesign(applyCommand(p,{type:'toggleDoor',id:'door-1'}));
try{for(const z of [-2.45,-1.55])check(!hits(opened,[-1.5,1,z],[0,0,z<-2?1:-1],'door').length,'開門後雙側中心通道清空');}finally{opened.dispose();}
console.log(`PASS shared-wall topology: ${checks} assertions; adjacency, shared edits, deletion, migration, negative geometry controls and two-sided door openings.`);
