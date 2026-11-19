import assert from 'node:assert/strict';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject,chartSectorContains,copyRoomGroup} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
import {objectBlocksWalkStart,walkDestination,stepWalk} from '../src/frontend/designer/walk.js';
import {runAgentOperations,agentCapabilities} from '../src/frontend/capture/agent-commands.js';

const store=new BuildingStore(emptyProject());
store.execute({type:'floorArea.add',points:[{x:-7,z:-7},{x:7,z:-7},{x:7,z:7},{x:-7,z:7}]});
store.execute({type:'addObject',assetId:'chart-sector',x:0,z:0});const id=store.state.objects.at(-1).id;
store.execute({type:'dimensions',id,width:4,depth:4,height:.35,elevation:.8});
const configure=(startAngle,endAngle)=>store.execute({type:'sector.configure',id,startAngle,endAngle});
configure(0,90);
const item=()=>store.state.objects.find(o=>o.id===id);
assert.deepEqual(parseBuilding(store.serialize()).levels[0].design.objects.find(o=>o.id===id).sector,{startAngle:0,endAngle:90});
assert(chartSectorContains(item(),{x:1,z:-1}));assert(!chartSectorContains(item(),{x:-1,z:1}));assert(!chartSectorContains(item(),{x:1.8,z:-1.8}));
assert(chartSectorContains({...item(),rotation:90},{x:1,z:1}));assert(!chartSectorContains({...item(),rotation:90},{x:-1,z:-1}));
assert(objectBlocksWalkStart(store.state,item(),{x:1,z:-1}));assert(!objectBlocksWalkStart(store.state,item(),{x:-1,z:1}),'empty parts of the same bounding rectangle stay walkable');
assert.equal(walkDestination(store.building,{x:-1,z:1}).y,1.65);assert.throws(()=>walkDestination(store.building,{x:1,z:-1}),/占用|空間/);

function surface(scene){return scene.byId.get(id).children.find(o=>o.isMesh);}
function topArea(mesh,height){const p=mesh.geometry.attributes.position;let area=0;for(let i=0;i<p.count;i+=3){if([0,1,2].some(j=>Math.abs(p.getY(i+j)-height)>1e-6))continue;const ax=p.getX(i+1)-p.getX(i),az=p.getZ(i+1)-p.getZ(i),bx=p.getX(i+2)-p.getX(i),bz=p.getZ(i+2)-p.getZ(i);area+=Math.abs(ax*bz-az*bx)/2;}return area;}
let scene=buildDesign(store.state),mesh=surface(scene);mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox;
assert(Math.abs(bounds.min.x)<1e-6&&Math.abs(bounds.max.x-2)<1e-6);assert(Math.abs(bounds.min.z+2)<1e-6&&Math.abs(bounds.max.z)<1e-6);assert(Math.abs(bounds.max.y-.35)<1e-6);
assert.equal(mesh.userData.id,id);assert(mesh.userData.chartSector);assert.equal(mesh.material.color.getHexString(),item().prop.color.slice(1));
assert(Math.abs(topArea(mesh,.35)-Math.PI)/Math.PI<.001,'quarter top area follows the actual circular sweep');
assert.equal(stepWalk(store.building,{x:2.7,y:1.65,z:-.8},-2,0,scene.group,store.building.activeLevelId),null,'a thin raised slice blocks at its real body-intersecting height');
assert(stepWalk(store.building,{x:-2,y:1.65,z:1},1,0,scene.group,store.building.activeLevelId),'no false collision in the unused sector bounds');
let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);scene.dispose();assert.equal(disposed,1);

configure(0,360);scene=buildDesign(store.state);mesh=surface(scene);assert(Math.abs(topArea(mesh,.35)-4*Math.PI)/(4*Math.PI)<.001);assert(chartSectorContains(item(),{x:-1,z:0}));assert(!chartSectorContains(item(),{x:2.1,z:0}));scene.dispose();
const smallest=13639/23204000*360;configure(360-smallest,360);scene=buildDesign(store.state);mesh=surface(scene);const actual=topArea(mesh,.35),expected=.5*4*smallest*Math.PI/180;
assert(actual>0);assert(Math.abs(actual-expected)/expected<.0001,'smallest county keeps its true positive angular area');scene.dispose();

const before=store.serialize(),history=store.past.length;
for(const angles of [[0,0],[90,0],[-1,90],[0,361],[NaN,90]])assert.throws(()=>configure(...angles));
assert.throws(()=>store.execute({type:'sector.configure',id,startAngle:0,endAngle:90,shader:'arbitrary'}),/欄位/);
assert.throws(()=>store.execute({type:'dimensions',id,width:3,depth:4,height:.35,elevation:.8}),/相同/);
const o=item();assert.throws(()=>store.execute({type:'prop.configure',id,x:o.x,z:o.z,elevation:o.elevation,rotation:o.rotation,width:o.width,depth:o.depth,height:o.height,...o.prop,pitch:5}),/水平/);
assert.equal(store.serialize(),before);assert.equal(store.past.length,history,'rejected configurations leave source and undo history unchanged');
const malformed=JSON.parse(before);delete malformed.levels[0].design.objects[0].sector;assert.throws(()=>parseBuilding(JSON.stringify(malformed)),/扇區/);
store.execute({type:'addObject',assetId:'placeholder-box',x:3,z:3});const box=store.state.objects.at(-1).id;assert.throws(()=>store.execute({type:'sector.configure',id:box,startAngle:0,endAngle:90}),/扇區/);
const foreign=JSON.parse(store.serialize());foreign.levels[0].design.objects.find(o=>o.id===box).sector={startAngle:0,endAngle:90};assert.throws(()=>parseBuilding(JSON.stringify(foreign)),/不支援/);
const source=structuredClone(store.state),sourceSector=source.objects.find(o=>o.id===id);sourceSector.sector={startAngle:30,endAngle:140};sourceSector.rotation=37;
for(const mirror of ['x','z']){const copied=copyRoomGroup(source,[source.rooms[0].id],{dx:20,dz:0,mirror}).design,sector=copied.objects.find(o=>o.assetId==='chart-sector'&&o.id!==id);assert.deepEqual(sector.sector,{startAngle:220,endAngle:330});for(const x of [-1.5,-.5,.5,1.5])for(const z of [-1.5,-.5,.5,1.5])assert.equal(chartSectorContains(sector,{x:(mirror==='x'?-x:x)+20,z:mirror==='z'?-z:z}),chartSectorContains(sourceSector,{x,z}),'mirrored native copy must reflect its asymmetric arc as well as rotation');}
store.execute({type:'editor.set',flag:'locked',ids:[id],value:true});const locked=store.serialize();assert.throws(()=>configure(0,45),/鎖定/);assert.equal(store.serialize(),locked);

const cap=agentCapabilities(),schema=cap.commandSchemas['sector.configure'];assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['type','id','startAngle','endAngle']);assert.equal(schema.properties.startAngle.minimum,0);assert.equal(schema.properties.endAngle.maximum,360);
const op=command=>({levelId:'floor-1',sourceIds:[],basis:'inferred',command}),agent=runAgentOperations(new BuildingStore(emptyProject()).building,[{...op({type:'addObject',assetId:'chart-sector',x:0,z:0}),bind:'slice'},op({type:'sector.configure',id:'$slice',startAngle:30,endAngle:140})]);
assert.deepEqual(agent.scene.levels[0].design.objects[0].sector,{startAngle:30,endAngle:140});assert.throws(()=>runAgentOperations(agent.scene,[op({type:'sector.configure',id:'object-1',startAngle:'0',endAngle:90})]),/數值/);
console.log('PASS chart sectors: strict native/agent contract, circular arc geometry/areas including full disk and smallest county, same-center orientation, exact footprint/raised thin-body collision, JSON persistence, atomic invalid/locked rejection and geometry disposal.');
