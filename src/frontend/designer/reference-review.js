import * as THREE from '../../../node_modules/three/build/three.module.js';
import {buildBuilding} from './building-geometry.js';
import {validateBuilding,floorElevation} from './building-model.js';
import {validateReferenceCamera,applyReferenceProjection} from './reference-camera.js';
import {captureReferenceView,sha256,validateReferenceSnapshot,applyViewportProjection,validateReferenceView,currentReferenceCamera} from './reference-workspace.js';

export const REVIEW_CHANNELS=['scene','source','overlay','wireframe','ids'];
export const REVIEW_BYTES=10*1024*1024;
const fail=message=>{throw new Error(message);};
const exact=(o,fields)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===fields.split(',').sort().join(',');
export function validateReferenceReviewJob(input,{building,source}){
 if(exact(input,'format,version,id,width,height,levelId,channels,roi,camera'))input={...input,view:null};
 if(!exact(input,'format,version,id,width,height,levelId,channels,roi,camera,view')||input.format!=='lumiere-reference-review-job'||input.version!==1||!/^review-[a-zA-Z0-9-]{1,80}$/.test(input.id))fail('固定視點比較工作格式不符。');
 if(!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<64||input.height<64||input.width>2048||input.height>2048||input.width*input.height>4194304)fail('比較圖長寬各限 64–2048 像素。');
 if(input.levelId!==null&&!building.levels.some(l=>l.id===input.levelId))fail('比較工作指定的樓層不存在。');
 if(!Array.isArray(input.channels)||!input.channels.length||input.channels.length>5||new Set(input.channels).size!==input.channels.length||input.channels.some(c=>!REVIEW_CHANNELS.includes(c)))fail('比較圖通道無效或重複。');
 const roi=input.roi;
 if(roi!==null&&(!exact(roi,'x,y,width,height')||!['x','y','width','height'].every(k=>Number.isFinite(roi[k]))||roi.x<0||roi.y<0||roi.width<=0||roi.height<=0||roi.x+roi.width>source.width||roi.y+roi.height>source.height))fail('ROI 必須完整位於來源圖片像素範圍內。');
 if(input.camera!==null&&!exact(input.camera,'format,version,width,height,focal,cx,cy,position,target'))fail('比較相機含未支援欄位。');
 const camera=input.camera===null?null:validateReferenceCamera(input.camera);
 if(camera&&(camera.width!==source.width||camera.height!==source.height))fail('比較相機與來源照片尺寸不一致。');
 const view=validateReferenceView(input.view);if(view&&view.levelId!==input.levelId)fail('比較視點與輸出樓層不一致。');
 if(view?.referenceCamera&&(view.referenceCamera.width!==source.width||view.referenceCamera.height!==source.height))fail('比對視點與來源照片尺寸不一致。');
 return {...structuredClone(input),camera,view};
}
export function defaultReferenceReviewJob(view,reference){
 if(!reference?.image||!view?.camera)fail('請先載入來源照片並開啟 3D。');
 const scale=Math.min(1,1280/reference.image.width,1280/reference.image.height);
 return {format:'lumiere-reference-review-job',version:1,id:'review-current',width:Math.max(64,Math.round(reference.image.width*scale)),height:Math.max(64,Math.round(reference.image.height*scale)),levelId:view.allFloors?null:view.building?.activeLevelId||null,channels:[...REVIEW_CHANNELS],roi:null,camera:currentReferenceCamera(view),view:captureReferenceView(view)};
}
export function referenceRoiPixels(job,source,settings){
 if(!job.roi)return {x:0,y:0,width:job.width,height:job.height};
 const {x,y,width,height}=job.roi,scale=Math.min(job.width/source.width,job.height/source.height)*settings.scale,angle=settings.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const points=[[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(([px,py])=>{const a=(px-source.width/2)*scale,b=(py-source.height/2)*scale;return [job.width*(.5+settings.x/100)+a*c-b*s,job.height*(.5+settings.y/100)+a*s+b*c];});
 const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0])))),top=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))),right=Math.min(job.width,Math.ceil(Math.max(...points.map(p=>p[0])))),bottom=Math.min(job.height,Math.ceil(Math.max(...points.map(p=>p[1]))));
 if(right<=left||bottom<=top)fail('ROI 經疊合位移後完全落在比較畫面之外。');return {x:left,y:top,width:right-left,height:bottom-top};
}
export function comparisonCamera(view,job){
 const camera=view.camera.clone();camera.clearViewOffset();camera.aspect=job.width/job.height;
 const reference=job.camera||job.view?.referenceCamera||(!job.view?currentReferenceCamera(view):null);
 if(reference){camera.position.fromArray(reference.position);camera.lookAt(new THREE.Vector3().fromArray(reference.target));applyReferenceProjection(camera,reference,job.width,job.height);}else if(job.view){camera.position.fromArray(job.view.position);camera.quaternion.fromArray(job.view.quaternion);applyViewportProjection(camera,job.view.fov,job.view.viewport,job.width,job.height);}else applyViewportProjection(camera,view.camera.fov,[view.width||view.camera.aspect*1000,view.height||1000],job.width,job.height);
 camera.updateMatrixWorld(true);return camera;
}
// Keep renderer state restoration synchronous: no animation frame can observe a partial export.
export function withReferenceRenderTarget(renderer,target,draw){
 const state={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace?.()||0,mip:renderer.getActiveMipmapLevel?.()||0,viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),color:renderer.getClearColor(new THREE.Color()).clone(),alpha:renderer.getClearAlpha(),autoClear:renderer.autoClear,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,xr:renderer.xr?.enabled};
 try{if(renderer.xr)renderer.xr.enabled=false;renderer.autoClear=true;renderer.setRenderTarget(target);renderer.setViewport(0,0,target.width,target.height);renderer.setScissorTest(false);return draw();}
 finally{renderer.setRenderTarget(state.target,state.face,state.mip);renderer.setViewport(state.viewport);renderer.setScissor(state.scissor);renderer.setScissorTest(state.scissorTest);renderer.setClearColor(state.color,state.alpha);renderer.autoClear=state.autoClear;renderer.toneMapping=state.toneMapping;renderer.toneMappingExposure=state.exposure;if(renderer.xr)renderer.xr.enabled=state.xr;}
}
function meshIdentity(mesh){let id=null,levelId=null,kind=mesh.userData.kind||'geometry';for(let node=mesh;node;node=node.parent){const d=node.userData||{};levelId??=d.floorId||null;if(!id){if(d.elementId){id=d.elementId;kind='element';}else if(d.stairId){id=d.stairId;kind='stair';}else if(d.liftId){id=d.liftId;kind='elevator';}else if(d.shaftId){id=d.shaftId;kind='shaft';}else id=d.id||null;}}return {key:(levelId||'building')+'/'+(id||'@'+kind),levelId,id,kind};}
function canvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
function readPixels(renderer,target){const bytes=new Uint8Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,bytes);const c=canvas(target.width,target.height),ctx=c.getContext('2d'),image=ctx.createImageData(target.width,target.height),stride=target.width*4;for(let y=0;y<target.height;y++)image.data.set(bytes.subarray((target.height-1-y)*stride,(target.height-y)*stride),y*stride);ctx.putImageData(image,0,0);return c;}
function png(c,roi){if(roi.x===0&&roi.y===0&&roi.width===c.width&&roi.height===c.height)return c.toDataURL('image/png');const crop=canvas(roi.width,roi.height);crop.getContext('2d').drawImage(c,roi.x,roi.y,roi.width,roi.height,0,0,roi.width,roi.height);return crop.toDataURL('image/png');}
export async function runReferenceReview({view,building,reference,snapshot,job:input,drawReference}){
 const checked=validateBuilding(building),source=validateReferenceSnapshot(snapshot);if(!source)fail('固定視點比較缺少來源工作區。');
 const job=validateReferenceReviewJob(input,{building:checked,source:source.source});
 if(!view?.renderer||!reference?.image)fail('固定視點輸出需要已載入的來源圖與 3D 渲染器。');
 if(view.renderer.xr?.isPresenting)fail('請先離開 VR 頭盔模式，再輸出比較圖。');
 const roi=referenceRoiPixels(job,source.source,source.settings),camera=comparisonCamera(view,job),scene=new THREE.Scene(),result={},materialChanges=[],temporary=[],idMap=[];
 const built=buildBuilding(checked,{onlyLevelId:job.levelId,textures:view.textures,importedAssets:view.importedAssets,roof:job.view?.roof??view.roof});scene.add(built.group);scene.background=view.scene.background?.clone?.()||view.scene.background;scene.environment=view.scene.environment;scene.environmentIntensity=view.scene.environmentIntensity;
 for(const child of view.scene.children)if(child.isLight){const light=child.clone();light.castShadow=false;scene.add(light);}
 const meshes=[];built.group.traverse(mesh=>{if(mesh.isMesh){if(mesh.userData.kind==='opening-marker'){mesh.visible=false;return;}const identity=meshIdentity(mesh);meshes.push({mesh,identity});materialChanges.push([mesh,mesh.material]);}});
 const byKey=new Map();for(const {identity} of meshes)byKey.set(identity.key,identity);
 for(const [index,[key,identity]] of [...byKey].sort(([a],[b])=>a.localeCompare(b)).entries()){const code=Math.imul(index+1,2654435761)&0xffffff,color='#'+code.toString(16).padStart(6,'0');byKey.set(key,{...identity,color,code});idMap.push({...identity,color,code});}
 const target=new THREE.WebGLRenderTarget(job.width,job.height,{depthBuffer:true});target.texture.colorSpace=THREE.SRGBColorSpace;
 try{withReferenceRenderTarget(view.renderer,target,()=>{
   const render=()=>{view.renderer.clear();view.renderer.render(scene,camera);return readPixels(view.renderer,target);};
   let sceneImage=null;if(job.channels.some(c=>['scene','overlay'].includes(c)))sceneImage=render();
   for(const channel of job.channels){let image;
    if(channel==='scene')image=sceneImage;
    else if(channel==='source'||channel==='overlay'){image=canvas(job.width,job.height);const ctx=image.getContext('2d');if(channel==='overlay')ctx.drawImage(sceneImage,0,0);drawReference(ctx,{...reference,...source.settings,hidden:false,mode:channel==='source'?'photo':'overlay'},job.width,job.height);}
    else{scene.background=new THREE.Color(0x000000);scene.environment=null;view.renderer.toneMapping=THREE.NoToneMapping;for(const {mesh,identity} of meshes){const color=channel==='ids'?byKey.get(identity.key).color:'#ffffff',material=new THREE.MeshBasicMaterial({color,wireframe:channel==='wireframe',side:THREE.DoubleSide,toneMapped:false});temporary.push(material);mesh.material=material;}image=render();}
    result[channel]={mime:'image/png',width:roi.width,height:roi.height,data:png(image,roi)};
    for(const [mesh,material] of materialChanges)mesh.material=material;
    scene.background=view.scene.background?.clone?.()||view.scene.background;scene.environment=view.scene.environment;
   }
  });
 }finally{for(const [mesh,material] of materialChanges)mesh.material=material;temporary.forEach(m=>m.dispose());target.dispose();built.dispose();}
 const sceneSha256=await sha256(new TextEncoder().encode(JSON.stringify(checked)));
 const packet={format:'lumiere-reference-review',version:1,manifest:{job,source:{name:source.source.name,sha256:source.source.sha256,sourceId:source.source.sourceId,width:source.source.width,height:source.source.height},sceneSha256,view:captureReferenceView({camera,width:job.width,height:job.height,building:{activeLevelId:job.levelId},allFloors:job.levelId===null,roof:job.view?.roof??view.roof,controls:{target:job.camera||job.view?new THREE.Vector3().fromArray(job.camera?.target||job.view.target):view.controls.target},referenceCamera:job.camera||job.view?.referenceCamera||null}),projection:camera.projectionMatrix.toArray(),coordinateOrigin:{levelId:job.levelId,elevation:job.levelId?floorElevation(checked,job.levelId):0},overlay:source.settings,roiPixels:roi,idMap,warnings:['各通道共用同一相機與像素範圍；未計算相似度或判定重建正確。','source 通道為來源照片套用相同疊合變換後的比較畫面；ROI 使用原始來源像素，旋轉後取畫面外接矩形。','ID 圖以不透明物件顯示，包括玻璃；黑色為背景，@ 開頭為未綁定獨立構件的幾何。',...(view.ifcReference?['外加 IFC 參考模型未納入本次建築比對。']:[])]},images:result};
 assertReferenceReviewSize(packet);return packet;
}
export function assertReferenceReviewSize(packet){if(new TextEncoder().encode(JSON.stringify(packet)).length>REVIEW_BYTES)fail('比較輸出超過 10 MB；請降低工作 JSON 的 width／height，或減少 channels 後重試。');}
