import assert from 'node:assert/strict';
import {DesignStore,sampleProject,parseProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
const s=new DesignStore(sampleProject());let n=0;
const check=(v)=>{assert.ok(v);n++;};
const add=assetId=>{s.execute({type:'addObject',assetId,x:0,z:0});return s.state.objects.at(-1).id;};
const tv=add('tv'),screen=add('projection-screen'),projector=add('projector'),sw=add('switch');
for(const [id,inches] of [[tv,65],[screen,120]]){
 s.execute({type:'displaySize',id,inches});const o=s.state.objects.find(o=>o.id===id);
 check(Math.abs(o.width/o.height-16/9)<1e-10);check(Math.abs(Math.hypot(o.width,o.height)-inches*.0254)<1e-10);
 const saved=s.serialize();s.undo();s.redo();check(s.serialize()===saved);check(parseProject(saved).objects.find(o=>o.id===id).width===o.width);
}
for(const cmd of [{type:'displaySize',id:tv,inches:NaN},{type:'displaySize',id:tv,inches:301},{type:'displaySize',id:projector,inches:65},{type:'bindDevice',id:sw,channel:0,targetId:screen}]){const before=s.serialize();assert.throws(()=>s.execute(cmd));check(s.serialize()===before);}
s.execute({type:'bindDevice',id:sw,channel:0,targetId:projector});s.execute({type:'deviceControl',id:sw,channel:0,value:1});check(s.state.objects.find(o=>o.id===projector).deviceState.power);
const built=buildDesign(s.state);try{check(built.byId.get(projector).children.some(c=>c.geometry?.type==='CylinderGeometry'));check(built.byId.get(screen).children.length===3);check(built.byId.get(tv).children.length===3);}finally{built.dispose();}
console.log(`PASS media assets: ${n} assertions; inches conversion, geometry, controls, undo and JSON.`);
