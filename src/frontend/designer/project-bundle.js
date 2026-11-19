import {validateBuilding} from './building-model.js';
import {ASSETS} from './catalog.js';
import {validateMaterialPack,decodeMaterialPack} from './material-pack.js';
import {validateSheetLayout} from './drawings.js';
import {validateFrame} from './frame-analysis.js';
import {loadGlb,disposeImportedAsset,checkAssetBudget} from './imported-assets.js';
import {loadIfcReference,makeIfcReference,disposeIfcReference} from './ifc-reference.js';
import {LIMITS} from './model.js';
import {validateCapture} from '../capture/capture-model.js';
import {validateReferenceSnapshot,prepareReferenceSnapshot} from './reference-workspace.js';

export const BUNDLE_BYTES=128*1024*1024;
const fail=m=>{throw new Error(m);};
const keys=(o,list)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===list.split(',').sort().join(',');
export function encodeBytes(buffer){const bytes=new Uint8Array(buffer);let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
export function decodeBytes(text,max){if(typeof text!=='string'||!text.length||text.length>Math.ceil(max/3)*4||text.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(text))fail('專案內嵌檔案編碼或大小錯誤。');const raw=atob(text);if(raw.length>max)fail('專案內嵌檔案超過大小限制。');return Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;}
export function canReplaceAsset(id){return Object.hasOwn(ASSETS,id)&&['equipment','extras'].includes(ASSETS[id].category)&&!ASSETS[id].control&&!['tv','speakers','projector','projection-screen','text-panel','chart-sector'].includes(id);}
export function validateBundle(input){
 if(input?.version===1&&keys(input,'format,version,building,assets,underlays,materials,ifc,sheets,frame'))input={...input,version:2,reference:null,captureContext:null};
 if(!keys(input,'format,version,building,assets,underlays,materials,ifc,sheets,frame,reference,captureContext')||input.format!=='lumiere-project'||input.version!==2)fail('不是支援的 Lumiere 完整專案包。');
 if(new TextEncoder().encode(JSON.stringify(input.building)).length>LIMITS.fileBytes||JSON.stringify(input.frame).length>200000||JSON.stringify(input.sheets).length>200000)fail('專案模型或圖紙資料超出上限。');
 const building=validateBuilding(input.building),levels=new Set(building.levels.map(l=>l.id));
 if(!Array.isArray(input.assets)||input.assets.length>32||!Array.isArray(input.underlays)||input.underlays.length>levels.size)fail('專案素材或底圖數量超出上限。');
 const ids=new Set();let bytes=0;
 const decode=(data,max)=>{const buffer=decodeBytes(data,max);bytes+=buffer.byteLength;if(bytes>64*1024*1024)fail('專案 GLB、底圖及 IFC 合計最多 64 MB。');return buffer;};
 const assets=input.assets.map(a=>{if(!keys(a,'id,data')||!canReplaceAsset(a.id)||ids.has(a.id))fail('素材類型不支援或重複。');ids.add(a.id);return {...a,buffer:decode(a.data,16*1024*1024)};});ids.clear();
 const underlays=input.underlays.map(u=>{if(!keys(u,'levelId,name,type,data,x,z,width,rotation,opacity')||!levels.has(u.levelId)||ids.has(u.levelId)||typeof u.name!=='string'||u.name.length>255||!['image/png','image/jpeg','image/webp'].includes(u.type)||!['x','z','width','rotation','opacity'].every(k=>Number.isFinite(u[k]))||Math.abs(u.x)>200||Math.abs(u.z)>200||u.width<.1||u.width>200||u.rotation<0||u.rotation>360||u.opacity<0||u.opacity>1)fail('底圖樓層、校準位置或圖片格式無效。');ids.add(u.levelId);return {...u,buffer:decode(u.data,12*1024*1024)};});
 let ifc=null;if(input.ifc!==null){if(!keys(input.ifc,'name,data')||typeof input.ifc.name!=='string'||input.ifc.name.length>255)fail('IFC 參考檔案格式錯誤。');ifc={...input.ifc,buffer:decode(input.ifc.data,40*1024*1024)};}
 const materials=validateMaterialPack(input.materials),sheets=input.sheets===null?null:validateBundleSheets(input.sheets,building),frame=validateFrame(input.frame,{draft:true}),reference=validateReferenceSnapshot(input.reference),captureContext=input.captureContext===null?null:validateCapture(input.captureContext);
 if(reference){bytes+=reference.buffer.byteLength;if(bytes>64*1024*1024)fail('專案內嵌素材與照片合計最多 64 MB。');delete reference.buffer;for(const view of [reference.view,reference.savedView])if(view?.levelId&&!levels.has(view.levelId))fail('比對視點指定的樓層不存在。');}
 if(captureContext&&JSON.stringify(captureContext.scene)!==JSON.stringify(building))fail('採集脈絡與建築場景不一致。');
 if(reference?.source.sourceId&&captureContext){const source=captureContext.sources.find(s=>s.id===reference.source.sourceId);if(!source||source.sha256!==reference.source.sha256||source.width!==reference.source.width||source.height!==reference.source.height)fail('比對照片與採集來源不一致。');}
 return {building,assets,underlays,materials,ifc,sheets,frame,reference,captureContext};
}
export function disposePrepared(p){p?.assets?.forEach(disposeImportedAsset);p?.underlays?.forEach(u=>u.image.close());p?.materials?.forEach(m=>m.image.close());p?.reference?.image.close();disposeIfcReference(p?.ifcRoot);}
export async function prepareBundle(input,{signal,loadAsset=loadGlb,decodeMaterials=decodeMaterialPack,decodeImage=createImageBitmap,loadIfc=loadIfcReference,makeIfc=makeIfcReference}={}){
 const v=validateBundle(input),p={building:v.building,assets:new Map(),underlays:new Map(),materials:[],ifcRoot:null,ifcSource:null,sheets:v.sheets,frame:v.frame,reference:null,captureContext:v.captureContext};
 const check=()=>{if(signal?.aborted)fail('已取消開啟專案。');};
 try{check();for(const a of v.assets){const entry=await loadAsset(a.buffer);entry.source=a.buffer;p.assets.set(a.id,entry);check();}checkAssetBudget(v.building,p.assets);
  for(const u of v.underlays){const source=new Blob([u.buffer],{type:u.type}),image=await decodeImage(source);const item={...u,image,source};delete item.buffer;delete item.data;p.underlays.set(u.levelId,item);if(image.width>8192||image.height>8192)fail('底圖長寬各不可超過 8192 像素。');check();}
  p.materials=await decodeMaterials(v.materials);check();
  p.reference=await prepareReferenceSnapshot(v.reference,{decodeImage});check();
  if(v.ifc){p.ifcSource=new Blob([v.ifc.buffer],{type:'application/x-step'});const data=await loadIfc(p.ifcSource,{signal});check();p.ifcRoot=makeIfc(data);p.ifcName=v.ifc.name;}
  return p;
 }catch(e){disposePrepared(p);throw e;}
}

export function validateBundleSheets(layout,building){
 if(!keys(layout,'format,version,sheets')||layout.format!=='lumiere-sheets'||layout.version!==1||!Array.isArray(layout.sheets)||!layout.sheets.length||layout.sheets.length>30)fail('圖紙配置格式錯誤。');
 for(const s of layout.sheets){if(!Array.isArray(s?.views))fail('圖紙視圖格式錯誤。');validateSheetLayout({...layout,sheets:[{...s,views:s.views.length?s.views:[{type:'plan',levelId:building.activeLevelId,scale:100,offset:0,x:15,y:40,width:50,height:50}]}]},building);}
 return layout;
}
