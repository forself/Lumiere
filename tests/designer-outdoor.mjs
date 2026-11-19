import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {ASSETS} from '../src/frontend/designer/catalog.js';
import {DesignStore,emptyProject,parseProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {walkSurface} from '../src/frontend/designer/stairs.js';
import {walkStart} from '../src/frontend/designer/walk.js';
import {outdoorSurface,roadMarks} from '../src/frontend/designer/outdoor.js';
const s=new DesignStore(emptyProject()),assets=Object.values(ASSETS).filter(a=>a.outdoor);assert.equal(assets.length,24);
for(const a of assets){s.execute({type:'addObject',assetId:a.id,x:0,z:0});const id=s.state.objects.at(-1).id;s.execute({type:'outdoor.configure',id,marking:a.markable?'doubleYellow':'none',signal:'green',direction:'left'});const built=buildDesign(s.state);let count=0;try{built.byId.get(id).traverse(m=>{if(m.isMesh){count++;assert.ok(Array.from(m.geometry.attributes.position.array).every(Number.isFinite));assert.equal(m.userData.id,id);}});assert.ok(count>0,a.id);}finally{built.dispose();}}
assert.deepEqual(parseProject(s.serialize()),s.state);const previous=s.serialize();assert.throws(()=>s.execute({type:'outdoor.configure',id:s.state.objects.at(-1).id,marking:'evil',signal:'green',direction:'left'}));assert.equal(s.serialize(),previous);s.execute({type:'delete',id:s.state.objects.at(-1).id});s.undo();assert.equal(s.serialize(),previous);assert.ok(roadMarks('whiteDash').length>1);
const b=new BuildingStore(emptyProject());b.execute({type:'addObject',assetId:'asphalt-road',x:0,z:0});const road=b.state.objects[0];b.execute({type:'dimensions',id:road.id,width:10,depth:30,height:.12,elevation:0});b.execute({type:'addObject',assetId:'underpass',x:0,z:0});
const mesh=buildDesign(b.state);try{const root=mesh.byId.get(road.id);root.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(0,1,7),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(root,true).length,0,'road entrance opening');ray.ray.origin.z=0;assert.ok(ray.intersectObject(root,true).length,'road over tunnel retained');}finally{mesh.dispose();}
let y=.12;for(let z=10.1;z>=0;z-=.08){const next=walkSurface(b.building,{x:0,z},y);assert.notEqual(next,null);y=next;}assert.ok(Math.abs(y+3)<1e-8,'walk descends below outdoor surface');for(let z=0;z<=10.2;z+=.08){const next=walkSurface(b.building,{x:0,z},y);assert.notEqual(next,null);y=next;}assert.ok(Math.abs(y-.12)<1e-8);
const bridge={...ASSETS.footbridge,assetId:'footbridge',x:0,z:0,rotation:0};assert.equal(outdoorSurface(bridge,{x:0,z:0}),5);assert.ok(walkStart(b.building,b.building.activeLevelId));
console.log('PASS 24 outdoor assets, geometry, settings, save/undo, rejected settings, road tunnel openings, bidirectional descent and outdoor walk start.');
import {writeFileSync} from 'node:fs';
const demo=new BuildingStore(emptyProject());
const place=(assetId,x,z,changes={})=>{demo.execute({type:'addObject',assetId,x,z});const o=demo.state.objects.at(-1);if(Object.keys(changes).length)demo.execute({type:'dimensions',id:o.id,width:changes.width??o.width,depth:changes.depth??o.depth,height:changes.height??o.height,elevation:changes.elevation??o.elevation});return o.id;};
const roadId=place('asphalt-road',0,0,{width:8,depth:32});demo.execute({type:'outdoor.configure',id:roadId,marking:'whiteDash',signal:'red',direction:'straight'});
place('brick-sidewalk',5,0,{depth:32});place('green-sidewalk',-4.8,0,{depth:32});place('hedge-island',0,8,{width:1,depth:8});place('bus-island',2.5,-7,{width:2,depth:6});place('crosswalk',0,-1,{elevation:.13,width:7,depth:3});place('curb-red',4.1,7,{elevation:.16});place('drain-cover',3.5,2,{elevation:.12});place('manhole-cover',2,4,{elevation:.12});place('traffic-signal',4.7,-2);place('directional-signal',-4.3,-2);place('pedestrian-signal',4.6,1);
writeFileSync('output/outdoor-test-design.json',demo.serialize());
import {stepWalk} from '../src/frontend/designer/walk.js';
for(const assetId of ['footbridge','underpass']){
 const store=new BuildingStore(emptyProject());store.execute({type:'addObject',assetId:'asphalt-road',x:0,z:0});store.execute({type:'dimensions',id:store.state.objects[0].id,width:10,depth:40,height:.12,elevation:0});store.execute({type:'addObject',assetId,x:0,z:0});const passage=store.state.objects.at(-1),scene=buildDesign(store.state);scene.group.updateMatrixWorld(true);
 try{let p={x:0,y:1.77,z:passage.depth/2+.2};for(let i=0;i<Math.ceil((passage.depth+.4)/.08);i++){const next=stepWalk(store.building,p,0,-.08,scene.group);assert.ok(next,assetId+' actual collision route '+i);p=next;}assert.ok(Math.abs(p.y-1.77)<.2);}finally{scene.dispose();}
}
console.log('PASS real walk collision through both footbridge and underpass.');
import {planSvg} from '../src/frontend/designer/design-export.js';
const outdoorSvg=planSvg(demo.building,demo.building.activeLevelId);assert.match(outdoorSvg,/#45494b/);assert.match(outdoorSvg,/width="0.144/);writeFileSync('output/outdoor-test-plan.svg',outdoorSvg);
const passages=new BuildingStore(emptyProject());passages.execute({type:'addObject',assetId:'concrete-paving',x:0,z:0});passages.execute({type:'dimensions',id:passages.state.objects[0].id,width:32,depth:32,height:.12,elevation:0});for(const [assetId,x] of [['footbridge',7],['underpass',-7]])passages.execute({type:'addObject',assetId,x,z:0});writeFileSync('output/outdoor-passages-test.json',passages.serialize());
import {signalLampCount} from '../src/frontend/designer/outdoor-catalog.js';
const lights=new DesignStore(emptyProject());
for(const assetId of ['traffic-signal','directional-signal','pedestrian-signal']){
 lights.execute({type:'addObject',assetId,x:0,z:0});const id=lights.state.objects.at(-1).id;
 assert.equal(signalLampCount(lights.state.objects.at(-1)),assetId==='pedestrian-signal'?2:3);
 for(let lampCount=1;lampCount<=6;lampCount++){lights.execute({type:'outdoor.configure',id,marking:'none',signal:'green',direction:'straight',lampCount});const built=buildDesign(lights.state);try{let actual=0;built.byId.get(id).traverse(m=>{if(m.userData.signalLamp)actual++;});assert.equal(actual,lampCount);}finally{built.dispose();}assert.equal(parseProject(lights.serialize()).objects.at(-1).outdoor.lampCount,lampCount);}
 const saved=lights.serialize();for(const lampCount of [0,7,2.5,'3',NaN])assert.throws(()=>lights.execute({type:'outdoor.configure',id,marking:'none',signal:'red',direction:'straight',lampCount}));assert.equal(lights.serialize(),saved);
 lights.execute({type:'outdoor.configure',id,marking:'none',signal:'red',direction:'straight',lampCount:1});lights.undo();assert.equal(lights.serialize(),saved);
 const legacy=JSON.parse(saved);delete legacy.objects.at(-1).outdoor.lampCount;assert.equal(signalLampCount(parseProject(JSON.stringify(legacy)).objects.at(-1)),assetId==='pedestrian-signal'?2:3);
}
console.log('PASS signal lens counts 1–6, exact rendered lens counts, old-file defaults, save/undo and invalid count rejection.');
// Taiwan Article 185: bars parallel to traffic (local Z), 0.4 m width and 0.6 m fixed gap.
for(const width of [.4,4,11.6,20]){const bars=roadMarks('crosswalk',width,2.8,2.8);assert.ok(bars.length);for(let i=0;i<bars.length;i++){const r=bars[i];assert.ok(Math.abs(r.w*width-.4)<1e-9);assert.ok(Math.abs(r.d*2.8-2.8)<1e-9);assert.equal(r.z,0);assert.ok(Math.abs(r.x*width)+.2<=width/2+1e-9);if(i)assert.ok(Math.abs((r.x-bars[i-1].x)*width-.4-.6)<1e-9);}}
const tw=new DesignStore(emptyProject());tw.execute({type:'addObject',assetId:'crosswalk',x:0,z:0});const twid=tw.state.objects[0].id;tw.execute({type:'dimensions',id:twid,width:11.6,depth:2.8,height:.008,elevation:.125});tw.execute({type:'rotateObject',id:twid});const twGeometry=buildDesign(tw.state);try{assert.equal(twGeometry.byId.get(twid).children.length,1);const pos=twGeometry.byId.get(twid).children[0].geometry.attributes.position;assert.equal(pos.count,24*12);for(let i=0;i<pos.count;i+=24){const box=new THREE.Box3();for(let j=i;j<i+24;j++)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos,j));const size=box.getSize(new THREE.Vector3());assert.ok(Math.abs(size.x-.4)<1e-6);assert.ok(Math.abs(size.z-2.8)<1e-6);}}finally{twGeometry.dispose();}
for(const depth of [1.9,8.1])assert.throws(()=>tw.execute({type:'dimensions',id:twid,width:11.6,depth,height:.008,elevation:0}));
console.log('PASS Taiwan crossing bar orientation, physical width, fixed gap, variable span, rotated geometry and depth limits.');
import {objectMarks} from '../src/frontend/designer/outdoor.js';
for(const assetId of ['lane-dashed-white','lane-double-yellow','crosswalk']){
 const store=new DesignStore(emptyProject());store.execute({type:'addObject',assetId,x:0,z:0});const original=store.state.objects[0],id=original.id,before=objectMarks(original);assert.ok(before.length>1);const built=buildDesign(store.state);try{assert.equal(built.byId.get(id).children.length,1,'one render mesh per marking group');assert.equal(built.byId.get(id).children[0].userData.id,id);}finally{built.dispose();}
 store.execute({type:'moveObject',id,x:2,z:3});store.execute({type:'rotateObject',id});assert.equal(store.state.objects.length,1);assert.deepEqual(objectMarks(store.state.objects[0]),before);
 store.execute({type:'dimensions',id,width:original.width,depth:assetId==='crosswalk'?3:20,height:original.height,elevation:0});if(assetId==='lane-dashed-white')assert.ok(objectMarks(store.state.objects[0]).length>before.length);assert.deepEqual(parseProject(store.serialize()),store.state);const saved=store.serialize();store.execute({type:'delete',id});assert.equal(store.state.objects.length,0);store.undo();assert.equal(store.serialize(),saved);
}
console.log('PASS marking groups: one model object and one mesh, move/rotate/resize, repeat generation, save/delete/undo.');
