import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateToolPageDefinition} from '../lib/page-generator/ToolPageDefinition.js';

const definition=JSON.parse(await readFile('definitions/tour.page.json','utf8'));
validateToolPageDefinition(definition,{componentNames:['BasicButton','Heading','Text','Dropdown','UploadButton','TourViewport','TextInput']});
const nodes=new Map(),parents=new Map();
function walk(node,parent=null){assert(!nodes.has(node.id),`duplicate node: ${node.id}`);nodes.set(node.id,node);parents.set(node.id,parent);for(const child of node.children||[])walk(child,node.id);}
walk(definition.root);
const under=(id,ancestor)=>{for(let parent=parents.get(id);parent;parent=parents.get(parent))if(parent===ancestor)return true;return false;};
const events=new Map([
 ['tour-editor','go.design'],['tour-menu-toggle','menu.toggle'],['tour-object-panel-toggle','object.panel'],
 ['tour-objects','object.choose'],['tour-asset','asset.choose'],['tour-add','object.add'],['tour-place-cancel','object.place.cancel'],
 ['tour-object-apply','object.apply'],['tour-object-rotate','object.rotate'],['tour-object-delete','object.delete'],
 ['tour-undo','edit.undo'],['tour-redo','edit.redo'],['tour-device-toggle','object.power'],['tour-device-channel','device.channel'],['tour-device-apply','device.apply'],
 ['tour-export-json','source.export.json'],['tour-export-bundle','source.export.bundle'],['tour-apply-exit','go.apply'],['tour-view','view.preset']
]);
for(const [id,command]of events){const node=nodes.get(id);assert(node,`missing action: ${id}`);assert(Object.values(node.events||{}).includes(command),`missing trusted command: ${id}`);}
assert(under('tour-view','tour-functions'));assert.equal(nodes.get('tour-view').component,'Dropdown');assert.deepEqual(nodes.get('tour-view').options.items.map(item=>item.value),['overview','front','side','top']);
for(const id of ['tour-editor','tour-menu-toggle','tour-object-panel-toggle'])assert(under(id,'tour-hud-actions'),`${id} must remain outside collapsible panels`);
for(const id of ['tour-plan','tour-position','tour-facing','tour-floor'])assert(under(id,'tour-plan-pane'),`${id} must be available in the minimap`);
for(const id of ['tour-scene','tour-plan'])assert(under(id,'tour-workspace'));
for(const id of ['tour-load-button','tour-cancel','tour-walk','tour-orbit','tour-plan-toggle','tour-roof-toggle','tour-detail','tour-lift-up','tour-lift-down'])assert(under(id,'tour-functions'),`${id} must remain in navigation settings`);
for(const id of ['tour-opening','tour-opening-toggle','tour-label-choice','tour-selected'])assert(under(id,'tour-object-editor'),`${id} must remain in object operations`);
for(const field of ['x','z','elevation','rotation','width','depth','height']){
 const node=nodes.get('tour-object-'+field);assert.equal(node.component,'TextInput');assert.equal(node.options.type,'number');assert(node.options.label.length>0);assert(under(node.id,'tour-object-editor'));
}
for(const action of ['forward','backward','left','right','turn-left','turn-right'])assert(under('tour-touch-'+action,'tour-scene-pane'));
assert.equal(nodes.get('tour-title').options.text,'3D實境導覽');assert.equal(nodes.get('tour-editor').options.customLabel,'離開');
const designer=JSON.parse(await readFile('definitions/designer.page.json','utf8'));let viewer,legacy;function designWalk(n){if(n.id==='design-viewer')viewer=n;if(n.id==='design-tour')legacy=n;for(const c of n.children||[])designWalk(c);}designWalk(designer.root);
assert.equal(viewer.options.customLabel,'3D實境導覽');assert.equal(viewer.events.onClick,'go.viewer');assert.equal(legacy.options.customLabel,'原始住宅範例');assert.equal(legacy.events.onClick,'go.tour');
const app=await readFile('src/frontend/app.js','utf8');for(const route of ['/tour','/design','/capture'])assert(app.includes(`path:'${route}'`),`preserve ${route}`);
console.log('PASS tour HUD definition: linked minimap/readouts, persistent exit/function controls, generated object fields, editing/export commands, touch controls and existing routes.');
