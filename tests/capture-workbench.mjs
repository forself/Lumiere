import assert from 'node:assert/strict';
import {newCapture} from '../src/frontend/capture/capture-model.js';
import {applyBuildingCommand} from '../src/frontend/designer/building-model.js';
import {emptyWorkbench,validateWorkbench,applyWorkbenchPacket,workbenchSummary,workbenchTemplate,observationTemplate,viewTemplate,calibrationTemplate,calibrationCandidate,suggestObservationTasks,mapImagePoints} from '../src/frontend/capture/workbench.js';

const clone=structuredClone;
const approx=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
function fixture(){
 const c=newCapture('capture-workbench');c.workbench=emptyWorkbench();
 c.sources=[{id:'source-1',name:'room.png',sha256:'a'.repeat(64),bytes:1024,mime:'image/png',width:800,height:600,kind:'photo',target:'起居空間',view:'入口',capturedAt:''}];
 c.scene=applyBuildingCommand(c.scene,{type:'addRoom',x:0,z:0,width:6,depth:6});
 c.scene=applyBuildingCommand(c.scene,{type:'addObject',assetId:'table',x:2,z:2});
 c.scene=applyBuildingCommand(c.scene,{type:'addOpening',kind:'window',wallId:'wall-1',at:.5});
 return c;
}
function packet(c,parts={}){return {...workbenchTemplate(c),...parts};}
function observation(parts={}){return {...observationTemplate('source-1'),name:'可見桌面',semantic:'table',geometry:{type:'box',points:[[40,100],[340,300]]},visibility:{overall:'partial',edges:['visible','visible','occluded','visible']},note:'桌腳被前景遮蔽。',...parts};}
const tableRef={levelId:'floor-1',kind:'object',id:'object-1'};
const review={id:'review-1',observationId:'observation-1',viewId:'view-1',result:'pass',note:'人工比對原圖上的桌面四角，現在僅記錄這次明確回報。'};

let c=fixture();
assert.equal(workbenchSummary(c).complete,false);
assert.deepEqual(workbenchSummary(c).unobservedSourceIds,['source-1']);
let tracked=applyWorkbenchPacket(c,packet(c,{observations:[observation()],views:[viewTemplate(c)]}));
assert.equal(c.workbench.observations.length,0,'updates must not mutate input');
assert.equal(tracked.revision,c.revision,'outer capture commit owns revision');
assert.equal(workbenchSummary(tracked).observations[0].status,'unmodeled');
assert.throws(()=>applyWorkbenchPacket(tracked,packet(tracked,{reviews:[review]})),/尚未連結/);
let modeled=applyWorkbenchPacket(tracked,packet(tracked,{observations:[observation({entityRefs:[tableRef]})]}));
assert.equal(workbenchSummary(modeled).observations[0].status,'modeled');
let checked=applyWorkbenchPacket(modeled,packet(modeled,{reviews:[review]}));
assert.equal(workbenchSummary(checked).complete,true);
assert.equal(workbenchSummary(checked).observations[0].status,'checked');
assert.deepEqual(applyWorkbenchPacket(checked,packet(checked,{reviews:[review]})),checked,'same-review replay is safe within a revision');
assert.throws(()=>applyWorkbenchPacket(checked,packet(checked,{reviews:[{...review,note:'overwrite'}]})),/ID 已使用/);
const revised=clone(checked);revised.revision+=1;assert.equal(workbenchSummary(revised).observations[0].status,'checked','unrelated revision does not invalidate geometry');
const edited=clone(checked);edited.scene=applyBuildingCommand(edited.scene,{type:'moveObject',id:'object-1',x:3,z:2});
assert.equal(workbenchSummary(edited).observations[0].status,'needs-fix');
assert.equal(workbenchSummary(edited).observations[0].stale,true);
const deleted=clone(checked);deleted.scene.levels[0].design.objects=[];
validateWorkbench(deleted);assert.equal(workbenchSummary(deleted).observations[0].missingRefs.length,1);
assert.equal(workbenchSummary(deleted).complete,false);
const changedImage=clone(checked);changedImage.sources[0].sha256='b'.repeat(64);assert.equal(workbenchSummary(changedImage).observations[0].status,'needs-fix');
const changedObservation=clone(checked.workbench.observations[0]);changedObservation.geometry.points[0][0]+=1;
assert.equal(workbenchSummary(applyWorkbenchPacket(checked,packet(checked,{observations:[changedObservation]}))).observations[0].status,'needs-fix');
const extraSource=clone(checked);extraSource.sources.push({...extraSource.sources[0],id:'source-2',sha256:'b'.repeat(64)});
assert.equal(workbenchSummary(extraSource).complete,false);assert.deepEqual(workbenchSummary(extraSource).unobservedSourceIds,['source-2']);

const bad=(mutate,pattern)=>{const p=packet(c,{observations:[observation({entityRefs:[clone(tableRef)]})]});mutate(p);assert.throws(()=>applyWorkbenchPacket(c,p),pattern);};
bad(p=>p.observations[0].status='checked',/未知/);
bad(p=>p.observations[0].geometry.points[0][0]=NaN,/像素/);
bad(p=>p.observations[0].geometry.points[1][0]=801,/像素/);
bad(p=>p.observations[0].entityRefs[0].levelId='floor-2',/樓層不符/);
bad(p=>p.observations[0].entityRefs[0].kind='wall',/樓層不符/);
bad(p=>p.observations[0].geometry.units='normalized',/未知/);
bad(p=>p.observations[0].visibility.overall='visible',/完全可見/);
bad(p=>p.observations[0].visibility.overall='occluded',/推論/);
bad(p=>p.observations[0].geometry={type:'polygon',points:[[0,0],[1,1],[2,2]]},/面積/);
bad(p=>{p.observations[0].geometry={type:'polygon',points:[[0,0],[200,200],[0,200],[100,0]]};},/交叉/);
bad(p=>p.baseRevision=99,/版本/);
bad(p=>p.observations[0].geometry.points[0][0]=-1,/像素/);
const atomicBefore=JSON.stringify(checked),invalidView=clone(checked.workbench.views[0]);invalidView.camera.focal=NaN;
assert.throws(()=>applyWorkbenchPacket(checked,packet(checked,{observations:[changedObservation],views:[invalidView]})));
assert.equal(JSON.stringify(checked),atomicBefore);
const otherView={...viewTemplate(extraSource,'source-2'),id:'view-2'};
assert.throws(()=>applyWorkbenchPacket(extraSource,packet(extraSource,{views:[otherView],reviews:[{...review,id:'review-other',viewId:'view-2'}]})),/同一來源/);
assert.throws(()=>applyWorkbenchPacket(extraSource,packet(extraSource,{observations:[{...changedObservation,sourceId:'source-2'}]})),/不可改綁/);
const cameraMismatch=clone(viewTemplate(c));cameraMismatch.camera.width=400;
assert.throws(()=>applyWorkbenchPacket(c,packet(c,{views:[cameraMismatch]})),/尺寸/);

let win=applyWorkbenchPacket(c,packet(c,{observations:[observation({entityRefs:[{levelId:'floor-1',kind:'opening',id:'window-1'}]})],views:[viewTemplate(c)],reviews:[review]}));
assert.equal(workbenchSummary(win).complete,true);
win=clone(win);win.scene.levels[0].design.vertices[0].x+=.2;
assert.equal(workbenchSummary(win).observations[0].status,'needs-fix','host wall movement invalidates opening review');

const lockedView=clone(viewTemplate(c));lockedView.locked=['focal'];
let locked=applyWorkbenchPacket(c,packet(c,{views:[lockedView]}));
const bypass=clone(lockedView);bypass.locked=[];bypass.camera.focal=900;
assert.throws(()=>applyWorkbenchPacket(locked,packet(locked,{views:[bypass]})),/已鎖定/);
locked=applyWorkbenchPacket(locked,packet(locked,{views:[{...lockedView,locked:[]}]}));
locked=applyWorkbenchPacket(locked,packet(locked,{views:[bypass]}));assert.equal(locked.workbench.views[0].camera.focal,900);
const suggestions=suggestObservationTasks(modeled);assert.equal(suggestions[0].blocksOtherWork,false);
assert.deepEqual(suggestions[0].affectedEntities,[tableRef]);assert.deepEqual(suggestions[0].region,modeled.workbench.observations[0].geometry);
assert(suggestions[0].instruction.includes('下邊'));assert.deepEqual(suggestions[0].sourceIds,['source-1']);

// Crop and resize are expressed explicitly in edge-coordinate pixels, independently of source geometry.
const transform={sourceWidth:1280,sourceHeight:800,crop:{x:138,y:61,width:1004,height:597},raster:{width:502,height:298.5},units:'pixels'};
assert.deepEqual(mapImagePoints([[0,0],[251,149.25],[502,298.5]],transform),[[138,61],[640,359.5],[1142,658]]);
assert.deepEqual(mapImagePoints([[138,61],[640,359.5],[1142,658]],transform,'from-source'),[[0,0],[251,149.25],[502,298.5]]);
assert.deepEqual(mapImagePoints([[.5,.5]],{...transform,units:'normalized'}),[[640,359.5]]);
assert.throws(()=>mapImagePoints([[251,149]],{...transform,units:'normalized'}),/像素/);
assert.throws(()=>mapImagePoints([[137,61]],transform,'from-source'),/裁切/);
assert.throws(()=>mapImagePoints([[0,0]],{...transform,crop:{...transform.crop,x:1000}}),/裁切/);
assert.throws(()=>mapImagePoints([[0,0]],{...transform,units:'px'}),/單位/);

// Three independent rays from one world direction intersect at the known synthetic vanishing point.
const job=calibrationTemplate(c);job.camera.cx=120;job.camera.cy=180;
job.lines=[[[0,100],[200,200]],[[800,100],[600,200]],[[200,600],[300,450]]];
job.heldOutLines=[[[100,0],[250,150]]];job.maxResidualPx=.01;
const fit=calibrationCandidate(c,job);approx(fit.camera.cx,400);approx(fit.camera.cy,300);
assert.equal(fit.camera.focal,job.camera.focal);assert.deepEqual(fit.camera.position,job.camera.position);
assert.equal(fit.scale.status,'unknown');assert.equal(fit.fit.accepted,true);assert(fit.fit.rmsePx<1e-8);assert(fit.fit.heldOutRmsePx<1e-8);
assert.equal(job.camera.cx,120,'solver must not mutate seed');
const wrongHeldout=clone(job);wrongHeldout.heldOutLines=[[[0,0],[800,0]]];assert.equal(calibrationCandidate(c,wrongHeldout).fit.accepted,false);
const xLocked=clone(job);xLocked.camera.cx=400;xLocked.locked.push('cx');approx(calibrationCandidate(c,xLocked).camera.cy,300);
const fullyLocked=clone(job);fullyLocked.locked.push('cx','cy');const fixed=calibrationCandidate(c,fullyLocked);assert.equal(fixed.camera.cx,120);assert.equal(fixed.fit.accepted,false);
const parallel=clone(job);parallel.lines=[[[0,0],[100,100]],[[0,50],[100,150]]];assert.throws(()=>calibrationCandidate(c,parallel),/近乎平行/);
const duplicated=clone(job);duplicated.lines=[job.lines[0],job.lines[0]];assert.throws(()=>calibrationCandidate(c,duplicated),/重合/);
const reusedHeldOut=clone(job);reusedHeldOut.heldOutLines=[[[0,500],[200,400]]];assert.throws(()=>calibrationCandidate(c,reusedHeldOut),/保留驗證/);
const short=clone(job);short.lines[0]=[[0,0],[1,1]];assert.throws(()=>calibrationCandidate(c,short),/過短/);
const unprovenScale=clone(job);unprovenScale.scale.status='measured';assert.throws(()=>calibrationCandidate(c,unprovenScale),/尺度/);
const noAssumptions=clone(job);noAssumptions.assumptions=[];assert.throws(()=>calibrationCandidate(c,noAssumptions),/假設/);
const calibrated=applyWorkbenchPacket(c,packet(c,{calibrations:[job]}));assert.equal(calibrated.workbench.calibrations[0].result.fit.accepted,true);
assert.equal(calibrated.workbench.views.length,0,'candidate creation never silently adopts the camera');
const tampered=clone(calibrated);tampered.workbench.calibrations[0].result.camera.cx++;assert.throws(()=>validateWorkbench(tampered),/結果與輸入/);
const missingSource=clone(calibrated);missingSource.workbench.calibrations[0].job.sourceId='source-99';assert.throws(()=>validateWorkbench(missingSource),/來源/);

console.log('PASS capture workbench: source inventories, typed pixel geometry, strict bindings, atomic updates, stale-review invalidation, explicit crop mapping, locks, targeted capture suggestions and constrained calibration with held-out residuals');
