import {evidenceReview} from '../src/frontend/capture/evidence.js';
import {stereoTemplate} from '../src/frontend/capture/stereo.js';
import {ASSETS,MATERIALS} from '../src/frontend/designer/catalog.js';
import {agentCapabilities,describeScene,AgentCommandError} from '../src/frontend/capture/agent-commands.js';
import {workbenchTemplate,workbenchSummary,calibrationTemplate,calibrationCandidate,WORKBENCH_LIMITS} from '../src/frontend/capture/workbench.js';
import {semanticTemplate,semanticSummary,SEMANTIC_KINDS} from '../src/frontend/capture/semantic-assemblies.js';
import {readFile,writeFile} from 'node:fs/promises';
import * as capture from '../src/frontend/capture/capture-model.js';
const [mode,input,report,output]=process.argv.slice(2);
const modes=['guide','template','apply','preview','inspect','assets','materials','schema','capabilities','stereo-template','stereo','photo-apply','evidence-apply','evidence-template','evidence-review','workbench-template','workbench-apply','workbench-summary','semantic-template','semantic-apply','semantic-summary','calibration-template','calibration-candidate'];
const writeModes=['apply','stereo','photo-apply','evidence-apply','workbench-apply','semantic-apply'];
const usage='用法：node scripts/capture-agent.mjs capabilities | assets [assetId|category] | materials [materialId] | schema [command] | inspect input.json [levelId] [entityId] | preview input.json report.json | apply input.json report.json [output.json] | guide input.json | template input.json | workbench-template input.json | workbench-apply input.json packet.json [output.json] | workbench-summary input.json | semantic-template input.json | semantic-apply input.json packet.json [output.json] | semantic-summary input.json | calibration-template input.json [sourceId] | calibration-candidate input.json job.json | stereo-template input.json | stereo input.json job.json [output.json] | photo-apply input.json result.json [output.json] | evidence-template input.json | evidence-review input.json | evidence-apply input.json evidence.json [output.json]';
const emit=value=>console.log(JSON.stringify(value,null,2));
async function readJSON(path){
 if(!path)throw new AgentCommandError('缺少 JSON 檔案路徑。',{path:'arguments',allowed:modes});
 const raw=await readFile(path,'utf8');if(Buffer.byteLength(raw,'utf8')>capture.MAX_BYTES)throw new AgentCommandError('JSON 檔案最多 10 MB。',{code:'JSON_TOO_LARGE',path});
 try{return JSON.parse(raw);}catch(error){throw new AgentCommandError('JSON 語法錯誤：'+error.message,{code:'JSON_PARSE_ERROR',path,suggestion:'修正 JSON 語法後重試；不接受註解、尾隨逗號或非 JSON 內容。'});}
}
try{
 if(!modes.includes(mode))throw new AgentCommandError(usage,{code:'UNKNOWN_MODE',path:'mode',allowed:modes});
 if(mode==='assets'){
  const list=Object.values(ASSETS).filter(asset=>!input||asset.id===input||asset.category===input);
  if(!list.length)throw new AgentCommandError('找不到素材或分類。',{path:'assetId',allowed:Object.keys(ASSETS)});emit(list);
 }else if(mode==='materials'){
  if(input&&!Object.hasOwn(MATERIALS,input))throw new AgentCommandError('找不到材質。',{path:'materialId',allowed:Object.keys(MATERIALS)});emit(input?MATERIALS[input]:MATERIALS);
 }else if(mode==='capabilities'){
  emit({...agentCapabilities(),operations:modes,workbench:{limits:WORKBENCH_LIMITS,coordinates:'原始來源影像像素；不是裁切或螢幕座標',review:'比對結果由代理或人類明確提交；相依資料改變後會失效'},semantic:{kinds:SEMANTIC_KINDS,operations:['assembly.put','assembly.detach','assembly.delete','relation.put','relation.delete'],template:'semantic-template input.json'},calibration:{template:'calibration-template input.json [sourceId]',candidate:'calibration-candidate input.json job.json',writesCapture:false,assumptionsRequired:true},visionEngine:true,semanticRecognition:false,photoAnalysis:{entry:'scripts/capture-photos.mjs',runtime:'.venv-vision',network:false,calibrationRequiredForPose:true},geometryEngine:'rectified-sparse-stereo-v1'});
 }else if(mode==='schema'){
  const capabilities=agentCapabilities();if(input&&!Object.hasOwn(capabilities.commandSchemas,input))throw new AgentCommandError('找不到命令 schema。',{path:'command',allowed:capabilities.commands});emit(input?capabilities.commandSchemas[input]:{operation:capabilities.operation,commands:capabilities.commandSchemas,examples:capabilities.examples});
 }else {if(!input)throw new AgentCommandError(usage,{path:'input'});const state=capture.parseCapture(await readFile(input,'utf8'));let result;
  if(mode==='inspect'){const query=report?.startsWith('{')?JSON.parse(report):report?.startsWith('floor-')?{levelId:report,...(output?{id:output}:{})}:report?{id:report}:{};result={captureId:state.id,revision:state.revision,...describeScene(state.scene,query),workbenchSummary:workbenchSummary(state),semanticSummary:semanticSummary(state)};}
  else if(mode==='workbench-template')result=workbenchTemplate(state);
  else if(mode==='workbench-summary')result=workbenchSummary(state);
  else if(mode==='workbench-apply')result=capture.applyWorkbench(state,await readJSON(report));
  else if(mode==='semantic-template')result=semanticTemplate(state);
  else if(mode==='semantic-summary')result=semanticSummary(state);
  else if(mode==='semantic-apply')result=capture.applySemantic(state,await readJSON(report));
  else if(mode==='calibration-template')result=calibrationTemplate(state,report||state.sources[0]?.id);
  else if(mode==='calibration-candidate'){if(output)throw new AgentCommandError('calibration-candidate 僅回傳候選，不接受寫入路徑。',{path:'output',suggestion:'若要保留候選，將原始 job 放入 workbench packet 的 calibrations 陣列，再執行 workbench-apply。'});result=calibrationCandidate(state,await readJSON(report));}
  else if(mode==='evidence-template')result=capture.evidenceTemplate(state);
  else if(mode==='evidence-review')result=evidenceReview(state);
  else if(mode==='evidence-apply')result=capture.applyEvidence(state,await readJSON(report));
  else if(mode==='photo-apply')result=capture.applyPhotoAnalysis(state,await readJSON(report));
  else if(mode==='stereo-template')result=stereoTemplate(state);
  else if(mode==='stereo')result=capture.applyStereo(state,await readJSON(report));
  else if(mode==='guide')result=capture.guide(state);
  else if(mode==='template')result=capture.reportTemplate(state);
  else if(mode==='apply')result=capture.applyReport(state,await readJSON(report));
  else if(mode==='preview'){
   if(output)throw new AgentCommandError('preview 僅回傳結果，不接受寫入路徑。',{path:'output',suggestion:'使用標準輸出檢查結果，再以 apply input.json report.json new-output.json 寫入新檔。'});
   const detail=capture.applyReportDetailed(state,await readJSON(report));result={ok:true,preview:true,captureId:state.id,baseRevision:state.revision,nextRevision:detail.capture.revision,bindings:detail.bindings,results:detail.results,diff:detail.diff,scene:describeScene(detail.capture.scene)};
  }
  const data=JSON.stringify(result,null,2)+'\n';if(writeModes.includes(mode)&&output)await writeFile(output,data,{flag:'wx'});else process.stdout.write(data);
 }
}catch(error){const detail=error instanceof AgentCommandError?error.toJSON():{code:error.code||'CAPTURE_OPERATION_FAILED',operationIndex:error.operationIndex??null,command:error.command??null,field:error.field??null,path:error.path??null,reason:error.message,allowed:error.allowed??null,suggestion:'檢查檔案格式、captureId、baseRevision 與來源／證據約束，再重試；未寫入原檔。'};console.error(JSON.stringify({ok:false,error:detail},null,2));process.exitCode=1;}
