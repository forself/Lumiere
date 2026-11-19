import {applyCommand,wallFrame} from './model.js';
import {semiLayout} from './semi-layout.js';
import {cleanEditing} from './editing.js';
export function checkSemiDoors(level,elements){for(const column of elements.filter(e=>e.kind==='column'))for(const door of level.design.openings.filter(o=>o.kind==='door')){const f=wallFrame(level.design,level.design.walls.find(w=>w.id===door.wallId)),dx=column.x-f.a.x,dz=column.z-f.a.z;if(Math.abs(dx*f.nx+dz*f.nz)<.4&&Math.abs(dx*f.dx+dz*f.dz-door.at*f.length)<door.width/2+.2)throw Error('柱列與現有門口相交，請調整位置或柱距。');}}
export function assemblyCommand(level,c){
 level.assemblies??=[];
 if(c.type==='semi.register'){let i=1;while(level.assemblies.some(g=>g.id==='semi-'+i))i++;level.assemblies.push({...c.value,id:'semi-'+i});return;}
 const g=level.assemblies.find(g=>g.id===c.id);if(!g)throw Error('請先選取半戶外整組。');
 if(c.type==='semi.detach'){level.assemblies=level.assemblies.filter(a=>a!==g);return;}
 if(c.type==='semi.delete'){level.elements=level.elements.filter(e=>!g.elementIds.includes(e.id));level.design.objects=level.design.objects.filter(o=>!g.objectIds.includes(o.id));level.assemblies=level.assemblies.filter(a=>a!==g);cleanEditing(level);return;}
 if(c.type!=='semi.update')throw Error('未知半戶外整組操作。');
 const next={...g};for(const k of ['kind','x','z','width','depth','clearance','spacing'])next[k]=c[k];const layout=semiLayout(next);checkSemiDoors(level,layout.elements);
 const oldElements=g.elementIds.map(id=>level.elements.find(e=>e.id===id)),oldObjects=g.objectIds.map(id=>level.design.objects.find(o=>o.id===id)),reserved=new Set(level.elements.map(e=>e.id));
 level.elements=level.elements.filter(e=>!g.elementIds.includes(e.id));next.elementIds=layout.elements.map((e,i)=>{let id=oldElements[i]?.id;if(!id){let n=1;while(reserved.has('element-'+n))n++;id='element-'+n;reserved.add(id);}level.elements.push({...e,id,materialId:oldElements[i]?.materialId||e.materialId});return id;});
 next.objectIds=[];
 for(let i=0;i<layout.objects.length;i++){const pose=layout.objects[i];let o=oldObjects[i];if(!o){level.design=applyCommand(level.design,{type:'addObject',assetId:pose.assetId,x:pose.x,z:pose.z});o=level.design.objects.at(-1);}Object.assign(o,pose);next.objectIds.push(o.id);}
 level.design.objects=level.design.objects.filter(o=>!g.objectIds.includes(o.id)||next.objectIds.includes(o.id));Object.assign(g,next);cleanEditing(level);
}
