import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateToolPageDefinition} from '../lib/page-generator/ToolPageDefinition.js';
import {MATERIALS,MATERIAL_CATEGORIES,ASSETS} from '../src/frontend/designer/catalog.js';
import {materialApplicationReason} from '../src/frontend/designer/material-application.js';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {TourEditor} from '../src/frontend/tour/TourEditor.js';
import {TourPage} from '../src/frontend/tour/TourPage.js';
import {DesignerPage} from '../src/frontend/designer/DesignerPage.js';
import {ELEMENT_MATERIAL_IDS} from '../src/frontend/designer/elements.js';
import {runAgentOperations,agentCapabilities} from '../src/frontend/capture/agent-commands.js';

for(const file of ['definitions/designer.page.json','definitions/tour.page.json'])validateToolPageDefinition(JSON.parse(await readFile(file,'utf8')));
const source=new BuildingStore(emptyProject());source.execute({type:'addRoom',x:-4,z:-4,width:8,depth:8});
const editor=new TourEditor(source.building),floor=editor.building.activeLevelId,chair=editor.place(floor,'chair',{x:0,z:0});
const capabilities=agentCapabilities();
for(const material of Object.values(MATERIALS)){
 assert.equal(capabilities.materials[material.id].name,material.name,'every preset is discoverable by agents');
 if(material.floorOnly)continue;
 editor.material(floor,chair.id,material.id);assert.equal(editor.object(floor,chair.id).materialId,material.id);
 const restored=parseBuilding(editor.store.serialize());assert.equal(restored.levels[0].design.objects.find(o=>o.id===chair.id).materialId,material.id,'selected preset survives JSON roundtrip');
}
const before=editor.store.serialize(),count=editor.store.past.length;
assert.throws(()=>editor.material(floor,chair.id,'https://example.com/material'),/登錄/);assert.throws(()=>editor.material(floor,chair.id,'tatami'),/地板/);assert.equal(editor.store.serialize(),before);assert.equal(editor.store.past.length,count);
editor.material(floor,chair.id,'fabric-linen-beige');editor.undo();assert.equal(editor.store.serialize(),before);editor.redo();assert.equal(editor.object(floor,chair.id).materialId,'fabric-linen-beige');

const imported=new TourEditor(editor.building,{assets:new Map([['chair',{}]])}),importedBefore=imported.store.serialize();assert.throws(()=>imported.material(floor,chair.id,'glass-clear-gloss'),/匯入模型/);assert.equal(imported.store.serialize(),importedBefore);
const vehicle=Object.values(ASSETS).find(a=>a.category==='vehicles'),car=editor.place(floor,vehicle.id,{x:2,z:2}),carBefore=editor.store.serialize();assert.throws(()=>editor.material(floor,car.id,'metal-stainless-polished'),/專用素材/);assert.equal(editor.store.serialize(),carBefore);
assert.equal(materialApplicationReason('oak',{kind:'objects',item:editor.object(floor,car.id)}),null,'legacy material behavior stays accepted');

const op=command=>({levelId:floor,basis:'inferred',sourceIds:[],command}),agent=runAgentOperations(source.building,[op({type:'addObject',assetId:'chair',x:0,z:0}),op({type:'material',id:'object-1',materialId:'plastic-translucent-white'})]);
assert.equal(agent.scene.levels[0].design.objects[0].materialId,'plastic-translucent-white');
const columns=new BuildingStore(source.building);columns.execute({type:'element.add',kind:'column',x:2,z:2,width:.3,depth:.3,height:2.5,elevation:0,rotation:0,materialId:'stone'});
for(const materialId of ELEMENT_MATERIAL_IDS){const column=columns.building.levels[0].elements[0];columns.execute({...column,type:'element.update',materialId});assert.equal(columns.building.levels[0].elements[0].materialId,materialId);}
const columnBefore=columns.serialize();assert.throws(()=>columns.execute({...columns.building.levels[0].elements[0],type:'element.update',materialId:'tatami'}),/材質/);assert.equal(columns.serialize(),columnBefore);
assert(!capabilities.commandSchemas['element.add'].properties.materialId.enum.includes('tatami'));assert(ELEMENT_MATERIAL_IDS.every(id=>capabilities.commandSchemas['element.add'].properties.materialId.enum.includes(id)));
const holes=new BuildingStore(source.building),holeCommand={type:'element.add',kind:'opening',x:0,z:0,width:1,depth:1,height:.15,elevation:0,rotation:0,materialId:'glass-clear-gloss'},holesBefore=holes.serialize(),holesHistory=holes.past.length;
assert.throws(()=>holes.execute(holeCommand),/洞口.*材質/);assert.equal(holes.serialize(),holesBefore);assert.equal(holes.past.length,holesHistory,'a rejected opening material cannot add history');
holes.execute({...holeCommand,materialId:'stone'});const legacyHoleBefore=holes.serialize(),legacyHoleHistory=holes.past.length;assert.throws(()=>holes.execute({...holes.building.levels[0].elements[0],type:'element.update',materialId:'metal-stainless-polished'}),/洞口.*材質/);assert.equal(holes.serialize(),legacyHoleBefore);assert.equal(holes.past.length,legacyHoleHistory);
const immutable=JSON.stringify(agent.scene);assert.throws(()=>runAgentOperations(agent.scene,[op({type:'material',id:'object-1',materialId:'unknown'})]));assert.equal(JSON.stringify(agent.scene),immutable);

const controls=new Map(),control=id=>{if(!controls.has(id))controls.set(id,{setItems(value){this.items=value;},setValue(value){this.value=value;},getValue(){return this.value;},setDisabled(value){this.disabled=value;},setText(value){this.text=value;}});return controls.get(id);};
const tour=Object.assign(Object.create(TourPage.prototype),{renderer:{},editor,building:editor.building,selection:{kind:'object',levelId:floor,id:chair.id},c:control,refreshEdited(){this.building=this.editor.building;this.syncMaterialControls();},message(value){this.notice=value;}});
tour.syncMaterialControls();tour.chooseMaterialCategory('glass');assert(control('tour-material-choice').items.every(i=>MATERIALS[i.value].category==='glass'));tour.materialChoice='glass-frosted-matte';tour.applyMaterial();assert.equal(editor.object(floor,chair.id).materialId,'glass-frosted-matte');assert.equal(control('tour-material-apply').disabled,false);
tour.selection={kind:'object',levelId:floor,id:car.id};tour.syncMaterialControls();tour.chooseMaterialCategory('metal');assert.equal(control('tour-material-apply').disabled,true);

const designStore=new BuildingStore(editor.building),designer=Object.assign(Object.create(DesignerPage.prototype),{renderer:{},store:designStore,selection:chair.id,views:[],control,execute(command){this.store.execute(command);this.syncMaterialPicker();},message(value){this.notice=value;}});
// 首次掛載與清除選取時，完整同步會傳入 undefined kind/item；失效 ID 也不可中斷同步。
designer.selection=null;const noSelectionBefore=designStore.serialize(),noSelectionHistory=designStore.past.length;
assert.doesNotThrow(()=>designer.syncMaterialPicker(undefined,undefined));assert.equal(control('design-material-apply').disabled,true);assert.match(control('design-material-note').text,/請先選取/);
assert.doesNotThrow(()=>designer.chooseMaterialCategory('glass'));assert.equal(control('design-material-apply').disabled,true);designer.applyMaterialChoice();assert.match(designer.notice,/請先選取/);assert.equal(designStore.serialize(),noSelectionBefore);assert.equal(designStore.past.length,noSelectionHistory);
designer.selection='object-9999';assert.doesNotThrow(()=>designer.syncMaterialPicker());designer.applyMaterialChoice();assert.equal(designStore.serialize(),noSelectionBefore);designer.selection=chair.id;
designer.syncMaterialPicker();designer.chooseMaterialCategory('fabric');assert(control('design-material-choice').items.every(i=>MATERIALS[i.value].category==='fabric'));designer.materialChoice='fabric-velvet-green';designer.applyMaterialChoice();assert.equal(designStore.state.objects.find(o=>o.id===chair.id).materialId,'fabric-velvet-green');
control('element-material').setValue('glass-clear-gloss');designer.syncElementMaterial('opening');assert.equal(control('element-material').disabled,true);assert.equal(control('element-material').value,'stone');assert.match(control('element-note').text,/沒有.*實體表面/);designer.syncElementMaterial('column');assert.equal(control('element-material').disabled,false);
assert(Object.keys(MATERIAL_CATEGORIES).every(id=>Object.values(MATERIALS).some(m=>m.category===id)));
console.log('PASS material selection: generated B4A controls, complete agent discovery, all presets save/reload, atomic rejection, supported-target rules, UI category filtering and undo/redo.');
