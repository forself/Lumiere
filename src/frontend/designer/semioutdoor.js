import {applyBuildingCommand,validateBuilding} from './building-model.js';
import {wallRooms,wallFrame} from './model.js';
export const SEMIOUTDOOR_PRESETS={corridor:'開放走廊',arcade:'騎樓',shelter:'連通雨棚'};
export function addSemiOutdoor(building,{kind,x,z,width,depth,clearance,spacing=3}){
 if(!Object.hasOwn(SEMIOUTDOOR_PRESETS,kind)||![x,z,width,depth,clearance,spacing].every(Number.isFinite)||width<1.2||depth<1.2||spacing<1||spacing>8||clearance<2)throw Error('半戶外空間尺寸或柱距錯誤。');
 const source=building.levels.find(l=>l.id===building.activeLevelId),oldElements=new Set(source.elements.map(e=>e.id)),oldObjects=new Set(source.design.objects.map(o=>o.id));
 let b=building;const run=c=>{b=applyBuildingCommand(b,c);},add=(kind,cx,cz,w,d,h,y)=>run({type:'element.add',kind,x:cx,z:cz,width:w,depth:d,height:h,elevation:y,rotation:0,materialId:'stone'});
 add('slab',x+width/2,z+depth/2,width,depth,.15,0);
 add(kind==='arcade'?'slab':'canopy',x+width/2,z+depth/2,width,depth,.15,clearance+.15);
 const count=Math.max(1,Math.ceil((width-.3)/spacing)),rows=kind==='shelter'?[z+.15,z+depth-.15]:[z+depth-.15];
 for(const cz of rows)for(let i=0;i<=count;i++){const cx=x+.15+i*(width-.3)/count,design=b.levels.find(l=>l.id===b.activeLevelId).design;for(const o of design.openings.filter(o=>o.kind==='door')){const f=wallFrame(design,design.walls.find(w=>w.id===o.wallId)),dx=cx-f.a.x,dz=cz-f.a.z;if(Math.abs(dx*f.nx+dz*f.nz)<.4&&Math.abs(dx*f.dx+dz*f.dz-o.at*f.length)<o.width/2+.2)throw Error('柱列與現有門口相交，請調整位置或柱距。');}add('column',cx,cz,.2,.2,clearance,0);}
 if(kind==='corridor'){const count=Math.ceil(width/6);for(let i=0;i<count;i++){run({type:'addObject',assetId:'school-rail-vertical',x:x+(i+.5)*width/count,z:z+depth-.06});const o=b.levels.find(l=>l.id===b.activeLevelId).design.objects.at(-1);run({type:'dimensions',id:o.id,width:width/count,depth:.12,height:1.1,elevation:0});}}
 const level=b.levels.find(l=>l.id===b.activeLevelId);run({type:'semi.register',value:{kind,x,z,width,depth,clearance,spacing,elementIds:level.elements.filter(e=>!oldElements.has(e.id)).map(e=>e.id),objectIds:level.design.objects.filter(o=>!oldObjects.has(o.id)).map(o=>o.id)}});
 return validateBuilding(b);
}
export function addWallCanopy(building,{wallId,width,depth,clearance,slope=0,materialId='stone'}){
 const l=building.levels.find(l=>l.id===building.activeLevelId),wall=l.design.walls.find(w=>w.id===wallId),owners=wallRooms(l.design,wallId);
 if(!wall||wall.type!=='wall'||owners.length!==1)throw Error('請先點選單側室內的外牆。');
 const r=owners[0],i=r.wallIds.indexOf(wallId),side=r.vertexIds[i]===wall.startId?-1:1,f=wallFrame(l.design,wall);
 if(![width,depth,clearance,slope].every(Number.isFinite)||width<.2||depth<.2||clearance<.3||slope<0||slope>20)throw Error('雨遮尺寸或坡度錯誤。');
 return applyBuildingCommand(building,{type:'element.add',kind:'canopy',x:(f.a.x+f.b.x)/2,z:(f.a.z+f.b.z)/2,width,depth,height:.12,elevation:clearance+.12+depth*Math.tan(slope*Math.PI/180)/2,rotation:0,materialId,canopy:{wallId,at:.5,side,slope}});
}
