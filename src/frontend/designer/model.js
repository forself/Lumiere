import {ROAD_MARKINGS,SIGNAL_STATES,SIGNAL_DIRECTIONS} from './outdoor-catalog.js';
import {validateSurfaceLoad} from './surface-load.js';
import {MATERIALS,ASSETS} from './catalog.js';
import {materialApplicationReason} from './material-application.js';
import {OPENING_STYLES,defaultStyle,openingStyle,openingParts,defaultWindowGrid,validateWindowGrid} from './openings.js';
import {DEVICE_CAPABILITIES,controlKind,compatibleTarget,targetValue,syncDeviceLinks} from './device-links.js';

export const LIMITS=Object.freeze({extent:40,vertices:512,walls:256,rooms:64,openings:160,objects:1000,fileBytes:10*1024*1024,history:80});
export const snap=value=>Math.round(value*10)/10;
export const RAIL_STYLES=Object.freeze({vertical:'直桿欄杆',glass:'玻璃欄杆',solid:'實心矮牆',horizontal:'橫桿欄杆',mesh:'網格欄杆'});
const clone=value=>structuredClone(value);
const fail=message=>{throw new Error(message);};
const finite=(value,min,max,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(`${label}必須介於 ${min} 與 ${max}。`);};
const keys=(value,allowed,label)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)fail(`${label}格式錯誤。`);
  if(Object.keys(value).length!==allowed.length||Object.keys(value).some(key=>!allowed.includes(key)))fail(`${label}含不支援或缺少的欄位。`);
};
const text=(value,label)=>{if(typeof value!=='string'||!value.trim()||value.length>64)fail(`${label}須為 1–64 字。`);};
const material=id=>{if(!Object.hasOwn(MATERIALS,id))fail('材質未登錄。');};
const point=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function onSegment(a,b,p){return Math.abs(cross(a,b,p))<1e-7&&p.x>=Math.min(a.x,b.x)-1e-7&&p.x<=Math.max(a.x,b.x)+1e-7&&p.z>=Math.min(a.z,b.z)-1e-7&&p.z<=Math.max(a.z,b.z)+1e-7;}
function intersects(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
export function insidePolygon(p,polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];if(onSegment(a,b,p))return true;
    if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
const signedArea=vertices=>vertices.reduce((sum,a,i)=>{const b=vertices[(i+1)%vertices.length];return sum+a.x*b.z-b.x*a.z;},0)/2;
export function polygonArea(vertices){return Math.abs(signedArea(vertices));}
const strictlyInside=(p,polygon)=>!polygon.some((a,i)=>onSegment(a,polygon[(i+1)%polygon.length],p))&&insidePolygon(p,polygon);
// Area-only floors may touch a partial edge without implying shared wall topology.
function polygonInteriorsOverlap(a,b){
 if(a.some(p=>strictlyInside(p,b))||b.some(p=>strictlyInside(p,a)))return true;
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
  const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
  if(cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0)return true;
  if(strictlyInside({x:(p.x+q.x)/2,z:(p.z+q.z)/2},b)||strictlyInside({x:(r.x+s.x)/2,z:(r.z+s.z)/2},a))return true;
  if(Math.abs(cross(p,q,r))<1e-7&&Math.abs(cross(p,q,s))<1e-7){
   const dx=q.x-p.x,dz=q.z-p.z,length2=dx*dx+dz*dz,along=v=>((v.x-p.x)*dx+(v.z-p.z)*dz)/length2;
   if(dx*(s.x-r.x)+dz*(s.z-r.z)>0&&Math.min(1,Math.max(along(r),along(s)))-Math.max(0,Math.min(along(r),along(s)))>1e-7)return true;
  }
 }
 return false;
}
export const wallRooms=(project,wallId)=>project.rooms.filter(room=>room.wallIds.includes(wallId));
export function wallFrame(project,wall){
  const a=project.vertices.find(v=>v.id===wall.startId),b=project.vertices.find(v=>v.id===wall.endId);
  const length=point(a,b),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
  return {a,b,length,dx,dz,nx:-dz,nz:dx};
}
export function entity(project,id){
  for(const kind of ['walls','openings','objects','rooms','vertices']){const item=project[kind].find(value=>value.id===id);if(item)return {kind,item};}
  return null;
}
export function emptyProject(){return {format:'lumiere-design',version:8,units:'m',level:{id:'level-1',name:'一樓',elevation:0},vertices:[],walls:[],rooms:[],openings:[],objects:[]};}
export function objectPose(project,object){
  if(object.trace?.anchorId){const f=traceAnchor(project,object.trace.anchorId),a=f.rotation*Math.PI/180,t=object.trace;return {...object,x:f.x+t.dx*Math.cos(a)-t.dz*Math.sin(a),z:f.z+t.dx*Math.sin(a)+t.dz*Math.cos(a),elevation:f.elevation+t.dy,rotation:((object.rotation+f.rotation)%360+360)%360};}
  if(!object.hostId)return object;
  const host=project.openings.find(o=>o.id===object.hostId),wall=project.walls.find(w=>w.id===host.wallId),f=wallFrame(project,wall),offset=host.side*(wall.thickness/2+.14);
  return {...object,x:f.a.x+f.dx*host.at*f.length+f.nx*offset,z:f.a.z+f.dz*host.at*f.length+f.nz*offset,rotation:Math.atan2(f.dz,f.dx)*180/Math.PI,elevation:host.sill,width:host.width+.2,height:host.height+.15};
}
// 水平扇區的精確輪廓；margin 是身體或選取邊界的平面緩衝距離。
export function chartSectorContains(o,p,margin=0){
  const yaw=-o.rotation*Math.PI/180,dx=p.x-o.x,dz=p.z-o.z,c=Math.cos(yaw),s=Math.sin(yaw),x=c*dx-s*dz,z=s*dx+c*dz,r=o.width/2,distance=Math.hypot(x,z),{startAngle:start,endAngle:end}=o.sector;
  if(end-start===360)return distance<=r+margin;
  let angle=(Math.atan2(-z,x)*180/Math.PI+360)%360;if(angle===0&&end===360)angle=360;
  const within=angle>=start&&angle<=end;
  if(distance<1e-12||within&&distance<=r+margin)return true;
  const segmentDistance=a=>{const vx=r*Math.cos(a*Math.PI/180),vz=-r*Math.sin(a*Math.PI/180),t=Math.max(0,Math.min(1,(x*vx+z*vz)/(r*r)));return Math.hypot(x-t*vx,z-t*vz);};
  return Math.min(segmentDistance(start),segmentDistance(end))<=margin;
}
// 跡證使用獨立的相對座標，不併入宿主幾何；不允許跡證互相依附。
export function traceAnchor(project,id){
 const found=entity(project,id);if(!found||found.kind==='vertices'||found.item.trace)fail('請選取有效的地坪、牆、門窗或物品宿主。');
 const {kind,item}=found;
 if(kind==='objects')return objectPose(project,item);
 if(kind==='rooms'){const v=project.vertices.find(v=>v.id===item.vertexIds[0]);return {...v,elevation:0,rotation:0};}
 const wall=kind==='walls'?item:project.walls.find(w=>w.id===item.wallId),f=wallFrame(project,wall),along=kind==='walls'?0:item.at*f.length;
 return {x:f.a.x+f.dx*along,z:f.a.z+f.dz*along,elevation:kind==='walls'?0:item.sill,rotation:Math.atan2(f.dz,f.dx)*180/Math.PI};
}
function positionTrace(project,o,pose,anchorId=o.trace.anchorId){
 const f=anchorId?traceAnchor(project,anchorId):{x:0,z:0,elevation:0,rotation:0},a=f.rotation*Math.PI/180,dx=pose.x-f.x,dz=pose.z-f.z;
 Object.assign(o,{x:pose.x,z:pose.z,elevation:pose.elevation,rotation:((pose.rotation-f.rotation)%360+360)%360});
 Object.assign(o.trace,{anchorId,dx:dx*Math.cos(a)+dz*Math.sin(a),dz:-dx*Math.sin(a)+dz*Math.cos(a),dy:pose.elevation-f.elevation});
}
const id=(project,prefix)=>{let index=1;const ids=new Set(['vertices','walls','rooms','openings','objects'].flatMap(key=>project[key].map(item=>item.id)));while(ids.has(`${prefix}-${index}`))index++;return `${prefix}-${index}`;};
export function validateProject(project){
  keys(project,['format','version','units','level','vertices','walls','rooms','openings','objects'],'設計檔');
  if(project.format!=='lumiere-design'||![1,2,3,4,5,6,7,8,9].includes(project.version)||project.units!=='m')fail('只接受第 1–9 版公尺制設計檔。');
  keys(project.level,['id','name','elevation'],'樓層');text(project.level.name,'樓層名稱');
  if(project.level.id!=='level-1'||project.level.elevation!==0)fail('第一階段只支援地坪標高 0 的單樓層。');
  const ids=new Set();
  for(const list of ['vertices','walls','rooms','openings','objects']){
    if(!Array.isArray(project[list])||project[list].length>LIMITS[list])fail(`${list}數量超出限制。`);
    for(const item of project[list]){if(!item||typeof item.id!=='string'||! /^[a-z][a-z0-9-]{0,63}$/.test(item.id)||ids.has(item.id))fail('構件 ID 格式錯誤或重複。');ids.add(item.id);}
  }
  const vertexIds=new Set(project.vertices.map(v=>v.id));
  for(const v of project.vertices){keys(v,['id','x','z'],'角點');finite(v.x,-LIMITS.extent,LIMITS.extent,'X');finite(v.z,-LIMITS.extent,LIMITS.extent,'Z');}
  if(project.version===1){
    const upgraded=clone(project);upgraded.version=2;
    for(const room of upgraded.rooms){
      if(!Array.isArray(room.vertexIds)||!Array.isArray(room.wallIds))continue;
      const polygon=room.vertexIds.map(vId=>upgraded.vertices.find(v=>v.id===vId));
      if(polygon.every(Boolean)&&signedArea(polygon)<0){room.vertexIds=[room.vertexIds[0],...room.vertexIds.slice(1).reverse()];room.wallIds.reverse();}
    }
    return validateProject(upgraded);
  }
  if(project.version===2){
    const upgraded=clone(project);upgraded.version=3;
    for(const o of upgraded.openings){keys(o,['id','wallId','kind','at','width','height','sill','open'],'舊版門窗');o.styleId=defaultStyle(o.kind);o.side=1;}
    return validateProject(upgraded);
  }
  if(project.version===3){
    const upgraded=clone(project);upgraded.version=4;
    for(const r of upgraded.rooms){keys(r,['id','name','vertexIds','wallIds','materialId'],'舊版房間');r.type='room';}
    for(const w of upgraded.walls){keys(w,['id','startId','endId','height','thickness','materialId'],'舊版牆');w.type='wall';w.railStyle='vertical';}
    return validateProject(upgraded);
  }
  if(project.version===4){
    const upgraded=clone(project);upgraded.version=5;
    for(const o of upgraded.objects){keys(o,['id','assetId','x','z','rotation','width','depth','height','materialId'],'舊版家具');o.elevation=0;o.hostId=null;o.installation='none';}
    return validateProject(upgraded);
  }
  if(project.version===5){
    const upgraded=clone(project);upgraded.version=6;
    for(const o of upgraded.objects){keys(o,['id','assetId','x','z','rotation','width','depth','height','materialId','elevation','hostId','installation'],'舊版設備');const spec=ASSETS[o.assetId];o.controls=Array(spec?.control?.channels||0).fill(spec?.control?.initial);}
    return validateProject(upgraded);
  }
  if(project.version===6){
    const upgraded=clone(project);upgraded.version=7;
    for(const o of upgraded.objects){keys(o,['id','assetId','x','z','rotation','width','depth','height','materialId','elevation','hostId','installation','controls'],'舊版設備');o.targets=Array(ASSETS[o.assetId]?.control?.channels||0).fill(null);o.deviceState=Object.hasOwn(DEVICE_CAPABILITIES,o.assetId)?{power:false,level:0,temperature:24}:null;}
    return validateProject(upgraded);
  }
  if(project.version===7){const upgraded=clone(project);upgraded.version=8;for(const o of upgraded.objects){keys(o,['id','assetId','x','z','rotation','width','depth','height','materialId','elevation','hostId','installation','controls','targets','deviceState'],'舊版設備');o.media=['tv','projector'].includes(o.assetId)?{screenId:null,speakerId:null,throwRatio:1.5}:null;}return validateProject(upgraded);}
  for(let i=0;i<project.vertices.length;i++)for(let j=i+1;j<project.vertices.length;j++)if(point(project.vertices[i],project.vertices[j])<1e-7)fail('重合角點必須使用同一個 ID。');
  for(const w of project.walls){
    keys(w,['id','startId','endId','height','thickness','materialId','type','railStyle',...(project.version===9&&Object.hasOwn(w,'independent')?['independent']:[])],'牆／欄杆');
    if(Object.hasOwn(w,'independent')&&w.independent!==true)fail('獨立牆標記只能為 true。');
    if(!['wall','rail'].includes(w.type)||!Object.hasOwn(RAIL_STYLES,w.railStyle))fail('牆／欄杆類型未登錄。');
    if(!vertexIds.has(w.startId)||!vertexIds.has(w.endId)||w.startId===w.endId)fail('牆的角點關係錯誤。');
    const independent=w.independent&&!wallRooms(project,w.id).length;
    finite(w.height,w.type==='rail'?.6:2,w.type==='rail'?2:5,'牆／欄杆高');finite(w.thickness,independent?.015:.08,.4,'牆厚');material(w.materialId);
    finite(wallFrame(project,w).length,independent?.02:.6,40,'牆長');
  }
  const roomWalls=new Set(),roomVertices=new Set(),polygons=[];
  for(const r of project.rooms){
    keys(r,['id','name','vertexIds','wallIds','materialId','type',...(Object.hasOwn(r,'surfaceLoad')?['surfaceLoad']:[]),...(project.version===9&&Object.hasOwn(r,'boundaryMode')?['boundaryMode']:[])],'空間');text(r.name,'空間名稱');material(r.materialId);
    if(Object.hasOwn(r,'boundaryMode')&&r.boundaryMode!=='area')fail('地坪邊界模式不支援。');
    const area=r.boundaryMode==='area';
    if(!['room','balcony'].includes(r.type))fail('空間類型未登錄。');
    if(!Array.isArray(r.vertexIds)||r.vertexIds.length<3||r.vertexIds.length>(area?64:16)||new Set(r.vertexIds).size!==r.vertexIds.length||!Array.isArray(r.wallIds)||r.wallIds.length!==(area?0:r.vertexIds.length))fail('房間必須是封閉的單一輪廓。');
    const polygon=r.vertexIds.map(vId=>project.vertices.find(v=>v.id===vId));
    if(polygon.some(v=>!v))fail('房間角點遺失。');
    for(let i=0;i<r.vertexIds.length;i++){
      const w=project.walls.find(w=>w.id===r.wallIds[i]);
      const a=r.vertexIds[i],b=r.vertexIds[(i+1)%r.vertexIds.length];
      if(!area&&(!w||!(w.startId===a&&w.endId===b||w.startId===b&&w.endId===a)))fail('房間牆線未閉合。');
      if(!area)roomWalls.add(w.id);roomVertices.add(r.vertexIds[i]);
      for(let j=i+2;j<polygon.length;j++){
        if(i===0&&j===polygon.length-1)continue;
        if(intersects(polygon[i],polygon[(i+1)%polygon.length],polygon[j],polygon[(j+1)%polygon.length]))fail('房間輪廓不能交叉。');
      }
    }
    if(signedArea(polygon)<(area?.01:1)-1e-9)fail(area?'地坪面積至少需要 0.01 平方公尺，且輪廓不可翻轉。':'房間面積至少需要 1 平方公尺，且輪廓不可翻轉。');
    for(const {polygon:other,room:peer} of polygons){
      if(area||peer.boundaryMode==='area'){if(polygonInteriorsOverlap(polygon,other))fail('房間內部不能重疊。');continue;}
      if(polygon.some(p=>strictlyInside(p,other))||other.some(p=>strictlyInside(p,polygon)))fail('房間內部不能重疊。');
      for(let i=0;i<polygon.length;i++)for(let j=0;j<other.length;j++){
        const a=polygon[i],b=polygon[(i+1)%polygon.length],c=other[j],d=other[(j+1)%other.length];
        if(!intersects(a,b,c,d))continue;
        if(r.wallIds[i]===peer.wallIds[j]){
          if(a.id!==d.id||b.id!==c.id)fail('共用牆的兩個房間必須位於牆的相反兩側。');
          continue;
        }
        const common=[a,b].filter(v=>v.id===c.id||v.id===d.id);
        const interiorTouch=(v,s,t)=>onSegment(s,t,v)&&v.id!==s.id&&v.id!==t.id;
        if(common.length!==1||interiorTouch(a,c,d)||interiorTouch(b,c,d)||interiorTouch(c,a,b)||interiorTouch(d,a,b))fail('房間只能沿整面牆相接；局部接牆請啟用自動分段或先切分牆段；交叉房間不可重疊。');
      }
    }
    polygons.push({polygon,room:r});
  }
  for(const w of project.walls)if(w.independent){roomWalls.add(w.id);roomVertices.add(w.startId);roomVertices.add(w.endId);}
  if(roomWalls.size!==project.walls.length||roomVertices.size!==project.vertices.length)fail('設計包含沒有房間歸屬的牆或角點。');
  for(const w of project.walls)if(wallRooms(project,w.id).length>2)fail('一面牆最多連接兩個房間。');
  for(const w of project.walls)if(w.type==='rail'&&!(w.independent&&!wallRooms(project,w.id).length)&&(wallRooms(project,w.id).length!==1||wallRooms(project,w.id)[0].type!=='balcony'))fail('欄杆只能配置在陽台外緣。');
  for(const o of project.openings){
    keys(o,['id','wallId','kind','at','width','height','sill','open','styleId','side',...(Object.hasOwn(o,'grid')?['grid']:[])],'門窗');
    const w=project.walls.find(w=>w.id===o.wallId);if(!w)fail('門窗所屬牆已遺失。');
    if(w.type==='rail')fail('欄杆不可放門窗；請在室內與陽台之間的實牆放門。');
    if(!['door','window'].includes(o.kind)||typeof o.open!=='boolean')fail('門窗類型或狀態錯誤。');
    finite(o.at,0,1,'相對位置');finite(o.width,.4,6,'門窗寬');finite(o.height,.3,4,'門窗高');finite(o.sill,0,3,'窗臺高');
    if(!Object.hasOwn(OPENING_STYLES,o.styleId)||openingStyle(o).kind!==o.kind||![1,-1].includes(o.side))fail('門窗樣式或內側方向未登錄。');
    const spec=openingStyle(o);
    if(spec.grid)validateWindowGrid(o.grid,o.width,o.height);else if(Object.hasOwn(o,'grid'))fail('只有多格固定窗可保存窗格設定。');
    if(o.kind==='door'&&o.sill!==0||spec.motion==='fixed'&&o.open)fail('門的底部需為 0；固定窗不可開啟。');
    const length=wallFrame(project,w).length,center=o.at*length,margin=w.independent&&!wallRooms(project,w.id).length?.001:.1;
    if(center-o.width/2<margin-1e-7||center+o.width/2>length-margin+1e-7||o.sill+o.height>w.height-.1+1e-7)fail('門窗超出牆面；請增加牆長／牆高或縮小門窗。');
    if(spec.motion==='rollup'&&o.sill+o.height+.3>w.height+1e-7)fail('鐵捲門上方需保留至少 30 公分捲箱空間。');
    if(!freeWall(project,w)&&spec.motion==='double-slide'&&(center-(o.width-.1)<.05||center+(o.width-.1)>length-.05))fail('雙邊落地拉門兩側需各有半扇門寬的停放空間。');
    if(spec.motion==='slide'){
      const parked=center+spec.travel*o.side*(o.width-.1);
      if(!freeWall(project,w)&&(parked-(o.width-.1)/2<.05||parked+(o.width-.1)/2>length-.05))fail('拉門停放側的牆長不足，請移動門洞、縮小寬度或改變拉向。');
    }
    if(freeWall(project,w)&&['slide','double-slide'].includes(spec.motion)){const f=wallFrame(project,w);for(const p of openingParts(o,w,1).parts)for(const dx of [-p.width/2,p.width/2])for(const dz of [-.025,.025]){finite(f.a.x+f.dx*(center+p.x+dx)+f.nx*(p.z+dz),-LIMITS.extent,LIMITS.extent,'拉門停放 X');finite(f.a.z+f.dz*(center+p.x+dx)+f.nz*(p.z+dz),-LIMITS.extent,LIMITS.extent,'拉門停放 Z');}}
    for(const peer of project.openings){if(peer.id!==o.id&&peer.wallId===o.wallId&&Math.abs(peer.at-o.at)*length<(peer.width+o.width)/2+margin-1e-7)fail(margin===.1?'同牆門窗之間需保留至少 10 公分。':'獨立牆門窗之間需保留至少 1 公釐。');}
  }
  for(const o of project.objects){
    keys(o,['id','assetId','x','z','rotation','width','depth','height','materialId','elevation','hostId','installation','controls','targets','deviceState','media',...(Object.hasOwn(o,'trace')?['trace']:[]),...(Object.hasOwn(o,'prop')?['prop']:[]),...(Object.hasOwn(o,'surfaceLoad')?['surfaceLoad']:[]),...(Object.hasOwn(o,'annotation')?['annotation']:[]),...(Object.hasOwn(o,'outdoor')?['outdoor']:[]),...(Object.hasOwn(o,'sector')?['sector']:[])],'家具設備');
    if(Object.hasOwn(o,'annotation')&&(typeof o.annotation!=='string'||!o.annotation.trim()||o.annotation.length>64))fail('人工標籤須為 1–64 字。');
    if(!Object.hasOwn(ASSETS,o.assetId))fail('素材未登錄。');material(o.materialId);
    finite(o.x,-40,40,'家具 X');finite(o.z,-40,40,'家具 Z');finite(o.rotation,-360,360,'旋轉角度');
    finite(o.elevation,-10,20,'離地高度');
    if(ASSETS[o.assetId].outdoor){keys(o.outdoor,['marking','signal','direction',...(Object.hasOwn(o.outdoor,'lampCount')?['lampCount']:[])],'戶外設定');if(Object.hasOwn(o.outdoor,'lampCount')&&(!ASSETS[o.assetId].shape.includes('signal')||!Number.isInteger(o.outdoor.lampCount)||o.outdoor.lampCount<1||o.outdoor.lampCount>6))fail('號誌燈數須為 1–6 的整數。');if(!Object.hasOwn(ROAD_MARKINGS,o.outdoor.marking)||!Object.hasOwn(SIGNAL_STATES,o.outdoor.signal)||!Object.hasOwn(SIGNAL_DIRECTIONS,o.outdoor.direction))fail('戶外設定未登錄。');if(!ASSETS[o.assetId].markable&&o.outdoor.marking!=='none')fail('此元件不支援附加標線。');}else if(Object.hasOwn(o,'outdoor'))fail('此素材不是戶外元件。');
    if(ASSETS[o.assetId].trace){
      keys(o.trace,['anchorId','dx','dy','dz','pitch','roll','label'],'跡證標記');
      if(o.trace.anchorId!==null){traceAnchor(project,o.trace.anchorId);const p=objectPose(project,o);finite(p.x,-40,40,'跡證世界 X');finite(p.z,-40,40,'跡證世界 Z');finite(p.elevation,-10,20,'跡證世界高度');}
      for(const k of ['dx','dy','dz'])finite(o.trace[k],-80,80,'相對位置');
      for(const k of ['pitch','roll'])finite(o.trace[k],-180,180,'跡證傾角');
      if(typeof o.trace.label!=='string'||o.trace.label.length>64)fail('跡證編號最多 64 字。');
    }else if(Object.hasOwn(o,'trace'))fail('此素材不是跡證標記。');
    if(ASSETS[o.assetId].prop){keys(o.prop,['color','pitch','roll','label'],'擺設設定');if(!/^#[0-9a-fA-F]{6}$/.test(o.prop.color))fail('顏色請使用 #RRGGBB。');for(const k of ['pitch','roll'])finite(o.prop[k],-180,180,'擺設傾角');if(typeof o.prop.label!=='string'||o.prop.label.length>64)fail('物品名稱最多 64 字。');}else if(Object.hasOwn(o,'prop'))fail('此素材不支援擺設設定。');
    for(const key of ['width','depth','height'])finite(o[key],ASSETS[o.assetId].prop?.0001:ASSETS[o.assetId].outdoor?.001:.01,ASSETS[o.assetId].outdoor?60:ASSETS[o.assetId].vehicleType&&key==='depth'?25:8,'家具設備尺寸');
    if(o.assetId==='chart-sector'){
      keys(o.sector,['startAngle','endAngle'],'扇區角度');for(const key of ['startAngle','endAngle'])finite(o.sector[key],0,360,'扇區角度');
      if(o.sector.endAngle<=o.sector.startAngle)fail('扇區終角必須大於起角，且不得超過 360 度。');
      if(o.width!==o.depth)fail('圓餅扇區的寬度與深度必須相同。');
      if(o.prop.pitch!==0||o.prop.roll!==0)fail('圓餅扇區保持水平；可調整平面旋轉方向。');
    }else if(Object.hasOwn(o,'sector'))fail('此素材不支援圓餅扇區角度。');
    if(o.assetId==='crosswalk'){finite(o.width,.4,60,'穿越道跨越長度');finite(o.depth,2,8,'枕木線段長度');}else if(o.outdoor?.marking==='crosswalk'&&(o.width<.4||o.depth<2))fail('枕木紋需至少 0.4 m 寬及 2 m 深的鋪面。');
    if(['tv','projector'].includes(o.assetId)){keys(o.media,['screenId','speakerId','throwRatio'],'影音設定');finite(o.media.throwRatio,.2,5,'投射比');for(const [key,asset] of [['screenId','projection-screen'],['speakerId','speakers']]){if(o.media[key]!==null&&!project.objects.some(t=>t.id===o.media[key]&&t.assetId===asset))fail('影音配對對象不存在或類型錯誤。');}if(o.assetId==='tv'&&o.media.screenId!==null)fail('電視不需投影屏幕。');}else if(o.media!==null)fail('此物件不支援影音設定。');
    const asset=ASSETS[o.assetId];
    if(!Array.isArray(o.controls)||o.controls.length!==(asset.control?.channels||0))fail('設備控制路數錯誤。');
    for(const value of o.controls){finite(value,asset.control.min,asset.control.max,'控制值');if(!Number.isInteger(value))fail('控制值必須為整數。');}
    if(!Array.isArray(o.targets)||o.targets.length!==o.controls.length||new Set(o.targets.filter(id=>id!==null)).size!==o.targets.filter(id=>id!==null).length)fail('控制對象路數錯誤或重複。');
    if(Object.hasOwn(DEVICE_CAPABILITIES,o.assetId)){
      keys(o.deviceState,['power','level','temperature'],'家電狀態');if(typeof o.deviceState.power!=='boolean')fail('家電開關狀態錯誤。');finite(o.deviceState.level,0,100,'亮度');finite(o.deviceState.temperature,16,30,'設定溫度');
      if(!Number.isInteger(o.deviceState.level)||!Number.isInteger(o.deviceState.temperature))fail('家電設定需為整數。');
      if(o.assetId==='light'&&o.deviceState.power!==(o.deviceState.level>0))fail('燈具開關與亮度不一致。');
    }else if(o.deviceState!==null)fail('此素材不具備家電狀態。');
    if(asset.shape==='pipe'?!['exposed','concealed'].includes(o.installation):o.installation!=='none')fail('只有管線可指定明管／暗管。');
    if(asset.category==='attachments'){
      const host=project.openings.find(v=>v.id===o.hostId);if(!host||host.kind!==asset.hostKind)fail('附加項目必須依附對應的門或窗。');
      if(project.objects.some(peer=>peer.id!==o.id&&peer.hostId===o.hostId&&peer.assetId===o.assetId))fail('同一門窗已有此附加項目。');
    }else if(o.hostId!==null)fail('此素材不接受依附關係。');
  }
  for(const host of [...project.rooms,...project.objects])validateSurfaceLoad(project,host,insidePolygon);
  for(const o of project.objects)o.targets.forEach((id,i)=>{if(id===null)return;const target=project.objects.find(t=>t.id===id);if(!target||target.id===o.id||!compatibleTarget(o,target)||o.controls[i]!==targetValue(o,target))fail('控制對象不存在、不相容或狀態不一致。');});
  return project;
}
function vertexAt(project,p){let v=project.vertices.find(v=>point(v,p)<1e-7);if(!v){v={id:id(project,'vertex'),x:p.x,z:p.z};project.vertices.push(v);}return v;}
function pruneVertices(project){const used=new Set([...project.rooms.flatMap(r=>r.vertexIds),...project.walls.flatMap(w=>[w.startId,w.endId])]);project.vertices=project.vertices.filter(v=>used.has(v.id));}
const freeWall=(project,w)=>w.independent===true&&!wallRooms(project,w.id).length;
function moveFreeWall(project,w,a,b){w.startId=vertexAt(project,a).id;w.endId=vertexAt(project,b).id;pruneVertices(project);}
function polygonPoints(input,max){if(!Array.isArray(input)||input.length<3||input.length>max)fail(`多邊形須有 3–${max} 個角點。`);for(const p of input){keys(p,['x','z'],'角點');finite(p.x,-LIMITS.extent,LIMITS.extent,'X');finite(p.z,-LIMITS.extent,LIMITS.extent,'Z');}const points=input.map(p=>({...p}));if(point(points[0],points.at(-1))<1e-7)points.pop();if(points.length<3)fail('多邊形至少需要三個不同角點。');if(signedArea(points)<0)points.reverse();return points;}
function addFloorArea(project,points,options={}){
 project.version=9;const room={id:id(project,'room'),name:options.name??`地坪 ${project.rooms.length+1}`,vertexIds:points.map(p=>vertexAt(project,p).id),wallIds:[],materialId:options.materialId??'oak',type:options.roomType??'room',boundaryMode:'area'};project.rooms.push(room);return room;
}
function splitWallSegment(project,w,distance){const f=wallFrame(project,w),minimum=freeWall(project,w)?.02:.6;if(distance<minimum-1e-7||f.length-distance<minimum-1e-7)fail(`自動接牆會產生短於 ${minimum} m 的牆段，請調整接點。`);if(project.openings.some(o=>o.wallId===w.id&&Math.abs(o.at*f.length-distance)<o.width/2+.02))fail('接牆分段點穿過門窗，請調整新房間邊界。');
      const mid=vertexAt(project,{x:f.a.x+f.dx*distance,z:f.a.z+f.dz*distance});
      const second={...w,id:id(project,'wall'),startId:mid.id};w.endId=mid.id;project.walls.push(second);
      for(const r of project.rooms){const i=r.wallIds.indexOf(w.id);if(i<0)continue;const forward=r.vertexIds[i]===w.startId;r.vertexIds.splice(i+1,0,mid.id);r.wallIds.splice(i,1,...(forward?[w.id,second.id]:[second.id,w.id]));}
      for(const o of project.openings.filter(o=>o.wallId===w.id)){const d=o.at*f.length;if(d<distance)o.at=d/distance;else{o.wallId=second.id;o.at=(d-distance)/(f.length-distance);}}}
function addRoomPolygon(project,points,{autoJoin=false}={}){
  if(autoJoin){for(const point of points){const wall=project.walls.find(w=>{const f=wallFrame(project,w);return onSegment(f.a,f.b,point)&&Math.hypot(point.x-f.a.x,point.z-f.a.z)>1e-7&&Math.hypot(point.x-f.b.x,point.z-f.b.z)>1e-7;});if(wall){const f=wallFrame(project,wall);splitWallSegment(project,wall,Math.hypot(point.x-f.a.x,point.z-f.a.z));}}
    const expanded=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];expanded.push(a);expanded.push(...project.vertices.filter(v=>onSegment(a,b,v)&&point(v,a)>1e-7&&point(v,b)>1e-7).sort((u,v)=>point(a,u)-point(a,v)).map(v=>({x:v.x,z:v.z})));}points=expanded;
  }

  const room={id:id(project,'room'),name:`空間 ${project.rooms.length+1}`,vertexIds:[],wallIds:[],materialId:'oak',type:'room'};
  for(const p of points){
    let v=project.vertices.find(v=>point(v,p)<1e-7);
    if(!v){v={id:id(project,'vertex'),x:p.x,z:p.z};project.vertices.push(v);}room.vertexIds.push(v.id);
  }
  for(let i=0;i<room.vertexIds.length;i++){
    const a=room.vertexIds[i],b=room.vertexIds[(i+1)%room.vertexIds.length];
    let w=project.walls.find(w=>w.startId===a&&w.endId===b||w.startId===b&&w.endId===a);
    if(!w){w={id:id(project,'wall'),startId:a,endId:b,height:2.8,thickness:.15,materialId:'plaster',type:'wall',railStyle:'vertical'};project.walls.push(w);}room.wallIds.push(w.id);
  }
  project.rooms.push(room);return room;
}
export function applyCommand(source,command){
  const project=clone(validateProject(source)),c=command;
  const priorTraces=new Map(project.objects.filter(o=>o.trace?.anchorId).map(o=>[o.id,objectPose(project,o)]));
  const selected=()=>{const found=entity(project,c.id);if(!found)fail('找不到選取構件。');return found;};
  switch(c.type){
    case 'wall.add':{
      keys(c,['type','start','end','height','thickness','materialId',...['wallType','railStyle'].filter(k=>Object.hasOwn(c,k))],'新增獨立牆');
      for(const p of [c.start,c.end]){keys(p,['x','z'],'牆端點');finite(p.x,-LIMITS.extent,LIMITS.extent,'X');finite(p.z,-LIMITS.extent,LIMITS.extent,'Z');}
      project.version=9;const a=vertexAt(project,c.start),b=vertexAt(project,c.end);project.walls.push({id:id(project,'wall'),startId:a.id,endId:b.id,height:c.height,thickness:c.thickness,materialId:c.materialId,type:c.wallType??'wall',railStyle:c.railStyle??'vertical',independent:true});break;
    }
    case 'floorArea.add':{
      keys(c,['type','points',...['name','materialId','roomType'].filter(k=>Object.hasOwn(c,k))],'新增獨立地坪');addFloorArea(project,polygonPoints(c.points,64),c);break;
    }
    case 'floorArea.translate':{
      const {kind,item}=selected();if(kind!=='rooms'||item.boundaryMode!=='area')fail('請選取獨立地坪。');finite(c.dx,-80,80,'移動 X');finite(c.dz,-80,80,'移動 Z');const points=item.vertexIds.map(id=>{const v=project.vertices.find(v=>v.id===id);return {x:v.x+c.dx,z:v.z+c.dz};});item.vertexIds=points.map(p=>vertexAt(project,p).id);pruneVertices(project);break;
    }
    case 'wall.translate':{
      const {kind,item}=selected();if(kind!=='walls'||!freeWall(project,item))fail('請選取沒有房間歸屬的獨立牆。');finite(c.dx,-80,80,'移動 X');finite(c.dz,-80,80,'移動 Z');const f=wallFrame(project,item);moveFreeWall(project,item,{x:f.a.x+c.dx,z:f.a.z+c.dz},{x:f.b.x+c.dx,z:f.b.z+c.dz});break;
    }
    case 'addRoom':{
      finite(c.x,-40,40,'X');finite(c.z,-40,40,'Z');finite(c.width,1,30,'房間寬');finite(c.depth,1,30,'房間深');
      addRoomPolygon(project,[[c.x,c.z],[c.x+c.width,c.z],[c.x+c.width,c.z+c.depth],[c.x,c.z+c.depth]].map(([x,z])=>({x,z})),{autoJoin:!!c.autoJoin});break;
    }
    case 'attachBalcony':
    case 'attachRoom':{
      const wall=project.walls.find(w=>w.id===c.wallId),owners=wallRooms(project,c.wallId);
      if(!wall||owners.length!==1)fail('請選擇只有一側房間的外牆；共用牆不能再接第三間。');
      if(wall.type!=='wall'||owners[0].type!=='room')fail('請從室內房間的實體外牆向外延伸。');
      finite(c.depth,1,30,'相鄰房間深度');
      const room=owners[0],index=room.wallIds.indexOf(wall.id);
      const a=project.vertices.find(v=>v.id===room.vertexIds[index]),b=project.vertices.find(v=>v.id===room.vertexIds[(index+1)%room.vertexIds.length]);
      const length=point(a,b),nx=(b.z-a.z)/length,nz=-(b.x-a.x)/length;
      const created=addRoomPolygon(project,[b,a,{x:a.x+nx*c.depth,z:a.z+nz*c.depth},{x:b.x+nx*c.depth,z:b.z+nz*c.depth}]);
      for(const wallId of created.wallIds){const w=project.walls.find(w=>w.id===wallId);if(wallRooms(project,wallId).length===1){w.height=wall.height;w.thickness=wall.thickness;w.materialId=wall.materialId;}}
      if(c.type==='attachBalcony'){
        created.type='balcony';created.name=`陽台 ${project.rooms.filter(r=>r.type==='balcony').length}`;created.materialId='stone';
        for(const wallId of created.wallIds){const w=project.walls.find(w=>w.id===wallId);if(wallId!==wall.id){if(wallRooms(project,wallId).length!==1)fail('陽台外緣不可與其他空間重疊共邊。');w.type='rail';w.height=1.1;w.thickness=.1;w.materialId='stone';}}
      }
      break;
    }
    case 'railStyle':{const found=selected();if(found.kind!=='walls'||found.item.type!=='rail')fail('請選陽台欄杆。');found.item.railStyle=c.styleId;break;}
    case 'moveVertex':{const found=selected();if(found.kind!=='vertices')fail('只能移動角點。');found.item.x=c.x;found.item.z=c.z;break;}
    case 'mediaSettings':{const {item}=selected();if(!item.media)fail('請選取電視或投影機。');item.media={screenId:c.screenId,speakerId:c.speakerId,throwRatio:c.throwRatio};break;}
    case 'displaySize':{
      const {kind,item}=selected();if(kind!=='objects'||!['tv','projection-screen'].includes(item.assetId))fail('請選取液晶電視或投影屏幕。');
      finite(c.inches,10,300,'對角線吋數');const diagonal=c.inches*.0254;item.width=diagonal*16/Math.sqrt(337);item.height=diagonal*9/Math.sqrt(337);break;
    }
    case 'addPolygon':{if(!Array.isArray(c.points)||c.points.length<3||c.points.length>16)fail('多邊形房間須有 3–16 個角點。');for(const point of c.points){keys(point,['x','z'],'角點');finite(point.x,-LIMITS.extent,LIMITS.extent,'X');finite(point.z,-LIMITS.extent,LIMITS.extent,'Z');}const points=c.points.map(p=>({...p}));if(point(points[0],points.at(-1))<1e-7)points.pop();if(points.length<3)fail('多邊形至少需要三個不同角點。');if(signedArea(points)<0)points.reverse();addRoomPolygon(project,points,{autoJoin:!!c.autoJoin});break;}
    case 'wall.move':{const found=selected();if(found.kind!=='walls')fail('請先選擇牆面。');finite(c.distance,-40,40,'牆面平移');const f=wallFrame(project,found.item);if(freeWall(project,found.item))moveFreeWall(project,found.item,{x:f.a.x+f.nx*c.distance,z:f.a.z+f.nz*c.distance},{x:f.b.x+f.nx*c.distance,z:f.b.z+f.nz*c.distance});else for(const v of [f.a,f.b]){v.x+=f.nx*c.distance;v.z+=f.nz*c.distance;}break;}
    case 'wall.split':{
      const found=selected();if(found.kind!=='walls')fail('請先選擇牆面。');const w=found.item,f=wallFrame(project,w),minimum=freeWall(project,w)?.02:.6;finite(c.distance,minimum,f.length-minimum,'分段位置');
      if(project.openings.some(o=>o.wallId===w.id&&Math.abs(o.at*f.length-c.distance)<o.width/2+.02))fail('分段位置不可穿過門窗開口，請移動分段點。');
      splitWallSegment(project,w,c.distance);break;
    }
    case 'wall.merge':{
      const walls=project.walls.filter(w=>[w.startId,w.endId].includes(c.vertexId));if(walls.length!==2)fail('此角點必須僅連接兩面牆，不能合併交叉或分岔牆。');const [a,b]=walls,owners=w=>wallRooms(project,w.id).map(r=>r.id).sort().join(',');
      if(owners(a)!==owners(b)||['height','thickness','materialId','type','railStyle','independent'].some(k=>a[k]!==b[k]))fail('只有相同歸屬、尺寸、材質與類型的共線牆可合併。');
      const start=project.vertices.find(v=>v.id===(a.startId===c.vertexId?a.endId:a.startId)),end=project.vertices.find(v=>v.id===(b.startId===c.vertexId?b.endId:b.startId)),mid=project.vertices.find(v=>v.id===c.vertexId),dx=end.x-start.x,dz=end.z-start.z,len=Math.hypot(dx,dz);
      if(Math.abs((mid.x-start.x)*dz-(mid.z-start.z)*dx)>1e-6||point(start,mid)+point(mid,end)>len+1e-6)fail('只有同一直線上的相鄰牆可合併。');
      const openings=project.openings.filter(o=>[a.id,b.id].includes(o.wallId)).map(o=>{const f=wallFrame(project,project.walls.find(w=>w.id===o.wallId));return {o,x:f.a.x+(f.b.x-f.a.x)*o.at,z:f.a.z+(f.b.z-f.a.z)*o.at,sign:f.dx*dx+f.dz*dz>=0?1:-1};});
      a.startId=start.id;a.endId=end.id;project.walls=project.walls.filter(w=>w!==b);
      for(const r of project.rooms.filter(r=>r.boundaryMode!=='area'&&r.vertexIds.includes(c.vertexId))){r.vertexIds=r.vertexIds.filter(id=>id!==c.vertexId);r.wallIds=r.vertexIds.map((v,i)=>{const n=r.vertexIds[(i+1)%r.vertexIds.length];return project.walls.find(w=>w.startId===v&&w.endId===n||w.startId===n&&w.endId===v)?.id;});}pruneVertices(project);
      for(const {o,x,z,sign} of openings){o.wallId=a.id;o.at=((x-start.x)*dx+(z-start.z)*dz)/(len*len);o.side*=sign;}break;
    }
    case 'dimensions':{
      const {kind,item}=selected();
      if(kind==='walls'){
        const f=wallFrame(project,item);finite(c.width,freeWall(project,item)?.02:.6,40,'牆長');
        if(freeWall(project,item))moveFreeWall(project,item,f.a,{x:f.a.x+f.dx*c.width,z:f.a.z+f.dz*c.width});else{f.b.x=f.a.x+f.dx*c.width;f.b.z=f.a.z+f.dz*c.width;}item.height=c.height;item.thickness=c.depth;
      }else if(kind==='openings'){item.width=c.width;item.height=c.height;item.sill=item.kind==='door'?0:c.sill;}
      else if(kind==='objects'){if(item.hostId)fail('附加項目的尺寸跟隨門窗，請修改依附對象。');item.width=c.width;item.depth=c.depth;item.height=c.height;if(c.elevation!==undefined){if(item.trace)positionTrace(project,item,{...objectPose(project,item),elevation:c.elevation});else item.elevation=c.elevation;}}
      else fail('請選牆、門窗或家具修改尺寸。');break;
    }
    case 'addOpening':{
      if(!project.walls.some(w=>w.id===c.wallId))fail('請在牆上放置門窗。');
      if(!['door','window'].includes(c.kind))fail('未知門窗類型。');
      const wall=project.walls.find(w=>w.id===c.wallId),owner=wallRooms(project,c.wallId)[0],index=owner?.wallIds.indexOf(c.wallId);
      project.openings.push({id:id(project,c.kind),wallId:c.wallId,kind:c.kind,at:c.at,width:c.kind==='door'?.9:1.2,height:c.kind==='door'?2.1:1.2,sill:c.kind==='door'?0:.9,open:false,styleId:defaultStyle(c.kind),side:!owner||owner.vertexIds[index]===wall.startId?1:-1});break;
    }
    case 'moveOpening':{const found=selected();if(found.kind!=='openings')fail('只能移動門窗。');found.item.at=c.at;break;}
    case 'windowGrid':{
      const wall=project.walls.find(w=>w.id===c.wallId),owner=wall&&wallRooms(project,wall.id)[0];if(!wall||(!owner&&!wall.independent)||wall.type!=='wall')fail('附牆窗格須指定目前樓層的原生實牆。');
      let opening=c.id===null?null:project.openings.find(o=>o.id===c.id);if(c.id!==null&&(!opening||opening.kind!=='window'))fail('待更新的原生窗洞不存在。');
      if(!opening){opening={id:id(project,'window')};project.openings.push(opening);}
      Object.assign(opening,{wallId:wall.id,kind:'window',at:c.at,width:c.width,height:c.height,sill:c.sill,open:false,styleId:'window-grid',side:!owner||owner.vertexIds[owner.wallIds.indexOf(wall.id)]===wall.startId?1:-1,grid:clone(c.grid)});break;
    }
    case 'addObject':{
      if(!Object.hasOwn(ASSETS,c.assetId))fail('素材未登錄。');const asset=ASSETS[c.assetId];
      project.objects.push({id:id(project,'object'),assetId:asset.id,x:asset.hostKind?0:c.x,z:asset.hostKind?0:c.z,rotation:0,width:asset.width,depth:asset.depth,height:asset.height,materialId:asset.materialId,...(asset.outdoor?{outdoor:{marking:'none',signal:'red',direction:'straight',...(asset.shape.includes('signal')?{lampCount:asset.shape==='pedestrian-signal'?2:3}:{})}}:{}),...(asset.prop?{prop:{color:'#c9b99a',pitch:0,roll:0,label:''}}:{}),...(asset.id==='chart-sector'?{sector:{startAngle:0,endAngle:90}}:{}),...(asset.trace?{trace:{anchorId:null,dx:0,dy:0,dz:0,pitch:0,roll:0,label:''}}:{}),elevation:asset.prop?(c.elevation??asset.elevation):asset.elevation,hostId:asset.hostKind?c.hostId:null,installation:asset.shape==='pipe'?'exposed':'none',controls:Array(asset.control?.channels||0).fill(asset.control?.initial),targets:Array(asset.control?.channels||0).fill(null),media:['tv','projector'].includes(asset.id)?{screenId:null,speakerId:null,throwRatio:1.5}:null,deviceState:Object.hasOwn(DEVICE_CAPABILITIES,asset.id)?{power:false,level:0,temperature:24}:null});if(asset.trace&&c.tracePlacement){const o=project.objects.at(-1),t=c.tracePlacement;positionTrace(project,o,{x:c.x,z:c.z,elevation:t.elevation,rotation:t.rotation},t.anchorId);o.trace.pitch=t.pitch;o.trace.roll=t.roll;}break;
    }
    case 'bindDevice':{const found=selected();if(found.kind!=='objects'||!controlKind(found.item.assetId)||!Number.isInteger(c.channel)||c.channel<0||c.channel>=found.item.controls.length)fail('請選擇有效開關路數。');const target=project.objects.find(o=>o.id===c.targetId);if(c.targetId!==null&&(!target||!compatibleTarget(found.item,target)))fail('請選擇既有且相容的家電。');found.item.targets[c.channel]=c.targetId;if(target)found.item.controls[c.channel]=targetValue(found.item,target);break;}
    case 'toggleAppliance':{const found=selected();if(found.kind!=='objects'||!found.item.deviceState)fail('此物件不能切換電源。');const state=found.item.deviceState;state.power=!state.power;if(found.item.assetId==='light')state.level=state.power?(state.level||100):0;syncDeviceLinks(project);break;}
    case 'deviceControl':{const found=selected();if(found.kind!=='objects'||!ASSETS[found.item.assetId].control)fail('此設備沒有可調控制值。');if(!Number.isInteger(c.channel)||c.channel<0||c.channel>=found.item.controls.length)fail('控制路數錯誤。');const spec=ASSETS[found.item.assetId].control;finite(c.value,spec.min,spec.max,'控制值');if(!Number.isInteger(c.value))fail('控制值必須為整數。');found.item.controls[c.channel]=c.value;const target=project.objects.find(o=>o.id===found.item.targets[c.channel]);if(target){const kind=controlKind(found.item.assetId);target.deviceState[kind]=kind==='power'?!!c.value:c.value;if(target.assetId==='light'){if(kind==='level')target.deviceState.power=c.value>0;else if(kind==='power')target.deviceState.level=c.value?(target.deviceState.level||100):0;}syncDeviceLinks(project);}break;}
    case 'installation':{const found=selected();if(found.kind!=='objects'||ASSETS[found.item.assetId].shape!=='pipe')fail('請選取管線。');found.item.installation=c.value;break;}
    case 'objects.batch':{
      if(!Array.isArray(c.ids)||!c.ids.length||new Set(c.ids).size!==c.ids.length)fail('請選取家具設備。');
      const items=c.ids.map(id=>project.objects.find(o=>o.id===id));if(items.some(o=>!o||o.hostId||o.trace?.anchorId))fail('批次操作僅支援獨立家具設備，附掛物隨依附對象。');
      const bounds=o=>{const a=o.rotation*Math.PI/180;return {x:(Math.abs(Math.cos(a))*o.width+Math.abs(Math.sin(a))*o.depth)/2,z:(Math.abs(Math.sin(a))*o.width+Math.abs(Math.cos(a))*o.depth)/2};};
      const cx=items.reduce((n,o)=>n+o.x,0)/items.length,cz=items.reduce((n,o)=>n+o.z,0)/items.length;
      if(c.action==='move'){finite(c.dx,-80,80,'X 位移');finite(c.dz,-80,80,'Z 位移');for(const o of items){o.x+=c.dx;o.z+=c.dz;}}
      else if(c.action==='rotate'){for(const o of items){const x=o.x-cx,z=o.z-cz;o.x=cx-z;o.z=cz+x;o.rotation=(o.rotation+90)%360;}}
      else if(c.action==='align'){if(items.length<2||!['left','right','front','back','center-x','center-z'].includes(c.mode))fail('對齊至少需要兩個物件及有效方向。');const axis=['left','right','center-x'].includes(c.mode)?'x':'z',sign=['left','back'].includes(c.mode)?-1:1,center=c.mode.startsWith('center'),ref=items[0][axis]+(center?0:sign*bounds(items[0])[axis]);for(const o of items.slice(1))o[axis]=ref-(center?0:sign*bounds(o)[axis]);}
      else if(c.action==='distribute'){if(items.length<3||!['x','z'].includes(c.axis))fail('等距分布至少需要三個物件。');const a=c.axis,sorted=[...items].sort((x,y)=>x[a]-y[a]),start=sorted[0][a],step=(sorted.at(-1)[a]-start)/(sorted.length-1);sorted.forEach((o,i)=>o[a]=start+i*step);}
      else fail('未知批次操作。');break;
    }
    case 'objects.paste':{
      if(!Array.isArray(c.objects)||!c.objects.length||c.objects.length>LIMITS.objects)fail('剪貼資料不是有效家具群組。');finite(c.dx,-80,80,'X 位移');finite(c.dz,-80,80,'Z 位移');
      const map=new Map(),copies=[];for(const input of c.objects){if(!input||input.hostId||input.trace?.anchorId||typeof input.id!=='string'||map.has(input.id))fail('剪貼群組含無效或依附物件。');const o=clone(input),old=o.id;o.id=id(project,'object');map.set(old,o.id);o.x+=c.dx;o.z+=c.dz;project.objects.push(o);copies.push(o);}
      for(const o of copies){if(!Array.isArray(o.targets))fail('剪貼設備引用錯誤。');o.targets=o.targets.map(id=>map.get(id)||null);if(o.media)for(const key of ['screenId','speakerId'])o.media[key]=map.get(o.media[key])||null;}break;
    }
    case 'label.set':{const {item,kind}=selected();if(kind!=='objects'||typeof c.text!=='string'||c.text.length>64)fail('請選取物品，標籤最多 64 字。');const text=c.text.trim();if(item.trace)item.trace.label=text;else if(item.prop)item.prop.label=text;else if(text)item.annotation=text;else delete item.annotation;break;}
    case 'surface.load':{const {item,kind}=selected();if(!['objects','rooms'].includes(kind))fail('請選取承載物品或地坪。');if(c.value===null)delete item.surfaceLoad;else item.surfaceLoad=clone(c.value);break;}
    case 'outdoor.configure':{const {item,kind}=selected();if(kind!=='objects'||!ASSETS[item.assetId].outdoor)fail('請選取戶外元件。');item.outdoor={marking:c.marking,signal:c.signal,direction:c.direction,...(ASSETS[item.assetId].shape.includes('signal')?{lampCount:c.lampCount??item.outdoor.lampCount??(item.assetId==='pedestrian-signal'?2:3)}:{})};break;}
    case 'prop.configure':{const {item:o,kind}=selected();if(kind!=='objects'||!ASSETS[o.assetId].prop)fail('請選取擺設或占位元件。');for(const k of ['x','z','elevation','rotation','width','depth','height'])o[k]=c[k];o.prop={color:c.color,pitch:c.pitch,roll:c.roll,label:c.label};break;}
    case 'sector.configure':{keys(c,['type','id','startAngle','endAngle'],'扇區設定');const {item,kind}=selected();if(kind!=='objects'||item.assetId!=='chart-sector')fail('請先選取圓餅圖扇區。');item.sector={startAngle:c.startAngle,endAngle:c.endAngle};break;}
    case 'trace.configure':{const {item:o,kind}=selected();if(kind!=='objects'||!o.trace)fail('請先選取跡證標記。');const pose={x:c.x,z:c.z,elevation:c.elevation,rotation:c.rotation};positionTrace(project,o,pose,c.anchorId);Object.assign(o.trace,{pitch:c.pitch,roll:c.roll,label:c.label});break;}
    case 'moveObject':{const found=selected();if(found.kind!=='objects'||found.item.hostId)fail('附加項目跟隨門窗，不能獨立移動。');if(found.item.trace)positionTrace(project,found.item,{...objectPose(project,found.item),x:c.x,z:c.z});else{found.item.x=c.x;found.item.z=c.z;}break;}
    case 'transformObject':{
      keys(c,['type','id','x','z','elevation','rotation','width','depth','height'],'物件調整');
      const found=selected();if(found.kind!=='objects'||found.item.hostId)fail('附加項目跟隨門窗，請調整依附對象。');
      const item=found.item;for(const k of ['x','z','elevation','rotation','width','depth','height'])if(typeof c[k]!=='number'||!Number.isFinite(c[k]))fail('物件位置、方向與尺寸須為有效數值。');
      if(item.trace)positionTrace(project,item,{x:c.x,z:c.z,elevation:c.elevation,rotation:c.rotation});else for(const k of ['x','z','elevation','rotation'])item[k]=c[k];
      for(const k of ['width','depth','height'])item[k]=c[k];break;
    }
    case 'rotateObject':{const found=selected();if(found.kind!=='objects'||found.item.hostId)fail('請選可獨立旋轉的家具設備。');found.item.rotation=(found.item.rotation+90)%360;break;}
    case 'material':{const {kind,item}=selected();if(!['walls','rooms','objects'].includes(kind))fail('請選牆、地坪或家具套用材質。');const reason=materialApplicationReason(c.materialId,{kind,item});if(reason)fail(reason);item.materialId=c.materialId;break;}
    case 'openingStyle':{const found=selected();if(found.kind!=='openings')fail('請先選取門窗。');found.item.styleId=c.styleId;found.item.open=false;if(c.styleId==='window-grid')found.item.grid=found.item.grid||defaultWindowGrid();else delete found.item.grid;break;}
    case 'flipOpening':{const found=selected();if(found.kind!=='openings')fail('請先選取門窗。');found.item.side*=-1;break;}
    case 'toggleDoor':
    case 'toggleOpening':{const found=selected();if(found.kind!=='openings'||openingStyle(found.item).motion==='fixed')fail('請選擇可開啟的門窗。');found.item.open=!found.item.open;break;}
    case 'delete':{
      const tracePoses=new Map(project.objects.filter(o=>o.trace?.anchorId).map(o=>[o.id,objectPose(project,o)]));
      const {kind,item}=selected();
      if(kind==='vertices'||kind==='walls'&&!freeWall(project,item))fail('牆與角點屬於房間輪廓；請選地坪刪除整個房間。');
      if(kind==='rooms'){
        const remaining=project.rooms.filter(r=>r.id!==item.id),wallIds=new Set(remaining.flatMap(r=>r.wallIds));
        project.walls=project.walls.filter(w=>w.independent||wallIds.has(w.id));
      }
      project[kind]=project[kind].filter(o=>o.id!==item.id);
      project.openings=project.openings.filter(o=>project.walls.some(w=>w.id===o.wallId));pruneVertices(project);
      project.objects=project.objects.filter(o=>!o.hostId||project.openings.some(host=>host.id===o.hostId));
      for(const o of project.objects)if(o.trace?.anchorId&&!entity(project,o.trace.anchorId))positionTrace(project,o,tracePoses.get(o.id),null);
      for(const o of project.objects){o.targets=o.targets.map(id=>project.objects.some(t=>t.id===id)?id:null);if(o.media)for(const key of ['screenId','speakerId'])if(!project.objects.some(t=>t.id===o.media[key]))o.media[key]=null;}break;
    }
    default:fail('未登錄的編輯命令。');
  }
  for(const o of project.objects)if(o.trace?.anchorId&&!entity(project,o.trace.anchorId)&&priorTraces.has(o.id))positionTrace(project,o,priorTraces.get(o.id),null);
  return validateProject(project);
}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export class DesignStore{
  constructor(project=emptyProject()){this.state=freeze(clone(validateProject(project)));this.past=[];this.future=[];this.listeners=new Set();this.revision=0;}
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  emit(){this.revision++;for(const listener of this.listeners)listener(this.state);}
  replace(project){const next=freeze(clone(validateProject(project)));if(JSON.stringify(next)===JSON.stringify(this.state))return false;this.past.push(this.state);if(this.past.length>LIMITS.history)this.past.shift();this.state=next;this.future=[];this.emit();return true;}
  execute(command){return this.replace(applyCommand(this.state,command));}
  preview(command){return applyCommand(this.state,command);}
  undo(){if(!this.past.length)return false;this.future.push(this.state);this.state=this.past.pop();this.emit();return true;}
  redo(){if(!this.future.length)return false;this.past.push(this.state);this.state=this.future.pop();this.emit();return true;}
  serialize(){return JSON.stringify(this.state,null,2);}
}
export function parseProject(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>LIMITS.fileBytes)fail('檔案過大，最多 10 MB。');return validateProject(JSON.parse(text));}
export function sampleProject(){
  let p=applyCommand(emptyProject(),{type:'addRoom',x:-3,z:-2,width:6,depth:4});
  p=applyCommand(p,{type:'addOpening',wallId:'wall-1',kind:'door',at:.25});
  p=applyCommand(p,{type:'addOpening',wallId:'wall-2',kind:'window',at:.5});
  p=applyCommand(p,{type:'addObject',assetId:'cabinet',x:-2.1,z:1.4});
  return applyCommand(p,{type:'addObject',assetId:'table',x:.7,z:.6});
}

// 2D 和 3D 共用的開口與牆段；門洞不使用透明材質假裝挖洞。
export function wallSections(project,wall){
  const length=wallFrame(project,wall).length,sections=[];
  const openings=project.openings.filter(o=>o.wallId===wall.id).sort((a,b)=>a.at-b.at);
  const push=(from,to,bottom,top)=>{if(to-from>1e-8&&top-bottom>1e-8)sections.push({from,to,bottom,top});};
  let cursor=-wall.thickness/2;
  for(const o of openings){const left=o.at*length-o.width/2,right=left+o.width;push(cursor,left,0,wall.height);push(left,right,0,o.sill);push(left,right,o.sill+o.height,wall.height);cursor=right;}
  push(cursor,length+wall.thickness/2,0,wall.height);return sections;
}

// Copy a room group atomically; geometry validation runs before the caller commits.
export function copyRoomGroup(source,roomIds,{dx,dz,mirror='none'}){
 const project=clone(validateProject(source));finite(dx,-80,80,'複製 X 位移');finite(dz,-80,80,'複製 Z 位移');if(!['none','x','z'].includes(mirror))fail('鏡像方向錯誤。');
 const rooms=source.rooms.filter(r=>roomIds.includes(r.id));if(!rooms.length)fail('群組沒有房間。');const points=rooms.flatMap(r=>r.vertexIds.map(id=>source.vertices.find(v=>v.id===id))),cx=(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,cz=(Math.min(...points.map(p=>p.z))+Math.max(...points.map(p=>p.z)))/2;
 const transform=p=>({x:mirror==='x'?2*cx-p.x+dx:p.x+dx,z:mirror==='z'?2*cz-p.z+dz:p.z+dz}),vertexMap=new Map(),wallMap=new Map(),roomMap=new Map(),openingMap=new Map(),objectMap=new Map(),existing=new Set(project.walls.map(w=>w.id));
 for(const r of rooms){let polygon=r.vertexIds.map(id=>transform(source.vertices.find(v=>v.id===id)));if(mirror!=='none')polygon.reverse();const nr=r.boundaryMode==='area'?addFloorArea(project,polygon):addRoomPolygon(project,polygon);nr.name=r.name;nr.type=r.type;nr.materialId=r.materialId;if(r.surfaceLoad)nr.surfaceLoad={...r.surfaceLoad,x:mirror==='x'?-r.surfaceLoad.x:r.surfaceLoad.x,z:mirror==='z'?-r.surfaceLoad.z:r.surfaceLoad.z};roomMap.set(r.id,nr.id);for(const vid of r.vertexIds){const p=transform(source.vertices.find(v=>v.id===vid));vertexMap.set(vid,project.vertices.find(v=>point(v,p)<1e-7).id);}}
 for(const w of source.walls.filter(w=>rooms.some(r=>r.wallIds.includes(w.id)))){const a=vertexMap.get(w.startId),b=vertexMap.get(w.endId),nw=project.walls.find(v=>v.startId===a&&v.endId===b||v.startId===b&&v.endId===a);if(existing.has(nw.id))fail('複製位置不可共用既有牆；請先留出間距。');const direction=nw.startId===a?1:-1;wallMap.set(w.id,{id:nw.id,direction});Object.assign(nw,{height:w.height,thickness:w.thickness,materialId:w.materialId,type:w.type,railStyle:w.railStyle});}
 for(const o of source.openings.filter(o=>wallMap.has(o.wallId))){const w=wallMap.get(o.wallId),n=clone(o);n.id=id(project,o.kind);n.wallId=w.id;n.at=w.direction===1?o.at:1-o.at;n.side=o.side*w.direction*(mirror==='none'?1:-1);if(mirror!=='none')n.styleId=o.styleId.includes('left')?o.styleId.replace('left','right'):o.styleId.includes('right')?o.styleId.replace('right','left'):o.styleId;project.openings.push(n);openingMap.set(o.id,n.id);}
 const objects=source.objects.filter(o=>o.hostId?openingMap.has(o.hostId):rooms.some(r=>insidePolygon(objectPose(source,o),r.vertexIds.map(id=>source.vertices.find(v=>v.id===id)))));
 for(const o of objects){const n=clone(o);if(n.trace){Object.assign(n,objectPose(source,o));n.trace={...n.trace,anchorId:null};}n.id=id(project,'object');objectMap.set(o.id,n.id);if(o.hostId)n.hostId=openingMap.get(o.hostId);else{const pose=n.trace?objectPose(source,o):o;Object.assign(n,transform(pose),{rotation:mirror==='x'?180-pose.rotation:mirror==='z'?-pose.rotation:pose.rotation});}if(n.sector&&mirror!=='none')n.sector={startAngle:360-n.sector.endAngle,endAngle:360-n.sector.startAngle};n.rotation=((n.rotation%360)+360)%360;project.objects.push(n);}
 for(const o of objects){const n=project.objects.find(v=>v.id===objectMap.get(o.id));if(n.trace&&o.trace.anchorId){const host=objectMap.get(o.trace.anchorId)||openingMap.get(o.trace.anchorId)||wallMap.get(o.trace.anchorId)?.id||roomMap.get(o.trace.anchorId);if(host)positionTrace(project,n,n,host);}n.targets=o.targets.map(id=>objectMap.get(id)||null);if(n.media){n.media.screenId=objectMap.get(o.media.screenId)||null;n.media.speakerId=objectMap.get(o.media.speakerId)||null;}}
 return {design:validateProject(project),roomIds:[...roomMap.values()]};
}

export function moveRoomGroup(source,roomIds,{dx,dz}){
 finite(dx,-80,80,'移動 X');finite(dz,-80,80,'移動 Z');const project=clone(validateProject(source)),ids=new Set(roomIds),rooms=project.rooms.filter(r=>ids.has(r.id));if(!rooms.length||rooms.length!==ids.size)fail('請選取有效房間。');const vertexIds=new Set(rooms.flatMap(r=>r.vertexIds));if(project.rooms.some(r=>!ids.has(r.id)&&r.vertexIds.some(id=>vertexIds.has(id))))fail('移動範圍仍與其他空間共用牆或角點，請把相鄰空間納入同一群組。');const polygons=rooms.map(r=>r.vertexIds.map(id=>({...project.vertices.find(v=>v.id===id)})));for(const o of project.objects)if(!o.hostId&&!o.trace?.anchorId&&polygons.some(poly=>insidePolygon(o,poly))){o.x+=dx;o.z+=dz;}for(const v of project.vertices)if(vertexIds.has(v.id)){v.x+=dx;v.z+=dz;}return validateProject(project);
}
