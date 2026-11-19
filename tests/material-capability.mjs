import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MATERIALS,MATERIAL_CATEGORIES} from '../src/frontend/designer/catalog.js';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const contract=await json('capabilities/material-library.json');
assert.equal(contract.contractKind,'project-owned-conceptual-capability');assert.equal(contract.id,'lumiere.material-library');
assert.equal(contract.limits.presets,Object.keys(MATERIALS).length);assert.equal(contract.limits.newPresets,Object.values(MATERIALS).filter(m=>!m.legacy).length);
assert.deepEqual(contract.inputs.categories,Object.keys(MATERIAL_CATEGORIES));assert.equal(contract.limits.runtimeMapSize,256);
assert.equal(contract.limits.patternedNewPresets,Object.values(MATERIALS).filter(m=>!m.legacy&&m.texture==='procedural').length);
for(const file of ['src/frontend/designer/material-library.js','src/frontend/designer/material-application.js','src/frontend/designer/catalog.js','src/frontend/designer/model.js','src/frontend/designer/geometry.js','src/frontend/designer/building-geometry.js','src/frontend/designer/asset-geometry.js','src/frontend/designer/DesignViewport.js','src/frontend/designer/DesignerPage.js','src/frontend/tour/TourPage.js','src/frontend/tour/TourEditor.js','definitions/designer.page.json','definitions/tour.page.json'])assert(Object.hasOwn(contract.implementationHashes,file),`missing material evidence: ${file}`);
for(const file of contract.validation)await readFile(file);
for(const [file,expected]of Object.entries(contract.implementationHashes)){
 assert.match(file,/^(?:src\/frontend\/|definitions\/)[\w./-]+$/);assert(!file.split('/').includes('..'));assert.match(expected,/^[a-f\d]{64}$/);
 assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),expected,`stale material capability hash: ${file}`);
}
const tour=await json('capabilities/tour-viewport.json');assert(tour.editing.commands.includes('material'));assert(tour.dependencies.includes('lumiere.material-library'));
const design=await json('capabilities/design-viewport.json');assert(design.dependencies.includes('lumiere.material-library'));
assert(!contract.dependencies.includes(design.id)&&!contract.dependencies.includes(tour.id),'material core cannot depend on its consuming viewports');
assert.equal(createHash('sha256').update(await readFile(contract.artifacts.generator)).digest('hex'),contract.artifactGeneratorHash,'artifact generator evidence is current');
console.log('PASS material capability: registered preset/category counts, complete application/render/UI evidence, current source hashes and linked tour/designer contracts.');
