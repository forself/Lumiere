import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fromSingle,validateBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {ASSETS} from '../src/frontend/designer/catalog.js';
import {runAgentOperations,describeScene,agentCapabilities,COMMAND_TYPES,AgentCommandError} from '../src/frontend/capture/agent-commands.js';
import * as capture from '../src/frontend/capture/capture-model.js';
import {observationTemplate,viewTemplate} from '../src/frontend/capture/workbench.js';

const op=(command,bind,levelId='floor-1')=>({levelId,sourceIds:['source-1'],basis:'inferred',command,...(bind?{bind}:{})});
const initial=fromSingle(emptyProject()),before=JSON.stringify(initial);
const batch=[
 op({type:'addRoom',x:-5,z:-4,width:10,depth:8},'room'),
 op({type:'addOpening',wallId:'$room.wallIds.0',kind:'window',at:.5},'window'),
 op({type:'dimensions',id:'$window',width:2.4,height:1.4,sill:.8}),
 op({type:'openingStyle',id:'$window',styleId:'window-transom-awning'}),
 op({type:'material',id:'$room',materialId:'oak'}),
 op({type:'addObject',assetId:'placeholder-box',x:1,z:1},'box'),
 op({type:'prop.configure',id:'$box',width:2,color:'#ffcc00',label:'前景桌面'}),
 op({type:'rotateObject',id:'$box'}),
 op({type:'addObject',assetId:'bowl',x:1,z:1,elevation:.8},'bowl'),
 op({type:'group.save',id:'new',name:'桌面配置',ids:['$box','$bowl']},'group')
];
const result=runAgentOperations(initial,batch),design=result.scene.levels[0].design;
assert.equal(JSON.stringify(initial),before,'成功批次也不可修改輸入');
assert.equal(result.bindings.room.id,design.rooms[0].id);
assert.equal(result.bindings.window.id,design.openings[0].id);
assert.deepEqual(result.bindings.room.wallIds,design.rooms[0].wallIds);
assert.equal(design.openings[0].styleId,'window-transom-awning');
assert.equal(design.openings[0].width,2.4);assert.equal(design.rooms[0].materialId,'oak');
assert.equal(design.objects[0].rotation,90);assert.equal(design.objects[0].width,2);
assert.equal(design.objects[0].depth,ASSETS['placeholder-box'].depth,'部分更新保留其他尺寸');
assert.equal(design.objects[0].prop.color,'#ffcc00');assert.equal(design.objects[0].prop.label,'前景桌面');
assert.equal(result.results[1].createdIds.openings[0],result.bindings.window.id);
assert.equal(result.diff.added.filter(e=>e.kind==='objects').length,2);
assert.equal(result.scene.levels[0].groups[0].objectIds[0],result.bindings.box.id);
assert.deepEqual(validateBuilding(result.scene),result.scene);

function rejects(operations,index,predicate){
 let error;try{runAgentOperations(initial,operations);}catch(e){error=e;}
 assert(error instanceof AgentCommandError);assert.equal(error.operationIndex,index);assert(predicate(error),JSON.stringify(error));
 assert.equal(JSON.stringify(initial),before,'失敗批次必須保留原場景');return error;
}
rejects([batch[0],op({type:'addRoom',x:100,z:0,width:4,depth:5})],1,e=>e.code==='SCENE_CONSTRAINT'&&!!e.suggestion);
rejects([batch[0],op({type:'addObject',assetId:'sofa',x:0,z:0,hiddenWrite:true})],1,e=>e.field==='hiddenWrite'&&e.allowed.includes('assetId'));
rejects([op({type:'moveObject',id:'$notCreated',x:0,z:0})],0,e=>e.path==='operations.0.command.id'&&/別名/.test(e.reason));
rejects([batch[0],op({type:'material',id:'$room.constructor',materialId:'oak'})],1,e=>/路徑/.test(e.reason));
rejects([batch[0],{...batch[1],bind:'room'}],1,e=>e.field==='bind');
rejects([op({type:'addRoom',x:'0',z:0,width:4,depth:4})],0,e=>e.field==='x');
rejects([op(JSON.parse('{"type":"addRoom","x":0,"z":0,"width":4,"depth":4,"__proto__":{"polluted":true}}'))],0,e=>/原型/.test(e.reason));
let getterCalled=false;const malicious={levelId:'floor-1',get command(){getterCalled=true;throw Error('不應執行 getter');}};
rejects([malicious],0,e=>/getter/.test(e.reason));assert.equal(getterCalled,false);
assert.equal({}.polluted,undefined);
rejects([op({type:'floor.add'},'constructor')],0,e=>e.field==='bind');
rejects([op({type:'addPolygon',points:[{x:0,z:0,extra:1},{x:4,z:0},{x:0,z:4}]})],0,e=>e.field==='extra');
rejects([op({type:'addObject',assetId:'not-an-asset',x:0,z:0})],0,e=>e.field==='assetId'&&e.allowed.includes('sofa'));

const removed=runAgentOperations(result.scene,[op({type:'group.delete',id:result.bindings.group.id}),op({type:'delete',id:result.bindings.box.id}),op({type:'moveObject',id:result.bindings.bowl.id,x:2,z:2}),op({type:'dimensions',id:result.bindings.window.id,width:2})]);
assert.equal(removed.scene.levels[0].groups.length,0);assert.equal(removed.scene.levels[0].design.objects.length,1);
assert(removed.diff.removed.some(e=>e.id===result.bindings.box.id&&e.kind==='objects'));
assert(removed.diff.updated.some(e=>e.id===result.bindings.bowl.id&&e.fields.includes('x')));
assert.equal(removed.scene.levels[0].design.openings[0].height,1.4);
assert.throws(()=>runAgentOperations(result.scene,[op({type:'element.delete',id:result.bindings.box.id})]),e=>e instanceof AgentCommandError&&/elements/.test(e.reason));

const floors=runAgentOperations(initial,[batch[0],op({type:'addObject',assetId:'table',x:0,z:0},'original'),op({type:'floor.add',copy:true},'upstairs'),op({type:'floor.update',name:'二樓'},undefined,'$upstairs'),op({type:'addObject',assetId:'chair',x:2,z:1},'chair','$upstairs')]);
assert.equal(floors.bindings.upstairs.id,'floor-2');assert.equal(floors.bindings.chair.levelId,'floor-2');assert.equal(floors.scene.levels[1].name,'二樓');
assert.throws(()=>runAgentOperations(initial,[batch[0],op({type:'addObject',assetId:'table',x:0,z:0},'table'),op({type:'floor.add',copy:true},'second'),op({type:'moveObject',id:'$table',x:1,z:0},undefined,'$second')]),e=>e.operationIndex===3&&/樓層|floor-1/.test(e.reason));
assert.throws(()=>describeScene(floors.scene,{id:'object-1'}),/多個樓層/);
const item=describeScene(floors.scene,{id:'object-1',levelId:'floor-1'});assert.equal(item.asset.id,'table');
const summary=describeScene(floors.scene,{levelId:'floor-2'});assert.equal(summary.levels.length,1);assert.equal(summary.levels[0].counts.objects,2);
assert.throws(()=>describeScene(floors.scene,{id:'object-1',levelId:'floor-1',raw:true}),/不支援欄位/);

// Existing reports without bind or aliases retain the same operation shape.
const legacy=runAgentOperations(initial,[op({type:'addRoom',x:0,z:0,width:4,depth:4})]);assert.equal(legacy.scene.levels[0].design.rooms.length,1);
const caps=agentCapabilities();assert.equal(caps.commands.length,COMMAND_TYPES.length);assert.equal(caps.commandSchemas['prop.configure'].additionalProperties,false);
assert.deepEqual(caps.commandSchemas['prop.configure'].required,['type','id']);
runAgentOperations(initial,caps.examples);

const cli=(args)=>spawnSync(process.execPath,['scripts/capture-agent.mjs',...args],{encoding:'utf8',maxBuffer:8*1024*1024});
const assets=cli(['assets','bowl']);assert.equal(assets.status,0,assets.stderr);assert.equal(JSON.parse(assets.stdout)[0].prop,true);
const schema=cli(['schema','group.save']);assert.equal(schema.status,0,schema.stderr);assert(JSON.parse(schema.stdout).required.includes('ids'));
const badMode=cli(['unknown-mode']);assert.equal(badMode.status,1);assert.equal(JSON.parse(badMode.stderr).error.code,'UNKNOWN_MODE');

// Full capture-level preview must run the same revision/provenance guards as apply.
assert.equal(typeof capture.applyReportDetailed,'function','capture-model 必須整合 detailed 原子介面');
const temp=await mkdtemp(join(tmpdir(),'lumiere-agent-commands-'));
try{
 let state=capture.addSource(capture.newCapture('capture-agent-tests'),{name:'室內.png',sha256:'a'.repeat(64),bytes:100,mime:'image/png',width:1280,height:720,kind:'photo',target:'客廳',view:'入口向內',capturedAt:'2026-11-08'});
 const report=capture.reportTemplate(state);report.summary='代理介面整合測試';report.operations=batch;
 const statePath=join(temp,'capture.json'),reportPath=join(temp,'report.json'),outPath=join(temp,'result.json');
 await writeFile(statePath,JSON.stringify(state));await writeFile(reportPath,JSON.stringify(report));const original=await readFile(statePath,'utf8');
 const preview=cli(['preview',statePath,reportPath]);assert.equal(preview.status,0,preview.stderr);const p=JSON.parse(preview.stdout);assert.equal(p.preview,true);assert.equal(p.bindings.box.id,'object-1');assert.equal(p.nextRevision,state.revision+1);assert.equal(await readFile(statePath,'utf8'),original);
 const applied=cli(['apply',statePath,reportPath,outPath]);assert.equal(applied.status,0,applied.stderr);const appliedState=capture.parseCapture(await readFile(outPath,'utf8'));assert.equal(appliedState.scene.levels[0].design.objects.length,2);
 const refuseOverwrite=cli(['apply',statePath,reportPath,statePath]);assert.equal(refuseOverwrite.status,1);assert.equal(JSON.parse(refuseOverwrite.stderr).error.code,'EEXIST');assert.equal(await readFile(statePath,'utf8'),original);
 const inspect=cli(['inspect',outPath,'floor-1',p.bindings.box.id]);assert.equal(inspect.status,0,inspect.stderr);assert.equal(JSON.parse(inspect.stdout).value.prop.label,'前景桌面');
 assert.equal(JSON.parse(inspect.stdout).workbenchSummary.total,0);assert.deepEqual(JSON.parse(inspect.stdout).semanticSummary.assemblies,[]);
 const workbenchTemplate=cli(['workbench-template',outPath]);assert.equal(workbenchTemplate.status,0,workbenchTemplate.stderr);const wp=JSON.parse(workbenchTemplate.stdout);
 const observation=observationTemplate('source-1');observation.name='桌面可見區';observation.geometry.points=[[500,300],[700,500]];observation.entityRefs=[{levelId:'floor-1',kind:'object',id:p.bindings.box.id}];
 const view=viewTemplate(appliedState);wp.observations=[observation];wp.views=[view];wp.reviews=[{id:'review-cli-test',observationId:observation.id,viewId:view.id,result:'pass',note:'測試提交的比對紀錄；不是實際照片辨識驗證。'}];
 const calibration=cli(['calibration-template',outPath,'source-1']);assert.equal(calibration.status,0,calibration.stderr);const job=JSON.parse(calibration.stdout);job.lines=[[[100,100],[640,360]],[[1000,100],[640,360]]];job.heldOutLines=[[[200,600],[640,360]]];
 const jobPath=join(temp,'calibration.json');await writeFile(jobPath,JSON.stringify(job));const candidate=cli(['calibration-candidate',outPath,jobPath]);assert.equal(candidate.status,0,candidate.stderr);assert.equal(JSON.parse(candidate.stdout).fit.accepted,true);wp.calibrations=[job];
 const wpPath=join(temp,'workbench.json'),wbPath=join(temp,'with-workbench.json');await writeFile(wpPath,JSON.stringify(wp));const workbench=cli(['workbench-apply',outPath,wpPath,wbPath]);assert.equal(workbench.status,0,workbench.stderr);
 const ws=cli(['workbench-summary',wbPath]);assert.equal(ws.status,0,ws.stderr);const wsResult=JSON.parse(ws.stdout);assert.equal(wsResult.counts.checked,1);assert.equal(wsResult.calibrations[0].accepted,true);
 const semanticPacket=cli(['semantic-template',statePath]);assert.equal(semanticPacket.status,0,semanticPacket.stderr);const semPath=join(temp,'semantic.json'),semOut=join(temp,'with-semantic.json');await writeFile(semPath,semanticPacket.stdout);
 const semantic=cli(['semantic-apply',statePath,semPath,semOut]);assert.equal(semantic.status,0,semantic.stderr);const ss=cli(['semantic-summary',semOut]);assert.equal(ss.status,0,ss.stderr);assert.equal(JSON.parse(ss.stdout).assemblies[0].status,'intact');
 const invalidPacket={...wp,unknown:true};await writeFile(wpPath,JSON.stringify(invalidPacket));const rejectedWorkbench=cli(['workbench-apply',outPath,wpPath]);assert.equal(rejectedWorkbench.status,1);assert.match(JSON.parse(rejectedWorkbench.stderr).error.reason,/欄位/);
 await writeFile(wpPath,'{"invalid":}');const invalidJson=cli(['workbench-apply',outPath,wpPath]);assert.equal(invalidJson.status,1);assert.equal(JSON.parse(invalidJson.stderr).error.code,'JSON_PARSE_ERROR');
 assert.equal(await readFile(statePath,'utf8'),original);
 const stale={...report,id:report.id+'-stale',baseRevision:state.revision+1};await writeFile(reportPath,JSON.stringify(stale));const conflict=cli(['preview',statePath,reportPath]);assert.equal(conflict.status,1);assert.match(JSON.parse(conflict.stderr).error.reason,/版本/);assert.equal(await readFile(statePath,'utf8'),original);
}finally{const absolute=resolve(temp);assert(absolute.startsWith(resolve(tmpdir())));await rm(absolute,{recursive:true,force:true});}
console.log('PASS capture agent commands: aliases, atomic execution, scoped IDs, strict fields/prototypes, patches, delete/diff, full specifications, CLI preview/workbench/semantic/calibration/revision/no-overwrite');
