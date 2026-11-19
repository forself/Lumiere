import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore,fromSingle,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject,validateProject,wallFrame,objectPose,copyRoomGroup,LIMITS} from '../src/frontend/designer/model.js';
import {defaultWindowGrid} from '../src/frontend/designer/openings.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {runAgentOperations,agentCapabilities} from '../src/frontend/capture/agent-commands.js';

const polygon=(coords)=>coords.map(([x,z])=>({x,z}));
const area=(points,extra={})=>({type:'floorArea.add',points:polygon(points),...extra});
const wall=(start,end,extra={})=>({type:'wall.add',start:{x:start[0],z:start[1]},end:{x:end[0],z:end[1]},height:2.8,thickness:.15,materialId:'plaster',...extra});
const unchangedReject=(s,c)=>{const before=s.serialize();assert.throws(()=>s.execute(c));assert.equal(s.serialize(),before);};
assert.equal(emptyProject().version,8,'legacy designs do not silently migrate');
assert.deepEqual([LIMITS.vertices,LIMITS.walls,LIMITS.rooms,LIMITS.objects,LIMITS.fileBytes],[512,256,64,1000,10*1024*1024]);

const s=new BuildingStore(emptyProject());
s.execute(area([[0,0],[6,0],[6,3],[3,3],[3,6],[0,6]],{name:'客餐廳與走道',materialId:'stone'}));
assert.equal(s.state.version,9);assert.equal(s.state.walls.length,0,'a functional floor area does not invent enclosing walls');
assert.deepEqual(s.state.rooms[0].wallIds,[]);assert.equal(s.state.rooms[0].boundaryMode,'area');
s.execute(area([[3,3],[6,3],[6,6],[3,6]],{roomType:'balcony'}));
assert.equal(s.state.vertices.length,7,'touching areas reuse exactly coincident vertices');
s.execute(wall([0,0],[6,0]));assert.equal(s.state.vertices.length,7,'independent walls reuse area vertices');
s.execute({type:'addOpening',wallId:'wall-1',kind:'door',at:.5});assert.equal(s.state.openings[0].side,1);
const built=buildBuilding(s.building,{onlyLevelId:'floor-1'});
try{
 const walls=[];built.group.traverse(o=>{if(o.isMesh&&o.userData.kind==='wall')walls.push(o);});
 const ray=new THREE.Raycaster(new THREE.Vector3(1,1.4,-.2),new THREE.Vector3(0,0,1),0,.4);
 assert(ray.intersectObjects(walls).length,'observed wall has actual geometry');
 ray.ray.origin.set(5,1.4,2.8);assert.equal(ray.intersectObjects(walls).length,0,'touching functional areas stay physically connected');
}finally{built.dispose();}
assert.deepEqual(parseBuilding(s.serialize()),s.building);
for(const points of [ [[0,0],[6,0],[6,3],[3,3],[3,6],[0,6]],[[1,1],[2,1],[2,2],[1,2]], [[-1,2],[7,2],[7,2.5],[-1,2.5]], [[8,0],[10,2],[10,0],[8,2]] ])unchangedReject(s,area(points));
const badVersion=structuredClone(s.state);badVersion.version=8;assert.throws(()=>validateProject(badVersion),'v9 fields cannot hide in a v8 file');
const badBoundary=structuredClone(s.state);badBoundary.rooms[0].boundaryMode='unknown';assert.throws(()=>validateProject(badBoundary));
const extraField=structuredClone(s.state);extraField.walls[0].remotePermission=true;assert.throws(()=>validateProject(extraField),'schema remains strict');

const many=new BuildingStore(emptyProject());
const circle=Array.from({length:64},(_,i)=>[Math.cos(i*Math.PI/32)*3,Math.sin(i*Math.PI/32)*3]);
many.execute(area(circle));assert.equal(many.state.rooms[0].vertexIds.length,64);
unchangedReject(many,area([...circle,circle[0]]));
const tiny=new BuildingStore(emptyProject());tiny.execute(area([[0,0],[.1,0],[.1,.1],[0,.1]]));
unchangedReject(tiny,area([[1,1],[1.01,1],[1.01,1.01],[1,1.01]]));

const split=new BuildingStore(emptyProject());
split.execute(area([[0,0],[2,0],[4,0],[4,4],[0,4]]));split.execute(wall([0,0],[4,0]));
split.execute({type:'addOpening',wallId:'wall-1',kind:'door',at:.8});
const areaVertices=[...split.state.rooms[0].vertexIds],mid=split.state.vertices.find(v=>v.x===2&&v.z===0).id;
split.execute({type:'wall.split',id:'wall-1',distance:2});assert.equal(split.state.vertices.length,5,'splitting at an existing area vertex does not duplicate it');
let opening=split.state.openings[0],frame=wallFrame(split.state,split.state.walls.find(w=>w.id===opening.wallId));
assert.equal(frame.a.x+frame.dx*frame.length*opening.at,3.2);
split.execute({type:'wall.merge',vertexId:mid});assert.deepEqual(split.state.rooms[0].vertexIds,areaVertices,'merging a free wall cannot remove an area corner');
assert.equal(split.state.walls[0].independent,true);
const areaBefore=split.state.rooms[0].vertexIds.map(id=>split.state.vertices.find(v=>v.id===id));
split.execute({type:'wall.translate',id:'wall-1',dx:0,dz:-1});
assert.deepEqual(split.state.rooms[0].vertexIds.map(id=>split.state.vertices.find(v=>v.id===id)),areaBefore,'wall drag detaches shared area vertices');
split.execute({type:'wall.move',id:'wall-1',distance:-1});
split.execute({type:'dimensions',id:'wall-1',width:5,height:2.8,depth:.02});
assert.deepEqual(split.state.rooms[0].vertexIds.map(id=>split.state.vertices.find(v=>v.id===id)),areaBefore);
split.execute({type:'floorArea.translate',id:'room-1',dx:8,dz:0});assert.equal(split.state.walls[0].independent,true);
const copied=copyRoomGroup(split.state,['room-1'],{dx:0,dz:8});assert.equal(copied.design.walls.length,1,'copying a floor area does not auto-box it');assert.equal(copied.design.rooms[1].boundaryMode,'area');

const short=new BuildingStore(emptyProject());short.execute(wall([0,0],[.04,0],{thickness:.015}));
short.execute({type:'wall.split',id:'wall-1',distance:.02});assert.equal(short.state.walls.length,2);
unchangedReject(short,wall([1,0],[1.019,0]));unchangedReject(short,wall([2,0],[3,0],{thickness:.014}));
short.execute(wall([2,0],[3,0],{wallType:'rail',height:1.1}));assert.equal(short.state.walls.at(-1).type,'rail');

const windows=new BuildingStore(emptyProject());windows.execute(wall([0,0],[4,0]));
for(const at of [.2,.50125])windows.execute({type:'addOpening',wallId:'wall-1',kind:'window',at});
assert.equal(windows.state.openings.length,2,'5 mm observed piers remain valid on a free wall');
unchangedReject(windows,{type:'moveOpening',id:'window-2',at:.5001});
windows.execute({type:'windowGrid',id:null,wallId:'wall-1',at:.85,width:.8,height:1.2,sill:.9,grid:defaultWindowGrid()});
assert.equal(windows.state.openings.at(-1).side,1,'grid window supports a wall with no room owner');
const sliding=new BuildingStore(emptyProject());sliding.execute(wall([0,0],[1.1,0]));sliding.execute({type:'addOpening',wallId:'wall-1',kind:'door',at:.5});
sliding.execute({type:'openingStyle',id:'door-1',styleId:'door-slide-left'});
sliding.execute({type:'openingStyle',id:'door-1',styleId:'door-glass-double-slide'});
sliding.execute({type:'wall.translate',id:'wall-1',dx:38.5,dz:0});
unchangedReject(sliding,{type:'wall.translate',id:'wall-1',dx:.35,dz:0});

const deletion=new BuildingStore(emptyProject());deletion.execute(area([[0,0],[4,0],[4,4],[0,4]]));deletion.execute(wall([0,0],[4,0]));
deletion.execute({type:'addOpening',wallId:'wall-1',kind:'door',at:.5});deletion.execute({type:'addObject',assetId:'door-curtain',hostId:'door-1',x:0,z:0});
deletion.execute({type:'addObject',assetId:'fingerprint',x:1,z:0,tracePlacement:{elevation:1,rotation:0,anchorId:'wall-1',pitch:0,roll:0}});
const traceId=deletion.state.objects.at(-1).id,traceBefore=objectPose(deletion.state,deletion.state.objects.at(-1));
deletion.execute({type:'delete',id:'room-1'});assert.equal(deletion.state.walls.length,1);assert.equal(deletion.state.vertices.length,2);assert.equal(deletion.state.openings.length,1);
deletion.undo();deletion.execute({type:'delete',id:'wall-1'});assert.equal(deletion.state.rooms.length,1);assert.equal(deletion.state.vertices.length,4);assert.equal(deletion.state.openings.length,0);assert.equal(deletion.state.objects.length,1);
assert.equal(deletion.state.objects[0].id,traceId);assert.equal(deletion.state.objects[0].trace.anchorId,null);assert.equal(objectPose(deletion.state,deletion.state.objects[0]).x,traceBefore.x);

const legacy=new BuildingStore(emptyProject());legacy.execute({type:'addRoom',x:0,z:0,width:4,depth:4});assert.equal(legacy.state.version,8);
unchangedReject(legacy,{type:'dimensions',id:'wall-1',width:.02,height:2.8,depth:.015});unchangedReject(legacy,{type:'wall.translate',id:'wall-1',dx:1,dz:0});unchangedReject(legacy,{type:'delete',id:'wall-1'});
legacy.execute(wall([8,0],[10,0]));legacy.execute({type:'delete',id:'room-1'});assert.equal(legacy.state.walls.length,1,'deleting a legacy room preserves independent walls');

const operation=(command,bind)=>({levelId:'floor-1',command,...(bind?{bind}:{})});
const commands=[operation(area([[0,0],[4,0],[4,4],[0,4]]),'area'),operation(wall([0,0],[4,0]),'wall'),operation({type:'addOpening',wallId:'$wall',kind:'door',at:.5},'door'),operation({type:'wall.translate',id:'$wall',dx:0,dz:-1}),operation({type:'floorArea.translate',id:'$area',dx:0,dz:1})];
const result=runAgentOperations(fromSingle(emptyProject()),commands);assert.equal(result.bindings.wall.kind,'walls');assert.deepEqual(result.bindings.area.wallIds,[]);assert.equal(result.scene.levels[0].design.version,9);
for(const command of [{...wall([0,0],[4,0]),start:{x:0,z:0,secret:true}},{...wall([0,0],[4,0]),wallType:'frame'},{...area([[0,0],[1,0],[1,1]]),unexpected:true}])assert.throws(()=>runAgentOperations(fromSingle(emptyProject()),[operation(command)]));
const schemas=agentCapabilities().commandSchemas;assert.equal(schemas['floorArea.add'].properties.points.maxItems,64);assert.equal(schemas.addPolygon.properties.points.maxItems,16);assert.equal(schemas['wall.add'].properties.start.additionalProperties,false);
console.log('PASS v9 independent walls and floor areas: source topology, thin/short walls, narrow window piers, open sliding parking, native geometry, strict schema, movement/split/merge, host deletion, legacy behavior and agent aliases.');
