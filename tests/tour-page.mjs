import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../node_modules/three/build/three.module.js';
import {validateToolPageDefinition} from '../lib/page-generator/ToolPageDefinition.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {emptyProject,sampleProject} from '../src/frontend/designer/model.js';
import {prepareBundle} from '../src/frontend/designer/project-bundle.js';
import {prepareTourInput,TourInputSession,BUNDLE_BYTES} from '../src/frontend/tour/tour-input.js';
import {stageTourHandoff,consumeTourHandoff,consumeTourEditorReturn} from '../src/frontend/tour/tour-handoff.js';
import {TourViewport} from '../src/frontend/tour/TourViewport.js';
import {TourPage} from '../src/frontend/tour/TourPage.js';
import {WalkController} from '../src/frontend/designer/walk.js';
import {TourTouchControls} from '../src/frontend/tour/TourTouchControls.js';

const definition=JSON.parse(await readFile('definitions/tour.page.json','utf8'));
validateToolPageDefinition(definition,{componentNames:['BasicButton','Heading','Text','Dropdown','UploadButton','TextInput','TourViewport']});
const building=new BuildingStore(sampleProject()).building,prepared=await prepareTourInput(JSON.stringify(building));
assert.equal(prepared.building.version,10);assert.equal(prepared.assets.size,0);
assert.equal((await prepareTourInput(JSON.stringify(sampleProject()))).building.levels.length,1,'legacy single-floor export migrates through the existing parser');
await assert.rejects(()=>prepareTourInput('{broken'),/有效的 JSON/);await assert.rejects(()=>prepareTourInput({...building,arbitraryScript:'alert(1)'}));
await assert.rejects(()=>prepareTourInput({...building,extra:'x'.repeat(10*1024*1024)}),/10 MB/);
const pack={format:'lumiere-project',version:2,building,assets:[],underlays:[],materials:{format:'lumiere-materials',version:2,materials:[]},ifc:null,sheets:null,reference:null,captureContext:null,frame:{format:'lumiere-frame-2d',version:1,name:'尚未分析',nodes:[],members:[],displacementLimitMm:10}};
const bundlePrepared=await prepareTourInput(pack,{prepare:(input,options)=>prepareBundle(input,{...options,decodeImage:async()=>{throw Error('unexpected image');},decodeMaterials:async()=>[]})});
assert.deepEqual(bundlePrepared.building,prepared.building);assert.equal(bundlePrepared.underlays.size,0);
await assert.rejects(()=>prepareTourInput({...pack,assets:[{id:'table',data:'https://example.com/model.glb'}]},{prepare:(input,options)=>prepareBundle(input,{...options,decodeImage:async()=>{},decodeMaterials:async()=>[]})}),/編碼/,'remote resources cannot be smuggled into a bundle');

const commits=[],disposed=[],session=new TourInputSession({commit:(data,name)=>commits.push({data,name}),dispose:data=>{if(data)disposed.push(data);}});
const original=await session.loadValue(building,'原始場景');await assert.rejects(()=>session.loadValue('{broken','壞檔案'));assert.equal(session.current,original);assert.equal(commits.length,1,'a failed import does not replace the current tour');
let read=false;await assert.rejects(()=>session.loadFile({size:BUNDLE_BYTES+1,name:'巨大檔案',text:async()=>{read=true;return '{}';}}));assert.equal(read,false,'oversized file rejects before reading into memory');
let finish,entered;
const wait=new Promise(resolve=>{entered=resolve;}),race=new TourInputSession({prepare:async(input,options)=>{if(input==='slow'){entered();return new Promise(resolve=>{finish=resolve;});}return prepareTourInput(input,options);},dispose:data=>{if(data)disposed.push(data);}});
const slow=race.loadValue('slow').catch(e=>e);await wait;const fast=await race.loadValue(building);const stale=await prepareTourInput(emptyProject());finish(stale);assert.equal((await slow).name,'AbortError');assert.equal(race.current,fast);assert(disposed.includes(stale),'late resources from a superseded load are released');race.destroy();assert(disposed.includes(fast));
let finishRead;const cancel=new TourInputSession({commit:()=>assert.fail('cancelled read cannot commit')});const reading=cancel.loadFile({size:100,name:'cancel.json',text:()=>new Promise(resolve=>{finishRead=resolve;})}).catch(e=>e);cancel.cancel();finishRead(JSON.stringify(building));assert.equal((await reading).name,'AbortError');assert.equal(cancel.current,null);cancel.destroy();session.destroy();

stageTourHandoff(pack,{editorState:{past:[building],saved:'原始狀態'}});const sent=consumeTourHandoff();sent.building.levels[0].design.openings[0].open=!sent.building.levels[0].design.openings[0].open;
const returned=consumeTourEditorReturn();assert.deepEqual(returned.input,pack,'viewer runtime changes cannot modify the retained editor snapshot');assert.equal(returned.editorState.saved,'原始狀態');assert.equal(consumeTourHandoff(),null);assert.equal(consumeTourEditorReturn(),null);
stageTourHandoff(building);assert.throws(()=>stageTourHandoff({format:'untrusted'}));assert.deepEqual(consumeTourHandoff(),building,'invalid stage does not replace a pending valid handoff');consumeTourEditorReturn();

// Real read-only gestures must never execute a design command, even when beginning over furniture.
let captured=false,picks=0,targets=0;
const plan=new TourViewport({mode:'plan',onCommand:()=>assert.fail('tour cannot edit'),onPick:()=>picks++,onWalkTarget:()=>targets++});
Object.assign(plan,{project:sampleProject(),building,tool:'select',width:800,height:600,zoom:50,center:{x:0,z:0},invalidate(){},canvas:{focus(){},getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){captured=true;},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false;}}});
const event=(x,z,button=0)=>({button,pointerId:1,clientX:400+x*50,clientY:300+z*50,timeStamp:2000,preventDefault(){},stopImmediatePropagation(){}}),before=JSON.stringify(plan.project),o=plan.project.objects[0];
plan.pointerDown(event(o.x,o.z));plan.pointerMove(event(o.x+1,o.z));plan.pointerUp(event(o.x+1,o.z));assert.equal(picks,0);assert.equal(JSON.stringify(plan.project),before);
plan.pointerDown(event(o.x,o.z));plan.pointerUp(event(o.x,o.z));assert.equal(picks,1);plan.doubleClick(event(0,1));assert.equal(targets,1);
plan.pointerDown(event(0,0,2));plan.pointerMove(event(1,0,2));plan.pointerUp(event(1,0,2));assert.equal(plan.center.x,-1);assert.equal(JSON.stringify(plan.project),before,'map panning does not mutate floor/furniture coordinates');

const walkStore=new BuildingStore(emptyProject());walkStore.execute({type:'addRoom',x:-3,z:-3,width:6,depth:6});
const scene=new TourViewport({mode:'scene',onCommand:()=>assert.fail('tour cannot edit'),onPick:()=>picks++});Object.assign(scene,{project:walkStore.state,building:walkStore.building,canvas:plan.canvas,camera:new THREE.PerspectiveCamera(),width:800,height:600,controls:{enabled:true},invalidate(){},pick:()=>({id:'opening-1',kind:'door'})});scene.walk=new WalkController(scene);scene.walk.teleportTo(0,0);
const atStart=picks;scene.pointerDown(event(0,0));scene.pointerUp(event(0,0));assert.equal(picks,atStart+1,'a click can select a door while walking');const yaw=scene.walk.yaw;scene.pointerDown(event(0,0));scene.pointerMove(event(.5,0));scene.pointerUp(event(.5,0));assert.notEqual(scene.walk.yaw,yaw);assert.equal(picks,atStart+1,'looking around does not activate a target');

// A tall object belongs to the floor that owns its mesh, even when its top crosses another floor.
const provenance=new TourViewport({mode:'scene'}),group=new THREE.Group(),floor=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());floor.userData.floorId='original-floor';mesh.userData={id:'tall-object',kind:'object'};floor.add(mesh);group.add(floor);group.updateMatrixWorld(true);
Object.assign(provenance,{project:sampleProject(),design:{group},camera:new THREE.PerspectiveCamera(45,4/3,.1,100),canvas:{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})}});provenance.camera.position.set(0,0,5);provenance.camera.lookAt(0,0,0);const hit=provenance.pick({clientX:400,clientY:300});assert.equal(hit.levelId,'original-floor');assert.equal(hit.id,'tall-object');mesh.geometry.dispose();mesh.material.dispose();

// A scene made only from walls remains viewable when it has no walkable start.
const noFloor=new BuildingStore(emptyProject());noFloor.execute({type:'wall.add',start:{x:0,z:0},end:{x:4,z:0},height:3,thickness:.15,materialId:'plaster'});const notices=[],page=Object.assign(Object.create(TourPage.prototype),{building:noFloor.building,scene:{walk:{start(){throw Error('沒有可用的起點');}}},message:m=>notices.push(m)});page.startWalk();assert.match(notices[0],/環繞檢視/);

// The initial workspace is hidden. Reveal and remeasure before fitting either viewport.
let visible=false;const fitDimensions=[],makeViewport=()=>({width:1,walk:{stop(){}},media:{clear(){}},scene:{add(){}},setMaterials(){},setWalkPosition(){},setDesign(){},resize(){this.width=visible?800:1;},fit(){fitDimensions.push(this.width);}}),initial=Object.assign(Object.create(TourPage.prototype),{scene:makeViewport(),plan:makeViewport(),syncControls(){visible=!!this.building;}});initial.acceptPrepared(await prepareTourInput(building),'首次載入',null);assert.deepEqual(fitDimensions,[800,800],'initial hidden workspace must be visible and resized before fit');

// Hold inputs drive the real collision-aware controller; release/cancel/blur never leave a stuck key.
class PadButton extends EventTarget{constructor(){super();this.disabled=false;this.classList={toggle(){}};}setAttribute(){}setPointerCapture(){}}
const emit=(target,type,fields={})=>{const e=new Event(type,{cancelable:true});for(const [key,value]of Object.entries(fields))Object.defineProperty(e,key,{value});target.dispatchEvent(e);};
const windowEvents=new EventTarget(),documentEvents=Object.assign(new EventTarget(),{hidden:false}),frames=new Map();let nextFrame=0;
const pad=new TourTouchControls(scene,{windowTarget:windowEvents,documentTarget:documentEvents,requestFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelFrame:id=>frames.delete(id)}),forwardButton=new PadButton(),turnButton=new PadButton();pad.bind(forwardButton,'forward');pad.bind(turnButton,'turn-left');
scene.walk.teleportTo(0,0);scene.walk.yaw=Math.PI;scene.walk.look();const barrier=new THREE.Mesh(new THREE.BoxGeometry(6,3,.2),new THREE.MeshBasicMaterial());barrier.position.set(0,1.5,1);barrier.userData.kind='wall';scene.design={group:new THREE.Group()};scene.design.group.add(barrier);scene.design.group.updateMatrixWorld(true);
emit(forwardButton,'pointerdown',{button:0,pointerId:7});for(let n=1;n<=180;n++)scene.walk.update(n*16.67);assert(scene.walk.body.z>.2&&scene.walk.body.z<.8,'touch movement advances and stops at real wall geometry');emit(forwardButton,'pointercancel',{pointerId:7});assert.equal(scene.walk.keys.size,0);
emit(forwardButton,'pointerdown',{button:0,pointerId:8});emit(forwardButton,'pointerup',{pointerId:8});emit(forwardButton,'click',{detail:1});assert.equal(scene.walk.keys.size,0,'pointer release click cannot move again');
emit(forwardButton,'keydown',{key:' ',repeat:false});assert(scene.walk.keys.has('w'));emit(forwardButton,'keyup',{key:' '});emit(forwardButton,'click',{detail:0});assert.equal(scene.walk.keys.size,0,'keyboard activation does not add an extra click pulse');
emit(turnButton,'pointerdown',{button:0,pointerId:9});const turnYaw=scene.walk.yaw;const [frameId,frameFn]=frames.entries().next().value;frames.delete(frameId);frameFn(100);assert(scene.walk.yaw>turnYaw,'held turning changes look direction');emit(windowEvents,'blur');assert.equal(frames.size,0);assert.equal(scene.walk.keys.size,0);
emit(forwardButton,'pointerdown',{button:0,pointerId:10});documentEvents.hidden=true;emit(documentEvents,'visibilitychange');assert.equal(scene.walk.keys.size,0);documentEvents.hidden=false;
emit(forwardButton,'pointerdown',{button:0,pointerId:11});pad.setEnabled(false);assert.equal(scene.walk.keys.size,0);pad.setEnabled(true);emit(forwardButton,'pointerdown',{button:0,pointerId:12});emit(forwardButton,'blur');assert.equal(scene.walk.keys.size,0);pad.destroy();emit(forwardButton,'pointerdown',{button:0,pointerId:13});assert.equal(scene.walk.keys.size,0,'destroy removes input listeners');
scene.walk.key({key:'a',preventDefault(){}},true);assert(scene.walk.keys.has('a'),'ordinary WASD remains available');scene.walk.key({key:'a',preventDefault(){}},false);barrier.geometry.dispose();barrier.material.dispose();
console.log('PASS tour: B4A definition, strict imports, limits, atomic cancellation, disposal, reversible handoff, read-only gestures, first-load sizing and touch movement/turning/collision/cleanup.');
