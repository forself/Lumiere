import {ASSETS} from './catalog.js';
export function surfaceInfo(project,host){
 if(host.vertexIds){const vs=host.vertexIds.map(id=>project.vertices.find(v=>v.id===id));return {kind:'floor',x:vs.reduce((n,v)=>n+v.x,0)/vs.length,z:vs.reduce((n,v)=>n+v.z,0)/vs.length,y:.003,vertices:vs};}
 const shape=ASSETS[host.assetId]?.shape,w=host.width,d=host.depth,h=host.height;
 if(['bowl','plate','cup'].includes(shape)){const base=shape==='bowl'?.12:shape==='plate'?.25:.08,r0=shape==='bowl'?.2:shape==='plate'?.34:.44,r1=shape==='bowl'?.46:shape==='plate'?.5:.44;return {kind:'cavity',shape:'ellipse',base:base*h,capacity:(1-base)*h,r0,r1,width:w,depth:d};}
 if(['sink','tub'].includes(shape)){const lip=shape==='tub'?.08:Math.min(.07,w*.12);return {kind:'cavity',shape:'rect',base:.65*h,capacity:.35*h,width:w-2*lip,depth:d-2*lip};}
 if(['paving','sidewalk','island','table','block','placeholder-box','placeholder-ellipse','paper','book','notebook','cabinet','counter'].includes(shape))return {kind:'flat',x:0,z:0,y:h,width:w,depth:d,ellipse:shape==='placeholder-ellipse'};
 return null;
}
export function validateSurfaceLoad(project,host,inside){
 if(!Object.hasOwn(host,'surfaceLoad'))return;
 const s=surfaceInfo(project,host),v=host.surfaceLoad,keys=['kind','color','fill','width','depth','thickness','x','z','shape'];
 if(!s||!v||typeof v!=='object'||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))throw new Error('承載表面或附加內容格式錯誤。');
 if(!['liquid','solid'].includes(v.kind)||!['ellipse','rect'].includes(v.shape)||!/^#[0-9a-fA-F]{6}$/.test(v.color))throw new Error('請選擇有效的內容類別、形狀及 #RRGGBB 顏色。');
 for(const [k,min,max] of [['fill',.01,.99],['width',.001,40],['depth',.001,40],['thickness',.0001,2],['x',-40,40],['z',-40,40]])if(typeof v[k]!=='number'||!Number.isFinite(v[k])||v[k]<min||v[k]>max)throw new Error('附加內容的尺寸、位置或填充比例超出範圍。');
 if(v.kind==='liquid'&&(host.prop?.pitch||host.prop?.roll))throw new Error('目前液面支援水平容器／表面，請先將前後與左右傾角設為 0。');
 if(s.kind==='cavity')return;
 const x=(s.x||0)+v.x,z=(s.z||0)+v.z,hw=v.width/2,hd=v.depth/2,corners=[{x:x-hw,z:z-hd},{x:x+hw,z:z-hd},{x:x+hw,z:z+hd},{x:x-hw,z:z+hd}];
 if(s.kind==='flat'){
  if(Math.abs(v.x)+hw>s.width/2+1e-8||Math.abs(v.z)+hd>s.depth/2+1e-8)throw new Error('鋪放範圍超出承載表面。');
  if(s.ellipse&&!(v.shape==='ellipse'&&v.x===0&&v.z===0)&&corners.some(p=>(p.x/(s.width/2))**2+(p.z/(s.depth/2))**2>1+1e-8))throw new Error('鋪放範圍須留在橢圓頂面內。');
 }else{
  const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),verts=s.vertices;
  if(corners.some(p=>!inside(p,verts))||verts.some(p=>p.x>x-hw+1e-8&&p.x<x+hw-1e-8&&p.z>z-hd+1e-8&&p.z<z+hd-1e-8)||verts.some((a,i)=>corners.some((c,j)=>{const b=verts[(i+1)%verts.length],d=corners[(j+1)%4];return cross(a,b,c)*cross(a,b,d)<-1e-12&&cross(c,d,a)*cross(c,d,b)<-1e-12;})))throw new Error('鋪放範圍須完整位於此地坪內。');
 }
}
