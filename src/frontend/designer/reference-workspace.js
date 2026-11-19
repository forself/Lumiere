import * as THREE from '../../../node_modules/three/build/three.module.js';
import {validateReferenceCamera,applyReferenceProjection} from './reference-camera.js';
import {validateCapture} from '../capture/capture-model.js';

export const REFERENCE_BYTES=10*1024*1024;
export const REFERENCE_MIMES=['image/png','image/jpeg','image/webp'];
const fail=message=>{throw new Error(message);};
const exact=(o,fields)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===fields.split(',').sort().join(',');
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function encodeReferenceBytes(buffer){const bytes=new Uint8Array(buffer);let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
function decode(data){if(typeof data!=='string'||!data.length||data.length>Math.ceil(REFERENCE_BYTES/3)*4||data.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))fail('來源圖片編碼或大小無效。');const raw=atob(data);if(raw.length>REFERENCE_BYTES)fail('來源圖片最多 10 MB。');return Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;}
export function validateReferenceView(view){
 if(view===null)return null;
 // Early v2 project bundles stored the same workspace version without framing metadata.
 if(exact(view,'position,quaternion,target,fov,referenceCamera'))view={...view,viewport:[view.referenceCamera?.width||1000,view.referenceCamera?.height||1000],levelId:null,roof:false};
 else if(exact(view,'position,quaternion,target,fov,viewport,referenceCamera'))view={...view,levelId:null,roof:false};
 if(!exact(view,'position,quaternion,target,fov,viewport,levelId,roof,referenceCamera'))fail('比對視點欄位不符。');
 for(const [key,size,limit] of [['position',3,1000],['target',3,1000],['quaternion',4,1]])if(!Array.isArray(view[key])||view[key].length!==size||!view[key].every(n=>Number.isFinite(n)&&Math.abs(n)<=limit))fail('比對視點座標無效。');
 if(Math.abs(Math.hypot(...view.quaternion)-1)>.0001||!Number.isFinite(view.fov)||view.fov<=0||view.fov>=179)fail('比對視點方向或視角無效。');
 if(!Array.isArray(view.viewport)||view.viewport.length!==2||!view.viewport.every(v=>Number.isFinite(v)&&v>=1&&v<=16384))fail('比對視點畫面尺寸無效。');
 if(!(view.levelId===null||/^floor-[1-9][0-9]*$/.test(view.levelId))||typeof view.roof!=='boolean')fail('視點樓層或屋頂設定無效。');
 if(view.referenceCamera!==null&&!exact(view.referenceCamera,'format,version,width,height,focal,cx,cy,position,target'))fail('工作區相機含未支援欄位。');
 return {...structuredClone(view),referenceCamera:view.referenceCamera===null?null:validateReferenceCamera(view.referenceCamera)};
}
function referenceTarget(view){return view.walk?.active?new THREE.Vector3(0,0,-1).applyQuaternion(view.camera.quaternion).multiplyScalar(10).add(view.camera.position):view.controls.target;}
export function currentReferenceCamera(view){return view.referenceCamera?validateReferenceCamera({...view.referenceCamera,position:view.camera.position.toArray(),target:referenceTarget(view).toArray()}):null;}
export function captureReferenceView(view){
 if(!view?.camera)return null;
 const target=referenceTarget(view);
 return validateReferenceView({position:view.camera.position.toArray(),quaternion:view.camera.quaternion.toArray(),target:target.toArray(),fov:view.camera.fov,viewport:[view.width||view.camera.aspect*1000,view.height||1000],levelId:view.allFloors?null:view.building?.activeLevelId||null,roof:!!view.roof,referenceCamera:currentReferenceCamera(view)});
}
export function restoreReferenceView(view,input){
 const state=validateReferenceView(input);if(!state||!view)return;
 view.walk?.stop();view.allFloors=state.levelId===null;view.roof=state.roof;view.camera.clearViewOffset();view.referenceCamera=state.referenceCamera;view.controls.enableDamping=false;view.controls.minDistance=.01;view.controls.maxPolarAngle=Math.PI-.001;
 view.camera.position.fromArray(state.position);view.controls.target.fromArray(state.target);view.controls.update();view.camera.quaternion.fromArray(state.quaternion);view.camera.fov=state.fov;view.camera.updateProjectionMatrix();
 if(state.referenceCamera)applyReferenceProjection(view.camera,state.referenceCamera,view.width||state.referenceCamera.width,view.height||state.referenceCamera.height);else applyViewportProjection(view.camera,state.fov,state.viewport,view.width||state.viewport[0],view.height||state.viewport[1]);view.invalidate?.();
}
export function applyViewportProjection(camera,fov,viewport,width,height){const scale=Math.min(width/viewport[0],height/viewport[1]);camera.fov=2*Math.atan(Math.tan(fov*Math.PI/360)*height/(viewport[1]*scale))*180/Math.PI;camera.aspect=width/height;camera.updateProjectionMatrix();}
export function validateReferenceSnapshot(input){
 if(input===null)return null;
 if(!exact(input,'format,version,source,settings,view,savedView')||input.format!=='lumiere-reference-workspace'||input.version!==1)fail('照片比對工作區格式不符。');
 const s=input.source,p=input.settings;
 if(!exact(s,'name,mime,width,height,bytes,sha256,data,sourceId')||typeof s.name!=='string'||s.name.length>255||!REFERENCE_MIMES.includes(s.mime)||!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<1||s.width>8192||s.height>8192||s.width*s.height>32000000||!Number.isInteger(s.bytes)||s.bytes<1||s.bytes>REFERENCE_BYTES||!/^[a-f0-9]{64}$/.test(s.sha256)||!(s.sourceId===null||/^source-[1-9][0-9]*$/.test(s.sourceId)))fail('來源圖片資料無效。');
 const buffer=decode(s.data);if(buffer.byteLength!==s.bytes)fail('來源圖片大小不一致。');
 if(!exact(p,'opacity,scale,x,y,rotation,mode'))fail('疊合設定欄位不符。');
 for(const [key,min,max] of [['opacity',0,1],['scale',.1,5],['x',-100,100],['y',-100,100],['rotation',-180,180]])if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)fail('疊合設定超出範圍。');
 if(!['photo','scene','overlay'].includes(p.mode))fail('比對模式無效。');
 const view=validateReferenceView(input.view),savedView=validateReferenceView(input.savedView);
 for(const v of [view,savedView])if(v?.referenceCamera&&(v.referenceCamera.width!==s.width||v.referenceCamera.height!==s.height))fail('來源圖與相機尺寸不一致。');
 return {...structuredClone(input),view,savedView,buffer};
}
export async function prepareReferenceSnapshot(input,{decodeImage=createImageBitmap}={}){
 const checked=validateReferenceSnapshot(input);if(!checked)return null;
 if(await sha256(checked.buffer)!==checked.source.sha256)fail('來源圖片 SHA-256 不一致。');
 const source=new Blob([checked.buffer],{type:checked.source.mime}),image=await decodeImage(source);
 if(image.width!==checked.source.width||image.height!==checked.source.height){image.close();fail('來源圖片實際尺寸與記錄不一致。');}
 delete checked.buffer;return {snapshot:checked,source,image};
}
export async function createReferenceSnapshot(image,view=null,savedView=null){
 if(!image)return null;if(!image.source?.arrayBuffer)fail('來源圖片缺少原始檔案，請重新載入。');
 const bytes=await image.source.arrayBuffer(),result={format:'lumiere-reference-workspace',version:1,source:{name:image.name||'reference',mime:image.source.type,width:image.image.width,height:image.image.height,bytes:bytes.byteLength,sha256:await sha256(bytes),data:encodeReferenceBytes(bytes),sourceId:image.sourceId||null},settings:Object.fromEntries(['opacity','scale','x','y','rotation'].map(k=>[k,image[k]])),view:validateReferenceView(view),savedView:validateReferenceView(savedView)};
 result.settings.mode=image.mode||(image.hidden?'scene':'overlay');validateReferenceSnapshot(result);return result;
}
// Router transitions share this module. No draft storage, external URL or script payload is used.
let pendingHandoff=null;
export async function stageCaptureHandoff(input,{sourceBlob=null,sourceId=null,camera=null,viewId=null,signal}={}){
 signal?.throwIfAborted();
 const capture=validateCapture(input);let reference=null;
 if(viewId!==null&&(typeof viewId!=='string'||viewId.length>100))fail('視點 ID 無效。');
 if(sourceBlob){const source=capture.sources.find(s=>s.id===sourceId);if(!source||!REFERENCE_MIMES.includes(source.mime)||sourceBlob.type!==source.mime||sourceBlob.size!==source.bytes)fail('採集照片與來源記錄不一致。');
  const bytes=await sourceBlob.arrayBuffer(),hash=await sha256(bytes);signal?.throwIfAborted();if(hash!==source.sha256)fail('採集照片 SHA-256 不一致。');
  let view=null;if(camera){const c=validateReferenceCamera(camera),temporary=new THREE.PerspectiveCamera();temporary.position.fromArray(c.position);temporary.lookAt(new THREE.Vector3().fromArray(c.target));view={position:c.position,quaternion:temporary.quaternion.toArray(),target:c.target,fov:2*Math.atan(c.height/(2*c.focal))*180/Math.PI,viewport:[c.width,c.height],levelId:null,roof:false,referenceCamera:c};}
  reference={format:'lumiere-reference-workspace',version:1,source:{name:source.name,mime:source.mime,width:source.width,height:source.height,bytes:source.bytes,sha256:source.sha256,data:encodeReferenceBytes(bytes),sourceId},settings:{opacity:.25,scale:1,x:0,y:0,rotation:0,mode:'overlay'},view,savedView:view};validateReferenceSnapshot(reference);
 }else if(sourceId!==null||camera!==null)fail('採集交接缺少來源圖片。');
 signal?.throwIfAborted();pendingHandoff={capture,reference,viewId};return {captureId:capture.id,revision:capture.revision,sourceId,viewId};
}
export function consumeCaptureHandoff(){const result=pendingHandoff;pendingHandoff=null;return result;}
let pendingReturn=null;
export function stageCaptureReturn(input){const capture=validateCapture(input);pendingReturn=capture;return {captureId:capture.id,revision:capture.revision};}
export function consumeCaptureReturn(){const capture=pendingReturn;pendingReturn=null;return capture;}
