import {validateReferenceCamera} from '../designer/reference-camera.js';

const clone=value=>structuredClone(value);
const fail=message=>{throw new Error(message);};
const text=(value,max=1000)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const exact=(value,keys,label)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))fail(`${label}含未知或缺少欄位。`);
};
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const array=(value,max,label)=>{if(!Array.isArray(value)||value.length>max)fail(`${label}超過允許數量。`);};
const unique=(values,label)=>{if(new Set(values).size!==values.length)fail(`${label}不可重複。`);};
const id=(value,prefix)=>typeof value==='string'&&new RegExp(`^${prefix}-[a-zA-Z0-9-]{1,80}$`).test(value);
const LOCKS=['focal','cx','cy','position','target'];
const REF_KINDS=['object','wall','opening','room','element','stair','elevator','shaft','assembly','group'];
const EDGE_STATES=['visible','occluded','clipped','unknown'];
const REVIEW_KEYS=['id','observationId','viewId','result','note'];
const STORED_REVIEW_KEYS=[...REVIEW_KEYS,'revision','observationFingerprint','entityFingerprint','viewFingerprint'];
const CAMERA_KEYS=['format','version','width','height','focal','cx','cy','position','target'];

export const WORKBENCH_LIMITS=Object.freeze({observations:1000,views:200,reviews:2000,calibrations:100,points:128});
export function emptyWorkbench(){return {version:1,observations:[],views:[],reviews:[],calibrations:[],assemblies:[],relations:[]};}

function sourceFor(capture,sourceId){
 const source=capture.sources?.find(s=>s.id===sourceId);
 if(!source||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<1||source.height<1)fail('觀察來源不存在或尚無有效影像尺寸；PDF 須先登錄對應的影像尺寸。');
 return source;
}
function point(value,width,height){
 if(!Array.isArray(value)||value.length!==2||!finite(value[0],0,width)||!finite(value[1],0,height))fail('影像點必須是來源範圍內的 [x,y] 像素座標。');
}
function locks(value){array(value,LOCKS.length,'相機鎖定');unique(value,'相機鎖定');if(value.some(v=>!LOCKS.includes(v)))fail('相機鎖定欄位不在允許清單。');}
function cameraForSource(capture,sourceId,camera){
 const source=sourceFor(capture,sourceId);exact(camera,CAMERA_KEYS,'比對相機');
 const checked=validateReferenceCamera(camera);
 if(checked.width!==source.width||checked.height!==source.height)fail('相機尺寸必須與原始來源影像一致。');
 return checked;
}
function validateRef(ref){exact(ref,['levelId','kind','id'],'構件對應');if(!/^floor-[1-9][0-9]*$/.test(ref.levelId)||!REF_KINDS.includes(ref.kind)||!text(ref.id,100)||!/^[-a-zA-Z0-9]+$/.test(ref.id))fail('構件對應的樓層、類型或 ID 無效。');}
const refKey=ref=>`${ref.levelId}/${ref.kind}/${ref.id}`;
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
// A cache-invalidation fingerprint, not a cryptographic signature or an authenticity claim.
function fingerprint(value){let hash=0xcbf29ce484222325n;for(const byte of new TextEncoder().encode(canonical(value)))hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);return 'fnv1a64:'+hash.toString(16).padStart(16,'0');}
const isFingerprint=value=>typeof value==='string'&&/^fnv1a64:[a-f0-9]{16}$/.test(value);

function entitySnapshot(capture,ref,seen=new Set()){
 const key=refKey(ref);if(seen.has(key))return {cycle:key};seen.add(key);
 const scene=capture.scene,level=scene?.levels?.find(l=>l.id===ref.levelId);if(!level)return null;
 const collections={object:level.design.objects,wall:level.design.walls,opening:level.design.openings,room:level.design.rooms,element:level.elements,group:level.groups,assembly:capture.workbench?.assemblies};
 let entity;
 if(['stair','elevator','shaft'].includes(ref.kind)){
  entity=scene[{stair:'stairs',elevator:'elevators',shaft:'shafts'}[ref.kind]]?.find(e=>e.id===ref.id);
  if(entity){const indices=[entity.fromId,entity.toId,ref.levelId].map(id=>scene.levels.findIndex(l=>l.id===id));if(indices[2]<indices[0]||indices[2]>indices[1])return null;}
 }else entity=collections[ref.kind]?.find(e=>e.id===ref.id&&(ref.kind!=='assembly'||e.levelId===ref.levelId));
 if(!entity)return null;
 const dependencies=[];
 const add=(kind,id)=>{const child=entitySnapshot(capture,{levelId:ref.levelId,kind,id},seen);dependencies.push(child||{missing:`${kind}/${id}`});};
 if(ref.kind==='wall')for(const id of [entity.startId,entity.endId])dependencies.push(level.design.vertices.find(v=>v.id===id)||{missing:id});
 if(ref.kind==='opening')add('wall',entity.wallId);
 if(ref.kind==='object'&&entity.hostId)add('opening',entity.hostId);
 if(ref.kind==='object'&&entity.trace?.anchorId){const kind=['objects','walls','openings','rooms'].find(k=>level.design[k].some(e=>e.id===entity.trace.anchorId));if(kind)add({objects:'object',walls:'wall',openings:'opening',rooms:'room'}[kind],entity.trace.anchorId);}
 if(ref.kind==='room'){for(const id of entity.vertexIds)dependencies.push(level.design.vertices.find(v=>v.id===id)||{missing:id});for(const id of entity.wallIds)add('wall',id);}
 if(['group','assembly'].includes(ref.kind)){for(const id of entity.objectIds||[])add('object',id);for(const id of entity.elementIds||[])add('element',id);for(const m of entity.members||[])add(m.kind,m.id);if(!dependencies.length||dependencies.some(d=>d.missing))return null;}
 const floorHeights=scene.levels.slice(0,scene.levels.indexOf(level)+1).map(l=>({id:l.id,height:l.height}));
 return {key,entity,dependencies,floorHeights};
}
function entityFingerprint(capture,observation){if(!observation.entityRefs.length)return null;const snapshots=observation.entityRefs.map(ref=>entitySnapshot(capture,ref));return snapshots.some(s=>s===null)?null:fingerprint(snapshots);}
function observationFingerprint(capture,observation){const source=sourceFor(capture,observation.sourceId);return fingerprint({observation,source:{id:source.id,sha256:source.sha256,width:source.width,height:source.height}});}
function viewFingerprint(capture,view){const source=sourceFor(capture,view.sourceId);return fingerprint({view,source:{id:source.id,sha256:source.sha256,width:source.width,height:source.height}});}

function validateObservation(capture,observation,{requireExistingRefs=false}={}){
 exact(observation,['id','sourceId','name','semantic','geometry','visibility','basis','entityRefs','note'],'觀察項目');
 if(!id(observation.id,'observation')||!text(observation.name,120)||!text(observation.semantic,80)||typeof observation.note!=='string'||observation.note.length>2000||!['observed','inferred','user-confirmed'].includes(observation.basis))fail('觀察名稱、語意或依據無效。');
 const source=sourceFor(capture,observation.sourceId),geometry=observation.geometry;
 exact(geometry,['type','points'],'觀察幾何');array(geometry.points,WORKBENCH_LIMITS.points,'觀察點');
 if(!['point','polyline','polygon','box'].includes(geometry.type))fail('觀察幾何類型必須為 point、polyline、polygon 或 box。');
 const n=geometry.points.length;if(geometry.type==='point'&&n!==1||geometry.type==='box'&&n!==2||geometry.type==='polyline'&&n<2||geometry.type==='polygon'&&n<3)fail('觀察幾何點數不符合類型。');
 for(const p of geometry.points)point(p,source.width,source.height);
 unique(geometry.points.map(p=>p.join(',')),'觀察點');
 if(geometry.type==='box'&&(geometry.points[0][0]>=geometry.points[1][0]||geometry.points[0][1]>=geometry.points[1][1]))fail('box 須以左上、右下兩點定義非零範圍。');
 if(geometry.type==='polygon'){
  const ps=geometry.points,area=ps.reduce((sum,p,i)=>sum+p[0]*ps[(i+1)%n][1]-ps[(i+1)%n][0]*p[1],0)/2;
  if(Math.abs(area)<.01)fail('polygon 面積不可為零。');
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const onSegment=(a,b,p)=>Math.abs(cross(a,b,p))<1e-8&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
  for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;const a=ps[i],b=ps[(i+1)%n],c=ps[j],d=ps[(j+1)%n];if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b))fail('polygon 邊界不可交叉或重疊。');}
 }
 exact(observation.visibility,['overall','edges'],'可見性');
 const edges=geometry.type==='point'?0:geometry.type==='box'?4:geometry.type==='polygon'?n:n-1;
 if(!['visible','partial','occluded','unknown'].includes(observation.visibility.overall)||!Array.isArray(observation.visibility.edges)||observation.visibility.edges.length!==edges||observation.visibility.edges.some(v=>!EDGE_STATES.includes(v)))fail('可見性邊界數量或狀態錯誤；box 依上、右、下、左順序。');
 if(observation.visibility.overall==='visible'&&observation.visibility.edges.some(v=>v!=='visible'))fail('完全可見的觀察不能包含遮蔽或未知邊。');
 if(['occluded','unknown'].includes(observation.visibility.overall)&&observation.basis==='observed')fail('完全遮蔽或未知位置必須保留推論或使用者確認依據。');
 array(observation.entityRefs,200,'構件對應');for(const ref of observation.entityRefs){validateRef(ref);if(requireExistingRefs&&!entitySnapshot(capture,ref))fail(`構件對應不存在或樓層不符：${refKey(ref)}`);}unique(observation.entityRefs.map(refKey),'構件對應');
 return observation;
}
function validateView(capture,view){exact(view,['id','sourceId','name','camera','locked'],'比對視點');if(!id(view.id,'view')||!text(view.name,120))fail('比對視點 ID 或名稱無效。');cameraForSource(capture,view.sourceId,view.camera);locks(view.locked);return view;}

export function validateWorkbench(capture){
 const workbench=capture.workbench;exact(workbench,['version','observations','views','reviews','calibrations','assemblies','relations'],'重建工作狀態');if(workbench.version!==1)fail('重建工作狀態版本不支援。');
 for(const [key,max] of Object.entries(WORKBENCH_LIMITS))if(key!=='points'){array(workbench[key],max,key);unique(workbench[key].map(v=>key==='calibrations'?v?.job?.id:v?.id),key);}
 array(workbench.assemblies,100,'高階構件');array(workbench.relations,200,'空間關係');
 for(const o of workbench.observations)validateObservation(capture,o);
 for(const v of workbench.views)validateView(capture,v);
 for(const r of workbench.reviews){
  exact(r,STORED_REVIEW_KEYS,'比對紀錄');if(!id(r.id,'review')||!['pass','needs-fix'].includes(r.result)||!text(r.note,2000)||!Number.isSafeInteger(r.revision)||r.revision<0||r.revision>capture.revision||![r.observationFingerprint,r.entityFingerprint,r.viewFingerprint].every(isFingerprint))fail('比對紀錄內容或指紋無效。');
  const observation=workbench.observations.find(o=>o.id===r.observationId),view=workbench.views.find(v=>v.id===r.viewId);if(!observation||!view||observation.sourceId!==view.sourceId)fail('比對紀錄必須使用同一來源的觀察與視點。');
 }
 for(const c of workbench.calibrations){exact(c,['job','result'],'校正候選紀錄');if(canonical(calibrationCandidate(capture,c.job))!==canonical(c.result))fail('校正候選結果與輸入不一致。');}
 return workbench;
}

export function observationTemplate(sourceId='source-1'){
 return {id:'observation-1',sourceId,name:'請填入可見物件名稱',semantic:'object',geometry:{type:'box',points:[[0,0],[1,1]]},visibility:{overall:'partial',edges:['visible','visible','unknown','visible']},basis:'observed',entityRefs:[],note:'座標須改為原始來源影像像素；不可直接使用裁切圖座標。'};
}
export function viewTemplate(capture,sourceId=capture.sources?.[0]?.id){const source=sourceFor(capture,sourceId);return {id:'view-1',sourceId,name:'待校正比對視點',camera:{format:'lumiere-reference-camera',version:1,width:source.width,height:source.height,focal:Math.max(50,source.width),cx:source.width/2,cy:source.height/2,position:[0,1.6,0],target:[0,1.6,-1]},locked:[]};}
export function workbenchTemplate(capture){return {format:'lumiere-workbench',version:1,id:'workbench-'+(capture.revision+1),captureId:capture.id,baseRevision:capture.revision,observations:[],views:[],reviews:[],calibrations:[]};}

export function applyWorkbenchPacket(input,packet){
 validateWorkbench(input);exact(packet,['format','version','id','captureId','baseRevision','observations','views','reviews','calibrations'],'觀察批次');
 if(packet.format!=='lumiere-workbench'||packet.version!==1||!id(packet.id,'workbench')||packet.captureId!==input.id||packet.baseRevision!==input.revision)fail('觀察批次格式、專案或版本不符。');
 for(const key of ['observations','views','reviews','calibrations']){array(packet[key],WORKBENCH_LIMITS[key],key);unique(packet[key].map(v=>v.id),key);}
 const capture=clone(input),workbench=capture.workbench;
 const upsert=(list,item)=>{const index=list.findIndex(v=>v.id===item.id);if(index<0)list.push(clone(item));else list[index]=clone(item);};
 for(const observation of packet.observations){
  validateObservation(capture,observation,{requireExistingRefs:true});const old=workbench.observations.find(v=>v.id===observation.id);
  if(old&&old.sourceId!==observation.sourceId)fail('既有觀察 ID 不可改綁另一張來源；請另建觀察 ID。');upsert(workbench.observations,observation);
 }
 for(const view of packet.views){
  validateView(capture,view);const old=workbench.views.find(v=>v.id===view.id);
  if(old){if(old.sourceId!==view.sourceId)fail('既有視點 ID 不可改綁另一張來源。');for(const key of old.locked)if(canonical(old.camera[key])!==canonical(view.camera[key]))fail(`相機 ${key} 已鎖定；先提交只解除鎖定的修改，再調整數值。`);}
  upsert(workbench.views,view);
 }
 for(const job of packet.calibrations){const result=calibrationCandidate(capture,job),old=workbench.calibrations.find(c=>c.job.id===job.id);if(old&&canonical(old.job)!==canonical(job))fail('校正候選 ID 已使用，請以新 ID 保存另一候選。');if(!old)workbench.calibrations.push({job:clone(job),result});}
 for(const review of packet.reviews){
  exact(review,REVIEW_KEYS,'比對回報');if(!id(review.id,'review')||!['pass','needs-fix'].includes(review.result)||!text(review.note,2000))fail('比對回報須有 ID、結果與具體理由。');
  const observation=workbench.observations.find(o=>o.id===review.observationId),view=workbench.views.find(v=>v.id===review.viewId);
  if(!observation||!view||observation.sourceId!==view.sourceId)fail('比對回報須引用同一來源的既有觀察與視點。');
  const entities=entityFingerprint(capture,observation);if(!entities)fail('尚未連結有效模型構件，不能宣稱已比對。');
  const record={...clone(review),revision:capture.revision,observationFingerprint:observationFingerprint(capture,observation),entityFingerprint:entities,viewFingerprint:viewFingerprint(capture,view)};
  const old=workbench.reviews.find(r=>r.id===review.id);if(old&&canonical(old)!==canonical(record))fail('比對紀錄 ID 已使用，請另建紀錄保留修正歷程。');if(!old)workbench.reviews.push(record);
 }
 validateWorkbench(capture);return capture;
}

export function workbenchSummary(capture){
 const workbench=validateWorkbench(capture),counts={unmodeled:0,modeled:0,checked:0,'needs-fix':0};
 const observations=workbench.observations.map(observation=>{
  const entities=entityFingerprint(capture,observation),missingRefs=observation.entityRefs.filter(ref=>!entitySnapshot(capture,ref));
  const review=workbench.reviews.findLast(r=>r.observationId===observation.id),view=review&&workbench.views.find(v=>v.id===review.viewId);
  const stale=!!review&&(review.observationFingerprint!==observationFingerprint(capture,observation)||review.entityFingerprint!==entities||!view||review.viewFingerprint!==viewFingerprint(capture,view));
  const status=!observation.entityRefs.length?'unmodeled':!entities?'needs-fix':review&&(stale||review.result==='needs-fix')?'needs-fix':review?'checked':'modeled';counts[status]++;
  return {id:observation.id,sourceId:observation.sourceId,name:observation.name,semantic:observation.semantic,status,entityRefs:clone(observation.entityRefs),missingRefs:clone(missingRefs),reviewId:review?.id||null,stale,reason:status==='unmodeled'?'來源項目尚未對應模型構件。':missingRefs.length?'模型構件已刪除或樓層參照失效。':stale?'來源、觀察、相關幾何或比對相機已變更，需重新比對。':status==='needs-fix'?'最近一次比對回報仍需修正。':status==='checked'?'已有對目前版本的明確比對回報；並非自動影像準確率。':'已對應模型，尚無比對回報。'};
 });
 const sources=capture.sources.map(source=>{const rows=observations.filter(o=>o.sourceId===source.id);return {sourceId:source.id,name:source.name,total:rows.length,checked:rows.filter(o=>o.status==='checked').length,hasInventory:rows.length>0};}),unobservedSourceIds=sources.filter(s=>!s.hasInventory).map(s=>s.sourceId);
 return {total:observations.length,counts,complete:observations.length>0&&counts.checked===observations.length&&!unobservedSourceIds.length,observations,sources,unobservedSourceIds,views:workbench.views.map(v=>({id:v.id,sourceId:v.sourceId,name:v.name,locked:[...v.locked]})),calibrations:workbench.calibrations.map(c=>({id:c.result.id,sourceId:c.result.sourceId,name:c.result.name,accepted:c.result.fit.accepted,rmsePx:c.result.fit.rmsePx})),assurance:'checked 表示代理或人類提交的比對回報仍適用目前資料；完整度只涵蓋已登錄清單，不代表自動辨識所有物件、獨立量測或實景正確性認證。'};
}

export function suggestObservationTasks(capture){
 validateWorkbench(capture);const result=[];
 for(const observation of capture.workbench.observations){
  const missing=observation.visibility.edges.map((state,index)=>({state,index})).filter(e=>e.state!=='visible');
  if(!missing.length&&observation.visibility.overall==='visible')continue;
  const edgeNames=observation.geometry.type==='box'?['上','右','下','左']:observation.visibility.edges.map((_,i)=>`第 ${i+1}`);
  const names=missing.map(e=>`${edgeNames[e.index]}邊（${{occluded:'遮蔽',clipped:'超出照片',unknown:'未知'}[e.state]}）`).join('、')||'整體輪廓';
  result.push({id:'task-'+observation.id,target:observation.name,priority:'important',reason:`來源 ${observation.sourceId} 的${names}尚未確認。`,instruction:`補充能看清「${observation.name}」${names}的照片；保留現有可辨識角點作為對應。超出照片者擴大取景，遮蔽者改變拍攝角度；不可由這項建議推定安全站位。`,alternatives:'可提供同一物件的尺寸圖、使用者量測，或保留未知部分並繼續其他構件。',sourceIds:[observation.sourceId],observationIds:[observation.id],affectedEntities:clone(observation.entityRefs),region:clone(observation.geometry),blocksOtherWork:false});
 }
 return result;
}

export function mapImagePoints(points,transform,direction='to-source'){
 exact(transform,['sourceWidth','sourceHeight','crop','raster','units'],'影像座標轉換');exact(transform.crop,['x','y','width','height'],'裁切範圍');exact(transform.raster,['width','height'],'顯示影像尺寸');
 const {sourceWidth:sw,sourceHeight:sh,crop,raster,units}=transform;
 if(![sw,sh,raster.width,raster.height].every(v=>finite(v,1,40000))||!finite(crop.x,0,sw)||!finite(crop.y,0,sh)||!finite(crop.width,.001,sw)||!finite(crop.height,.001,sh)||crop.x+crop.width>sw||crop.y+crop.height>sh||!['pixels','normalized'].includes(units)||!['to-source','from-source'].includes(direction))fail('影像座標轉換的裁切範圍、尺寸、方向或單位無效。');
 array(points,1000,'轉換點');
 return points.map(p=>{
  if(direction==='to-source'){point(p,units==='normalized'?1:raster.width,units==='normalized'?1:raster.height);const x=units==='normalized'?p[0]:p[0]/raster.width,y=units==='normalized'?p[1]:p[1]/raster.height;return [crop.x+x*crop.width,crop.y+y*crop.height];}
  point(p,sw,sh);if(p[0]<crop.x||p[0]>crop.x+crop.width||p[1]<crop.y||p[1]>crop.y+crop.height)fail('來源點不在指定裁切範圍內。');return [(p[0]-crop.x)/crop.width*(units==='normalized'?1:raster.width),(p[1]-crop.y)/crop.height*(units==='normalized'?1:raster.height)];
 });
}

export function calibrationTemplate(capture,sourceId=capture.sources?.[0]?.id){
 const view=viewTemplate(capture,sourceId);
 return {id:'calibration-1',sourceId,name:'消失點相機候選',lines:[],heldOutLines:[],camera:view.camera,locked:['focal','position','target'],scale:{status:'unknown',metresPerUnit:null,note:'尚無已知尺度；相機位置與焦距是候選假設。'},assumptions:['所選線段屬於同一個平行方向。','該方向對應相機朝向，消失點可作為主點候選。','未估計鏡頭畸變；焦距與世界尺度仍需其他證據。'],maxResidualPx:5};
}
export function calibrationCandidate(capture,job){
 exact(job,['id','sourceId','name','lines','heldOutLines','camera','locked','scale','assumptions','maxResidualPx'],'校正工作');
 if(!id(job.id,'calibration')||!text(job.name,120)||!finite(job.maxResidualPx,.01,1000))fail('校正 ID、名稱或殘差容許值無效。');
 const source=sourceFor(capture,job.sourceId),camera=cameraForSource(capture,job.sourceId,job.camera);locks(job.locked);
 exact(job.scale,['status','metresPerUnit','note'],'尺度假設');if(!['unknown','assumed'].includes(job.scale.status)||!text(job.scale.note)||job.scale.status==='unknown'&&job.scale.metresPerUnit!==null||job.scale.status==='assumed'&&!finite(job.scale.metresPerUnit,.000001,1000000))fail('尺度須明確保留未知，或提供標為 assumed 的正比例與說明。');
 array(job.assumptions,20,'校正假設');if(!job.assumptions.length||job.assumptions.some(v=>!text(v)))fail('校正必須明列假設，不能宣稱唯一相機解。');
 array(job.lines,100,'校正線段');array(job.heldOutLines,100,'保留線段');if(job.lines.length<2)fail('至少需要兩條同方向且不重合的觀測線段。');
 const lineCoefficients=line=>{if(!Array.isArray(line)||line.length!==2)fail('線段須包含兩個端點。');for(const p of line)point(p,source.width,source.height);const [[x1,y1],[x2,y2]]=line,n=Math.hypot(x2-x1,y2-y1);if(n<2)fail('線段過短，至少需要 2 像素。');const a=(y1-y2)/n,b=(x2-x1)/n;return {a,b,c:a*x1+b*y1};};
 const training=job.lines.map(lineCoefficients),heldOut=job.heldOutLines.map(lineCoefficients);
 const sameLine=(a,b)=>Math.min(Math.hypot(a.a-b.a,a.b-b.b,a.c-b.c),Math.hypot(a.a+b.a,a.b+b.b,a.c+b.c))<1e-6;
 for(let i=0;i<training.length;i++)if(training.slice(0,i).some(line=>sameLine(line,training[i])))fail('校正線段重合，不能重複計入同一條線。');
 for(let i=0;i<heldOut.length;i++)if([...training,...heldOut.slice(0,i)].some(line=>sameLine(line,heldOut[i])))fail('保留驗證線段須與訓練線段及其他保留線段分開，不能使用同一直線的另一段。');
 let aa=0,ab=0,bb=0,ac=0,bc=0;for(const {a,b,c} of training){aa+=a*a;ab+=a*b;bb+=b*b;ac+=a*c;bc+=b*c;}
 const lockX=job.locked.includes('cx'),lockY=job.locked.includes('cy'),det=aa*bb-ab*ab,condition=det/((aa+bb)**2);
 if(condition<1e-6)fail('線段近乎平行或重合，消失點不穩定；請換取不同位置、具有可辨夾角的同方向線段。');
 if(!lockX&&!lockY){camera.cx=(ac*bb-bc*ab)/det;camera.cy=(bc*aa-ac*ab)/det;}
 else if(!lockX){if(aa<1e-8)fail('目前線段無法約束未鎖定的主點 X。');camera.cx=(ac-ab*camera.cy)/aa;}
 else if(!lockY){if(bb<1e-8)fail('目前線段無法約束未鎖定的主點 Y。');camera.cy=(bc-ab*camera.cx)/bb;}
 validateReferenceCamera(camera);
 const residuals=lines=>lines.map(({a,b,c})=>Math.abs(a*camera.cx+b*camera.cy-c));
 const trainingResidualsPx=residuals(training),heldOutResidualsPx=residuals(heldOut),rmse=values=>values.length?Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length):null;
 return {id:job.id,sourceId:job.sourceId,name:job.name,camera,locked:[...job.locked],scale:clone(job.scale),assumptions:[...job.assumptions],fit:{method:'parallel-direction-vanishing-point-as-principal-point',trainingResidualsPx,heldOutResidualsPx,rmsePx:rmse(trainingResidualsPx),heldOutRmsePx:rmse(heldOutResidualsPx),maxResidualPx:job.maxResidualPx,accepted:[...trainingResidualsPx,...heldOutResidualsPx].every(v=>v<=job.maxResidualPx)},limitations:['消失點作為主點僅適用已明列的相機朝向假設，不是一般單張照片完整校正。','只計算未鎖定的主點 X/Y；焦距、姿態與尺度沿用候選輸入。','線段符合不表示物件、整張照片或三維尺寸正確；仍須跨區域、跨視角核對。']};
}
