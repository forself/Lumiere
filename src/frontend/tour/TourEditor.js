import {BuildingStore,applyBuildingCommand,validateBuilding,floorElevation} from '../designer/building-model.js';
import {ASSETS} from '../designer/catalog.js';
import {materialApplicationReason} from '../designer/material-application.js';
import {objectPose} from '../designer/model.js';
import {walkSurface} from '../designer/stairs.js';
import {checkAssetBudget} from '../designer/imported-assets.js';
import {BUNDLE_BYTES,encodeBytes,validateBundle} from '../designer/project-bundle.js';
import {replaceCaptureScene} from '../capture/capture-model.js';
import {guardEvidence} from '../capture/evidence.js';
import {guardRelations} from '../capture/semantic-assemblies.js';

export const TOUR_TRANSFORM_FIELDS=['x','z','elevation','rotation','width','depth','height'];
const number=value=>{if(typeof value==='string'&&!value.trim())throw new Error('請填寫有效數值。');const n=Number(value);if(!Number.isFinite(n))throw new Error('請填寫有效數值。');return n;};
export class TourEditor{
 constructor(building,{assets=new Map(),captureContext=null}={}){this.store=new BuildingStore(building);this.initial=this.store.building;this.assets=assets;this.captureContext=captureContext;this.saved=this.store.serialize();this.savedContent=this.content();}
 get building(){return this.store.building;}
 content(){return JSON.stringify({...this.building,activeLevelId:this.building.levels[0].id});}
 get dirty(){return this.content()!==this.savedContent;}
 level(id=this.building.activeLevelId){const level=this.building.levels.find(l=>l.id===id);if(!level)throw new Error('樓層不存在。');return level;}
 object(levelId,id){const object=this.level(levelId).design.objects.find(o=>o.id===id);if(!object)throw new Error('請先選取物件。');return object;}
 commit(levelId,commands){
  let next=this.building;if(next.activeLevelId!==levelId)next=applyBuildingCommand(next,{type:'floor.select',id:levelId});
  for(const command of commands)next=applyBuildingCommand(next,command);this.validateCandidate(next);this.store.replace(next);return this.building;
 }
 validateCandidate(next){if(this.captureContext){guardEvidence(this.captureContext,next);guardRelations(this.captureContext,next);}checkAssetBudget(next,this.assets);}
 selectFloor(id){this.store.building=new BuildingStore({...this.building,activeLevelId:id}).building;return this.building;}
 apply(levelId,id,fields){
  const object=this.object(levelId,id);if(object.hostId)throw new Error('附加項目跟隨門窗，請至設計器調整依附對象。');
  if(!fields||Object.getPrototypeOf(fields)!==Object.prototype||Object.keys(fields).some(k=>!TOUR_TRANSFORM_FIELDS.includes(k)))throw new Error('物件調整含不支援的欄位。');
  if((this.level(levelId).assemblies||[]).some(a=>a.objectIds.includes(id)))throw new Error('此物件屬於組合構件，請至設計器調整整組或先解除組合。');
  const pose=objectPose(this.level(levelId).design,object),values=Object.fromEntries(TOUR_TRANSFORM_FIELDS.map(k=>[k,number(fields[k]??pose[k])]));
  return this.commit(levelId,[{type:'transformObject',id,...values}]);
 }
 rotate(levelId,id){const o=objectPose(this.level(levelId).design,this.object(levelId,id));return this.apply(levelId,id,{rotation:(o.rotation+90)%360});}
 remove(levelId,id){this.object(levelId,id);if((this.level(levelId).assemblies||[]).some(a=>a.objectIds.includes(id)))throw new Error('請至設計器調整或解除組合後再刪除。');return this.commit(levelId,[{type:'delete',id}]);}
 place(levelId,assetId,point,{hostId=null}={}){
  const asset=ASSETS[assetId];if(!asset)throw new Error('請先選取已登錄素材。');const level=this.level(levelId),before=new Set(level.design.objects.map(o=>o.id));
  const command={type:'addObject',assetId};let supportElevation=asset.elevation;
  if(asset.hostKind){const host=level.design.openings.find(o=>o.id===hostId&&o.kind===asset.hostKind);if(!host)throw new Error('此附加項目須先選取對應門窗。');command.hostId=hostId;}
  else{const x=number(point?.x),z=number(point?.z),base=floorElevation(this.building,levelId),queryY=point?.y===undefined?base+.05:number(point.y);if(queryY<base-.4||queryY>base+level.height+.4)throw new Error('放置高度不在指定樓層範圍內。');const support=walkSurface(this.building,{x,z},queryY);if(support===null)throw new Error('此處沒有可放置的地坪，請點選房間、陽台、樓板或道路地面。');command.x=x;command.z=z;supportElevation=support-base+asset.elevation;command.elevation=supportElevation;}
  let next=this.building;if(next.activeLevelId!==levelId)next=applyBuildingCommand(next,{type:'floor.select',id:levelId});next=applyBuildingCommand(next,command);let added=next.levels.find(l=>l.id===levelId).design.objects.find(o=>!before.has(o.id));
  if(!asset.hostKind&&added.elevation!==supportElevation)next=applyBuildingCommand(next,{type:'transformObject',id:added.id,...Object.fromEntries(TOUR_TRANSFORM_FIELDS.map(k=>[k,k==='elevation'?supportElevation:added[k]]))});
  this.validateCandidate(next);this.store.replace(next);return this.object(levelId,added.id);
 }
 togglePower(levelId,id){this.object(levelId,id);return this.commit(levelId,[{type:'toggleAppliance',id}]);}
 material(levelId,id,materialId){const object=this.object(levelId,id);if(object.hostId)throw new Error('附加項目請至設計器調整材質。');if((this.level(levelId).assemblies||[]).some(a=>a.objectIds.includes(id)))throw new Error('此物件屬於組合構件，請至設計器調整整組。');const reason=materialApplicationReason(materialId,{kind:'objects',item:object,importedAssets:this.assets});if(reason)throw new Error(reason);return this.commit(levelId,[{type:'material',id,materialId}]);}
 control(levelId,id,channel,value){this.object(levelId,id);return this.commit(levelId,[{type:'deviceControl',id,channel:number(channel),value:number(value)}]);}
 toggleOpening(levelId,id){return this.commit(levelId,[{type:'toggleOpening',id}]);}
 undo(){if(this.store.past.length)this.validateCandidate(this.store.past.at(-1));return this.store.undo();}
 redo(){if(this.store.future.length)this.validateCandidate(this.store.future.at(-1));return this.store.redo();}
}

export async function captureTourBundle(prepared,building){
 const model=validateBuilding(building),assets=[],underlays=[];
 for(const [id,entry]of prepared?.assets||[]){if(!entry.source)throw new Error('素材缺少原始 GLB，無法完整匯出。');assets.push({id,data:encodeBytes(entry.source)});}
 for(const [levelId,u]of prepared?.underlays||[]){if(!model.levels.some(l=>l.id===levelId))continue;if(!u.source)throw new Error('底圖缺少原始檔案，無法完整匯出。');underlays.push({levelId,name:u.name,type:u.source.type,data:encodeBytes(await u.source.arrayBuffer()),x:u.x,z:u.z,width:u.width,rotation:u.rotation,opacity:u.opacity});}
 const capture=prepared?.captureContext||null,pack={format:'lumiere-project',version:2,building:model,assets,underlays,materials:{format:'lumiere-materials',version:2,materials:(prepared?.materials||[]).map(({id,data,tileMetres,channel})=>({id,data,tileMetres,channel}))},ifc:prepared?.ifcSource?{name:prepared.ifcName||'reference.ifc',data:encodeBytes(await prepared.ifcSource.arrayBuffer())}:null,sheets:prepared?.sheets||null,frame:prepared?.frame||{format:'lumiere-frame-2d',version:1,name:'尚未分析',nodes:[],members:[],displacementLimitMm:10},reference:prepared?.reference?.snapshot||null,captureContext:capture?(JSON.stringify(capture.scene)===JSON.stringify(model)?capture:replaceCaptureScene(capture,model)):null};
 if(new TextEncoder().encode(JSON.stringify(pack)).length>BUNDLE_BYTES)throw new Error('完整專案包最多 128 MB。');validateBundle(pack);return pack;
}
