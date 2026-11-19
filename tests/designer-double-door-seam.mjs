import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {OBB} from '../node_modules/three/examples/jsm/math/OBB.js';
import {sampleProject,applyCommand} from '../src/frontend/designer/model.js';
import {openingParts} from '../src/frontend/designer/openings.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';

const bounds=mesh=>{mesh.geometry.computeBoundingBox();const b=new OBB().fromBox3(mesh.geometry.boundingBox);b.applyMatrix4(mesh.matrixWorld);b.halfSize.subScalar(1e-6);return b;};
let checks=0;
for(const width of [.4,.9,1.44,2.4])for(const styleId of ['door-double-in','door-double-out'])for(const side of [1,-1]){
 let project=applyCommand(sampleProject(),{type:'dimensions',id:'door-1',width,height:2.1,sill:0});
 project=applyCommand(project,{type:'openingStyle',id:'door-1',styleId});
 if(side===-1)project=applyCommand(project,{type:'flipOpening',id:'door-1'});
 const opening=project.openings.find(o=>o.id==='door-1'),wall=project.walls.find(w=>w.id===opening.wallId),built=buildDesign(project),root=built.byId.get(opening.id),leaves=root.children.filter(c=>c.userData.openingLeaf),strip=leaves[0].children.find(m=>m.userData.role==='meeting-stile');
 try{
  assert(strip,'the moving leaf contains its own meeting stile');assert.equal(strip.parent,leaves[0]);assert.equal(leaves.length,2);
  const fixed=root.children.filter(c=>c.isMesh),opposite=leaves[1].children.filter(c=>c.isMesh);
  for(let i=0;i<=40;i++){
   const progress=i/40,parts=openingParts(opening,wall,progress).parts;
   parts.forEach((p,index)=>{leaves[index].position.set(opening.at*6+p.x,p.y,p.z);leaves[index].rotation.y=p.rotation;});built.group.updateMatrixWorld(true);
   for(const peer of [...fixed,...opposite]){assert(!bounds(strip).intersectsOBB(bounds(peer),0),`${styleId} width=${width} side=${side} progress=${progress}: stile must not penetrate frame or opposite leaf`);checks++;}
   if(i===0||i===40)for(const direction of [-1,1])for(const height of [.04,1,opening.height-.06]){
    const ray=new THREE.Raycaster(new THREE.Vector3(-1.5,height,-2-direction*.65),new THREE.Vector3(0,0,direction),0,1.3),hits=ray.intersectObject(built.group,true).filter(h=>h.object.userData.id===opening.id);
    assert.equal(hits.length>0,i===0,'closed exact centre is sealed from both sides; fully open centre is clear');checks++;
   }
  }
 }finally{built.dispose();}
}
console.log(`PASS moving double-door meeting stile: ${checks} sampled clearance and bidirectional centre-ray checks; inward/outward, both sides, closed and open.`);
