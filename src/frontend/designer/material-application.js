import {ASSETS,MATERIALS} from './catalog.js';

export const LEGACY_MATERIAL_IDS=Object.freeze(['plaster','oak','stone','tatami']);
const legacy=new Set(LEGACY_MATERIAL_IDS),sceneShapes=new Set(['perimeter-wall','human-rider','broadleaf-tree','conifer-tree']);

// 材質可見效果與物件碰撞分開；不接受套用成功卻完全沒有可改表面的新材質。
export function materialApplicationReason(materialId,{kind,item,importedAssets}={}){
 if(!Object.hasOwn(MATERIALS,materialId))return '請選擇已登錄的材質。';
 if(kind==='objects'&&importedAssets?.has(item?.assetId))return '匯入模型保留內嵌材質與貼圖，請在原模型中調整。';
 if(!legacy.has(materialId)){
  if(kind==='walls'&&item?.type==='rail'&&item.railStyle!=='solid')return '欄杆零件保留原有材質，請選取實心矮牆。';
  if(kind==='objects'){
   const spec=ASSETS[item?.assetId];if(!spec)return '物件素材不存在。';
   if(['vehicles','outdoor','school'].includes(spec.category)||spec.schoolShape||spec.outdoor||['pipe','television','valve','dial'].includes(spec.shape)||spec.category==='scene'&&!sceneShapes.has(spec.shape))return '此專用素材保留原有多材質外觀，請選擇一般家具、占位元件或獨立玻璃面板。';
  }
 }
 if(MATERIALS[materialId].floorOnly&&kind!=='rooms')return materialId==='tatami'?'榻榻米僅適用於空間地板。':'此材質僅適用於空間地板。';
 return null;
}
