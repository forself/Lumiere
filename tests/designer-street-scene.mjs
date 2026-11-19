import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {parseBuilding,BuildingStore} from '../src/frontend/designer/building-model.js';
import {createStreetScene} from '../src/frontend/designer/street-scene.js';
import {createInteriorIndex,interiorState} from '../src/frontend/designer/interior-streaming.js';
import {stepWalk} from '../src/frontend/designer/walk.js';
const b=parseBuilding(readFileSync('output/crossroads-convenience-store.json','utf8')),snapshot=JSON.stringify(b),index=createInteriorIndex(b);
let observer={x:-14.2,y:1.8,z:-7.6};
const opts=()=>({observer,visibleObjects:interiorState(index,observer).allowed,onlyLevelId:b.activeLevelId});
const scene=createStreetScene(b,opts());
const shells=()=>scene.group.children.find(g=>g.children.some(c=>c.userData.floorId));
const shell=shells(),exterior=scene.byId.get('object-1');
observer={x:-14.2,y:1.8,z:-12};scene.update(opts());assert.equal(shells(),shell,'room entry reuses shell');assert.equal(scene.byId.get('object-1'),exterior,'unchanged cell reuses geometry');
observer={x:250,y:100,z:250};scene.update(opts());assert.equal(scene.stats.loadedCells,0);assert.equal(scene.stats.coarseLevels,1);
let meshes=0;scene.group.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes<20);
observer={x:0,y:1.8,z:0};scene.update(opts());assert.equal(scene.stats.coarseLevels,0);assert.ok(scene.stats.loadedCells>0);
// Selection restores detail at any distance; full mode restores all outdoor cells.
observer={x:250,y:100,z:250};scene.update({...opts(),selectedId:b.levels[0].design.rooms[0].id});assert.equal(scene.stats.coarseLevels,0);
scene.update({...opts(),streetMode:'full',visibleObjects:null});assert.equal(scene.stats.coarseLevels,0);assert.equal(scene.stats.loadedCells,scene.stats.totalCells);
// Real doorway collision traversal using independently retained geometry.
observer={x:-14.2,y:1.8,z:-7.6};for(let i=0;i<50;i++){scene.update(opts());const next=stepWalk(b,observer,0,-.08,scene.group);assert.ok(next,'doorway step '+i);observer=next;}
assert.equal(JSON.stringify(b),snapshot);scene.dispose();assert.equal(scene.group.children.length,0);
const high=new BuildingStore(parseBuilding(readFileSync('output/convenience-store-detail.json','utf8')));for(let i=1;i<8;i++)high.execute({type:'floor.add',copy:true});writeFileSync('output/highrise-lod-test.json',high.serialize());
const options={observer:{x:120,y:80,z:120},visibleObjects:new Map(high.building.levels.map(l=>[l.id,new Set()]))};
const tall=createStreetScene(high.building,options);assert.equal(tall.stats.coarseLevels,8);const farBox=new THREE.Box3().setFromObject(tall.group);let far=0;tall.group.traverse(o=>{if(o.isMesh)far++;});tall.update({...options,streetMode:'full'});let full=0;tall.group.traverse(o=>{if(o.isMesh)full++;});assert.ok(far<full/3);assert.ok(farBox.max.y>24,'high-rise retains total height');tall.dispose();
console.log(`PASS street streaming: room-entry shell/cell reuse, distant cell disposal, near/selected/full restoration, collision, immutable metadata; 8-storey shells ${full} → ${far} meshes.`);
