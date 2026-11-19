import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {sampleProject,applyCommand,parseProject,validateProject,DesignStore} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++;};const rejects=(fn,label)=>{assert.throws(fn,undefined,label);checks++;};
const sample=sampleProject(),p=applyCommand(sample,{type:'attachBalcony',wallId:'wall-1',depth:2});
check(p.rooms[1].type==='balcony'&&p.rooms[1].materialId==='stone','陽台明確型別與石材地坪');
check(p.walls.filter(w=>w.type==='rail').length===3,'三外緣皆有欄杆');
check(p.walls.find(w=>w.id==='wall-1').type==='wall'&&JSON.stringify(p.openings)===JSON.stringify(sample.openings),'保留室內分界牆與門窗');
for(const wallId of ['wall-1','wall-2','wall-3','wall-4'])check(applyCommand(sample,{type:'attachBalcony',wallId,depth:2}).walls.filter(w=>w.type==='rail').length===3,'四方向外接陽台');
const rails=p.walls.filter(w=>w.type==='rail'),store=new DesignStore(p),before=store.serialize();
rejects(()=>store.execute({type:'addOpening',wallId:rails[0].id,kind:'door',at:.5}),'不在欄杆挖門');
rejects(()=>store.execute({type:'attachRoom',wallId:rails[0].id,depth:2}),'不從欄杆外側接房');
rejects(()=>store.execute({type:'railStyle',id:rails[0].id,styleId:'unknown'}),'未知樣式拒絕');
rejects(()=>store.execute({type:'dimensions',id:rails[0].id,width:2,height:.3,depth:.1}),'超出編輯高度範圍拒絕');
check(store.serialize()===before,'錯誤操作不改動設計');
store.execute({type:'railStyle',id:rails[0].id,styleId:'glass'});store.undo();check(store.serialize()===before,'樣式可復原');store.redo();check(store.state.walls.find(w=>w.id===rails[0].id).railStyle==='glass','樣式可重做');
store.execute({type:'delete',id:'room-2'});check(store.state.walls.length===4&&store.state.openings.length===2,'刪陽台清除三欄杆並保留原門窗');store.undo();check(store.state.rooms.length===2,'刪陽台可復原');
check(parseProject(store.serialize()).rooms[1].type==='balcony','JSON保留陽台類型');
const old=structuredClone(sample);old.version=3;for(const o of old.objects){delete o.elevation;delete o.hostId;delete o.installation;delete o.controls;delete o.targets;delete o.deviceState;delete o.media;}for(const r of old.rooms)delete r.type;for(const w of old.walls){delete w.type;delete w.railStyle;}
check(parseProject(JSON.stringify(old)).version===8,'版本3檔案遷移');
const invalid=structuredClone(p);invalid.walls.find(w=>w.id==='wall-1').type='rail';invalid.walls.find(w=>w.id==='wall-1').height=1.1;rejects(()=>validateProject(invalid),'拒絕把室內分界改為欄杆');
const ray=(built,origin,direction,id)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,1).intersectObject(built.group,true).filter(h=>h.object.isMesh&&h.object.userData.id===id);
for(const styleId of ['vertical','glass','solid','horizontal','mesh']){
  let state=p;for(const rail of rails)state=applyCommand(state,{type:'railStyle',id:rail.id,styleId});
  const built=buildDesign(state);
  try{
    // 獨立來源：陽台 x[-3,3], z[-4,-2]，三外緣在 x±3 及 z=-4。
    for(const [origin,direction,index] of [[[3.45,1.075,-3],[-1,0,0],0],[[-3.45,1.075,-3],[1,0,0],2],[[0,1.075,-4.45],[0,0,1],1]]){
      // addRoomPolygon 的邊序：共牆、左邊、外側、右邊。
      const railId=index===0?rails[2].id:index===2?rails[0].id:rails[1].id;
      check(ray(built,origin,direction,railId).length>0,`${styleId} 實際外緣扶手連續`);
      check(!ray(built,[origin[0],1.5,origin[2]],direction,railId).length,`${styleId} 低欄杆上方沒有全高牆`);
    }
    for(const [x,z] of [[-2.8,-3.8],[0,-3],[2.8,-2.2]])check(ray(built,[x,.5,z],[0,-1,0],'room-2').length>0,'陽台地坪實際存在');
    const infill=ray(built,[.3,.5,-4.45],[0,0,1],rails[1].id);
    check(['vertical','horizontal','mesh'].includes(styleId)?infill.length===0:infill.length>0,'玻璃／實牆填板存在；直桿間維持真實空隙');
    if(styleId==='horizontal')check(ray(built,[.3,.605,-4.45],[0,0,1],rails[1].id).length>0,'橫桿實際幾何');
    if(styleId==='mesh')check(ray(built,[.3,.55,-4.45],[0,0,1],rails[1].id).length>0,'網格實際橫線');
    check(Math.abs(ray(built,[0,-.4,-3],[0,1,0],'room-2')[0].distance-.25)<1e-6,'陽台板底為地坪以下15公分');
    check(!ray(built,[-1.5,1,-2.45],[0,0,1],'wall-1').length,'原門洞不被陽台誤封');
    const outer=built.byId.get(rails[1].id);built.group.remove(outer);check(!ray(built,[0,1.075,-4.45],[0,0,1],rails[1].id).length,'負向控制辨識外欄杆移除');
  }finally{built.dispose();}
}
console.log(`PASS balconies: ${checks} assertions; three-edge railings, floor geometry, retained doorway, deletion, history and migration.`);
