import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import * as THREE from '../node_modules/three/build/three.module.js';
import {newCapture,validateCapture,applySemantic,applyEvidence,evidenceTemplate,resolveEvidence} from '../src/frontend/capture/capture-model.js';
import {semanticTemplate,semanticSummary} from '../src/frontend/capture/semantic-assemblies.js';
import {applyBuildingCommand,validateBuilding} from '../src/frontend/designer/building-model.js';
import {applyCommand,wallSections,wallFrame,parseProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
import {openingParts} from '../src/frontend/designer/openings.js';
import {planSvg} from '../src/frontend/designer/design-export.js';
import {stepWalk} from '../src/frontend/designer/walk.js';

const clone=structuredClone,near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){let c=newCapture('capture-hosted-window');c.title='附牆窗格修正驗證：共用原生洞口';c.sources=[{id:'source-1',name:'synthetic-window-fixture.png',sha256:'a'.repeat(64),bytes:100,mime:'image/png',width:800,height:600,kind:'photo',target:'合成測試；不是來源照片重建',view:'正面',capturedAt:''}];c.scene=applyBuildingCommand(c.scene,{type:'addRoom',x:0,z:0,width:8,depth:6});c.scene=applyBuildingCommand(c.scene,{type:'addRoom',x:0,z:-4,width:8,depth:4,autoJoin:true});return c;}
const op={type:'assembly.put',id:'assembly-window',levelId:'floor-1',kind:'window-grid',name:'三列兩排附牆窗格',params:{x:0,z:0,width:3,depth:.15,height:2,rotation:0,color:'#52433a',elevation:.5,columns:3,rows:2,frame:.06,glassColor:'#b6dce7',host:{wallId:'wall-1',at:.5}}};
const packet=(c,operations)=>({...semanticTemplate(c),operations});
const design=c=>c.scene.levels[0].design;
const opening=c=>design(c).openings[0];
const rayHits=(group,x,y,z,dz)=>new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(0,0,dz),0,1).intersectObject(group,true).filter(h=>h.object.isMesh);
const throughPane=(built,x,y=1)=>rayHits(built.group,x,y,.45,-1);
const apertureClear=(built,x,y=1)=>throughPane(built,x,y).every(hit=>hit.object.userData.kind!=='wall');

const c=fixture(),before=JSON.stringify(c);let hosted=applySemantic(c,packet(c,[op]));
assert.equal(JSON.stringify(c),before);validateCapture(hosted);
assert.equal(design(hosted).objects.length,0,'hosted grids are native openings, without duplicate placeholder objects');
assert.equal(design(hosted).openings.length,1,'multiple rows share exactly one wall aperture');
const a=hosted.workbench.assemblies[0],o=opening(hosted);assert.deepEqual(a.members,[{role:'opening',kind:'opening',id:o.id}]);
near(a.params.x,4);near(a.params.z,0);near(a.params.rotation,0);assert.equal(semanticSummary(hosted).assemblies[0].status,'intact');
assert.equal(o.styleId,'window-grid');assert.equal(o.grid.rows,2);assert.equal(o.grid.columns,3);assert.equal(openingParts(o,design(hosted).walls[0]).parts.length,13);
const sections=wallSections(design(hosted),design(hosted).walls[0]);assert(!sections.some(s=>s.from<4&&s.to>4&&s.bottom<1&&s.top>1),'native wall solids exclude the actual hole');
let built=buildDesign(design(hosted));
try{
 assert.equal(built.byId.get(o.id).children.length,13,'only 6 panes and 7 frames; no extra default frame or fixed leaf');
 assert(apertureClear(built,4));const hit=throughPane(built,4).find(h=>h.object.userData.id===o.id);assert(hit);assert.equal(hit.object.userData.role,'grid-pane');assert.equal(hit.object.material.transparent,true);
 assert.equal(stepWalk(hosted.scene,{x:4,y:1.65,z:.45},0,-.6,built.group),null,'fixed glass and sill still block passage using actual window geometry');
 const blocked=built.group.clone();const plug=new THREE.Mesh(new THREE.BoxGeometry(3,2,.15),new THREE.MeshBasicMaterial());plug.position.set(4,1.5,0);plug.userData={kind:'wall',id:'deliberate-opaque-plug'};blocked.add(plug);blocked.updateMatrixWorld(true);
 assert.equal(apertureClear({group:blocked},4),false,'negative control: adding an opaque wall in the aperture must fail the aperture check');plug.geometry.dispose();plug.material.dispose();
}finally{built.dispose();}
const svg=planSvg(hosted.scene,'floor-1');assert(svg.includes(`data-opening="${o.id}" x1="2.5" y1="0" x2="5.5" y2="0"`));assert.equal((svg.match(/data-grid-mullion/g)||[]).length,4);

const changed=clone(op);changed.params.host.at=.25;changed.params.width=2;changed.params.height=1.6;changed.params.elevation=.8;changed.params.rows=3;
const resized=applySemantic(hosted,packet(hosted,[changed]));assert.equal(opening(resized).id,o.id);near(opening(resized).at,.25);near(opening(resized).width,2);near(opening(resized).sill,.8);
built=buildDesign(design(resized));try{assert(apertureClear(built,2,1.1));assert(!apertureClear(built,4,1.1),'old aperture is filled by opaque wall after movement');}finally{built.dispose();}
const deleted=applySemantic(hosted,packet(hosted,[{type:'assembly.delete',id:a.id}]));assert.equal(design(deleted).openings.length,0);assert.equal(deleted.workbench.assemblies.length,0);
built=buildDesign(design(deleted));try{assert(!apertureClear(built,4));}finally{built.dispose();}

// Human moves and dimensions operate on the same native opening, and invalidate the recipe snapshot.
const human=clone(hosted);human.scene=applyBuildingCommand(human.scene,{type:'moveOpening',id:o.id,at:.6});
assert.equal(semanticSummary(human).assemblies[0].status,'modified');assert.throws(()=>applySemantic(human,packet(human,[changed])),/人工修改/);
built=buildDesign(design(human));try{const bounds=new THREE.Box3().setFromObject(built.byId.get(o.id));near((bounds.min.x+bounds.max.x)/2,4.8);assert(apertureClear(built,4.8));}finally{built.dispose();}
const humanSize=clone(hosted);humanSize.scene=applyBuildingCommand(humanSize.scene,{type:'dimensions',id:o.id,width:2.4,height:1.8,sill:.6});
assert.equal(semanticSummary(humanSize).assemblies[0].status,'modified');const pp=openingParts(opening(humanSize),design(humanSize).walls[0]).parts;near(Math.max(...pp.map(p=>p.x+p.width/2))-Math.min(...pp.map(p=>p.x-p.width/2)),2.4);
const shiftedWall=clone(hosted);for(const v of design(shiftedWall).vertices)if(v.z===0)v.z=.2;validateCapture(shiftedWall);assert.equal(semanticSummary(shiftedWall).assemblies[0].status,'modified');
built=buildDesign(design(shiftedWall));try{const bounds=new THREE.Box3().setFromObject(built.byId.get(o.id));near((bounds.min.z+bounds.max.z)/2,.2);}finally{built.dispose();}
const lost=clone(hosted);lost.scene=applyBuildingCommand(lost.scene,{type:'delete',id:o.id});validateCapture(lost);assert.equal(semanticSummary(lost).assemblies[0].status,'missing');
const detached=applySemantic(human,packet(human,[{type:'assembly.detach',id:a.id}]));assert.equal(detached.workbench.assemblies.length,0);assert.deepEqual(design(detached),design(human));

const independent=clone(op);delete independent.params.host;independent.params.x=4;independent.params.z=1;
const free=applySemantic(c,packet(c,[independent]));assert.equal(design(free).openings.length,0);assert.equal(design(free).objects.length,13);assert(!Object.hasOwn(free.workbench.assemblies[0].params,'host'));
const attached=applySemantic(free,packet(free,[op]));assert.equal(design(attached).objects.length,0);assert.equal(design(attached).openings.length,1);
const madeFree=applySemantic(hosted,packet(hosted,[independent]));assert.equal(design(madeFree).openings.length,0);assert.equal(design(madeFree).objects.length,13);
const lockedFree=clone(free);lockedFree.scene=applyBuildingCommand(lockedFree.scene,{type:'editor.set',flag:'locked',value:true,ids:[design(lockedFree).objects[0].id]});const lockBefore=JSON.stringify(lockedFree);
assert.throws(()=>applySemantic(lockedFree,packet(lockedFree,[op])),/鎖定/);assert.equal(JSON.stringify(lockedFree),lockBefore,'failed attach leaves neither a hole nor partial deletion');
let ep=evidenceTemplate(hosted);ep.claims=[{id:'claim-window-width',levelId:'floor-1',kind:'opening',entityId:o.id,property:'width',value:3,uncertainty:0,sourceIds:['source-1'],basis:'measured',state:'現況',note:'測試鎖定的已知窗寬。'}];
let locked=applyEvidence(hosted,ep);locked=resolveEvidence(locked,'claim-window-width','保留測試窗寬');const lockedBefore=JSON.stringify(locked);
assert.throws(()=>applySemantic(locked,packet(locked,[changed])),/鎖定/);assert.equal(JSON.stringify(locked),lockedBefore);
assert.throws(()=>applySemantic(locked,packet(locked,[{type:'assembly.delete',id:a.id}])),/鎖定/);assert.equal(JSON.stringify(locked),lockedBefore);

const overlap=clone(op);overlap.id='assembly-overlap';assert.throws(()=>applySemantic(hosted,packet(hosted,[overlap])),/10 公分/);
const missingHost=clone(op);missingHost.params.host.wallId='wall-999';assert.throws(()=>applySemantic(c,packet(c,[missingHost])),/原生實牆/);
const edge=clone(op);edge.params.host.at=.01;assert.throws(()=>applySemantic(c,packet(c,[edge])),/超出牆面/);
const unknown=clone(op);unknown.params.host.side=1;assert.throws(()=>applySemantic(c,packet(c,[unknown])),/欄位/);
const badGrid=clone(hosted);opening(badGrid).grid.hidden=true;assert.throws(()=>validateCapture(badGrid),/未知/);

let native=applyCommand(design(c),{type:'addOpening',kind:'window',wallId:'wall-1',at:.5});const original=JSON.stringify(native);
native=applyCommand(native,{type:'openingStyle',id:'window-1',styleId:'window-grid'});assert.equal(native.openings[0].grid.columns,2);assert.doesNotThrow(()=>buildDesign(native).dispose());
native=applyCommand(native,{type:'openingStyle',id:'window-1',styleId:'window-fixed'});assert.equal(JSON.stringify(native),original,'ordinary window round-trip adds no accidental grid field');
const dense=clone(hosted);opening(dense).grid.frame=.1;opening(dense).grid.columns=12;validateCapture(dense);const denseBefore=JSON.stringify(dense);
assert.throws(()=>applyBuildingCommand(dense.scene,{type:'dimensions',id:o.id,width:.4,height:2,sill:.5}),/分隔過密/);assert.equal(JSON.stringify(dense),denseBefore);
assert.deepEqual(parseProject(JSON.stringify(design(hosted))),design(hosted));validateBuilding(JSON.parse(JSON.stringify(hosted.scene)));

// A non-axis-aligned wall supplies the authoritative position and orientation.
let diagonal=fixture();diagonal.scene=applyBuildingCommand(diagonal.scene,{type:'addPolygon',points:[{x:12,z:0},{x:18,z:2},{x:16,z:8},{x:10,z:6}]});
const diagonalWall=design(diagonal).rooms.at(-1).wallIds[0],dOp=clone(op);dOp.params.host.wallId=diagonalWall;const dResult=applySemantic(diagonal,packet(diagonal,[dOp]));const frame=wallFrame(design(dResult),design(dResult).walls.find(w=>w.id===diagonalWall));near(dResult.workbench.assemblies[0].params.rotation,Math.atan2(frame.dz,frame.dx)*180/Math.PI);

const output=new URL('../output/window-grid-host-fix/',import.meta.url);await mkdir(output,{recursive:true});
await writeFile(new URL('hosted-window.capture.json',output),JSON.stringify(hosted,null,2));
await writeFile(new URL('hosted-window.building.json',output),JSON.stringify(hosted.scene,null,2));
await writeFile(new URL('hosted-window-plan.svg',output),svg);
console.log('PASS hosted semantic windows: native aperture and negative-control wall plug, shared 2D/3D/collision geometry, multi-row grid, movement/resize/delete, human drift, standalone compatibility, lock atomicity and old-window round-trip');
