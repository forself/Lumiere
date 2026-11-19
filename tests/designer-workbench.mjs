import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateToolPageDefinition} from '../lib/page-generator/ToolPageDefinition.js';
import {DesignerPage,WORKBENCH_PANELS} from '../src/frontend/designer/DesignerPage.js';
import {consumeTourHandoff,consumeTourEditorReturn} from '../src/frontend/tour/tour-handoff.js';

const definition=JSON.parse(await readFile('definitions/designer.page.json','utf8'));
validateToolPageDefinition(definition);
const nodes=new Map(),parents=new Map();
const visit=(node,parent)=>{assert(!nodes.has(node.id),'duplicate node '+node.id);nodes.set(node.id,node);parents.set(node.id,parent?.id||null);for(const child of node.children||[])visit(child,node);};visit(definition.root,null);
for(const id of ['design-save','design-load','design-export','design-import','bundle-save','bundle-load','tool-select','tool-room','tool-polygon','tool-door','tool-window','design-plan','design-scene','design-inspector','structure-panel','asset-place','school-add','semi-add','batch-copy','batch-paste','floor-add','floor-copy','floor-linked','render-png','render-pdf','sheet-export','material-import','asset-glb','design-opening-style','design-door','design-summary'])assert(nodes.has(id),'original control remains reachable: '+id);
assert.equal(nodes.get('workbench-panel').component,'Dropdown');assert.equal(nodes.get('workbench-toggle').component,'BasicButton');assert.equal(nodes.get('design-viewer').events.onClick,'go.viewer');
assert.equal(nodes.get('workbench-controls-toggle').component,'BasicButton');assert.equal(nodes.get('workbench-controls-toggle').events.onClick,'workbench.controls');assert.equal(parents.get('workbench-controls-toggle'),'design-primary-actions');assert.equal(parents.get('design-viewer'),'design-primary-actions','scene handoff remains outside collapsed secondary file actions');
for(const [panel,group] of Object.entries({assets:'workbench-assets',school:'workbench-school',semi:'workbench-semi',batch:'design-batch',floors:'design-floors',scene:'workbench-scene',render:'design-render-tools',materials:'design-material-library'})){
 assert(nodes.get('workbench-panel').options.items.some(x=>x.value===panel));let current=group;while(current&&current!=='workbench-tools')current=parents.get(current);assert.equal(current,'workbench-tools','tool group belongs to bounded drawer');
}

// Every tool category is available; collapsing the drawer changes no component tree.
const hosts=new Map([...nodes.keys()].map(id=>[id,{hidden:false,id}])),attrs=new Map(),values=[];
const page=new DesignerPage();page.renderer={getHost:id=>hosts.get(id),getComponent:id=>id==='workbench-panel'?{setValue:v=>values.push(v)}:id==='workbench-toggle'?{element:{setAttribute:(k,v)=>attrs.set(k,v)}}:null};page.sync=()=>page.syncWorkbench();
page.syncWorkbench();assert.equal(hosts.get('workbench-tools').hidden,true);assert.equal(attrs.get('aria-expanded'),'false');
for(const panel of Object.keys(WORKBENCH_PANELS)){page.chooseWorkbench(panel);assert.equal(page.workbenchOpen,true);assert.equal(values.at(-1),panel);const visible=[...hosts].filter(([id,h])=>['design-batch','design-floors','workbench-scene','design-render-tools','design-material-library'].includes(id)&&!h.hidden).map(([id])=>id);assert(visible.length<=1,'one large category visible at a time');}
const chosen=page.workbenchPanel;page.chooseWorkbench('constructor');assert.equal(page.workbenchPanel,chosen,'unknown category is ignored');page.workbenchOpen=false;page.syncWorkbench();assert.equal(hosts.get('workbench-tools').hidden,true);

// The mobile disclosure hides no individual commands: its persistent button controls the original groups.
const compactAttrs=new Map(),compactClasses=new Map();hosts.get('designer').classList={toggle:(name,value)=>compactClasses.set(name,value)};
const originalComponent=page.renderer.getComponent;page.renderer.getComponent=id=>id==='workbench-controls-toggle'?{element:{setAttribute:(name,value)=>compactAttrs.set(name,value)}}:originalComponent(id);
page.syncWorkbench();assert.equal(compactAttrs.get('aria-expanded'),'false');assert.equal(compactClasses.get('workbench-controls-open'),false);for(const id of ['design-files','design-toolbar','workbench-navigation','workbench-tools'])assert(compactAttrs.get('aria-controls').split(' ').includes(id));
page.toggleWorkbenchControls();assert.equal(compactAttrs.get('aria-expanded'),'true');assert.equal(compactClasses.get('workbench-controls-open'),true);page.chooseWorkbench('materials');assert.equal(hosts.get('design-material-library').hidden,false,'all secondary categories remain reachable after opening phone controls');page.toggleWorkbenchControls();assert.equal(compactClasses.get('workbench-controls-open'),false);

// Opening a tour is a separate deep copy, and returning retains original undo/redo/dirty state.
const savedLocation=globalThis.location;globalThis.location={hash:'/design'};
try{
 const source=new DesignerPage();source.control=()=>({setDisabled(){}});source.message=m=>{source.notice=m;};source.compactControlsOpen=true;
 const originalSaved=source.saved,o=source.store.state.objects[0];source.store.execute({type:'moveObject',id:o.id,x:o.x+.2,z:o.z});source.store.execute({type:'rotateObject',id:o.id});source.store.undo();
 source.frameEditor.model.name='待儲存構架';source.frameEditor.history=[{...source.frameEditor.model,name:'之前構架'}];source.projectBundle.savedExtras='different';
 const before=source.store.serialize(),past=source.store.past.length,future=source.store.future.length,frameSaved=source.frameEditor.saved;
 const pack={format:'lumiere-project',version:2,building:structuredClone(source.store.building),assets:[],underlays:[],materials:{format:'lumiere-materials',version:2,materials:[]},ifc:null,sheets:null,frame:structuredClone(source.frameEditor.model),reference:null,captureContext:null};
 source.projectBundle.capture=async()=>structuredClone(pack);await source.openViewer();assert.equal(globalThis.location.hash,'/tour');
 const runtime=consumeTourHandoff();runtime.building.levels[0].design.openings[0].open=true;
 const back=consumeTourEditorReturn();assert.equal(back.input.building.levels[0].design.openings[0].open,false,'runtime door state does not alter editor snapshot');
 const editor=new DesignerPage();editor.sync=()=>{};editor.store.replace(back.input.building);editor.frameEditor.model=back.input.frame;editor.restoreTourEditorState(back.editorState);
 assert.equal(editor.store.serialize(),before);assert.equal(editor.saved,originalSaved);assert.notEqual(editor.store.serialize(),editor.saved,'unsaved building remains unsaved');assert.equal(editor.store.past.length,past);assert.equal(editor.store.future.length,future);assert.equal(editor.frameEditor.saved,frameSaved);assert.equal(editor.frameEditor.dirty,true);assert.equal(editor.frameEditor.history.length,1);assert.equal(editor.projectBundle.dirty,true);assert.equal(editor.compactControlsOpen,true,'phone controls return to their prior disclosure state');
 editor.store.undo();assert.equal(editor.store.serialize(),originalSaved);editor.store.redo();assert.equal(editor.store.serialize(),before,'undo and redo remain functional after returning');
 let complete;source.projectBundle.capture=()=>new Promise(resolve=>{complete=resolve;});globalThis.location.hash='/design';const opening=source.openViewer();source.store.execute({type:'moveObject',id:o.id,x:o.x+.4,z:o.z});complete(pack);await opening;assert.equal(globalThis.location.hash,'/design');assert.match(source.notice,/期間專案已變更/);assert.equal(consumeTourHandoff(),null,'stale capture is never handed to the viewer');
}finally{if(savedLocation===undefined)delete globalThis.location;else globalThis.location=savedLocation;}
console.log('PASS B4A workbench: all categories reachable, one bounded drawer, existing core controls retained, safe full-project tour handoff and original model/history/dirty-state return.');
