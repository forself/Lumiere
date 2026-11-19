import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInteriorIndex,interiorState} from '../src/frontend/designer/interior-streaming.js';
import {parseBuilding,BuildingStore} from '../src/frontend/designer/building-model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {stepWalk} from '../src/frontend/designer/walk.js';
const b=parseBuilding(readFileSync('output/crossroads-convenience-store.json','utf8')),snapshot=JSON.stringify(b),index=createInteriorIndex(b),level=b.levels[0],room=level.design.rooms[0],owners=index.levels.get(level.id).owners,insideIds=[...owners].filter(([,r])=>r).map(([id])=>id);
assert.ok(insideIds.length>=10);const outside=interiorState(index,{x:0,y:1.65,z:0}),inside=interiorState(index,{x:-14.2,y:1.65,z:-12}),above=interiorState(index,{x:-14.2,y:15,z:-12});assert.equal(outside.active.size,0);assert.equal(inside.active.size,1);assert.equal(above.active.size,0);
const edit=interiorState(index,{x:0,y:15,z:0},{selectedId:insideIds[0],selectionLevelId:level.id});assert.equal(edit.active.size,1);
const pre=interiorState(index,{x:-14.2,y:1.65,z:-8.9});assert.equal(pre.active.size,1);assert.equal(interiorState(index,{x:-14.2,y:1.65,z:-8.7},{previous:pre.active}).active.size,1);assert.equal(interiorState(index,{x:-14.2,y:1.65,z:-8.4},{previous:pre.active}).active.size,0);
function inspect(visibleObjects){const built=buildBuilding(b,{onlyLevelId:level.id,visibleObjects});let meshes=0;built.group.traverse(o=>{if(o.isMesh)meshes++;});return {built,meshes};}
const full=inspect(),ext=inspect(outside.allowed),loaded=inspect(inside.allowed);try{assert.ok(ext.meshes<full.meshes);assert.equal(loaded.meshes,full.meshes);for(const id of insideIds){assert.equal(ext.built.byId.has(id),false);assert.ok(loaded.built.byId.has(id));}for(const id of room.wallIds)assert.ok(ext.built.byId.has(id));let disposed=0;loaded.built.byId.get(insideIds[0]).traverse(o=>{if(o.geometry)o.geometry.addEventListener('dispose',()=>disposed++);});loaded.built.dispose();assert.ok(disposed>0);console.log(`Interior streaming: ${insideIds.length} interior objects deferred; mesh count ${full.meshes} → ${ext.meshes} from outside, restored to ${full.meshes} inside.`);}finally{full.built.dispose();ext.built.dispose();}
let p={x:-14.2,y:1.8,z:-7.6},active=new Set();for(let i=0;i<50;i++){const state=interiorState(index,p,{previous:active});active=state.active;const built=buildBuilding(b,{visibleObjects:state.allowed});try{const next=stepWalk(b,p,0,-.08,built.group);assert.ok(next,'streamed doorway traversal '+i);p=next;}finally{built.dispose();}}
assert.equal(JSON.stringify(b),snapshot);
const store=new BuildingStore(b);store.execute({type:'floor.add',copy:true});const multi=createInteriorIndex(store.building),up=interiorState(multi,{x:-14.2,y:4.85,z:-12});assert.equal(up.active.size,1);assert.ok([...up.active][0].includes('floor-2'));
console.log('PASS exterior shell retention, deferred mesh construction, entry preload, exit hysteresis, selection preview, above-roof exclusion, disposal, doorway collision, multi-floor and unchanged design.');
