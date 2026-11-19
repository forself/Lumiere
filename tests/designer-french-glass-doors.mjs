import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {sampleProject,applyCommand,parseProject} from '../src/frontend/designer/model.js';
import {OPENING_STYLES,openingParts} from '../src/frontend/designer/openings.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';

const source=sampleProject(),doorId='door-1';
const doorHit=built=>new THREE.Raycaster(new THREE.Vector3(-1.65,1,-2.6),new THREE.Vector3(0,0,1),0,1.2).intersectObject(built.group,true).filter(h=>h.object.isMesh&&h.object.userData.id===doorId);
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
for(const styleId of ['door-glass-double-in','door-glass-double-out']){
 const spec=OPENING_STYLES[styleId];
 assert.deepEqual({kind:spec.kind,motion:spec.motion,glass:spec.glass},{kind:'door',motion:'double',glass:true});checks++;
 for(const side of [1,-1]){
  let closed=applyCommand(source,{type:'openingStyle',id:doorId,styleId});
  if(side<0)closed=applyCommand(closed,{type:'flipOpening',id:doorId});
  const opening=closed.openings.find(o=>o.id===doorId),wall=closed.walls.find(w=>w.id===opening.wallId);
  for(const progress of [0,.25,.5,.75,1]){
   const layout=openingParts(opening,wall,progress);
   check(layout.parts.length===2&&layout.swings.length===2,`${styleId} 保留兩個玻璃門扇與兩條門弧`);
   check(layout.parts.every(p=>Math.abs(p.width-((opening.width-.1)/2-.005))<1e-9),`${styleId} 門扇寬度不隨開啟程度縮放`);
   if(progress>0)check(layout.parts.every(p=>Math.sign(p.z)===side*(spec.inward?1:-1)),`${styleId} 兩片門扇依照內外側開啟`);
   check(Math.abs(layout.parts[0].rotation+layout.parts[1].rotation)<1e-9,`${styleId} 兩側門扇反向旋轉`);
  }
  const opened=applyCommand(closed,{type:'toggleOpening',id:doorId});
  for(const [state,isOpen]of [[closed,false],[opened,true]]){
   const built=buildDesign(state);
   try{
    const leaves=built.byId.get(doorId).children.filter(c=>c.userData.openingLeaf);
    check(leaves.length===2,`${styleId} 實際三維場景包含兩片門扇`);
    check(leaves.every(leaf=>leaf.children[0].material.transparent&&leaf.children[0].material.opacity===.5&&Math.abs(leaf.children[0].geometry.parameters.depth-.018)<1e-9),`${styleId} 兩片實際門扇使用原生透明玻璃幾何與材質`);
    check((doorHit(built).length===0)===isOpen,`${styleId} 關閉阻擋、開啟留下可通行的淨開口`);
    const thresholdHits=new THREE.Raycaster(new THREE.Vector3(-1.65,.015,-2.6),new THREE.Vector3(0,0,1),0,1.2).intersectObject(built.group,true).filter(h=>h.object.isMesh&&h.object.userData.id===doorId);
    check(thresholdHits.length===0,`${styleId} 不繼承窗戶底框造成落地門檻`);
   }finally{built.dispose();}
  }
  check(parseProject(JSON.stringify(opened)).openings.find(o=>o.id===doorId).styleId===styleId,`${styleId} 原生JSON保存玻璃雙扇樣式`);
  assert.deepEqual(applyCommand(opened,{type:'toggleOpening',id:doorId}),closed);checks++;
 }
 assert.throws(()=>applyCommand(source,{type:'openingStyle',id:'window-1',styleId}));checks++;
}
console.log(`PASS French glass doors: ${checks} assertions; inward/outward, both sides, paired motion, actual glass meshes, passage, floor clearance and native roundtrip.`);
