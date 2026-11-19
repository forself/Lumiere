import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore,applyBuildingCommand,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject,sampleProject,wallFrame} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {DesignViewport} from '../src/frontend/designer/DesignViewport.js';
import {planSvg} from '../src/frontend/designer/design-export.js';
import {walkStart,wallBlocksWalkStart,stepWalk} from '../src/frontend/designer/walk.js';

const store=new BuildingStore(emptyProject());
store.execute({type:'floorArea.add',points:[{x:-3,z:-3},{x:3,z:-3},{x:3,z:3},{x:-3,z:3}],name:'開放地坪',materialId:'oak'});
const areaId=store.state.rooms[0].id;
store.execute({type:'wall.add',start:{x:-3,z:-2.5},end:{x:3,z:-2.5},height:2.8,thickness:.2,materialId:'plaster'});
const wallId=store.state.walls[0].id;
store.execute({type:'addOpening',wallId,kind:'door',at:.5});
const doorId=store.state.openings[0].id;
store.execute({type:'dimensions',id:doorId,width:1.6,height:2.4,sill:0});
store.execute({type:'openingStyle',id:doorId,styleId:'door-glass-sash'});
store.execute({type:'wall.add',start:{x:1,z:1},end:{x:1.05,z:1},height:2.8,thickness:.03,materialId:'plaster'});
assert.equal(store.state.walls.length,2,'floor area does not create four perimeter walls');
const start=walkStart(store.building,store.building.activeLevelId);
for(const wall of store.state.walls)assert.equal(wallBlocksWalkStart(store.state,wall,start),false,'floor-based spawn must avoid independent wall solids');
assert.notDeepEqual({x:start.x,z:start.z},{x:-2.5,z:-2.5},'old first floor candidate lies inside a partition');
assert.equal(wallBlocksWalkStart(store.state,store.state.walls[0],{x:-.4,z:-2.5}),true,'closed glass door blocks spawn');
const testCrossing=open=>{
 const built=buildBuilding(store.building,{onlyLevelId:store.building.activeLevelId});
 try{
  assert.equal(!!stepWalk(store.building,{x:-.4,y:1.65,z:-2.85},0,.6,built.group),open,'actual door geometry controls the free half of the crossing');
  assert.equal(stepWalk(store.building,{x:.4,y:1.65,z:-2.85},0,.6,built.group),null,'the overlapping glass half remains blocked');
  let count=0;built.group.traverse(mesh=>{if(!mesh.isMesh)return;count++;assert([...mesh.geometry.attributes.position.array].every(Number.isFinite));});assert(count>5);
 }finally{built.dispose();}
};
testCrossing(false);store.execute({type:'toggleOpening',id:doorId});testCrossing(true);
assert.equal(wallBlocksWalkStart(store.state,store.state.walls[0],{x:-.4,z:-2.5}),false);
assert.equal(wallBlocksWalkStart(store.state,store.state.walls[0],{x:.4,z:-2.5}),true);

const floorGeometry=buildDesign(store.state,{selectedId:areaId});
try{assert.equal(floorGeometry.handles.length,4,'every area vertex has a 3D adjustment handle');assert(floorGeometry.byId.has(wallId));assert(floorGeometry.byId.has(doorId));}finally{floorGeometry.dispose();}
const svg=planSvg(store.building,store.building.activeLevelId);
assert(svg.includes(`data-room="${areaId}"`));assert(svg.includes('stroke-dasharray=".12 .08"'),'area outline is not exported as an architectural wall');
assert.deepEqual(parseBuilding(store.serialize()),store.building);

// Exercise the real viewport pick -> preview -> commit path. Right press must
// retain context-menu behaviour; dragging area corners is independent of walls.
const view=new DesignViewport({mode:'plan'});let captured=false,commits=0;
Object.assign(view,{width:800,height:600,zoom:50,project:store.state,building:store.building,tool:'select',invalidate(){},canvas:{focus(){},setPointerCapture(){captured=true;},hasPointerCapture(){return captured;},releasePointerCapture(){captured=false;},getBoundingClientRect(){return {left:0,top:0};}}});
view.options={onSelect(id){view.selection=id;},previewBuilding:c=>applyBuildingCommand(store.building,c),onPreviewBuilding:b=>{view.building=b;},onPreview:()=>{view.building=store.building;},onCommand:c=>{store.execute(c);commits++;view.project=store.state;view.building=store.building;}};
const event=(x,z,button=0)=>({clientX:400+x*50,clientY:300+z*50,button,pointerId:1,preventDefault(){},stopImmediatePropagation(){}});
view.pointerDown(event(-1.5,-2.5,2));assert.equal(view.drag,undefined);assert.equal(commits,0);
const floorBefore=store.state.rooms[0].vertexIds.map(id=>({...store.state.vertices.find(v=>v.id===id)}));
view.pointerDown(event(-1.5,-2.5));view.pointerMove(event(-1.2,-2.3));
assert.equal(wallFrame(store.state,store.state.walls[0]).a.x,-3,'wall preview is not committed');
view.pointerUp(event(-1.2,-2.3));
let f=wallFrame(store.state,store.state.walls[0]);assert(Math.abs(f.a.x+2.7)<1e-8&&Math.abs(f.a.z+2.3)<1e-8);
assert.deepEqual(store.state.rooms[0].vertexIds.map(id=>store.state.vertices.find(v=>v.id===id)),floorBefore,'moving a wall does not move its supporting area');
const wallBefore={a:{...f.a},b:{...f.b}};
view.pointerDown(event(1.5,1.5));view.pointerMove(event(1.7,1.6));view.pointerUp(event(1.7,1.6));
f=wallFrame(store.state,store.state.walls[0]);assert.deepEqual({a:f.a,b:f.b},wallBefore,'moving area does not move independent walls');
const corner=store.state.vertices.find(v=>v.id===store.state.rooms[0].vertexIds[0]);
assert(Math.abs(corner.x+2.8)<1e-8&&Math.abs(corner.z+2.9)<1e-8);
assert.deepEqual(view.pick(event(corner.x,corner.z)),{id:corner.id,kind:'vertex'});
view.pointerDown(event(corner.x,corner.z));view.pointerMove(event(corner.x+.1,corner.z));view.pointerUp(event(corner.x+.1,corner.z));
assert(Math.abs(store.state.vertices.find(v=>v.id===corner.id).x+2.7)<1e-8,'area corner remains editable through existing moveVertex');
assert.equal(commits,3);store.undo();store.redo();parseBuilding(store.serialize());
// The source drawing remains readable: PDF labels are not duplicated by dozens
// of area/short-wall labels, while selecting a wall still reveals its dimension.
store.execute({type:'floorArea.add',points:[{x:4,z:-3},{x:5,z:-3},{x:5,z:-2},{x:4,z:-2}],name:'長到應該隱藏的窄小空間名稱',materialId:'oak'});
store.execute({type:'addObject',assetId:'book',x:1,z:2});
const texts=[];view.context=new Proxy({measureText:text=>({width:[...text].length*7}),fillText:text=>texts.push(text)},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
view.project=store.state;view.building=store.building;view.selection=null;view.zoom=50;
view.underlay={x:-3,z:-3,width:6,rotation:0,opacity:.5,image:{width:100,height:100}};
view.drawPlan(store.state);assert(!texts.some(t=>t.includes('開放地坪')||t.includes('m²')||/^\d+\.\d+ m$/.test(t)),'source overlay hides redundant room labels and wall dimensions');
texts.length=0;view.selection=wallId;view.drawPlan(store.state);assert.equal(texts.filter(t=>/^\d+\.\d+ m$/.test(t)).length,1,'selected wall keeps its dimension over the source');
texts.length=0;view.selection=null;view.underlay=null;view.drawPlan(store.state);assert(texts.includes('開放地坪'));assert(!texts.some(t=>t.includes('長到應該隱藏')||t.includes('m²')||/^\d+\.\d+ m$/.test(t)),'overview names fit the floor and avoid tiny areas');
texts.length=0;view.zoom=90;view.drawPlan(store.state);assert.equal(texts.filter(t=>/^\d+\.\d+ m$/.test(t)).length,1,'large-scale view labels the long wall but not a 5 cm lining');
texts.length=0;view.drawPlan(sampleProject());assert(texts.some(t=>t.includes('m²')),'legacy v8 label behaviour is retained');
assert(!planSvg(store.building,store.building.activeLevelId).includes('>書冊（闔上）</text>'),'SVG omits a generic label wider than its small object');
console.log('PASS source layout: independent walls, area floors, editable 2D/3D handles, drag/undo, safe spawn, glass sash half-width crossing and SVG boundary semantics.');
