import assert from 'node:assert/strict';
import {buildBarChart,barChartScale} from '../src/frontend/designer/bar-chart.js';
import {parseBuilding} from '../src/frontend/designer/building-model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';

const input={title:'合成長條圖測試',period:'測試期別',unit:'人',source:{name:'本機合成案例',url:'https://example.org/data'},data:[{id:'small',name:'少數地區',value:14000},{id:'large',name:'多數地區',value:4100000},{id:'medium',name:'中間地區',value:2050000},{id:'zero',name:'零值地區',value:0}]};
const before=JSON.stringify(input),{building,index}=buildBarChart(input);assert.equal(JSON.stringify(input),before,'input is not mutated');
assert.equal(building.levels[0].design.walls.length,0,'chart platform must remain open');
assert.deepEqual(index.bars.map(b=>b.id),['large','medium','small','zero']);assert.equal(index.scale.minimum,0);assert(index.scale.maximum>=4100000);
const actual=parseBuilding(JSON.stringify(building)),objects=actual.levels[0].design.objects;
for(const bar of index.bars){
 assert.equal(bar.width,index.geometry.barWidth);assert.equal(bar.depth,index.geometry.barDepth);assert.equal(bar.baseline,0);
 const caption=objects.find(o=>o.id===bar.captionId);assert(caption.prop.label.includes(bar.name)&&caption.prop.label.includes(new Intl.NumberFormat('zh-TW').format(bar.value)));assert(caption.z>bar.z&&caption.rotation===0,'captions face the standard +Z front camera');
 if(!bar.value){assert.equal(bar.objectId,null);continue;}
 const object=objects.find(o=>o.id===bar.objectId);assert(object);assert.equal(object.height,bar.value/index.scale.maximum*index.scale.height);assert.equal(object.elevation,index.geometry.baselineElevation);assert.equal(bar.elevation,1);assert.equal(object.width,bar.width);assert.equal(object.depth,bar.depth);assert.equal(object.materialId,'paint-gray-satin');assert(caption.elevation+caption.height<object.elevation,'fixed captions cannot cover even the shortest bar from the front');
}
assert.equal(index.bars[0].height/index.bars[1].height,2,'double value has double height');assert(index.bars[2].height<.1,'small values are not silently raised');
for(const id of index.baseIds){const base=objects.find(o=>o.id===id);assert.equal(base.elevation+base.height,index.geometry.baselineElevation,'pedestal top aligns with shared statistical zero');}
const renderCopy=structuredClone(actual);renderCopy.levels[0].design.objects=objects.filter(o=>o.assetId!=='text-panel');
const scene=buildBuilding(renderCopy);for(const bar of index.bars.filter(b=>b.value)){let found=false;scene.group.traverse(o=>{if(o.isMesh&&o.userData.id===bar.objectId){found=true;assert.equal(o.material.transmission||0,0);assert.equal(o.material.opacity,1);}});assert(found,'all positive values render as actual native geometry');}scene.dispose();
const tie=buildBarChart({...input,data:[{name:'甲',value:1},{name:'乙',value:1}]}).index;assert.deepEqual(tie.bars.map(b=>b.name),['甲','乙']);
const decimal=buildBarChart({...input,data:[{name:'小數',value:1.23456789}]});assert(decimal.building.levels[0].design.objects.find(o=>o.id===decimal.index.bars[0].captionId).prop.label.includes('1.23456789'),'caption does not silently round precise input');
assert.equal(barChartScale(4100000).maximum,5000000);assert.equal(barChartScale(0).minimum,0);
assert.throws(()=>barChartScale(Number.MIN_VALUE),/尺度/);
for(const bad of [NaN,Infinity,-1,'100',null])assert.throws(()=>buildBarChart({...input,data:[{name:'錯誤',value:bad}]}),/數值/);
assert.throws(()=>buildBarChart({...input,data:[{name:'同名',value:1},{name:'同名',value:2}]}),/重複/);
assert.throws(()=>buildBarChart({...input,data:[]}),/1–40/);assert.throws(()=>buildBarChart({...input,options:{materialId:'glass-clear-gloss'}}),/不透明/);
assert.throws(()=>buildBarChart({...input,source:{name:'錯誤',url:'javascript:alert(1)'}}),/HTTP/);
const many=buildBarChart({...input,data:Array.from({length:40},(_,i)=>({name:'類別'+i,value:i*10000}))});parseBuilding(JSON.stringify(many.building));
console.log('PASS 3D bar charts: linear zero-baseline geometry, equal widths/depths, deterministic sorting, exact data captions, native open platform/JSON roundtrip, opaque materials and invalid-input refusal.');
