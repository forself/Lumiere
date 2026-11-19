import {validateCapture,replaceCaptureScene} from '../capture/capture-model.js';
import {BUNDLE_BYTES,encodeBytes,validateBundle,prepareBundle,disposePrepared} from './project-bundle.js';
import {disposeImportedAsset} from './imported-assets.js';
import {disposeIfcReference} from './ifc-reference.js';
import {downloadBlob} from './design-export.js';

export class ProjectBundleEditor{
 constructor(page){this.page=page;this.identities=new WeakMap();this.nextId=1;this.savedExtras=null;this.previous=null;}
 view(){return this.page.views?.find(v=>v.renderer);}
 id(value){if(!value||typeof value!=='object')return 0;if(!this.identities.has(value))this.identities.set(value,this.nextId++);return this.identities.get(value);}
 extras(){const p=this.page,v=this.view();return JSON.stringify({assets:[...(v?.importedAssets||[])].map(([id,a])=>[id,this.id(a)]),materials:this.id(v?.materialEntries),ifc:this.id(p.ifcSource),underlays:[...p.underlays].map(([id,u])=>[id,this.id(u.source),u.x,u.z,u.width,u.rotation,u.opacity]),sheets:p.sheetPages||[],reference:p.reference?.stamp()||null,captureContext:p.captureContext||null});}
 stamp(){return this.page.store.serialize()+'|'+this.extras()+'|'+JSON.stringify(this.page.frameEditor.model);}
 get dirty(){return this.savedExtras!==null&&this.savedExtras!==this.extras();}
 markSaved(){this.savedExtras=this.extras();}
 commands(){return [['bundle.save',()=>this.save()],['bundle.load',(_,files)=>this.load(files?.[0])],['bundle.cancel',()=>{this.abort?.abort();}],['bundle.restore',()=>this.load(null,this.previous)]];}
 async capture(){const p=this.page,v=this.view(),building=structuredClone(p.store.building),assets=[],underlays=[],materials={format:'lumiere-materials',version:2,materials:(v?.materialEntries||[]).map(({id,data,tileMetres,channel})=>({id,data,tileMetres,channel}))},sheets=p.sheetPages?.length?{format:'lumiere-sheets',version:1,sheets:structuredClone(p.sheetPages)}:null,frame=structuredClone(p.frameEditor.model),ifcSource=p.ifcSource,ifcName=p.ifcName;
  const sourceAssets=[...(v?.importedAssets||[])],sourceUnderlays=[...p.underlays];
  for(const [id,a] of sourceAssets){if(!a.source)throw new Error('素材缺少原始 GLB，請重新載入後再打包。');assets.push({id,data:encodeBytes(a.source)});}
  for(const [levelId,u] of sourceUnderlays){if(!building.levels.some(l=>l.id===levelId))continue;if(!u.source)throw new Error('底圖缺少原始檔案，請重新載入後再打包。');underlays.push({levelId,name:u.name,type:u.source.type,data:encodeBytes(await u.source.arrayBuffer()),x:u.x,z:u.z,width:u.width,rotation:u.rotation,opacity:u.opacity});}
  const reference=await p.reference?.capture()||null,captureContext=p.captureContext?(JSON.stringify(p.captureContext.scene)===JSON.stringify(building)?validateCapture(p.captureContext):replaceCaptureScene(p.captureContext,building)):null;
  return {format:'lumiere-project',version:2,reference,captureContext,building,assets,underlays,materials,ifc:ifcSource?{name:ifcName||'reference.ifc',data:encodeBytes(await ifcSource.arrayBuffer())}:null,sheets,frame};
 }
 async save(){const p=this.page,stamp=this.stamp();try{const pack=await this.capture(),text=JSON.stringify(pack);if(new Blob([text]).size>BUNDLE_BYTES)throw new Error('完整專案包最多 128 MB，請減少素材。');validateBundle(pack);if(p.destroyed||stamp!==this.stamp())throw new Error('打包期間專案已變更，請重新另存。');downloadBlob(new Blob([text],{type:'application/json'}),'lumiere-project.lumiere');p.saved=p.store.serialize();p.frameEditor.saved=JSON.stringify(p.frameEditor.model);this.markSaved();p.sync();p.message('已下載完整專案包：建築、素材、底圖、IFC、圖紙、分析模型、來源照片與比對視點。影片仍需另行載入。');}catch(e){if(!p.destroyed)p.message(e.message);}}
 async load(file,restore=null){if(!file&&!restore)return;const p=this.page;this.abort?.abort();const abort=new AbortController();this.abort=abort;const stamp=this.stamp();let prepared;
  try{if(file&&file.size>BUNDLE_BYTES)throw new Error('完整專案包最多 128 MB。');p.message('正在本機驗證完整專案；成功後才替換目前內容，可取消。');const input=restore||JSON.parse(await file.text());if(abort.signal.aborted)throw new Error('已取消開啟專案。');const previous=await this.capture();prepared=await prepareBundle(input,{signal:abort.signal});
   if(p.destroyed||abort.signal.aborted||stamp!==this.stamp())throw new Error('讀檔期間專案已變更或取消，未替換目前內容。');
   this.commit(prepared);prepared=null;this.previous=previous;this.markSaved();p.message('完整專案已開啟；素材與校準已還原。可按「還原開啟前專案」復原整包，原本機草稿未覆寫。');
  }catch(e){disposePrepared(prepared);if(!p.destroyed&&this.abort===abort)p.message('專案未開啟：'+e.message);}finally{if(this.abort===abort)this.abort=null;}
 }
 commit(data){const p=this.page,v=this.view();p.ifcAbort?.abort();p.assetLoad={};p.materialLoad={};p.cadLoad={};p.frameEditor.loadToken=null;p.clearUnderlays();v.traceAbort?.abort();v.media?.clear();disposeIfcReference(v.ifcReference);v.importedAssets?.forEach(disposeImportedAsset);v.importedAssets=data.assets;v.ifcReference=data.ifcRoot;if(data.ifcRoot)v.scene.add(data.ifcRoot);p.ifcSource=data.ifcSource;p.ifcName=data.ifcName;p.underlays=data.underlays;v.setMaterials(data.materials);p.sheetPages=data.sheets?.sheets||[];p.sheetIndex=0;p.sheetView='new';p.sheetDragHistory=[];p.frameEditor.model=data.frame;p.frameEditor.history=[];p.frameEditor.invalidate();p.frameEditor.saved=JSON.stringify(data.frame);p.editPrefs.clear();p.multiIds=[];p.selection=null;p.clipboard=[];p.cadSource=null;p.captureContext=data.captureContext;p.store.replace(data.building);p.saved=p.store.serialize();this.markSaved();p.sync();p.syncSheets();p.views.forEach(view=>view.fit());p.reference?.install(data.reference);this.markSaved();}
 destroy(){this.abort?.abort();this.previous=null;}
}
