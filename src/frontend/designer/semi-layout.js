const fail=m=>{throw Error(m);};
export function semiLayout(p){
 const {kind,x,z,width,depth,clearance,spacing}=p;if(!['corridor','arcade','shelter'].includes(kind)||![x,z,width,depth,clearance,spacing].every(Number.isFinite)||width<1.2||width>30||depth<1.2||depth>8||spacing<1||spacing>8||clearance<2)fail('半戶外空間尺寸或柱距錯誤。');
 const elements=[],objects=[],add=(kind,x,z,width,depth,height,elevation)=>elements.push({kind,x,z,width,depth,height,elevation,rotation:0,materialId:'stone',...(kind==='canopy'?{canopy:{wallId:null,at:.5,side:1,slope:0}}:{})});
 add('slab',x+width/2,z+depth/2,width,depth,.15,0);add(kind==='arcade'?'slab':'canopy',x+width/2,z+depth/2,width,depth,.15,clearance+.15);
 const count=Math.max(1,Math.ceil((width-.3)/spacing)),rows=kind==='shelter'?[z+.15,z+depth-.15]:[z+depth-.15];for(const cz of rows)for(let i=0;i<=count;i++)add('column',x+.15+i*(width-.3)/count,cz,.2,.2,clearance,0);
 if(kind==='corridor'){const n=Math.ceil(width/6);for(let i=0;i<n;i++)objects.push({assetId:'school-rail-vertical',x:x+(i+.5)*width/n,z:z+depth-.06,width:width/n,depth:.12,height:1.1,elevation:0,rotation:0});}
 return {elements,objects};
}
export function validateAssemblies(level){
 const groups=level.assemblies||[];if(!Array.isArray(groups)||groups.length>30)fail('半戶外組合最多 30 組。');const used=new Set(),names=new Set();
 for(const g of groups){const keys=['id','kind','x','z','width','depth','clearance','spacing','elementIds','objectIds'];if(!g||Object.keys(g).length!==keys.length||Object.keys(g).some(k=>!keys.includes(k))||!/^semi-[1-9][0-9]*$/.test(g.id)||names.has(g.id))fail('半戶外組合資料錯誤。');names.add(g.id);const expected=semiLayout(g);
  for(const [list,source,fields] of [['elementIds','elements',['kind','x','z','width','depth','height','elevation','rotation']],['objectIds','objects',['assetId','x','z','width','depth','height','elevation','rotation']]]){
   if(!Array.isArray(g[list])||g[list].length!==expected[source].length)fail('半戶外組合成員數不符。');const all=source==='elements'?level.elements:level.design.objects;
   for(let i=0;i<g[list].length;i++){const id=g[list][i],item=all.find(o=>o.id===id),key=source+':'+id;if(!item||used.has(key))fail('半戶外組合成員不存在或重複。');used.add(key);const e=expected[source][i];if(fields.some(k=>typeof e[k]==='number'?Math.abs(item[k]-e[k])>1e-6:item[k]!==e[k])||item.canopy&&(item.canopy.wallId!==null||item.canopy.slope!==0))fail('此構件屬於半戶外整組；請使用整組設定，或先解除整組關聯。');}
  }
 }
}
