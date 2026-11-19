import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {VEHICLE_ASSETS} from '../src/frontend/designer/vehicle-catalog.js';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
import {planSvg} from '../src/frontend/designer/design-export.js';
import {vehiclePlanParts} from '../src/frontend/designer/vehicle-geometry.js';
const s=new BuildingStore(emptyProject());const colors=['#4c9996','#b5533e','#e7e0cd','#be554b','#7285a4','#52695d','#af9a73','#d3d6d3','#aa6b46','#3b7299','#bdc2c4','#b98b42','#527e98','#b8b8b0','#d6cead','#4b9981','#9b647c'];
for(const [i,a] of VEHICLE_ASSETS.entries()){
 const x=(i%4-1.5)*7,z=Math.floor(i/4)*18-36;
 s.execute({type:'addObject',assetId:a.id,x,z});const o=s.state.objects.at(-1);
 s.execute({type:'prop.configure',id:o.id,x,z,width:a.width,depth:a.depth,height:a.height,elevation:0,rotation:0,pitch:0,roll:0,color:colors[i],label:''});
 assert(vehiclePlanParts(s.state.objects.at(-1)).length>=3);
}
let b=parseBuilding(s.serialize());b.levels[0].name='車輛元件展示｜前方 −Z｜尺寸可調';
const built=buildDesign(b.levels[0].design);let meshes=0;
try{for(const [i,o] of b.levels[0].design.objects.entries()){
 const root=built.byId.get(o.id);assert(root,'single selectable root');let wheels=0;root.traverse(m=>{if(m.isMesh){meshes++;assert.equal(m.userData.id,o.id);assert([...m.geometry.attributes.position.array].every(Number.isFinite));if(m.geometry.type==='CylinderGeometry'&&m.geometry.parameters.radialSegments===16)wheels++;}});assert.equal(wheels,o.assetId==='vehicle-semi-trailer'?24:['vehicle-dump-truck','vehicle-heavy-truck'].includes(o.assetId)?12:i<2?4:8,'axle and tire/hub count');let paint=false;root.traverse(m=>{if(m.isMesh&&m.material.color.getHexString()===colors[i].slice(1))paint=true;});assert(paint,'editable body paint');
 const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());assert(Math.abs(bounds.min.y)<1e-5,'ground contact');assert(size.x<=o.width+.02&&size.y<=o.height+.02&&size.z<=o.depth+.02,'dimensions contain shape');assert(size.z>o.depth*.8);
}}
finally{built.dispose();}
const svg=planSvg(b,b.activeLevelId);assert(svg.includes('#537986'));
mkdirSync('output/vehicles',{recursive:true});writeFileSync('output/vehicles/showroom.json',JSON.stringify(b,null,2));writeFileSync('output/vehicles/showroom.svg',svg);
// Editing, scaling, rotation and serialization must keep a vehicle as one object.
const edit=new BuildingStore(b),o=edit.state.objects[0];edit.execute({type:'dimensions',id:o.id,width:.9,depth:2.2,height:1.4});edit.execute({type:'rotateObject',id:o.id});assert.equal(edit.state.objects.length,17);assert.deepEqual(parseBuilding(edit.serialize()),edit.building);
console.log(`PASS 17 vehicle variants, ${meshes} meshes, wheel count, selectable IDs, finite geometry, bounds/ground, editable dimensions/rotation, JSON and 2D SVG`);

const heavy=structuredClone(b);heavy.levels[0].design.objects=heavy.levels[0].design.objects.slice(11);for(const [i,o] of heavy.levels[0].design.objects.entries()){o.x=(i%3-1)*7;o.z=Math.floor(i/3)*20-10;}parseBuilding(JSON.stringify(heavy));writeFileSync('output/vehicles/heavy-showroom.json',JSON.stringify(heavy,null,2));writeFileSync('output/vehicles/heavy-showroom.svg',planSvg(heavy,heavy.activeLevelId));
const long=new BuildingStore(heavy),semi=long.state.objects.find(o=>o.assetId==='vehicle-semi-trailer');long.execute({type:'dimensions',id:semi.id,width:2.6,depth:22,height:4});assert.equal(parseBuilding(long.serialize()).levels[0].design.objects.find(o=>o.id===semi.id).depth,22);assert.throws(()=>long.execute({type:'dimensions',id:semi.id,width:2.6,depth:26,height:4}));
