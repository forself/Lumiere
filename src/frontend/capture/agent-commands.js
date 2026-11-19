import {applyBuildingCommand,validateBuilding} from '../designer/building-model.js';
import {ASSETS,MATERIALS,ASSET_CATEGORIES} from '../designer/catalog.js';
import {OPENING_STYLES} from '../designer/openings.js';
import {LIMITS,RAIL_STYLES,wallFrame,objectPose} from '../designer/model.js';
import {ELEMENT_LABELS,ELEMENT_MATERIAL_IDS} from '../designer/elements.js';

// This registry is intentionally explicit. A new editor command is not an agent
// capability until its accepted fields and input contract are registered here.
const specs={
 addRoom:['x z width depth autoJoin','x z width depth'],
 addPolygon:['points autoJoin','points'],
 'wall.add':['start end height thickness materialId wallType railStyle','start end height thickness materialId'],
 'wall.translate':['id dx dz','id dx dz'],
 'floorArea.add':['points name materialId roomType','points'],
 'floorArea.translate':['id dx dz','id dx dz'],
 attachRoom:['wallId depth','wallId depth'],attachBalcony:['wallId depth','wallId depth'],
 addOpening:['wallId kind at','wallId kind at'],addObject:['assetId x z hostId elevation tracePlacement','assetId x z'],
 moveObject:['id x z','id x z'],moveVertex:['id x z','id x z'],moveOpening:['id at','id at'],
 rotateObject:['id','id'],dimensions:['id width height depth sill elevation','id'],
 material:['id materialId','id materialId'],openingStyle:['id styleId','id styleId'],railStyle:['id styleId','id styleId'],
 flipOpening:['id','id'],toggleDoor:['id','id'],toggleOpening:['id','id'],delete:['id','id'],
 'wall.move':['id distance','id distance'],'wall.split':['id distance','id distance'],'wall.merge':['vertexId','vertexId'],
 'wall.constraint':['id locked','id locked'],'vertex.solve':['id x z orthogonal','id x z'],
 'prop.configure':['id x z elevation rotation width depth height color pitch roll label','id'],
 'sector.configure':['id startAngle endAngle','id startAngle endAngle'],
 'trace.configure':['id x z elevation rotation anchorId pitch roll label','id'],
 'outdoor.configure':['id marking signal direction lampCount','id'],
 'label.set':['id text','id text'],'surface.load':['id value','id value'],
 mediaSettings:['id screenId speakerId throwRatio','id'],displaySize:['id inches','id inches'],
 bindDevice:['id channel targetId','id channel targetId'],toggleAppliance:['id','id'],
 deviceControl:['id channel value','id channel value'],installation:['id value','id value'],
 'objects.batch':['ids action dx dz mode axis','ids action'],'objects.paste':['objects dx dz','objects dx dz'],
 'group.save':['id name ids','id name ids'],'group.delete':['id','id'],'editor.set':['flag value ids','flag value ids'],
 'element.add':['kind x z width depth height elevation rotation materialId canopy','kind x z width depth height elevation rotation materialId'],
 'element.update':['id x z width depth height elevation rotation materialId','id'],'element.delete':['id','id'],
 'canopy.configure':['id width depth clearance slope materialId','id width depth clearance slope materialId'],'canopy.detach':['id','id'],
 'shaft.add':['toId x z width depth','toId x z width depth'],'shaft.update':['id toId x z width depth','id'],'shaft.delete':['id','id'],
 'zone.assign':['id roomId name kind','id roomId name kind'],'zone.unassign':['roomId','roomId'],
 'zone.move':['id dx dz','id dx dz'],'zone.copy':['id name dx dz','id name dx dz'],
 'lift.add':['toId x z width depth style','toId x z width depth style'],'lift.update':['id toId x z width depth style','id'],'lift.delete':['id','id'],
 'stair.add':['x z width length rotation layout finish wallMode wallHandrail','x z width length rotation'],
 'stair.update':['id x z width length rotation layout finish wallMode wallHandrail','id'],'stair.delete':['id','id'],
 'floor.select':['id','id'],'floor.add':['copy linked',''],'floor.detach':['',''],'floor.update':['name height',''],'floor.delete':['',''],
 'semi.register':['value','value'],'semi.update':['id kind x z width depth clearance spacing','id'],
 'semi.detach':['id','id'],'semi.delete':['id','id']
};
const words=s=>s?s.split(' '):[];
export const COMMAND_TYPES=Object.freeze(Object.keys(specs));
export const COMMAND_FIELDS=Object.freeze(Object.fromEntries(Object.entries(specs).map(([key,[fields]])=>[key,Object.freeze(words(fields))])));
const forbidden=new Set(['__proto__','prototype','constructor']);
const numberFields=new Set(words('x z width depth height thickness sill elevation rotation pitch roll at distance inches throwRatio channel lampCount dx dz length clearance slope spacing startAngle endAngle'));
const booleanFields=new Set(words('autoJoin locked orthogonal copy linked'));
const idFields=new Set(words('id wallId roomId vertexId hostId anchorId screenId speakerId targetId toId levelId'));
const nullableIds=new Set(words('hostId anchorId screenId speakerId targetId'));
const localKinds=['vertices','walls','rooms','openings','objects','elements','groups','zones','assemblies'];
const globalKinds=['stairs','elevators','shafts'];
const operationFields=['levelId','sourceIds','basis','command','bind'];
const clone=x=>structuredClone(x);
const own=(o,k)=>Object.hasOwn(o,k);

export class AgentCommandError extends Error{
 constructor(reason,detail={}){super(reason);this.name='AgentCommandError';Object.assign(this,{code:'INVALID_AGENT_COMMAND',operationIndex:null,command:null,field:null,path:null,reason,allowed:null,suggestion:null},detail);}
 toJSON(){return {code:this.code,operationIndex:this.operationIndex,command:this.command,field:this.field,path:this.path,reason:this.reason,allowed:this.allowed,suggestion:this.suggestion};}
}
const invalid=(reason,path,allowed=null)=>{throw new AgentCommandError(reason,{path,field:path?.split('.').at(-1)||null,allowed});};
function assertPlain(value,path){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid('必須是普通 JSON 物件。',path);}
function safeJSON(value,path,seen=new Set(),depth=0){
 if(depth>32)invalid('JSON 巢狀深度不得超過 32。',path);
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value))invalid('必須是有限數值。',path);return;}
 if(typeof value!=='object')invalid('僅接受 JSON 值。',path);
 if(seen.has(value))invalid('JSON 不可循環參照。',path);seen.add(value);
 if(!Array.isArray(value))assertPlain(value,path);
 for(const key of Reflect.ownKeys(value)){
  if(typeof key!=='string'||forbidden.has(key))invalid('禁止原型或非 JSON 欄位。',`${path}.${String(key)}`);
  if(Array.isArray(value)&&key==='length')continue;
  if(Array.isArray(value)&&! /^(0|[1-9][0-9]*)$/.test(key))invalid('陣列不得包含具名欄位。',`${path}.${key}`);
  const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!own(d,'value'))invalid('JSON 欄位不可使用 getter／setter。',`${path}.${key}`);
  safeJSON(d.value,`${path}.${key}`,seen,depth+1);
 }
 seen.delete(value);
}
function exactAllowed(value,allowed,path,required=[]){
 assertPlain(value,path);for(const key of Object.keys(value))if(!allowed.includes(key))invalid(`不支援欄位 ${key}。`,`${path}.${key}`,allowed);
 for(const key of required)if(!own(value,key))invalid(`缺少必要欄位 ${key}。`,`${path}.${key}`,required);
}
function scalar(value,key,path){
 if(numberFields.has(key)){if(typeof value!=='number'||!Number.isFinite(value))invalid('必須是有限數值，不接受數字字串。',path);}
 else if(booleanFields.has(key)){if(typeof value!=='boolean')invalid('必須是布林值。',path);}
 else if(idFields.has(key)){if(value===null&&nullableIds.has(key))return;if(typeof value!=='string'||!value.length||value.length>128)invalid('ID 須為 1–128 字字串或已建立的 $別名。',path);}
 else if(!['points','start','end','tracePlacement','canopy','objects','ids','value'].includes(key)&&typeof value!=='string')invalid('必須是字串。',path);
}
function validateCommand(c,path){
 assertPlain(c,path);if(typeof c.type!=='string'||!own(specs,c.type))invalid('未登錄的代理命令。',`${path}.type`,COMMAND_TYPES);
 exactAllowed(c,['type',...COMMAND_FIELDS[c.type]],path,['type',...words(specs[c.type][1])]);
 for(const [key,value]of Object.entries(c))if(key!=='type')scalar(value,key,`${path}.${key}`);
 for(const key of ['ids'])if(own(c,key)){if(!Array.isArray(c[key])||!c[key].length||c[key].length>1000)invalid('ID 清單須有 1–1000 個項目。',`${path}.${key}`);c[key].forEach((id,i)=>scalar(id,'id',`${path}.${key}.${i}`));if(new Set(c[key]).size!==c[key].length)invalid('ID 清單不可重複。',`${path}.${key}`);}
 if(own(c,'points')){const max=c.type==='floorArea.add'?64:16;if(!Array.isArray(c.points)||c.points.length<3||c.points.length>max)invalid(`輪廓須有 3–${max} 個角點。`,`${path}.points`);c.points.forEach((p,i)=>{exactAllowed(p,['x','z'],`${path}.points.${i}`,['x','z']);for(const k of ['x','z'])scalar(p[k],k,`${path}.points.${i}.${k}`);});}
 for(const field of ['start','end'])if(own(c,field)){exactAllowed(c[field],['x','z'],`${path}.${field}`,['x','z']);for(const k of ['x','z'])scalar(c[field][k],k,`${path}.${field}.${k}`);}
 for(const [key,fields]of [['tracePlacement',words('elevation rotation anchorId pitch roll')],['canopy',words('wallId at side slope')]])if(own(c,key)){exactAllowed(c[key],fields,`${path}.${key}`,fields);for(const [k,v]of Object.entries(c[key]))if(k==='side'){if(![-1,1].includes(v))invalid('側向須為 -1 或 1。',`${path}.${key}.${k}`,[-1,1]);}else if(!(key==='canopy'&&k==='wallId'&&v===null))scalar(v,k,`${path}.${key}.${k}`);}
 if(c.type==='surface.load'&&c.value!==null){const fields=words('kind color fill width depth thickness x z shape');exactAllowed(c.value,fields,`${path}.value`,fields);}
 if(c.type==='semi.register'){const fields=words('kind x z width depth clearance spacing elementIds objectIds');exactAllowed(c.value,fields,`${path}.value`,fields);for(const k of ['elementIds','objectIds']){if(!Array.isArray(c.value[k]))invalid('成員須為 ID 清單。',`${path}.value.${k}`);c.value[k].forEach((v,i)=>scalar(v,'id',`${path}.value.${k}.${i}`));}}
 if(c.type==='objects.paste'&&(!Array.isArray(c.objects)||!c.objects.length||c.objects.length>LIMITS.objects))invalid('剪貼物件清單為空或超過上限。',`${path}.objects`);
 if(c.type==='editor.set'&&typeof c.value!=='boolean')invalid('必須是布林值。',`${path}.value`);
 if(c.type==='deviceControl'&&(typeof c.value!=='number'||!Number.isInteger(c.value)))invalid('控制值須為整數。',`${path}.value`);
 if(c.type==='installation'&&!['exposed','concealed'].includes(c.value))invalid('管線須為明管或暗管。',`${path}.value`,['exposed','concealed']);
 const enums={
  'addOpening.kind':['door','window'],'element.add.kind':Object.keys(ELEMENT_LABELS),
  'wall.add.wallType':['wall','rail'],'wall.add.railStyle':Object.keys(RAIL_STYLES),'floorArea.add.roomType':['room','balcony'],
  'objects.batch.action':['move','rotate','align','distribute'],'objects.batch.mode':['left','right','front','back','center-x','center-z'],
  'objects.batch.axis':['x','z'],'editor.set.flag':['locked','hidden'],'zone.assign.kind':['unit','public','service']
 };
 for(const [key,value]of Object.entries(c)){const allowed=enums[`${c.type}.${key}`];if(allowed&&!allowed.includes(value))invalid('不支援的選項。',`${path}.${key}`,allowed);}
 if(c.type==='objects.batch'){const required={move:['dx','dz'],align:['mode'],distribute:['axis'],rotate:[]}[c.action];for(const key of required)if(!own(c,key))invalid('此批次動作缺少必要欄位。',`${path}.${key}`,required);}
 if(own(c,'assetId')&&!own(ASSETS,c.assetId))invalid('素材未登錄，請查詢 assets。',`${path}.assetId`,Object.keys(ASSETS));
 if(own(c,'materialId')&&!own(MATERIALS,c.materialId))invalid('材質未登錄，請查詢 materials。',`${path}.materialId`,Object.keys(MATERIALS));
 if(own(c,'materialId')&&['element.add','element.update','canopy.configure'].includes(c.type)&&!ELEMENT_MATERIAL_IDS.includes(c.materialId))invalid('此建築構件不適用僅限空間地板的材質。',`${path}.materialId`,ELEMENT_MATERIAL_IDS);
 if(c.type==='openingStyle'&&!own(OPENING_STYLES,c.styleId))invalid('門窗樣式未登錄。',`${path}.styleId`,Object.keys(OPENING_STYLES));
 if(c.type==='railStyle'&&!own(RAIL_STYLES,c.styleId))invalid('欄杆樣式未登錄。',`${path}.styleId`,Object.keys(RAIL_STYLES));
}

function allEntities(scene){
 const result=[];
 for(const l of scene.levels){
  const {design,elements,groups,zones,assemblies,...metadata}=l;
  result.push({kind:'levels',id:l.id,levelId:l.id,value:metadata});
  for(const kind of localKinds)for(const value of (l[kind]||design[kind]||[]))result.push({kind,id:value.id,levelId:l.id,value});
 }
 for(const kind of globalKinds)for(const value of scene[kind])result.push({kind,id:value.id,levelId:null,value});
 return result;
}
const entityKey=e=>`${e.levelId||''}/${e.kind}/${e.id}`;
function sceneDiff(before,after){
 const a=new Map(allEntities(before).map(e=>[entityKey(e),e])),b=new Map(allEntities(after).map(e=>[entityKey(e),e]));
 const added=[],removed=[],updated=[];
 for(const [key,e]of b){const old=a.get(key);if(!old)added.push(clone(e));else if(JSON.stringify(old.value)!==JSON.stringify(e.value)){const fields=[...new Set([...Object.keys(old.value),...Object.keys(e.value)])].filter(k=>JSON.stringify(old.value[k])!==JSON.stringify(e.value[k]));updated.push({kind:e.kind,id:e.id,levelId:e.levelId,fields,before:clone(old.value),after:clone(e.value)});}}
 for(const [key,e]of a)if(!b.has(key))removed.push(clone(e));
 return {added,updated,removed,activeLevelId:{before:before.activeLevelId,after:after.activeLevelId}};
}
function findEntity(scene,id,levelId){return allEntities(scene).find(e=>e.id===id&&(e.levelId===levelId||e.levelId===null));}
function resolveRef(value,bindings,path,scope,{global=false,level=false}={}){
 if(typeof value!=='string'||!value.startsWith('$'))return value;
 const parts=value.slice(1).split('.');if(parts.some(p=>forbidden.has(p)||! /^(?:[A-Za-z][A-Za-z0-9_]*|0|[1-9][0-9]*)$/.test(p)))invalid('別名路徑無效。',path);
 const bound=bindings[parts.shift()];if(!bound)invalid('別名尚未建立；bind 必須出現在引用之前。',path,Object.keys(bindings));
 let target=bound;for(const part of parts){if(!target||typeof target!=='object'||!own(target,part))invalid('別名欄位不存在。',path);target=target[part];}
 if(target===bound)target=bound.id;
 if(typeof target!=='string'||!target.length)invalid('別名必須解析為單一 ID。',path);
 if(!global&&!level&&bound.levelId&&bound.levelId!==scope)invalid(`別名屬於 ${bound.levelId}，目前操作位於 ${scope}。`,path,null);
 return target;
}
function resolveCommand(c,bindings,scope,path){
 const result=clone(c),globalCommand=/^(stair|lift|shaft)\./.test(c.type);
 for(const key of Object.keys(result)){
  if(idFields.has(key))result[key]=resolveRef(result[key],bindings,`${path}.${key}`,scope,{global:key==='id'&&globalCommand,level:key==='toId'||key==='id'&&c.type==='floor.select'});
  if(key==='ids')result.ids=result.ids.map((v,i)=>resolveRef(v,bindings,`${path}.ids.${i}`,scope));
 }
 for(const key of ['canopy','tracePlacement'])if(result[key])for(const field of Object.keys(result[key]))if(idFields.has(field))result[key][field]=resolveRef(result[key][field],bindings,`${path}.${key}.${field}`,scope);
 if(c.type==='semi.register')for(const key of ['elementIds','objectIds'])result.value[key]=result.value[key].map((v,i)=>resolveRef(v,bindings,`${path}.value.${key}.${i}`,scope));
 return result;
}
function patchCommand(scene,c,path){
 const l=scene.levels.find(l=>l.id===scene.activeLevelId),found=c.id?findEntity(scene,c.id,l.id):null,item=found?.value;
 if(c.id&&c.id!=='new'&&!item&&c.type!=='floor.select')invalid('指定的元件不存在於此樓層；請先 inspect 確認 ID。',`${path}.id`);
 const expected={element:'elements',canopy:'elements',group:'groups',zone:'zones',semi:'assemblies',stair:'stairs',lift:'elevators',shaft:'shafts'}[c.type.split('.')[0]];
 if(c.id&&item&&expected&&found.kind!==expected)invalid(`此命令須指定 ${expected}，實際元件屬於 ${found.kind}。`,`${path}.id`,[expected]);
 let defaults={};
 if(c.type==='floor.update')defaults={name:l.name,height:l.height};
 if(item){
  if(c.type==='dimensions')defaults=found.kind==='walls'?{width:wallFrame(l.design,item).length,depth:item.thickness,height:item.height}:Object.fromEntries(['width','depth','height','sill','elevation'].filter(k=>own(item,k)).map(k=>[k,item[k]]));
  if(c.type==='prop.configure')defaults={...item,...item.prop};
  if(c.type==='trace.configure')defaults={...objectPose(l.design,item),...item.trace};
  if(c.type==='outdoor.configure')defaults={...item.outdoor};
  if(c.type==='mediaSettings')defaults={...item.media};
  if(['element.update','shaft.update','lift.update','stair.update','semi.update'].includes(c.type))defaults=item;
 }
 const allowed=COMMAND_FIELDS[c.type];return {...Object.fromEntries(Object.entries(defaults).filter(([key])=>allowed.includes(key))),...c};
}
function bindingFor(c,step,scene,scope){
 const primaryKinds={addRoom:'rooms',addPolygon:'rooms','floorArea.add':'rooms','wall.add':'walls',attachRoom:'rooms',attachBalcony:'rooms',addOpening:'openings',addObject:'objects','floor.add':'levels','group.save':'groups','zone.assign':'zones','zone.copy':'zones','element.add':'elements','shaft.add':'shafts','lift.add':'elevators','stair.add':'stairs','semi.register':'assemblies'};
 const expected=primaryKinds[c.type],created=step.added.filter(e=>e.levelId===scope||e.levelId===null||c.type==='floor.add');
 const primary=created.find(e=>e.kind===expected)||findEntity(scene,c.id||c.roomId||c.vertexId||'',scope);
 const actual=primary||(c.type.startsWith('floor.')?{id:scene.activeLevelId,kind:'levels',levelId:scene.activeLevelId}:null);
 const ids=Object.fromEntries(['levels',...localKinds,...globalKinds].map(kind=>[kind,created.filter(e=>e.kind===kind).map(e=>e.id)]));
 return {id:actual?.id||null,kind:actual?.kind||null,levelId:actual?.levelId??scope,ids,...(actual?.kind==='rooms'?{wallIds:clone(actual.value.wallIds),vertexIds:clone(actual.value.vertexIds)}:{})};
}

/** Pure, atomic execution. Revision/source/evidence checks belong to capture-model. */
export function runAgentOperations(input,operations){
 let scene;try{safeJSON(input,'scene');scene=validateBuilding(input);}catch(e){if(e instanceof AgentCommandError)throw e;throw new AgentCommandError(e.message,{path:'scene',code:'INVALID_SCENE'});}
 if(!Array.isArray(operations)||operations.length>200)invalid('operations 須為陣列，且每批最多 200 個命令。','operations');
 const initial=scene,bindings=Object.create(null),results=[];let bytes=0;
 for(let i=0;i<operations.length;i++){
  const op=operations[i],base=`operations.${i}`,path=`${base}.command`;let commandName=null;
  try{
   safeJSON(op,base);exactAllowed(op,operationFields,base,['levelId','command']);
   commandName=typeof op.command?.type==='string'?op.command.type:null;
   bytes+=new TextEncoder().encode(JSON.stringify(op)).length;if(bytes>LIMITS.fileBytes)invalid('批次 JSON 不得超過 10 MB。',base);
   if(own(op,'bind')&&(typeof op.bind!=='string'||! /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(op.bind)||forbidden.has(op.bind)||own(bindings,op.bind)))invalid('bind 須為不重複的英文字母開頭別名，最多 64 字。',`${base}.bind`);
   if(own(op,'sourceIds')&&(!Array.isArray(op.sourceIds)||op.sourceIds.some(id=>typeof id!=='string')))invalid('sourceIds 須為字串清單。',`${base}.sourceIds`);
   if(own(op,'basis')&&!['observed','inferred','user-confirmed'].includes(op.basis))invalid('不支援的依據類別。',`${base}.basis`,['observed','inferred','user-confirmed']);
   scalar(op.levelId,'levelId',`${base}.levelId`);
   const scope=resolveRef(op.levelId,bindings,`${base}.levelId`,scene.activeLevelId,{level:true});
   if(!scene.levels.some(l=>l.id===scope))invalid('樓層不存在。',`${base}.levelId`,scene.levels.map(l=>l.id));
   validateCommand(op.command,path);
   const before=scene;scene=applyBuildingCommand(scene,{type:'floor.select',id:scope});
   let command=resolveCommand(op.command,bindings,scope,path);command=patchCommand(scene,command,path);
   // Revalidate after alias substitution and patch expansion; the editor then
   // performs authoritative geometry, host, size and cross-floor checks.
   validateCommand(command,path);scene=applyBuildingCommand(scene,command);
   const diff=sceneDiff(before,scene),binding=bindingFor(command,diff,scene,scope);
   if(op.bind){if(!binding.id)invalid('此操作沒有可綁定的單一元件；請綁定建立命令。',`${base}.bind`);bindings[op.bind]=binding;}
   results.push({operationIndex:i,command:command.type,levelId:scope,bind:op.bind||null,id:binding.id,createdIds:binding.ids,binding,diff});
  }catch(error){
   const e=error instanceof AgentCommandError?error:new AgentCommandError(error.message,{code:'SCENE_CONSTRAINT',path,suggestion:'依 reason 修正位置、尺寸、依附關係或鎖定狀態，再重試整批；輸入場景未變更。'});
   e.operationIndex=i;e.command=commandName;throw e;
  }
 }
 return {scene,bindings:{...bindings},results,diff:sceneDiff(initial,scene)};
}

/** Compact discovery and unambiguous, floor-scoped entity reads. */
export function describeScene(input,options={}){
 const scene=validateBuilding(input);safeJSON(options,'query');exactAllowed(options,['levelId','id','entityId','kind','detail'],'query');
 for(const key of ['levelId','id','entityId'])if(own(options,key))scalar(options[key],key==='entityId'?'id':key,`query.${key}`);
 if(own(options,'detail')&&typeof options.detail!=='boolean')invalid('detail 須為布林值。','query.detail');
 if(own(options,'kind')&&!['levels',...localKinds,...globalKinds].includes(options.kind))invalid('查詢種類不存在。','query.kind',['levels',...localKinds,...globalKinds]);
 if(own(options,'id')&&own(options,'entityId')&&options.id!==options.entityId)invalid('id 與 entityId 不可指定不同元件。','query.id');
 const id=options.id??options.entityId,levelId=options.levelId;
 if(levelId&&!scene.levels.some(l=>l.id===levelId))invalid('查詢樓層不存在。','query.levelId',scene.levels.map(l=>l.id));
 if(id){
  const matches=allEntities(scene).filter(e=>e.id===id&&(!levelId||e.levelId===levelId||e.levelId===null)&&(!options.kind||e.kind===options.kind));
  if(matches.length!==1)invalid(matches.length?'ID 在多個樓層重複，請指定 levelId。':'找不到元件。','query.id',matches.map(e=>({id:e.id,kind:e.kind,levelId:e.levelId})));
  const e=matches[0],asset=e.value.assetId?ASSETS[e.value.assetId]:null;return {...clone(e),...(asset?{asset:clone(asset)}:{})};
 }
 return {format:'lumiere-agent-scene-summary',version:1,sceneFormat:scene.format,sceneVersion:scene.version,activeLevelId:scene.activeLevelId,
  levels:scene.levels.filter(l=>!levelId||l.id===levelId).map(l=>({id:l.id,name:l.name,height:l.height,templateId:l.templateId,counts:Object.fromEntries(localKinds.map(k=>[k,(l[k]||l.design[k]||[]).length])),
   entities:allEntities(scene).filter(e=>e.levelId===l.id&&e.kind!=='levels'&&(!options.kind||e.kind===options.kind)).map(e=>options.detail?clone(e):({id:e.id,kind:e.kind,...Object.fromEntries(['name','assetId','kind','x','z','width','depth','height','rotation','materialId','styleId','wallId','at','sill'].filter(k=>own(e.value,k)&&k!=='kind').map(k=>[k,e.value[k]]))}))})),
  cores:Object.fromEntries(globalKinds.map(k=>[k,clone(scene[k])]))};
}

function propertySchema(type,field){
 const enumFields={assetId:Object.keys(ASSETS),materialId:['element.add','element.update','canopy.configure'].includes(type)?ELEMENT_MATERIAL_IDS:Object.keys(MATERIALS),layout:['straight','return'],finish:['stone','oak'],wallMode:['auto','both-rails','left','right','both'],wallHandrail:['yes','no'],style:['home','passenger']};
 const enums={
  'addOpening.kind':['door','window'],'element.add.kind':Object.keys(ELEMENT_LABELS),'zone.assign.kind':['unit','public','service'],'semi.update.kind':['corridor','arcade','shelter'],
  'wall.add.wallType':['wall','rail'],'wall.add.railStyle':Object.keys(RAIL_STYLES),'floorArea.add.roomType':['room','balcony'],
  'openingStyle.styleId':Object.keys(OPENING_STYLES),'railStyle.styleId':Object.keys(RAIL_STYLES),'objects.batch.action':['move','rotate','align','distribute'],
  'objects.batch.mode':['left','right','front','back','center-x','center-z'],'objects.batch.axis':['x','z'],'editor.set.flag':['locked','hidden'],'installation.value':['exposed','concealed']
 };
 if(field==='type')return {const:type};
 if(type==='sector.configure'&&['startAngle','endAngle'].includes(field))return {type:'number',minimum:0,maximum:360};
 const choices=enums[`${type}.${field}`]||enumFields[field];if(choices)return {type:'string',enum:choices};
 if(numberFields.has(field))return {type:['channel','lampCount'].includes(field)?'integer':'number'};
 if(booleanFields.has(field))return {type:'boolean'};
 if(idFields.has(field))return {type:nullableIds.has(field)?['string','null']:'string',maxLength:128,description:'ID 或已在本批建立的 $alias／$alias.wallIds.0；一般元件須同樓層。'};
 if(field==='points')return {type:'array',minItems:3,maxItems:type==='floorArea.add'?64:16,items:{type:'object',additionalProperties:false,required:['x','z'],properties:{x:{type:'number',minimum:-40,maximum:40},z:{type:'number',minimum:-40,maximum:40}}}};
 if(field==='start'||field==='end')return {type:'object',additionalProperties:false,required:['x','z'],properties:{x:{type:'number',minimum:-40,maximum:40},z:{type:'number',minimum:-40,maximum:40}}};
 if(field==='ids')return {type:'array',minItems:1,maxItems:1000,uniqueItems:true,items:{type:'string',maxLength:128}};
 if(field==='tracePlacement')return {type:'object',additionalProperties:false,required:['elevation','rotation','anchorId','pitch','roll'],properties:{elevation:{type:'number'},rotation:{type:'number'},anchorId:{type:['string','null']},pitch:{type:'number'},roll:{type:'number'}}};
 if(field==='canopy')return {type:'object',additionalProperties:false,required:['wallId','at','side','slope'],properties:{wallId:{type:['string','null']},at:{type:'number',minimum:0,maximum:1},side:{enum:[-1,1]},slope:{type:'number',minimum:0,maximum:20}}};
 if(field==='objects')return {type:'array',minItems:1,maxItems:LIMITS.objects,items:{type:'object',description:'使用 inspect 回傳的完整 objects.value；須通過既有家具模型 schema。含宿主或已依附跡證不可貼上。'},description:'貼上時重新分配 ID；僅保留這批物件內部的開關與影音連結。'};
 if(field==='value'){
  if(type==='editor.set')return {type:'boolean'};
  if(type==='deviceControl')return {type:'integer'};
  if(type==='surface.load')return {oneOf:[{type:'null'},{type:'object',additionalProperties:false,required:words('kind color fill width depth thickness x z shape'),properties:{kind:{enum:['liquid','solid']},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},fill:{type:'number',minimum:.01,maximum:.99},width:{type:'number',minimum:.001,maximum:40},depth:{type:'number',minimum:.001,maximum:40},thickness:{type:'number',minimum:.0001,maximum:2},x:{type:'number'},z:{type:'number'},shape:{enum:['ellipse','rect']}}}]};
  if(type==='semi.register')return {type:'object',additionalProperties:false,required:words('kind x z width depth clearance spacing elementIds objectIds'),properties:{kind:{enum:['corridor','arcade','shelter']},...Object.fromEntries(words('x z width depth clearance spacing').map(k=>[k,{type:'number'}])),elementIds:{type:'array',items:{type:'string'}},objectIds:{type:'array',items:{type:'string'}}}};
 }
 return {type:'string',...(['text','label'].includes(field)?{maxLength:64}:field==='name'?{minLength:1,maxLength:32}:field==='color'?{pattern:'^#[0-9a-fA-F]{6}$'}:{})};
}
export function agentCapabilities(){
 return {format:'lumiere-capture-capabilities',version:2,commands:COMMAND_TYPES,commandFields:COMMAND_FIELDS,
  commandSchemas:Object.fromEntries(COMMAND_TYPES.map(type=>[type,{type:'object',additionalProperties:false,required:['type',...words(specs[type][1])],properties:Object.fromEntries(['type',...COMMAND_FIELDS[type]].map(field=>[field,propertySchema(type,field)])),...(type==='objects.batch'?{allOf:['move','align','distribute'].map(action=>({if:{properties:{action:{const:action}}},then:{required:{move:['dx','dz'],align:['mode'],distribute:['axis']}[action]}}))}:{})}])),
  operation:{required:['levelId','command'],optional:['sourceIds','basis','bind'],additionalProperties:false,binding:'bind 命名當步結果；$alias 指主要 ID；$room.wallIds.0 指房間牆面。別名僅可用於 ID 欄位，且不得跨錯誤樓層。'},
  execution:{atomic:true,mutatesInput:false,dryRun:'preview 執行完整驗證與來源／版本／證據檢查，回傳差異但不寫檔。',revisionGuard:'applyReportDetailed / applyReport 檢查 captureId 與 baseRevision。',patchCommands:COMMAND_TYPES.filter(t=>['dimensions','prop.configure','trace.configure','outdoor.configure','mediaSettings','floor.update','element.update','shaft.update','lift.update','stair.update','semi.update'].includes(t)),geometryValidation:'每步執行既有設計器的完整場景驗證；所有步驟成功才可提交。'},
  assets:{query:'assets [assetId|category]',categories:clone(ASSET_CATEGORIES),count:Object.keys(ASSETS).length,fullSpecification:true},materials:clone(MATERIALS),openingStyles:clone(OPENING_STYLES),railStyles:clone(RAIL_STYLES),elementKinds:clone(ELEMENT_LABELS),
  limits:{jsonBytes:LIMITS.fileBytes,operationsPerReport:200,objectsPerLevel:LIMITS.objects,levels:8},
  examples:[{levelId:'floor-1',bind:'room',command:{type:'addRoom',x:-3,z:-2,width:6,depth:4}},{levelId:'floor-1',bind:'window',command:{type:'addOpening',wallId:'$room.wallIds.1',kind:'window',at:.5}},{levelId:'floor-1',command:{type:'dimensions',id:'$window',width:2,height:1.4,sill:.8}},{levelId:'floor-1',command:{type:'openingStyle',id:'$window',styleId:'window-transom-awning'}}]};
}
