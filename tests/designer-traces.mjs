import assert from 'node:assert/strict';
import {ASSETS} from '../src/frontend/designer/catalog.js';
import {DesignStore,sampleProject,objectPose,parseProject,copyRoomGroup} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
const s=new DesignStore(sampleProject()),traces=Object.values(ASSETS).filter(a=>a.trace);assert.equal(traces.length,6);
const add=assetId=>{s.execute({type:'addObject',assetId,x:0,z:0});return s.state.objects.at(-1).id;};
const get=id=>s.state.objects.find(o=>o.id===id),pose=id=>objectPose(s.state,get(id));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const host=add('table');
for(const a of traces){const id=add(a.id);s.execute({type:'trace.configure',id,anchorId:host,x:.2,z:.3,elevation:.8,rotation:0,pitch:90,roll:0,label:'E-01 <文字>'});near(pose(id).x,.2);const built=buildDesign(s.state);try{assert.equal(built.byId.get(id).rotation.x,Math.PI/2);assert.ok(built.byId.get(id).children.length);}finally{built.dispose();}}
const ids=s.state.objects.filter(o=>o.trace).map(o=>o.id),id=ids[0];
s.execute({type:'moveObject',id:host,x:1,z:2});near(pose(id).x,1.2);near(pose(id).z,2.3);
s.execute({type:'rotateObject',id:host});near(pose(id).x,.7);near(pose(id).z,2.2);near(pose(id).rotation,90);
s.execute({type:'moveObject',id,x:.9,z:2.5});near(pose(id).x,.9);near(pose(id).z,2.5);
s.execute({type:'dimensions',id,width:.2,depth:.3,height:.01,elevation:1.2});near(pose(id).elevation,1.2);
assert.deepEqual(parseProject(s.serialize()),s.state);
const prior=pose(id),saved=s.serialize();s.execute({type:'delete',id:host});assert.equal(get(id).trace.anchorId,null);near(pose(id).x,prior.x);near(pose(id).z,prior.z);near(pose(id).rotation,prior.rotation);s.undo();assert.equal(s.serialize(),saved);
for(const anchorId of ['room-1',s.state.walls[0].id,'door-1','window-1']){s.execute({type:'trace.configure',id,anchorId,x:0,z:0,elevation:1,rotation:0,pitch:90,roll:0,label:'E-02'});assert.equal(get(id).trace.anchorId,anchorId);}
const before=s.serialize();for(const changes of [{anchorId:id},{anchorId:'missing'},{pitch:NaN},{label:'x'.repeat(65)}]){assert.throws(()=>s.execute({type:'trace.configure',id,anchorId:host,x:0,z:0,elevation:1,rotation:0,pitch:0,roll:0,label:'',...changes}));assert.equal(s.serialize(),before);}
const copy=copyRoomGroup(s.state,['room-1'],{dx:10,dz:0}).design;assert.ok(copy.objects.some(o=>o.trace&&o.trace.anchorId!=='window-1'&&o.x>5));
s.execute({type:'addObject',assetId:'fingerprint',x:1,z:1,tracePlacement:{anchorId:host,elevation:1,rotation:45,pitch:90,roll:0}});assert.equal(s.state.objects.at(-1).trace.anchorId,host);
console.log('PASS trace markers: six types, attachment transforms, independent edits, detach on deletion, undo, strict import, room copy and surface placement.');
