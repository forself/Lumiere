import assert from 'node:assert/strict';
import {ASSETS,ASSET_CATEGORIES} from '../src/frontend/designer/catalog.js';
import {DesignStore,sampleProject,applyCommand,objectPose,parseProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++;};const rejects=(fn,label)=>{assert.throws(fn,undefined,label);checks++;};
check(Object.keys(ASSET_CATEGORIES).length===8,'四大類、現場重建、戶外道路、校園與車輛');
check(['plant','bookcase','aquarium','mat','rug'].every(id=>ASSETS[id].category==='extras'),'使用者指定額外項目歸類');
const source=sampleProject();
for(const asset of Object.values(ASSETS)){
  check(Object.hasOwn(ASSET_CATEGORIES,asset.category),'每項素材有合法分類');
  const p=applyCommand(source,{type:'addObject',assetId:asset.id,x:0,z:0,hostId:asset.hostKind==='door'?'door-1':'window-1'});
  const object=p.objects.at(-1),built=buildDesign(p);
  try{check(built.byId.get(object.id).children.length>0,`${asset.name} 實際幾何`);}finally{built.dispose();}
  check(parseProject(JSON.stringify(p)).objects.at(-1).assetId===asset.id,'素材可儲存重開');
}
const s=new DesignStore(source);s.execute({type:'addObject',assetId:'window-curtain',hostId:'window-1'});
const curtain=s.state.objects.at(-1),initial=objectPose(s.state,curtain);
s.execute({type:'moveOpening',id:'window-1',at:.6});const moved=objectPose(s.state,s.state.objects.at(-1));
check(Math.abs(moved.z-initial.z-.4)<1e-6,'窗簾隨窗移動');
s.execute({type:'dimensions',id:'window-1',width:1.4,height:1.4,sill:.8});
const sized=objectPose(s.state,s.state.objects.at(-1));check(Math.abs(sized.width-1.6)<1e-6&&sized.elevation===.8&&Math.abs(sized.height-1.55)<1e-6,'窗簾寬高與標高隨窗');
const snapshot=s.serialize();rejects(()=>s.execute({type:'moveObject',id:curtain.id,x:2,z:2}),'附加不可獨立移動');
rejects(()=>s.execute({type:'addObject',assetId:'door-curtain',hostId:'window-1'}),'錯誤依附對象拒絕');
rejects(()=>s.execute({type:'addObject',assetId:'window-curtain',hostId:'window-1'}),'重複依附拒絕');
check(s.serialize()===snapshot,'拒絕不改資料');
s.execute({type:'delete',id:'window-1'});check(!s.state.objects.some(o=>o.id===curtain.id),'刪窗同步清理依附件');s.undo();check(s.serialize()===snapshot,'復原窗與窗簾');
s.execute({type:'delete',id:'room-1'});check(!s.state.objects.some(o=>o.hostId),'刪房清理附加，保留獨立物件');s.undo();
s.execute({type:'addObject',assetId:'water-pipe',x:1,z:1});const pipe=s.state.objects.at(-1);
s.execute({type:'installation',id:pipe.id,value:'concealed'});s.execute({type:'dimensions',id:pipe.id,width:2,depth:.05,height:.05,elevation:1.2});
check(s.state.objects.at(-1).installation==='concealed'&&s.state.objects.at(-1).elevation===1.2,'暗管與標高保存');
rejects(()=>s.execute({type:'installation',id:'object-1',value:'concealed'}),'家具不可指定管線敷設');
const corrupt=JSON.parse(s.serialize());corrupt.objects.find(o=>o.hostId).hostId='missing';rejects(()=>parseProject(JSON.stringify(corrupt)),'外部孤立依附拒絕');
const old=structuredClone(source);old.version=4;for(const o of old.objects){delete o.elevation;delete o.hostId;delete o.installation;delete o.controls;delete o.targets;delete o.deviceState;delete o.media;}
const migrated=parseProject(JSON.stringify(old));check(migrated.version===8&&migrated.objects[0].elevation===0&&migrated.objects[0].hostId===null,'版本4遷移保持原家具落地');
for(const asset of Object.values(ASSETS).filter(a=>a.control)){
  const initial=applyCommand(source,{type:'addObject',assetId:asset.id,x:0,z:0}),id=initial.objects.at(-1).id;
  const changed=applyCommand(initial,{type:'deviceControl',id,channel:asset.control.channels-1,value:asset.control.max});
  const values=changed.objects.at(-1).controls;
  check(values.at(-1)===asset.control.max&&values.slice(0,-1).every(v=>v===asset.control.initial),'各路控制互不改寫');
  rejects(()=>applyCommand(changed,{type:'deviceControl',id,channel:asset.control.channels,value:0}),'超出路數拒絕');
  rejects(()=>applyCommand(changed,{type:'deviceControl',id,channel:0,value:asset.control.max+1}),'超出範圍拒絕');
  check(parseProject(JSON.stringify(changed)).objects.at(-1).controls.at(-1)===asset.control.max,'控制值可持久化');
  if(['switch','valve','dial'].includes(asset.shape)){
    const before=buildDesign(initial),after=buildDesign(changed);
    try{const rotations=b=>b.byId.get(id).children.map(c=>c.rotation.toArray().slice(0,3));check(JSON.stringify(rotations(before))!==JSON.stringify(rotations(after)),'實際搖臂／旋鈕／閥桿轉動');}finally{before.dispose();after.dispose();}
  }
}
console.log(`PASS asset categories: ${checks} assertions; catalog, geometry, attachment follow/cascade, elevation, installation and migration.`);
