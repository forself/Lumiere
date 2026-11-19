import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {planSvg} from '../src/frontend/designer/design-export.js';
import {stepWalk} from '../src/frontend/designer/walk.js';
const source=readFileSync('output/crossroads-test-design.json','utf8'),s=new BuildingStore(parseBuilding(source));
const originalObjectIds=new Set(s.state.objects.map(o=>o.id));
s.execute({type:'addRoom',x:-19.2,z:-19.2,width:10,depth:10});
const room=s.state.rooms.at(-1),walls=room.wallIds.map(id=>s.state.walls.find(w=>w.id===id)),vertex=id=>s.state.vertices.find(v=>v.id===id),front=walls.find(w=>[w.startId,w.endId].every(id=>Math.abs(vertex(id).z+9.2)<1e-7)),side=walls.find(w=>[w.startId,w.endId].every(id=>Math.abs(vertex(id).x+9.2)<1e-7));
function opening(wall,kind,at,width,height,sill=0){s.execute({type:'addOpening',wallId:wall.id,kind,at});const id=s.state.openings.at(-1).id;s.execute({type:'dimensions',id,width,height,sill});return id;}
const door=opening(front,'door',.5,2,2.2);s.execute({type:'openingStyle',id:door,styleId:'door-glass-double-slide'});s.execute({type:'toggleOpening',id:door});
opening(front,'window',.18,2.4,2,.15);opening(front,'window',.82,2.4,2,.15);opening(side,'window',.5,5,2,.15);
function put(assetId,x,z,width,depth,height,elevation=0,rotation=0,color){s.execute({type:'addObject',assetId,x,z});const initial=s.state.objects.at(-1),id=initial.id;s.execute({type:'dimensions',id,width:width??initial.width,depth:depth??initial.depth,height:height??initial.height,elevation});for(let i=0;i<rotation/90;i++)s.execute({type:'rotateObject',id});if(color){const o=s.state.objects.find(o=>o.id===id);s.execute({type:'prop.configure',id,label:'',color,pitch:0,roll:0,x:o.x,z:o.z,width:o.width,depth:o.depth,height:o.height,elevation:o.elevation,rotation:o.rotation});}return id;}
for(const x of [-17.6,-15.2,-12.8])put('bookcase',x,-15,3.6,.55,1.45,0,90);
for(const x of [-17.4,-15.8])put('fridge',x,-18.65,1.2,.7,2.05);
put('placeholder-box',-11.1,-11.2,2.4,.8,.9,0,0,'#d5d0bf');put('placeholder-box',-11.4,-11.2,.4,.3,.32,.9,0,'#39494c');put('microwave',-10.4,-11.2,.5,.4,.3,.9);
put('ac',-19,-13,.9,.23,.3,2.2,90);put('ac',-16,-19,.9,.23,.3,2.2);
put('light',-16,-13.3,1.2,.2,.08,2.6);put('light',-12,-15.6,1.2,.2,.08,2.6);
const sign=put('placeholder-box',-14.2,-9.02,7,.15,.45,2.25,0,'#2a9385');s.execute({type:'label.set',id:sign,text:'便利商店（測試店）'});
put('placeholder-box',-14.2,-8.85,8,1,.12,2.72,0,'#ddd8bc');
put('table',-10.2,-16.7,1.4,.7,.75,0,90);put('chair',-11,-16.2,.5,.5,.85,0,270);put('chair',-11,-17.2,.5,.5,.85,0,270);
put('concrete-sidewalk',-14.2,-9.1,10,.2,.15);
const result=JSON.parse(s.serialize());result.levels[0].design.rooms.find(r=>r.id===room.id).name='便利商店（測試店）';const verified=parseBuilding(JSON.stringify(result));assert.equal(verified.levels[0].design.objects.length,originalObjectIds.size+18);assert.equal(verified.levels[0].design.openings.length,4);
const built=buildBuilding(verified);try{let p={x:-14.2,y:1.8,z:-7.6};for(let i=0;i<50;i++){const next=stepWalk(verified,p,0,-.08,built.group);assert.ok(next,'sidewalk to open store door '+i);p=next;}assert.ok(p.z<-11.5);assert.ok(Math.abs(p.y-1.65)<1e-8);}finally{built.dispose();}
writeFileSync('output/crossroads-convenience-store.json',JSON.stringify(verified,null,2));writeFileSync('output/crossroads-convenience-store.svg',planSvg(verified,verified.activeLevelId));assert.equal(readFileSync('output/crossroads-test-design.json','utf8'),source);
console.log(`PASS store: original crossroads unchanged, ${verified.levels[0].design.objects.length} total objects, 100 m² shop, 4 glazed openings, saved/reloaded and walkable sidewalk-to-entry route.`);
// Detail-only inspection copy; the delivered street scene remains intact.
const detail=structuredClone(verified);detail.levels[0].design.objects=detail.levels[0].design.objects.filter(o=>!originalObjectIds.has(o.id));writeFileSync('output/convenience-store-detail.json',JSON.stringify(parseBuilding(JSON.stringify(detail)),null,2));
