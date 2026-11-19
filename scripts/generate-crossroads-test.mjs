import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {planSvg} from '../src/frontend/designer/design-export.js';
const s=new BuildingStore(emptyProject());
function put(assetId,x,z,width,depth,height,elevation=0,rotation=0){s.execute({type:'addObject',assetId,x,z});const o=s.state.objects.at(-1),id=o.id;s.execute({type:'dimensions',id,width:width??o.width,depth:depth??o.depth,height:height??o.height,elevation});for(let i=0;i<rotation/90;i++)s.execute({type:'rotateObject',id});return id;}
function signal(assetId,x,z,rotation,color,count){const id=put(assetId,x,z,undefined,undefined,undefined,.15,rotation);s.execute({type:'outdoor.configure',id,marking:'none',signal:color,direction:'straight',lampCount:count});return id;}
put('asphalt-road',0,0,12,12,.12);
for(const side of [-1,1]){put('asphalt-road',0,13*side,12,14,.12);put('asphalt-road',13*side,0,14,12,.12);}
for(const sx of [-1,1])for(const sz of [-1,1]){
 put('brick-sidewalk',7.5*sx,7.5*sz,3,3,.15);put('brick-sidewalk',7.5*sx,14.5*sz,3,11,.15);put('brick-sidewalk',14.5*sx,7.5*sz,11,3,.15);
 put('curb-red',5.94*sx,13*sz,.12,14,.008,.122);put('curb-red',13*sx,5.94*sz,14,.12,.008,.122);
 put('drain-cover',5.45*sx,10.8*sz,.5,.8,.025,.12);
 // Opposite pedestrian heads face each other across each crossing.
 signal('pedestrian-signal',7*sx,8*sz,sx>0?90:270,'red',2);
 signal('pedestrian-signal',8*sx,7*sz,sz>0?180:0,'green',2);
}
for(const side of [-1,1]){
 put('crosswalk',0,8*side,11.6,2.8,.008,.125);
 put('crosswalk',8*side,0,11.6,2.8,.008,.125,90);
 // Right-hand approach lanes stop before the crossing; opposite lanes remain open.
 put('curb-white',-3*side,10*side,5.65,.25,.008,.125);
 put('curb-white',10*side,3*side,.25,5.65,.008,.125);
 put('lane-double-yellow',0,15*side,.36,10,.008,.125);put('lane-double-yellow',15*side,0,.36,10,.008,.125,90);
 for(const lane of [-3,3]){put('lane-dashed-white',lane,15*side,.12,7.3,.008,.125);put('lane-dashed-white',15*side,lane,.12,7.3,.008,.125,90);}
 signal('traffic-signal',-6.8*side,10.8*side,side>0?0:180,'green',3);
 signal('directional-signal',10.8*side,6.8*side,side>0?270:90,'red',5);
}
put('manhole-cover',2,-2,.7,.7,.025,.12);
const saved=s.serialize();assert.deepEqual(parseBuilding(saved),s.building);assert.equal(s.state.objects.filter(o=>o.assetId==='crosswalk').length,4);assert.equal(s.state.objects.filter(o=>o.assetId==='pedestrian-signal').length,8);assert.ok(s.state.objects.length<=100);
const built=buildBuilding(s.building);let meshes=0;try{built.group.traverse(m=>{if(m.isMesh){meshes++;assert.ok(Array.from(m.geometry.attributes.position.array).every(Number.isFinite));}});}finally{built.dispose();}
writeFileSync('output/crossroads-test-design.json',saved);writeFileSync('output/crossroads-test-plan.svg',planSvg(s.building,s.building.activeLevelId));
console.log(`PASS crossroads: ${s.state.objects.length} objects, ${meshes} finite meshes, 4 crosswalks, 4 vehicle signals, 8 pedestrian signals, save/reload and SVG.`);
