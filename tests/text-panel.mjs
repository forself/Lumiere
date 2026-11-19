import assert from 'node:assert/strict';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {ASSETS} from '../src/frontend/designer/catalog.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
import {textPanelTexture} from '../src/frontend/designer/asset-geometry.js';
import {manualLabel} from '../src/frontend/designer/balloon-labels.js';
import {objectBlocksWalkStart,stepWalk,walkDestination} from '../src/frontend/designer/walk.js';

assert.equal(ASSETS['text-panel'].prop,true);
const store=new BuildingStore(emptyProject());store.execute({type:'addRoom',x:-4,z:-4,width:8,depth:8});
const panel=(text,x=0)=>{store.execute({type:'addObject',assetId:'text-panel',x,z:0});const id=store.state.objects.at(-1).id;store.execute({type:'dimensions',id,width:2,depth:.025,height:1.8,elevation:0});store.execute({type:'label.set',id,text});return store.state.objects.at(-1);};
const one=panel('臺北市\n2,000,000 人'),two=panel('<文字>\n1,234 人',2.5);
assert.equal(manualLabel(one),'');assert.equal(manualLabel({...one,annotation:'也不重複顯示氣球'}),'');
assert.equal(parseBuilding(store.serialize()).levels[0].design.objects[0].prop.label,'臺北市\n2,000,000 人');
assert.equal(objectBlocksWalkStart(store.state,one,{x:0,z:0}),false);
assert.equal(walkDestination(store.building,{x:0,z:0}).y,1.65);
let scene=buildDesign(store.state);assert.equal(scene.byId.get(one.id).children.length,1,'Node without Canvas retains safe panel geometry');
assert(stepWalk(store.building,{x:0,y:1.65,z:-.5},0,1,scene.group,store.building.activeLevelId),'sign must not block walking rays');scene.dispose();

const canvases=[],calls=[],inkCalls=[];
const canvasFactory=()=>{const canvas={width:0,height:0,getContext(){return {font:'',clearRect(){},measureText(value){return {width:Array.from(value).length*(parseFloat(this.font.match(/[\d.]+px/)?.[0])||20)*.6};},fillText(...args){calls.push(args);inkCalls.push(this.fillStyle);}};}};canvases.push(canvas);return canvas;};
const direct=textPanelTexture('第一行\n第二行 <純文字>',8,.2,{canvasFactory});assert(direct.isCanvasTexture);assert(direct.image.width<=512&&direct.image.height<=512);assert(direct.image.width>=64&&direct.image.height>=64);assert(calls.length>=2);assert(calls.every(c=>c[3]<=512));assert(calls.some(c=>c[0].includes('<純文字>')));assert.equal(direct.repeat.x,1);assert.equal(direct.repeat.y,1);direct.dispose();
assert(inkCalls.every(color=>color==='#25342e'),'standalone texture calls retain the default dark ink');
const custom=textPanelTexture('淺色字',1,2,{canvasFactory,inkColor:'#f3ead2'});assert.equal(inkCalls.at(-1),'#f3ead2','optional ink colour reaches Canvas fillText');custom.dispose();
const originalDocument=globalThis.document,originalOffscreen=globalThis.OffscreenCanvas;
try{
 delete globalThis.OffscreenCanvas;globalThis.document={createElement:type=>{assert.equal(type,'canvas');return canvasFactory();}};
 scene=buildDesign(store.state);const maps=[];
 for(const object of [one,two]){
  const meshes=scene.byId.get(object.id).children;assert.equal(meshes.length,3);assert(meshes.every(m=>m.userData.nonBlocking));
  assert.equal(meshes[1].position.z,.025/2+.0002);assert.equal(meshes[2].rotation.y,Math.PI);
  assert.equal(meshes[1].material,meshes[2].material);maps.push(meshes[1].material.map);
 }
 assert.notEqual(maps[0],maps[1],'per-instance text cannot leak to another sign');assert.equal(maps[0].userData.text,one.prop.label);assert.equal(maps[1].userData.text,two.prop.label);
 let disposed=0;maps.forEach(t=>t.addEventListener('dispose',()=>disposed++));scene.dispose();assert.equal(disposed,2,'one texture released per panel, shared by both faces');
 const contrast=new BuildingStore(emptyProject()),cases=[['#41413b','plaster','#f3ead2'],['#f2eee1','plaster','#25342e'],['#41413b','ceramic-white-gloss','#25342e']];
 for(const [index,[color,materialId]] of cases.entries()){
  contrast.execute({type:'addObject',assetId:'text-panel',x:index*2,z:0});const id=contrast.state.objects.at(-1).id;
  contrast.execute({type:'prop.configure',id,x:index*2,z:0,width:1,depth:.025,height:2,elevation:0,rotation:0,pitch:0,roll:0,color,label:'國立臺北商業大學'});
  contrast.execute({type:'material',id,materialId});
 }
 const contrastStart=inkCalls.length;scene=buildDesign(contrast.state);
 for(const [index,object] of contrast.state.objects.entries()){
  const map=scene.byId.get(object.id).children[1].material.map;
  assert.equal(map.userData.inkColor,cases[index][2],'dark legacy background selects light ink; bright or preset background keeps dark ink');
 }
 assert(inkCalls.slice(contrastStart).includes('#f3ead2')&&inkCalls.slice(contrastStart).includes('#25342e'),'rendered sign textures paint both contrast choices');scene.dispose();
}finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalOffscreen===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=originalOffscreen;}

store.execute({type:'addObject',assetId:'placeholder-box',x:0,z:0});const block=store.state.objects.at(-1);store.execute({type:'dimensions',id:block.id,width:2,depth:.025,height:1.8,elevation:0});scene=buildDesign(store.state);assert.equal(stepWalk(store.building,{x:0,y:1.65,z:-.5},0,1,scene.group,store.building.activeLevelId),null,'ordinary same-size box still blocks');scene.dispose();
console.log('PASS text panels: native prop JSON/multiline roundtrip, safe bounded Canvas text, independent per-instance maps, both readable faces, no duplicate balloons, nonblocking walk/teleport and texture disposal.');
