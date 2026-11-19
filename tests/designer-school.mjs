import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {emptyProject,wallFrame} from '../src/frontend/designer/model.js';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {insertSchoolModule,SCHOOL_MODULES} from '../src/frontend/designer/school-modules.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {planSvg} from '../src/frontend/designer/design-export.js';
import {stepWalk} from '../src/frontend/designer/walk.js';
for(const kind of Object.keys(SCHOOL_MODULES)){
 const original=new BuildingStore(emptyProject()),source=original.serialize(),result=insertSchoolModule(original.building,{kind,x:0,z:0}),store=new BuildingStore(result.building),p=store.state;
 original.replace(result.building);original.undo();assert.equal(original.serialize(),source);original.redo();assert.equal(original.state.rooms.length,1);original.undo();
 if(kind==='computer'){for(const [id,n] of [['computer-desk',9],['student-chair',9],['computer-monitor',10],['computer-tower',10],['computer-keyboard',10],['computer-mouse',10]])assert.equal(p.objects.filter(o=>o.assetId===id).length,n);const monitor=p.objects.find(o=>o.assetId==='computer-monitor');assert.equal(monitor.elevation,.75);store.execute({type:'addObject',assetId:'switch',x:7,z:1});const sw=store.state.objects.at(-1).id;store.execute({type:'bindDevice',id:sw,channel:0,targetId:monitor.id});store.execute({type:'deviceControl',id:sw,channel:0,value:1});assert.equal(store.state.objects.find(o=>o.id===monitor.id).deviceState.power,true);store.undo();store.undo();store.undo();}
 assert.equal(original.serialize(),source);assert.equal(p.rooms.length,1);assert.equal(p.walls.length,4);assert.equal(p.openings.length,3);
 const entrance=p.openings.find(o=>o.kind==='door'),ef=wallFrame(p,p.walls.find(w=>w.id===entrance.wallId));store.execute({type:'addObject',assetId:'concrete-paving',x:ef.a.x+ef.dx*ef.length*entrance.at,z:ef.a.z+ef.dz*ef.length*entrance.at+1});
 const built=buildBuilding(store.building);try{
  for(const wall of p.walls){const f=wallFrame(p,wall),ray=new THREE.Raycaster(new THREE.Vector3((f.a.x+f.b.x)/2+f.nx,2.7,(f.a.z+f.b.z)/2+f.nz),new THREE.Vector3(-f.nx,0,-f.nz),0,2);assert.ok(ray.intersectObject(built.group,true).some(hit=>hit.object.userData.id===wall.id),'wall lintel present');}
  for(const o of p.openings){const w=p.walls.find(w=>w.id===o.wallId),f=wallFrame(p,w),ray=new THREE.Raycaster(new THREE.Vector3(f.a.x+f.dx*f.length*o.at+f.nx,o.sill+o.height/2,f.a.z+f.dz*f.length*o.at+f.nz),new THREE.Vector3(-f.nx,0,-f.nz),0,2);assert.ok(!ray.intersectObject(built.group,true).some(hit=>hit.object.userData.id===w.id),'no solid wall filling opening');}
  const door=p.openings.find(o=>o.kind==='door'),f=wallFrame(p,p.walls.find(w=>w.id===door.wallId)),center={x:f.a.x+f.dx*f.length*door.at,z:f.a.z+f.dz*f.length*door.at};let pos={x:center.x,y:1.65,z:center.z+.3};for(let i=0;i<8;i++){const next=stepWalk(store.building,pos,0,-.08,built.group);assert.ok(next,kind+' entrance');pos=next;}
 }finally{built.dispose();store.undo();}
 store.execute({type:'toggleOpening',id:p.openings.find(o=>o.kind==='door').id});store.undo();assert.equal(store.state.openings.find(o=>o.kind==='door').open,true);assert.equal(parseBuilding(store.serialize()).levels[0].design.rooms.length,1);
 assert.throws(()=>insertSchoolModule(result.building,{kind,x:0,z:0}));
 writeFileSync(`output/school-${kind}.json`,store.serialize());
}
const s=new BuildingStore(emptyProject());for(const [kind,x,z] of [['classroom',-18,-16],['classroom',-8,-16],['guard',12,-16],['restroom',10,-10],['corridor',-18,-6]])s.replace(insertSchoolModule(s.building,{kind,x,z}).building);
function put(assetId,x,z,width,depth,height){s.execute({type:'addObject',assetId,x,z});const o=s.state.objects.at(-1);if(width)s.execute({type:'dimensions',id:o.id,width,depth,height,elevation:0});return o.id;}
put('concrete-paving',0,10,40,22,.05);
for(const x of [-18,-15,-12,-9,-6,-3,0,3,6,9,12,15,18])put('school-rail-vertical',x,21);
for(const x of [-12,-9,-6])put('school-rail-mesh',x,3);
put('flagpole',5,0);put('basketball-hoop',-8,8);put('football-goal',10,15);put('bike-rack',15,-1);put('school-bin',10,0);put('drinking-fountain',-3,-5);put('wash-trough',1,-5);put('school-bench',5,4);put('notice-board',15,-5);put('school-rail-horizontal',18,4);
const mark=put('notice-board',0,18);s.execute({type:'label.set',id:mark,text:'校園元件測試區'});
writeFileSync('output/school-campus-test.json',s.serialize());writeFileSync('output/school-campus-test.svg',planSvg(s.building,s.building.activeLevelId));
console.log(`PASS five editable school modules: wall/opening coverage, entrance collision, undo, persistence and overlap rejection; campus ${s.state.rooms.length} rooms / ${s.state.objects.length} objects.`);
