import {applyBuildingCommand,validateBuilding} from '../designer/building-model.js';
import {wallFrame,insidePolygon} from '../designer/model.js';

const fail=message=>{throw new Error(message);};
const exact=(o,keys)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(o,k)))fail('語意構件欄位不符契約。');};
const finite=(n,min,max,name)=>{if(!Number.isFinite(n)||n<min||n>max)fail(name+' 超出允許範圍。');};
const label=s=>typeof s==='string'&&s.trim().length>0&&s.length<=120;
const color=s=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
const signature=value=>{let h=2166136261;for(const c of canonical(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');};
const level=(scene,id)=>scene.levels.find(l=>l.id===id);
const member=(scene,levelId,m)=>{const l=level(scene,levelId);return m.kind==='object'?l?.design.objects.find(o=>o.id===m.id):m.kind==='opening'?l?.design.openings.find(o=>o.id===m.id):l?.elements.find(e=>e.id===m.id);};
const memberSnapshot=(scene,levelId,m)=>{const item=member(scene,levelId,m);if(m.kind!=='opening'||!item)return item||null;const l=level(scene,levelId),wall=l.design.walls.find(w=>w.id===item.wallId);return {opening:item,wall,vertices:wall?[wall.startId,wall.endId].map(id=>l.design.vertices.find(v=>v.id===id)):[]};};
const fingerprint=(scene,a)=>signature({levelId:a.levelId,kind:a.kind,name:a.name,params:a.params,members:a.members.map(m=>[m.role,m.kind,m.id,memberSnapshot(scene,a.levelId,m)])});
export const SEMANTIC_KINDS=['partial-space','window-grid','sectional-sofa'];

function validateParams(kind,p){
 const common=['x','z','width','depth','height','rotation','color'];
 exact(p,[...common,...(kind==='partial-space'?['boundaries','floor','ceiling','thickness']:kind==='window-grid'?['elevation','columns','rows','frame','glassColor',...(Object.hasOwn(p,'host')?['host']:[])]:['layout','seatHeight'])]);
 const hosted=kind==='window-grid'&&Object.hasOwn(p,'host');
 finite(p.x,hosted?-40:-35,hosted?40:35,'X');finite(p.z,hosted?-40:-35,hosted?40:35,'Z');finite(p.width,.3,8,'寬');finite(p.depth,.02,8,'深');finite(p.height,.1,8,'高');
 if(!(hosted?Number.isFinite(p.rotation)&&p.rotation>=0&&p.rotation<360:[0,90,180,270].includes(p.rotation))||!color(p.color))fail('獨立構件方向須為 90° 倍數，顏色須為 #RRGGBB。');
 if(hosted){exact(p.host,['wallId','at']);if(!/^wall-[1-9][0-9]*$/.test(p.host.wallId))fail('附牆窗格須指定原生牆 ID。');finite(p.host.at,0,1,'沿牆位置');}
 if(kind==='partial-space'){exact(p.boundaries,['north','east','south','west']);if(!Object.values(p.boundaries).every(x=>['wall','open','unknown'].includes(x))||typeof p.floor!=='boolean'||typeof p.ceiling!=='boolean')fail('局部空間須明示四側為牆、開放或未知。');finite(p.thickness,.04,.5,'牆厚');finite(p.depth,.3,8,'空間深');}
 if(kind==='window-grid'){finite(p.elevation,0,10,'窗底高');finite(p.frame,.015,.2,'窗框寬');for(const k of ['columns','rows'])if(!Number.isInteger(p[k])||p[k]<1||p[k]>12)fail('窗列／行數須為 1–12。');if(p.width/p.columns<=p.frame*2||p.height/p.rows<=p.frame*2||!color(p.glassColor))fail('窗格尺寸或玻璃色無效。');}
 if(kind==='sectional-sofa'){if(!['straight','left','right','u'].includes(p.layout))fail('沙發配置無效。');finite(p.seatHeight,.2,p.height-.15,'座高');if(p.width<1||p.depth<.65||p.height<.5)fail('沙發尺寸過小。');if(p.layout!=='straight'&&p.depth<=.95)fail('轉角沙發深度須大於 0.95 m，才有可辨識的延伸座。');if(p.layout==='u'&&p.width<2.12)fail('U 型沙發總寬至少 2.12 m，避免左右座墊重疊。');}
 return p;
}

function parts(kind,p,name){
 const out=[],r=p.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 const box=(role,x,z,width,depth,height,elevation,assetId='placeholder-box',tint=p.color)=>{out.push({role,kind:'object',assetId,x:p.x+c*x-s*z,z:p.z+s*x+c*z,width,depth,height,elevation,rotation:p.rotation,color:tint,label:(name+' · '+role).slice(0,64)});};
 const slab=(role,elevation)=>out.push({role,kind:'element',x:p.x,z:p.z,width:p.width,depth:p.depth,height:.12,elevation,rotation:p.rotation,materialId:'stone'});
 if(kind==='partial-space'){
  if(p.floor)slab('floor',0);if(p.ceiling)slab('ceiling',p.height);
  for(const side of ['north','south'])if(p.boundaries[side]==='wall')box('wall-'+side,0,(side==='north'?-1:1)*p.depth/2,p.width,p.thickness,p.height,0);
  for(const side of ['west','east'])if(p.boundaries[side]==='wall')box('wall-'+side,(side==='west'?-1:1)*p.width/2,0,p.thickness,p.depth,p.height,0);
 }else if(kind==='window-grid'){
  const w=(p.width-p.frame)/p.columns,h=(p.height-p.frame)/p.rows;
  for(let row=0;row<p.rows;row++)for(let col=0;col<p.columns;col++)box('pane-'+row+'-'+col,-p.width/2+p.frame/2+w*(col+.5),0,w-p.frame,p.depth*.45,h-p.frame,p.elevation+row*h+p.frame,'placeholder-glass',p.glassColor);
  for(let i=0;i<=p.columns;i++)box('mullion-'+i,-p.width/2+p.frame/2+w*i,0,p.frame,p.depth,p.height,p.elevation);
  for(let i=0;i<=p.rows;i++)box('rail-'+i,0,0,p.width,p.depth,p.frame,p.elevation+i*h);
 }else{
  const seatD=p.layout==='straight'?p.depth:Math.min(.9,p.depth),arm=.16,back=.18;
  box('base',0,-p.depth/2+seatD/2,p.width,seatD,p.seatHeight*.5,0,'placeholder-rounded');
  box('seat-main',0,-p.depth/2+seatD/2,p.width-arm*2,seatD,p.seatHeight*.5,p.seatHeight*.5,'placeholder-rounded');
  box('back-main',0,-p.depth/2+back/2,p.width,back,p.height-p.seatHeight,p.seatHeight,'placeholder-rounded');
  for(const side of ['left','right']){
   const x=(side==='left'?-1:1)*(p.width/2-arm/2),extended=[side,'u'].includes(p.layout),d=extended?p.depth:seatD;
   if(extended&&p.depth>seatD){const tail=p.depth-seatD,sx=(side==='left'?-1:1)*(p.width/2-seatD/2),sz=seatD/2;box('base-'+side,sx,sz,seatD,tail,p.seatHeight*.5,0,'placeholder-rounded');box('seat-'+side,sx-(side==='left'?-1:1)*arm/2,sz,seatD-arm,tail,p.seatHeight*.5,p.seatHeight*.5,'placeholder-rounded');}
   box('arm-'+side,x,-p.depth/2+d/2,arm,d,p.height-p.seatHeight*.6,p.seatHeight*.6,'placeholder-rounded');
  }
 }
 return out;
}

export function validateSemanticState(capture){
 const w=capture.workbench;if(!w)return;
 if(!Array.isArray(w.assemblies)||w.assemblies.length>100||!Array.isArray(w.relations)||w.relations.length>200)fail('語意構件／關係數量超過限制。');
 const ids=new Set(),owned=new Set();for(const a of w.assemblies){exact(a,['id','levelId','kind','name','params','members','fingerprint','sourceIds','basis']);if(!/^assembly-[\w-]+$/.test(a.id)||ids.has(a.id)||!SEMANTIC_KINDS.includes(a.kind)||!label(a.name)||!/^floor-\d+$/.test(a.levelId)||!Array.isArray(a.members)||!a.members.length||a.members.length>200||!/^[a-f0-9]{8}$/.test(a.fingerprint))fail('語意構件資料錯誤。');ids.add(a.id);validateParams(a.kind,a.params);provenance(capture,a);const hosted=a.kind==='window-grid'&&a.params.host;if(hosted&&(a.members.length!==1||a.members[0].kind!=='opening'||a.members[0].role!=='opening'))fail('附牆窗格須對應單一原生窗洞。');const roles=new Set();for(const m of a.members){exact(m,['role','kind','id']);const key=a.levelId+':'+m.kind+':'+m.id;if(!label(m.role)||roles.has(m.role)||!(hosted?['opening']:['object','element']).includes(m.kind)||!/^\w+-\d+$/.test(m.id)||owned.has(key))fail('語意構件成員重複或無效。');roles.add(m.role);owned.add(key);}}
 ids.clear();for(const r of w.relations){validateRelation(r);if(ids.has(r.id))fail('關係 ID 重複。');ids.add(r.id);}
}
function provenance(c,a){if(!['observed','inferred','user-confirmed'].includes(a.basis)||!Array.isArray(a.sourceIds)||!a.sourceIds.length||new Set(a.sourceIds).size!==a.sourceIds.length||a.sourceIds.some(id=>!c.sources.some(s=>s.id===id)))fail('語意構件必須引用來源並標示推論依據。');}
function validateRelation(r){
 exact(r,['id','kind','subject','target','side','at','gap','locked']);if(!/^relation-[\w-]+$/.test(r.id)||!['against-wall','on-ground'].includes(r.kind)||typeof r.locked!=='boolean')fail('空間關係格式錯誤。');
 for(const ref of [r.subject,r.target]){exact(ref,['levelId','kind','id']);if(!/^floor-[1-9][0-9]*$/.test(ref.levelId)||!/^\w+-[1-9][0-9]*$/.test(ref.id))fail('空間關係參照錯誤。');}if(r.subject.kind!=='object'||!(r.kind==='against-wall'?['wall','object']:['room','element']).includes(r.target.kind)||r.subject.levelId!==r.target.levelId||r.subject.kind===r.target.kind&&r.subject.id===r.target.id)fail('空間關係須為同層不同元件，且目標類型須符合靠牆或落地關係。');if(![-1,1].includes(r.side))fail('靠牆側向須為 -1 或 1。');finite(r.at,0,1,'沿牆位置');finite(r.gap,0,2,'間隙');
}
function relationPosition(scene,r){
 const l=level(scene,r.subject.levelId),o=l?.design.objects.find(o=>o.id===r.subject.id);if(!o||o.hostId||o.trace?.anchorId)fail('關係主體不存在或已有宿主。');let target;
 if(r.kind==='on-ground'){
  if(r.target.kind==='room'){target=l.design.rooms.find(x=>x.id===r.target.id);if(!target||!insidePolygon(o,target.vertexIds.map(id=>l.design.vertices.find(v=>v.id===id))))fail('物件不在指定地坪上。');return {...o,elevation:r.gap};}
  target=l.elements.find(x=>x.id===r.target.id);if(r.target.kind!=='element'||target?.kind!=='slab')fail('落地關係需指定房間或樓板。');const rot=target.rotation%180!==0,w=rot?target.depth:target.width,d=rot?target.width:target.depth;if(Math.abs(o.x-target.x)>w/2||Math.abs(o.z-target.z)>d/2)fail('物件不在指定樓板上。');return {...o,elevation:target.elevation+r.gap};
 }
 let ax,az,dx,dz,length,thickness;
 if(r.target.kind==='wall'){target=l.design.walls.find(x=>x.id===r.target.id);if(!target)fail('目標牆已不存在。');const f=wallFrame(l.design,target);({length}=f);ax=f.a.x;az=f.a.z;dx=f.dx;dz=f.dz;thickness=target.thickness;}
 else if(r.target.kind==='object'){target=l.design.objects.find(x=>x.id===r.target.id);if(!target||target.hostId)fail('目標牆體不存在或有宿主。');const rot=target.rotation*Math.PI/180,wide=target.width>=target.depth;length=wide?target.width:target.depth;thickness=wide?target.depth:target.width;dx=wide?Math.cos(rot):-Math.sin(rot);dz=wide?Math.sin(rot):Math.cos(rot);ax=target.x-dx*length/2;az=target.z-dz*length/2;}
 else fail('靠牆關係需指定牆或獨立牆體。');
 const nx=-dz,nz=dx,rot=o.rotation*Math.PI/180,extent=(Math.abs(nx*Math.cos(rot)+nz*Math.sin(rot))*o.width+Math.abs(-nx*Math.sin(rot)+nz*Math.cos(rot))*o.depth)/2,offset=r.side*(thickness/2+extent+r.gap);
 return {...o,x:ax+dx*length*r.at+nx*offset,z:az+dz*length*r.at+nz*offset};
}
export function semanticSummary(capture){
 return {assemblies:capture.workbench.assemblies.map(a=>({id:a.id,name:a.name,kind:a.kind,members:a.members.length,status:a.members.some(m=>!member(capture.scene,a.levelId,m))?'missing':fingerprint(capture.scene,a)!==a.fingerprint?'modified':'intact'})),relations:capture.workbench.relations.map(r=>{try{const p=relationPosition(capture.scene,r),o=level(capture.scene,r.subject.levelId).design.objects.find(o=>o.id===r.subject.id),error=Math.hypot(p.x-o.x,p.z-o.z,p.elevation-o.elevation);return {id:r.id,locked:r.locked,status:error<.01?'satisfied':'needs-fix',errorMetres:error};}catch(e){return {id:r.id,locked:r.locked,status:'missing',reason:e.message};}})};
}
export function guardRelations(capture,scene){for(const r of capture.workbench?.relations||[]){if(!r.locked)continue;const p=relationPosition(scene,r),o=level(scene,r.subject.levelId).design.objects.find(o=>o.id===r.subject.id);if(Math.hypot(p.x-o.x,p.z-o.z,p.elevation-o.elevation)>.01)fail('修改違反已鎖定關係 '+r.id+'；請先解除關係鎖定，或一併調整主體。');}}

export function applySemanticPacket(input,packet){
 exact(packet,['format','version','id','captureId','baseRevision','sourceIds','basis','operations']);if(packet.format!=='lumiere-semantic'||packet.version!==1||!/^semantic-[\w-]+$/.test(packet.id)||packet.captureId!==input.id||packet.baseRevision!==input.revision||!Array.isArray(packet.operations)||packet.operations.length<1||packet.operations.length>100)fail('語意操作格式或版本不符。');provenance(input,packet);const c=structuredClone(input);const exec=cmd=>{c.scene=applyBuildingCommand(c.scene,cmd);};
 for(const op of packet.operations){
  if(op.type==='assembly.put'){
   exact(op,['type','id','levelId','kind','name','params']);if(!/^assembly-[\w-]+$/.test(op.id)||!SEMANTIC_KINDS.includes(op.kind)||!label(op.name))fail('語意構件格式錯誤。');validateParams(op.kind,op.params);const l=level(c.scene,op.levelId);if(!l)fail('語意構件樓層不存在。');if(op.params.height+(op.params.elevation||0)>l.height)fail('構件超過樓高，請先確認樓高。');const old=c.workbench.assemblies.find(a=>a.id===op.id);if(old&&(old.levelId!==op.levelId||old.kind!==op.kind))fail('既有構件不可更換樓層或種類，請另建 ID。');if(old&&fingerprint(c.scene,old)!==old.fingerprint)fail('構件已有人工修改，請先 detach 保留修改，再建立新構件。');exec({type:'floor.select',id:op.levelId});const params=structuredClone(op.params),hosted=op.kind==='window-grid'&&params.host,members=[];
   if(hosted){
    const current=level(c.scene,op.levelId),wall=current.design.walls.find(w=>w.id===params.host.wallId);if(!wall||wall.type!=='wall')fail('附牆窗格須指定目前樓層的原生實牆；不自動猜測宿主。');const f=wallFrame(current.design,wall);Object.assign(params,{x:f.a.x+f.dx*f.length*params.host.at,z:f.a.z+f.dz*f.length*params.host.at,rotation:(Math.atan2(f.dz,f.dx)*180/Math.PI+360)%360});
    const existing=old?.members.find(m=>m.kind==='opening'&&m.role==='opening'),before=new Set(current.design.openings.map(o=>o.id));
    exec({type:'windowGrid',id:existing?.id||null,wallId:wall.id,at:params.host.at,width:params.width,height:params.height,sill:params.elevation,grid:{columns:params.columns,rows:params.rows,frame:params.frame,depth:params.depth,color:params.color,glassColor:params.glassColor}});
    members.push({role:'opening',kind:'opening',id:existing?.id||level(c.scene,op.levelId).design.openings.find(o=>!before.has(o.id)).id});
   }
   const generated=hosted?[]:parts(op.kind,params,op.name);
   for(const p of generated){let id=old?.members.find(m=>m.role===p.role&&m.kind===p.kind)?.id;const current=level(c.scene,op.levelId);if(p.kind==='object'){if(!id){const before=new Set(current.design.objects.map(o=>o.id));exec({type:'addObject',assetId:p.assetId,x:p.x,z:p.z});id=level(c.scene,op.levelId).design.objects.find(o=>!before.has(o.id)).id;}exec({type:'prop.configure',id,x:p.x,z:p.z,width:p.width,depth:p.depth,height:p.height,elevation:p.elevation,rotation:p.rotation,color:p.color,pitch:0,roll:0,label:p.label});}else{const command={type:id?'element.update':'element.add',...(id?{id}:{kind:'slab'}),x:p.x,z:p.z,width:p.width,depth:p.depth,height:p.height,elevation:p.elevation,rotation:p.rotation,materialId:p.materialId};const before=new Set(current.elements.map(e=>e.id));exec(command);if(!id)id=level(c.scene,op.levelId).elements.find(e=>!before.has(e.id)).id;}members.push({role:p.role,kind:p.kind,id});}
   for(const m of old?.members||[])if(!members.some(n=>n.kind===m.kind&&n.id===m.id))exec({type:m.kind==='element'?'element.delete':'delete',id:m.id});
   const a={id:op.id,levelId:op.levelId,kind:op.kind,name:op.name,params,members,fingerprint:'',sourceIds:[...packet.sourceIds],basis:packet.basis};a.fingerprint=fingerprint(c.scene,a);c.workbench.assemblies=c.workbench.assemblies.filter(a=>a.id!==op.id);c.workbench.assemblies.push(a);
  }else if(['assembly.detach','assembly.delete'].includes(op.type)){
   exact(op,['type','id']);const a=c.workbench.assemblies.find(a=>a.id===op.id);if(!a)fail('語意構件不存在。');if(op.type==='assembly.delete'){exec({type:'floor.select',id:a.levelId});for(const m of a.members)if(member(c.scene,a.levelId,m))exec({type:m.kind==='element'?'element.delete':'delete',id:m.id});}c.workbench.assemblies=c.workbench.assemblies.filter(a=>a.id!==op.id);
  }else if(op.type==='relation.put'){
   exact(op,['type','relation','apply']);validateRelation(op.relation);if(typeof op.apply!=='boolean')fail('關係 apply 須為布林值。');const r=structuredClone(op.relation),old=c.workbench.relations.find(v=>v.id===r.id);if(old?.locked&&canonical({...old,locked:false})!==canonical({...r,locked:false}))fail('關係已鎖定；請先只解除鎖定，再變更關係。');const p=relationPosition(c.scene,r);if(op.apply){exec({type:'floor.select',id:r.subject.levelId});if(r.kind==='against-wall')exec({type:'moveObject',id:r.subject.id,x:p.x,z:p.z});else exec({type:'dimensions',id:r.subject.id,width:p.width,depth:p.depth,height:p.height,elevation:p.elevation});}c.workbench.relations=c.workbench.relations.filter(v=>v.id!==r.id);c.workbench.relations.push(r);
  }else if(op.type==='relation.delete'){exact(op,['type','id']);const r=c.workbench.relations.find(r=>r.id===op.id);if(!r)fail('關係不存在。');if(r.locked)fail('關係已鎖定；請先解除鎖定再刪除。');c.workbench.relations=c.workbench.relations.filter(r=>r.id!==op.id);
  }else fail('未知語意操作。');
 }
 c.scene=validateBuilding(c.scene);validateSemanticState(c);guardRelations(c,c.scene);return c;
}
export function semanticTemplate(c){return {format:'lumiere-semantic',version:1,id:'semantic-'+(c.revision+1),captureId:c.id,baseRevision:c.revision,sourceIds:c.sources.map(s=>s.id),basis:'inferred',operations:[{type:'assembly.put',id:'assembly-space',levelId:c.scene.activeLevelId,kind:'partial-space',name:'局部空間',params:{x:0,z:0,width:5,depth:4,height:2.8,rotation:0,color:'#ddd9d0',boundaries:{north:'wall',east:'unknown',south:'open',west:'wall'},floor:true,ceiling:false,thickness:.12}}]};}
