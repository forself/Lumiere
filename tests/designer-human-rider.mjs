import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {ASSETS} from '../src/frontend/designer/catalog.js';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';

const spec=ASSETS['human-rider'];
assert.deepEqual([spec.width,spec.depth,spec.height,spec.prop],[.6,.85,1.35,true]);
assert.deepEqual([ASSETS.human.shape,ASSETS.human.width,ASSETS.human.depth,ASSETS.human.height],['human',.55,.35,1.7]);
const s=new BuildingStore(emptyProject());
s.execute({type:'addObject',assetId:'human-rider',x:0,z:0});
const id=s.state.objects.at(-1).id;
s.execute({type:'addObject',assetId:'human',x:3,z:0});
const standingId=s.state.objects.at(-1).id;
const configure={type:'prop.configure',id,x:0,z:0,width:.6,depth:.85,height:1.35,elevation:0,rotation:0,pitch:0,roll:0,color:'#4874a5',label:'騎士姿態示意'};
s.execute(configure);
assert.deepEqual(parseBuilding(s.serialize()),s.building,'editable rider survives the existing BuildingStore JSON contract');
const built=buildDesign(s.state);
try{
 const root=built.byId.get(id),standing=built.byId.get(standingId),part=name=>root.getObjectByName('human-rider:'+name);
 let count=0;
 root.traverse(mesh=>{if(!mesh.isMesh)return;count++;assert.equal(mesh.userData.id,id);assert([...mesh.geometry.attributes.position.array].every(Number.isFinite));});
 assert(count>=16,'complete body, both arms and both legs');
 const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
 assert(size.x<=spec.width+1e-6&&size.z<=spec.depth+1e-6);
 assert(Math.abs(bounds.min.y)<1e-6&&Math.abs(bounds.max.y-spec.height)<1e-6,'feet-to-head height');
 assert.equal(part('torso').material.color.getHexString(),'4874a5');
 const torso=part('torso'),tp=torso.geometry.attributes.position;let shoulder=0,waist=0;
 for(let i=0;i<tp.count;i++){const x=Math.abs(tp.getX(i)*torso.scale.x);if(tp.getY(i)>0)shoulder=Math.max(shoulder,x);else waist=Math.max(waist,x);}
 assert(shoulder>waist*1.3,'shoulders taper toward waist instead of an oval belly');
 assert(Math.abs(new THREE.Box3().setFromObject(part('pelvis')).min.y-.35*spec.height)<1e-6,'known seat-contact height');
 const axis=mesh=>new THREE.Vector3(0,1,0).applyQuaternion(mesh.quaternion);
 for(const side of ['left','right']){
  const thigh=axis(part(side+'-thigh')),shin=axis(part(side+'-shin'));
  assert(thigh.z<-.9&&Math.abs(thigh.y)<.2,'seated thighs extend toward local -Z');
  assert(Math.abs(shin.y)>.95&&Math.abs(shin.z)<.1,'bent knees have nearly vertical shins');
  assert(part(side+'-hand').position.z<part(side+'-elbow').position.z&&part(side+'-elbow').position.z<part('torso').position.z,'both arms reach forward');
  assert(part(side+'-hand').position.y>part(side+'-knee').position.y,'hands remain above knees');
 }
 assert(part('head').position.z<part('pelvis').position.z,'head leans forward');
 const standingSize=new THREE.Box3().setFromObject(standing).getSize(new THREE.Vector3());
 assert(size.y<standingSize.y&&size.z>standingSize.z*1.5,'rider silhouette differs from unchanged standing figure');
}finally{built.dispose();}

for(const [width,depth,height] of [[.3,.6,.8],[1.2,1.7,2.7]]){
 s.execute({...configure,width,depth,height});
 const scene=buildDesign(s.state);
 try{const box=new THREE.Box3().setFromObject(scene.byId.get(id)),size=box.getSize(new THREE.Vector3());assert([size.x,size.y,size.z].every(Number.isFinite));assert(size.x<=width+1e-6&&size.z<=depth+1e-6&&size.y<=height+1e-6,'resized shape stays in its editable dimensions');}finally{scene.dispose();}
}
for(const height of [1.1,1.35]){
 s.execute({...configure,height});const scene=buildDesign(s.state);
 try{const root=scene.byId.get(id),head=root.getObjectByName('human-rider:head'),size=new THREE.Box3().setFromObject(head).getSize(new THREE.Vector3());assert(size.y>size.x*1.1,'head stays taller than wide throughout the scene rider height range');assert(Math.abs(new THREE.Box3().setFromObject(root).max.y-height)<1e-6,'head remains inside configured height');}finally{scene.dispose();}
}
s.execute({...configure,x:2,z:-3,elevation:.24,rotation:90});
assert.deepEqual(parseBuilding(s.serialize()),s.building);
const rotated=buildDesign(s.state);
try{
 const root=rotated.byId.get(id);root.updateWorldMatrix(true,true);
 const hand=root.getObjectByName('human-rider:left-hand').getWorldPosition(new THREE.Vector3()),pelvis=root.getObjectByName('human-rider:pelvis').getWorldPosition(new THREE.Vector3());
 assert(hand.x>pelvis.x,'clockwise plan rotation turns local -Z toward world +X');
 assert(Math.abs(new THREE.Box3().setFromObject(root).min.y-.24)<1e-6,'elevation is measured from the feet');
}finally{rotated.dispose();}
console.log('PASS human-rider: seated geometry, local -Z facing, known seat/foot heights, finite adjustable bounds/color/rotation, standing preservation and BuildingStore JSON roundtrip.');
