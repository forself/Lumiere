import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {sampleProject,applyCommand,DesignStore,parseProject} from '../src/frontend/designer/model.js';
import {OPENING_STYLES,openingParts} from '../src/frontend/designer/openings.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++;};
const rejects=(fn,label)=>{assert.throws(fn,undefined,label);checks++;};
const hit=(built,origin,direction,id)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,1.2).intersectObject(built.group,true).filter(h=>h.object.isMesh&&h.object.userData.id===id);
const source=sampleProject();
for(const [styleId,spec] of Object.entries(OPENING_STYLES)){
  const id=spec.kind==='door'?'door-1':'window-1',closed=applyCommand(source,{type:'openingStyle',id,styleId}),o=closed.openings.find(o=>o.id===id),wall=closed.walls.find(w=>w.id===o.wallId);
  const built=buildDesign(closed);
  try{check(spec.kind==='door'?hit(built,[-1.65,1,-2.6],[0,0,1],id).length:hit(built,[3.6,1.5,-.2],[-1,0,0],id).length,`${styleId} 關閉時扇片填滿預期位置`);}finally{built.dispose();}
  if(spec.motion==='fixed'){rejects(()=>applyCommand(closed,{type:'toggleOpening',id}),'固定窗不能開啟');continue;}
  const opened=applyCommand(closed,{type:'toggleOpening',id}),openBuilt=buildDesign(opened);
  try{
    if(spec.motion!=='transom')check(spec.kind==='door'?!hit(openBuilt,[-1.65,1,-2.6],[0,0,1],id).length:!hit(openBuilt,[3.6,1.5,-.3],[-1,0,0],id).length,`${styleId} 開啟後預期淨開口沒有殘留扇片`);
    if(spec.motion==='sash')check((spec.kind==='door'?hit(openBuilt,[-1.35,1,-2.6],[0,0,1],id):hit(openBuilt,[3.6,1.5,.3],[-1,0,0],id)).length>0,'疊合門窗開啟後另一半保留扇片');
    const leaves=openBuilt.byId.get(id).children.filter(c=>c.userData.openingLeaf);
    if(spec.motion==='swing'||spec.motion==='double'){
      const direction=o.side*(spec.inward?1:-1);
      check(leaves.every(c=>Math.sign(c.position.z)===direction),`${styleId} 實際扇片位於指定內／外側`);
      check(leaves.length===(spec.motion==='double'?2:1),`${styleId} 扇片數正確`);
      if(spec.motion==='swing')check(Math.abs(leaves[0].position.x-(1.5+(spec.hinge==='left'?-.4:.4)))<1e-6||spec.kind==='window'&&Math.abs(leaves[0].position.x-(2+(spec.hinge==='left'?-.55:.55)))<1e-6,`${styleId} 鉸鏈位於指定左／右端`);
    }
    if(spec.motion==='rollup')check(leaves.every(c=>c.position.y>o.height),'鐵捲門全部扇片捲至洞口上方');
    if(spec.motion==='slide')check(Math.sign(leaves[0].position.x-1.5)===spec.travel,'拉門實際停放在指定左／右側');
  }finally{openBuilt.dispose();}
  const restored=applyCommand(opened,{type:'toggleOpening',id});check(JSON.stringify(restored)===JSON.stringify(closed),`${styleId} 關回還原完整資料`);
  const flipped=applyCommand(opened,{type:'flipOpening',id});check(flipped.openings.find(o=>o.id===id).side===-1,'反轉參考內側');
  // 五個行程點檢查扇片寬高不縮放、雙扇同時運動；不是全屋家具掃掠碰撞。
  for(const progress of [0,.25,.5,.75,1]){
    const {parts}=openingParts(o,wall,progress);
    check(parts.length>0&&parts.every(p=>[p.x,p.y,p.z,p.rotation,p.width,p.height].every(Number.isFinite)&&p.width>0&&p.height>0),`${styleId} 行程 ${progress} 有效`);
  }
}
const store=new DesignStore(source),before=store.serialize();
store.execute({type:'openingStyle',id:'door-1',styleId:'door-double-out'});store.execute({type:'toggleOpening',id:'door-1'});
const saved=store.serialize();check(parseProject(saved).openings[0].styleId==='door-double-out'&&parseProject(saved).openings[0].open,'版本3 JSON保留樣式與開啟狀態');
store.undo();store.undo();check(store.serialize()===before,'樣式及開關可復原');store.redo();store.redo();check(store.serialize()===saved,'樣式及開關可重做');
rejects(()=>store.execute({type:'openingStyle',id:'door-1',styleId:'window-fixed'}),'門不能套用窗樣式');
rejects(()=>store.execute({type:'openingStyle',id:'door-1',styleId:'constructor'}),'未知樣式拒絕');
check(store.serialize()===saved,'拒絕樣式不破壞設計');
const atEdge=applyCommand(source,{type:'moveOpening',id:'door-1',at:.1});
rejects(()=>applyCommand(atEdge,{type:'openingStyle',id:'door-1',styleId:'door-slide-left'}),'拉門側邊停放空間不足拒絕');
const tooTall=applyCommand(source,{type:'dimensions',id:'door-1',width:.9,height:2.6,sill:0});
rejects(()=>applyCommand(tooTall,{type:'openingStyle',id:'door-1',styleId:'door-rollup'}),'捲箱高度不足拒絕');
for(const version of [1,2]){
  const old=structuredClone(source);old.version=version;for(const o of old.objects){delete o.elevation;delete o.hostId;delete o.installation;delete o.controls;delete o.targets;delete o.deviceState;delete o.media;}for(const r of old.rooms)delete r.type;for(const w of old.walls){delete w.type;delete w.railStyle;}for(const o of old.openings){delete o.styleId;delete o.side;}
  const migrated=parseProject(JSON.stringify(old));check(migrated.version===8&&migrated.openings[0].styleId==='door-left-in'&&migrated.openings[1].styleId==='window-fixed','舊版保留原單扇內開與固定窗');
}
// Floor-level sash doors overlap within the opening; they do not need parking
// width beside it and must not inherit a window's bottom frame / sill.
let sash=applyCommand(source,{type:'moveOpening',id:'door-1',at:.1});
sash=applyCommand(sash,{type:'openingStyle',id:'door-1',styleId:'door-glass-sash'});
const sashOpening=sash.openings.find(o=>o.id==='door-1');
check(sashOpening.sill===0,'玻璃疊合門維持落地門洞');
for(const open of [false,true]){
 const state=open?applyCommand(sash,{type:'toggleOpening',id:'door-1'}):sash,built=buildDesign(state);
 try{
  check(!hit(built,[-2.4,.015,-2.6],[0,0,1],'door-1').length,'門洞底部沒有窗框式門檻');
  check((hit(built,[-2.6,1,-2.6],[0,0,1],'door-1').length===0)===open,'疊合後左半通行、關閉後阻擋');
  check(hit(built,[-2.2,1,-2.6],[0,0,1],'door-1').length>0,'疊合後右半仍被玻璃門扇阻擋');
 }finally{built.dispose();}
}
console.log(`PASS opening styles: ${checks} assertions; ${Object.values(OPENING_STYLES).filter(s=>s.kind==='door').length} doors, ${Object.values(OPENING_STYLES).filter(s=>s.kind==='window').length} windows, actual geometry, motion samples, limits, migration and history.`);
