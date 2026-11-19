import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {sampleProject,applyCommand,parseProject} from '../src/frontend/designer/model.js';
import {OPENING_STYLES,openingParts} from '../src/frontend/designer/openings.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';

const source=sampleProject(),id='door-1';
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
assert.deepEqual(OPENING_STYLES['door-sash'],{kind:'door',name:'雙扇疊合拉門',motion:'sash'});checks++;
for(const side of [1,-1]){
 let closed=applyCommand(source,{type:'openingStyle',id,styleId:'door-sash'});
 if(side<0)closed=applyCommand(closed,{type:'flipOpening',id});
 const o=closed.openings.find(o=>o.id===id),wall=closed.walls.find(w=>w.id===o.wallId);
 for(const progress of [0,.25,.5,.75,1]){
  const {parts,swings}=openingParts(o,wall,progress);
  check(parts.length===2&&swings.length===0,'衣櫥滑門是兩片平移門扇，不產生門弧');
  check(parts.every(p=>p.rotation===0&&Math.abs(p.x)+p.width/2<=o.width/2+1e-9),'滑門全行程不向洞外停放或占用相鄰臥室門');
  check(parts.every(p=>Math.abs(p.width-((o.width-.1)/2+.01))<1e-9),'兩片門扇保留相同寬度與疊合餘量');
  check(Math.abs(parts[0].z-parts[1].z)===.07,'兩片門扇保留分離的前後軌道');
 }
 const opened=applyCommand(closed,{type:'toggleOpening',id});
 const probe=(built,x,y=1)=>new THREE.Raycaster(new THREE.Vector3(x,y,-2.6),new THREE.Vector3(0,0,1),0,1.2).intersectObject(built.group,true).filter(h=>h.object.isMesh&&h.object.userData.id===id);
 for(const [state,isOpen]of [[closed,false],[opened,true]]){
  const built=buildDesign(state);
  try{
   const leaves=built.byId.get(id).children.filter(c=>c.userData.openingLeaf);
   check(leaves.length===2,'實際三維場景有兩片衣櫥門');
   check(leaves.every(leaf=>!leaf.children[0].material.transparent&&leaf.children[0].material.opacity===1&&Math.abs(leaf.children[0].geometry.parameters.depth-.045)<1e-9),'衣櫥門是實體不透明門板，不套用玻璃材質');
   check((probe(built,-1.5-side*.2).length===0)===isOpen,'開啟後單側留下淨開口');
   check(probe(built,-1.5+side*.2).length>0,'另一側仍被疊合的兩片門板阻擋');
   check(probe(built,-1.5,.015).length===0,'落地衣櫥門不帶窗式底框');
  }finally{built.dispose();}
 }
 check(parseProject(JSON.stringify(opened)).openings.find(o=>o.id===id).styleId==='door-sash','原生JSON保留不透明雙扇滑門樣式');
 assert.deepEqual(applyCommand(opened,{type:'toggleOpening',id}),closed);checks++;
}
assert.throws(()=>applyCommand(source,{type:'openingStyle',id:'window-1',styleId:'door-sash'}));checks++;
console.log(`PASS wardrobe sash: ${checks} assertions; paired opaque meshes, bounded travel, two-sided clearance, closed obstruction, floor clearance and native roundtrip.`);
