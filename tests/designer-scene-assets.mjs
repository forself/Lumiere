import assert from 'node:assert/strict';
import {ASSETS} from '../src/frontend/designer/catalog.js';
import {DesignStore,sampleProject,parseProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
const s=new DesignStore(sampleProject()),ids=Object.values(ASSETS).filter(a=>a.category==='scene'&&!a.trace).map(a=>a.id);
assert.equal(ids.length,16);
for(const assetId of ids){
 s.execute({type:'addObject',assetId,x:1,z:1});const id=s.state.objects.at(-1).id;
 s.execute({type:'dimensions',id,width:1.1,depth:.7,height:assetId==='bloodstain'||assetId==='puddle'?.01:1.5,elevation:2});
 const built=buildDesign(s.state);let count=0,disposed=0;
 try{built.byId.get(id).traverse(mesh=>{if(!mesh.isMesh)return;assert.equal(mesh.userData.id,id);assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));count++;mesh.geometry.addEventListener('dispose',()=>disposed++);});assert.ok(count>0);}finally{built.dispose();}
 assert.equal(disposed,count);
}
const fence=s.state.objects.find(o=>o.assetId==='electric-fence');
s.execute({type:'addObject',assetId:'switch',x:0,z:0});const sw=s.state.objects.at(-1);
s.execute({type:'bindDevice',id:sw.id,channel:0,targetId:fence.id});
s.execute({type:'deviceControl',id:sw.id,channel:0,value:1});
assert.equal(s.state.objects.find(o=>o.id===fence.id).deviceState.power,true);
assert.deepEqual(parseProject(s.serialize()),s.state);
s.execute({type:'delete',id:fence.id});assert.equal(s.state.objects.at(-1).targets[0],null);s.undo();assert.equal(s.state.objects.at(-1).targets[0],fence.id);
console.log('PASS scene assets: 16 adjustable assets, finite selectable meshes, disposal, switch state, serialization and undo.');
