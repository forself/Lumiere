import assert from 'node:assert/strict';
import {newCapture,validateCapture,applySemantic,applyWorkbench,replaceCaptureScene} from '../src/frontend/capture/capture-model.js';
import {applyBuildingCommand} from '../src/frontend/designer/building-model.js';
import {applySemanticPacket,semanticTemplate,semanticSummary,validateSemanticState,guardRelations} from '../src/frontend/capture/semantic-assemblies.js';
import {workbenchTemplate,observationTemplate,viewTemplate,workbenchSummary} from '../src/frontend/capture/workbench.js';

const clone=structuredClone,near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){const c=newCapture('capture-semantic');c.sources=[{id:'source-1',name:'interior.png',sha256:'a'.repeat(64),bytes:100,mime:'image/png',width:800,height:600,kind:'photo',target:'客廳',view:'入口',capturedAt:''}];return c;}
function packet(c,operations){return {...semanticTemplate(c),operations};}
const spaceOp=c=>semanticTemplate(c).operations[0];
const windowOp={type:'assembly.put',id:'assembly-window',levelId:'floor-1',kind:'window-grid',name:'多格窗與上方氣窗',params:{x:0,z:-2,width:3,depth:.1,height:2,rotation:0,color:'#555555',elevation:.6,columns:3,rows:2,frame:.06,glassColor:'#a9cada'}};
const sofaOp={type:'assembly.put',id:'assembly-sofa',levelId:'floor-1',kind:'sectional-sofa',name:'左轉角連續沙發',params:{x:0,z:0,width:3,depth:2,height:.9,rotation:0,color:'#bba988',layout:'left',seatHeight:.45}};
const object=(c,id)=>c.scene.levels[0].design.objects.find(o=>o.id===id);
const assembly=(c,id)=>c.workbench.assemblies.find(a=>a.id===id);
const role=(c,id,name)=>object(c,assembly(c,id).members.find(m=>m.role===name).id);

const c=fixture(),space=applySemantic(c,packet(c,[spaceOp(c)]));
assert.equal(c.scene.levels[0].elements.length,0);
assert.equal(space.revision,c.revision+1);validateCapture(space);
assert.deepEqual(assembly(space,'assembly-space').members.map(m=>m.role),['floor','wall-north','wall-west']);
assert.equal(space.scene.levels[0].design.rooms.length,0,'a partial view must never invent a closed room');
assert.equal(assembly(space,'assembly-space').params.boundaries.east,'unknown');
assert.equal(semanticSummary(space).assemblies[0].status,'intact');
const changed=spaceOp(space);changed.params.width=6;changed.params.rotation=90;changed.name='旋轉後的局部空間';
const updated=applySemantic(space,packet(space,[changed]));
assert.deepEqual(assembly(updated,'assembly-space').members,assembly(space,'assembly-space').members,'matching semantic roles retain entity IDs');
near(role(updated,'assembly-space','wall-north').x,2);near(role(updated,'assembly-space','wall-north').z,0);
assert.equal(semanticSummary(updated).assemblies[0].status,'intact');
const empty=spaceOp(c);empty.params.boundaries={north:'unknown',east:'unknown',south:'unknown',west:'unknown'};empty.params.floor=false;empty.params.ceiling=false;
assert.throws(()=>applySemanticPacket(c,packet(c,[empty])),/語意構件資料/);

let windows=applySemantic(c,packet(c,[windowOp]));assert.equal(assembly(windows,'assembly-window').members.length,13);
assert.equal(windows.scene.levels[0].design.objects.filter(o=>o.assetId==='placeholder-glass').length,6);
const wc=windows.scene.levels[0].design.objects;near(Math.min(...wc.map(o=>o.x-o.width/2)),-1.5);near(Math.max(...wc.map(o=>o.x+o.width/2)),1.5);
near(Math.min(...wc.map(o=>o.elevation)),.6);near(Math.max(...wc.map(o=>o.elevation+o.height)),2.6);
const larger=clone(windowOp);larger.params.columns=4;larger.params.width=3.4;
let expanded=applySemantic(windows,packet(windows,[larger]));
for(const m of assembly(windows,'assembly-window').members)assert.equal(assembly(expanded,'assembly-window').members.find(v=>v.role===m.role).id,m.id);
const zeroBottom=clone(windowOp);zeroBottom.params.elevation=0;zeroBottom.name='窗'.repeat(100);
const low=applySemantic(c,packet(c,[zeroBottom]));assert(low.scene.levels[0].design.objects.every(o=>o.elevation>=0&&o.prop.label.length<=64));
const smaller=clone(larger);smaller.params.columns=2;const shrunken=applySemantic(expanded,packet(expanded,[smaller]));
assert.equal(assembly(shrunken,'assembly-window').members.length,10);assert.equal(shrunken.scene.levels[0].design.objects.length,10);

const sofas=applySemantic(c,packet(c,[sofaOp]));assert.equal(semanticSummary(sofas).assemblies[0].status,'intact');
const covers=(o,x,z)=>Math.abs(x-o.x)<o.width/2&&Math.abs(z-o.z)<o.depth/2;
assert(!sofas.scene.levels[0].design.objects.some(o=>covers(o,.5,.5)),'L-shaped free floor remains free, including its base');
assert(sofas.scene.levels[0].design.objects.some(o=>covers(o,-1,.5)));
const right=clone(sofaOp);right.params.layout='right';const rightSofa=applySemantic(sofas,packet(sofas,[right]));
assert(!rightSofa.scene.levels[0].design.objects.some(o=>covers(o,-.5,.5)));assert(rightSofa.scene.levels[0].design.objects.some(o=>covers(o,1,.5)));
const u=clone(sofaOp);u.params.layout='u';const uSofa=applySemantic(c,packet(c,[u]));assert(!uSofa.scene.levels[0].design.objects.some(o=>covers(o,0,.5)));
const straight=clone(sofaOp);straight.params.layout='straight';straight.params.depth=.8;const straightSofa=applySemantic(c,packet(c,[straight]));assert.equal(assembly(straightSofa,'assembly-sofa').members.length,5);

const edited=clone(windows),pane=assembly(edited,'assembly-window').members.find(m=>m.role==='pane-0-0');
edited.scene=applyBuildingCommand(edited.scene,{type:'moveObject',id:pane.id,x:2,z:-2});validateCapture(edited);
assert.equal(semanticSummary(edited).assemblies[0].status,'modified');
assert.throws(()=>applySemantic(edited,packet(edited,[larger])),/人工修改/);
const detached=applySemantic(edited,packet(edited,[{type:'assembly.detach',id:'assembly-window'}]));
assert.equal(detached.workbench.assemblies.length,0);assert.deepEqual(detached.scene.levels[0].design.objects,edited.scene.levels[0].design.objects);
const missing=clone(windows);missing.scene=applyBuildingCommand(missing.scene,{type:'delete',id:pane.id});validateCapture(missing);assert.equal(semanticSummary(missing).assemblies[0].status,'missing');
assert.throws(()=>applySemantic(missing,packet(missing,[larger])),/人工修改/);
const deleted=applySemantic(windows,packet(windows,[{type:'assembly.delete',id:'assembly-window'}]));assert.equal(deleted.scene.levels[0].design.objects.length,0);
const badParams=clone(windows);badParams.workbench.assemblies[0].params.width=3.1;assert.equal(semanticSummary(badParams).assemblies[0].status,'modified');

let room=fixture();room.scene=applyBuildingCommand(room.scene,{type:'addRoom',x:0,z:0,width:6,depth:5});room.scene=applyBuildingCommand(room.scene,{type:'addObject',assetId:'table',x:2,z:2});
const relation={id:'relation-wall',kind:'against-wall',subject:{levelId:'floor-1',kind:'object',id:'object-1'},target:{levelId:'floor-1',kind:'wall',id:'wall-1'},side:1,at:.5,gap:.1,locked:true};
let related=applySemantic(room,packet(room,[{type:'relation.put',relation,apply:true}]));const moved=object(related,'object-1');
near(moved.x,3);near(moved.z,.075+moved.depth/2+.1);assert.equal(semanticSummary(related).relations[0].status,'satisfied');
const movedScene=applyBuildingCommand(related.scene,{type:'moveObject',id:'object-1',x:4,z:2});
assert.throws(()=>guardRelations(related,movedScene),/鎖定/);assert.throws(()=>replaceCaptureScene(related,movedScene),/鎖定/);
assert.throws(()=>applySemantic(related,packet(related,[{type:'relation.put',relation:{...relation,gap:.4,locked:false},apply:true}])),/先只解除/);
assert.throws(()=>applySemantic(related,packet(related,[{type:'relation.delete',id:relation.id}])),/解除鎖定/);
const unlocked=applySemantic(related,packet(related,[{type:'relation.put',relation:{...relation,locked:false},apply:false}]));
assert.doesNotThrow(()=>guardRelations(unlocked,movedScene));
const removed=applySemantic(unlocked,packet(unlocked,[{type:'relation.delete',id:relation.id}]));assert.equal(removed.workbench.relations.length,0);
const mismatch=clone(relation);mismatch.target.levelId='floor-2';assert.throws(()=>applySemantic(room,packet(room,[{type:'relation.put',relation:mismatch,apply:true}])),/同層/);
const ground={...relation,id:'relation-ground',kind:'on-ground',target:{levelId:'floor-1',kind:'room',id:'room-1'},gap:.03};
const grounded=applySemantic(room,packet(room,[{type:'relation.put',relation:ground,apply:true}]));near(object(grounded,'object-1').elevation,.03);
let slab=space;slab={...slab,scene:applyBuildingCommand(slab.scene,{type:'addObject',assetId:'table',x:0,z:0})};const slabTable=slab.scene.levels[0].design.objects.at(-1);
const onSlab={...ground,subject:{...ground.subject,id:slabTable.id},target:{levelId:'floor-1',kind:'element',id:'element-1'}};
const slabGrounded=applySemantic(slab,packet(slab,[{type:'relation.put',relation:onSlab,apply:true}]));near(object(slabGrounded,slabTable.id).elevation,.03);
const onWall={...ground,target:relation.target};assert.throws(()=>applySemantic(room,packet(room,[{type:'relation.put',relation:onWall,apply:true}])),/目標類型/);

const invalid=clone(windowOp);invalid.params.width=NaN;
const before=JSON.stringify(c);assert.throws(()=>applySemantic(c,packet(c,[spaceOp(c),invalid])));assert.equal(JSON.stringify(c),before);
const unknown=clone(windowOp);unknown.params.guessed=true;assert.throws(()=>applySemantic(c,packet(c,[unknown])),/欄位/);
const noSource=packet(c,[windowOp]);noSource.sourceIds=['source-2'];assert.throws(()=>applySemantic(c,noSource),/來源/);
const floorSwap=clone(windowOp);floorSwap.levelId='floor-99';assert.throws(()=>applySemantic(c,packet(c,[floorSwap])),/樓層/);

// A reviewed assembly must become stale when any generated member changes, and cannot pass after deletion.
const observation={...observationTemplate('source-1'),name:'整組窗格',entityRefs:[{levelId:'floor-1',kind:'assembly',id:'assembly-window'}]};
const rp={...workbenchTemplate(windows),observations:[observation],views:[viewTemplate(windows)],reviews:[{id:'review-window',observationId:observation.id,viewId:'view-1',result:'pass',note:'逐一對照窗格分隔後的回報。'}]};
const reviewed=applyWorkbench(windows,rp);assert.equal(workbenchSummary(reviewed).complete,true);
const changedMember=clone(reviewed);changedMember.scene=edited.scene;assert.equal(workbenchSummary(changedMember).observations[0].status,'needs-fix');
const lostMember=clone(reviewed);lostMember.scene=missing.scene;assert.equal(workbenchSummary(lostMember).observations[0].missingRefs.length,1);
assert.throws(()=>applyWorkbench(lostMember,{...workbenchTemplate(lostMember),reviews:[{...rp.reviews[0],id:'review-window-2'}]}),/尚未連結/);

console.log('PASS capture semantic assemblies: three recipes, unknown boundaries, stable member IDs, exact window bounds, L/U footprint, drift/detach, atomic failures, locked wall/ground relations and assembly-review invalidation');
