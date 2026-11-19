import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {ASSETS} from '../src/frontend/designer/catalog.js';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';

const s=new BuildingStore(emptyProject()),spec=ASSETS['vehicle-scooter'];
s.execute({type:'addObject',assetId:spec.id,x:0,z:0});const id=s.state.objects.at(-1).id;
for(const scale of [.7,1,1.5]){
 const width=spec.width*scale,depth=spec.depth*scale,height=spec.height*scale;
 s.execute({type:'prop.configure',id,x:0,z:0,width,depth,height,elevation:0,rotation:0,pitch:0,roll:0,color:'#5487ad',label:'曲面速克達'});
 const built=buildDesign(s.state);
 try{
  const root=built.byId.get(id),shield=root.getObjectByName('vehicle-scooter:front-shield'),fender=root.getObjectByName('vehicle-scooter:front-fender');
  assert(shield&&fender,'scooter has a shaped shield and front-wheel fender');
  root.traverse(m=>{if(m.isMesh)assert([...m.geometry.attributes.position.array].every(Number.isFinite));});
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
  assert(size.x<=width+1e-6&&size.y<=height+1e-6&&size.z<=depth+1e-6,'geometry respects vehicle dimensions');assert(Math.abs(bounds.min.y)<1e-6,'tires retain ground contact');
  const p=shield.geometry.attributes.position;let upper=0,lower=0,minZ=Infinity,maxZ=-Infinity;
  for(let i=0;i<p.count;i++){const y=p.getY(i)/height,x=Math.abs(p.getX(i));if(y>.6)upper=Math.max(upper,x);if(y<.32)lower=Math.max(lower,x);minZ=Math.min(minZ,p.getZ(i));maxZ=Math.max(maxZ,p.getZ(i));}
  assert(upper>lower*1.35,'shield is visibly wider near handlebars than footboard');assert(maxZ-minZ>depth*.08,'shield has curved depth rather than a flat vertical plate');
  assert.equal(shield.material.color.getHexString(),'5487ad');
  const f=new THREE.Box3().setFromObject(fender),r=Math.min(height*.23,depth*.16);assert(f.max.y>2*r,'fender clears the top of the front tire');assert(f.max.z<0&&f.min.z>-depth/2,'fender wraps the front wheel within the vehicle bounds');
  const fp=fender.geometry.attributes.position,normal=fender.geometry.attributes.normal;let highest=0;
  for(let i=1;i<fp.count;i++)if(fp.getY(i)>fp.getY(highest))highest=i;
  assert(normal.getY(highest)>.9,'outer fender faces upward and remains visible with front-face materials');
  const triangles=(shield.geometry.index?.count??p.count)/3+fender.geometry.index.count/3;assert(triangles<400,'curved front parts keep a small geometry budget');
 }finally{built.dispose();}
 assert.deepEqual(parseBuilding(s.serialize()),s.building,'shape refinement keeps the existing JSON contract');
}
console.log('PASS scooter shape: tapered curved shield, wheel clearance, outward fender normals, low triangle count, adjustable bounds/color and JSON roundtrip.');
