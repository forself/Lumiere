import assert from 'node:assert/strict';
import {buildPieChart} from '../src/frontend/designer/pie-chart.js';
import {parseBuilding} from '../src/frontend/designer/building-model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import * as THREE from '../node_modules/three/build/three.module.js';

const input={title:'合成圓餅測試',period:'測試期別',unit:'人',source:{name:'本機合成案例',url:'https://example.org/data'},data:[{id:'tiny',name:'小類別',value:1},{id:'half',name:'大類別',value:500},{id:'middle',name:'中類別',value:499},{id:'zero',name:'零值',value:0}]};
const before=JSON.stringify(input),{building,index}=buildPieChart(input);
assert.equal(JSON.stringify(input),before,'input data is immutable');assert.equal(index.total,1000);assert.equal(index.slices.length,4);
assert.deepEqual(index.slices.map(s=>s.id),['half','middle','tiny','zero']);
assert.equal(index.slices[0].angleDegrees,180);assert.equal(index.slices[2].angleDegrees,360-index.slices[2].startAngle);
assert(index.slices[2].angleDegrees<.361&&index.slices[2].angleDegrees>.359,'tiny positive category is not inflated');
assert.equal(index.slices[2].endAngle,360);assert.equal(index.slices[3].objectId,null);assert.equal(index.slices[3].angleDegrees,0);
assert.equal(index.geometry.closedAngle,360);assert.equal(building.levels[0].design.walls.length,0);
const restored=parseBuilding(JSON.stringify(building)),objects=restored.levels[0].design.objects,byId=new Map(objects.map(o=>[o.id,o]));
let prior=0;
for(const sector of index.slices){
 assert.equal(sector.startAngle,prior);prior=sector.endAngle;
 assert.equal(sector.share,sector.value/index.total);assert.equal(sector.percentage,sector.value/index.total*100);
 assert.equal(sector.displayPercentage,new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}).format(sector.percentage)+'%');
 const caption=byId.get(sector.captionId),chip=byId.get(sector.chipId);
 assert(caption.prop.label.includes(sector.name)&&caption.prop.label.includes(sector.value.toLocaleString('zh-TW'))&&caption.prop.label.includes(sector.displayPercentage));
 assert.equal(caption.prop.pitch,-90);assert.equal(chip.prop.color,sector.color);
 if(sector.objectId){const object=byId.get(sector.objectId);assert.equal(object.assetId,'chart-sector');assert.equal(object.prop.color,sector.color);assert.equal(object.materialId,'plaster');assert.equal(object.width,index.geometry.radius*2);assert.equal(object.depth,object.width);assert.equal(object.height,index.geometry.thickness);assert.equal(object.elevation,index.geometry.elevation);assert.deepEqual(object.sector,{startAngle:sector.startAngle,endAngle:sector.endAngle});}
}
assert.equal(prior,360);assert.equal(new Set(index.slices.map(s=>s.color)).size,index.slices.length);
const scene=buildBuilding(restored);
for(const sector of index.slices.filter(s=>s.objectId)){
 const meshes=[];scene.group.traverse(o=>{if(o.isMesh&&o.userData.id===sector.objectId)meshes.push(o);});assert(meshes.length>0,'positive values render native sector meshes');
 let topArea=0;
 for(const mesh of meshes){
  assert.equal(mesh.material.opacity,1);assert.equal(mesh.material.transmission||0,0);assert.equal(mesh.material.color.getHexString(),sector.color.slice(1));
  const geometry=mesh.geometry,indexAttribute=geometry.index,positions=geometry.attributes.position,count=indexAttribute?indexAttribute.count:positions.count;
  for(let i=0;i<count;i+=3){const point=j=>new THREE.Vector3().fromBufferAttribute(positions,indexAttribute?indexAttribute.getX(i+j):i+j),a=point(0),b=point(1),c=point(2),normal=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a));if(normal.y>0&&Math.abs(a.y-index.geometry.thickness)<1e-6&&Math.abs(b.y-a.y)<1e-6&&Math.abs(c.y-a.y)<1e-6)topArea+=normal.length()/2;}
 }
 const expectedArea=Math.PI*index.geometry.radius**2*sector.share;
 assert(Math.abs(topArea/expectedArea-1)<.0002,'actual triangulated top area agrees with raw share within 0.02% tessellation tolerance');
 const root=meshes[0].parent,bounds=new THREE.Box3().setFromObject(root);assert(Math.abs(bounds.max.y-bounds.min.y-index.geometry.thickness)<1e-6,'all sectors have equal actual thickness');
}
scene.dispose();
const single=buildPieChart({...input,data:[{name:'全部',value:1}]}).index;assert.equal(single.slices[0].startAngle,0);assert.equal(single.slices[0].endAngle,360);assert.equal(single.slices[0].percentage,100);
const tied=buildPieChart({...input,data:[{name:'甲',value:1},{name:'乙',value:1}]}).index;assert.deepEqual(tied.slices.map(s=>s.name),['甲','乙']);
const twentyTwo=buildPieChart({...input,data:Array.from({length:22},(_,i)=>({name:'類別'+i,value:23-i}))});assert.equal(twentyTwo.index.geometry.legend.columns,2);assert.equal(twentyTwo.index.geometry.legend.rowsPerColumn,11);
assert.equal(twentyTwo.index.slices.at(-1).endAngle,360);assert.equal(twentyTwo.index.slices[21].startAngle,twentyTwo.index.slices[20].endAngle,'21st/22nd slice boundary remains contiguous');
const captions=twentyTwo.index.slices.map(s=>twentyTwo.building.levels[0].design.objects.find(o=>o.id===s.captionId));for(const a of captions)for(const b of captions)if(a.id!==b.id)assert(Math.abs(a.x-b.x)>4.9||Math.abs(a.z-b.z)>=.639,'fixed legend cards do not overlap');
for(const chart of [{building:restored,index},twentyTwo])for(const card of chart.building.levels[0].design.objects.filter(o=>o.assetId==='text-panel')){
 const {x:cx,z:cz}=chart.index.geometry.center,x=Math.max(card.x-card.width/2,Math.min(card.x+card.width/2,cx)),z=Math.max(card.z-card.height,Math.min(card.z,cz));
 assert(Math.hypot(x-cx,z-cz)>chart.index.geometry.radius,'fixed title/total/legend/source cards never overlap the visible pie footprint');
}
for(const value of [-1,NaN,Infinity,'100',null])assert.throws(()=>buildPieChart({...input,data:[{name:'錯誤',value}]}),/數值/);
assert.throws(()=>buildPieChart({...input,data:[{name:'零',value:0}]}),/總計/);
assert.throws(()=>buildPieChart({...input,data:[{name:'重複',value:1},{name:'重複',value:2}]}),/重複/);
assert.throws(()=>buildPieChart({...input,source:{name:'錯誤',url:'javascript:alert(1)'}}),/HTTP/);
assert.throws(()=>buildPieChart({...input,data:[]}),/1–40/);
assert.throws(()=>buildPieChart({...input,data:[{name:'極大',value:1e15},{name:'極小',value:Number.MIN_VALUE}]}),/比例/);
console.log('PASS 3D pie charts: exact source proportions/360 closure, equal native thickness/radius, opaque color matching, tiny/zero categories, nonoverlapping fixed legends, JSON roundtrip and invalid-input refusal.');
