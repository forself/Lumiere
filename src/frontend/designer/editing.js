const fail=m=>{throw new Error(m);};
const exact=(o,keys)=>{if(!o||Object.keys(o).length!==keys.length||Object.keys(o).some(k=>!keys.includes(k)))fail('編輯群組資料欄位錯誤。');};
export const emptyEditor=()=>({locked:[],hidden:[]});
export function validateEditing(level){
 const objects=new Set(level.design.objects.filter(o=>!o.hostId).map(o=>o.id));
 if(!Array.isArray(level.groups)||level.groups.length>100)fail('家具群組最多 100 組。');const ids=new Set(),used=new Set();for(const g of level.groups){exact(g,['id','name','objectIds']);if(!/^group-[1-9][0-9]*$/.test(g.id)||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>32||!Array.isArray(g.objectIds)||!g.objectIds.length)fail('群組名稱或成員錯誤。');ids.add(g.id);for(const id of g.objectIds){if(!objects.has(id)||level.design.objects.find(o=>o.id===id)?.trace?.anchorId||used.has(id))fail('群組成員不存在、重複或屬於其他群組。');used.add(id);}}
 exact(level.editor,['locked','hidden']);for(const key of ['locked','hidden']){const a=level.editor[key];if(!Array.isArray(a)||a.length>100||new Set(a).size!==a.length||a.some(id=>!objects.has(id)))fail('鎖定／暫藏成員錯誤。');}
}
export function cleanEditing(level){const ids=new Set(level.design.objects.filter(o=>!o.hostId).map(o=>o.id));level.groups=level.groups.map(g=>({...g,objectIds:g.objectIds.filter(id=>ids.has(id)&&!level.design.objects.find(o=>o.id===id)?.trace?.anchorId)})).filter(g=>g.objectIds.length);for(const key of ['locked','hidden'])level.editor[key]=level.editor[key].filter(id=>ids.has(id));}
export function editCommand(level,c){
 if(c.type==='group.save'){const members=[...new Set(c.ids||[])];if(!members.length)fail('請先選擇家具設備。');let g=level.groups.find(g=>g.id===c.id);if(!g){if(c.id!=='new')fail('群組不存在。');let n=1;while(level.groups.some(g=>g.id==='group-'+n))n++;g={id:'group-'+n,name:c.name,objectIds:[]};level.groups.push(g);}g.name=c.name;g.objectIds=members;}
 else if(c.type==='group.delete'){if(!level.groups.some(g=>g.id===c.id))fail('群組不存在。');level.groups=level.groups.filter(g=>g.id!==c.id);}
 else if(c.type==='editor.set'){if(!['locked','hidden'].includes(c.flag)||typeof c.value!=='boolean'||!Array.isArray(c.ids))fail('編輯設定錯誤。');const ids=new Set(level.editor[c.flag]);for(const id of c.ids)c.value?ids.add(id):ids.delete(id);level.editor[c.flag]=[...ids];}
 else fail('未知群組操作。');
}
export function assertLocks(before,after){for(const old of before.levels){const next=after.levels.find(l=>l.id===old.id);for(const id of old.editor.locked){const a=old.design.objects.find(o=>o.id===id),b=next?.design.objects.find(o=>o.id===id);if(JSON.stringify(a)!==JSON.stringify(b))fail('修改包含已鎖定構件，請先解除鎖定。');}}}
