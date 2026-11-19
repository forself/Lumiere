import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {TOUR_TRANSFORM_FIELDS} from '../src/frontend/tour/TourEditor.js';

const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const tour=await readJson('capabilities/tour-viewport.json');
assert.equal(tour.contractKind,'project-owned-conceptual-capability');
assert.equal(tour.id,'lumiere.tour-viewport');
assert.equal(tour.scope,'#/tour');
assert.equal(tour.source,'src/frontend/tour/TourViewport.js');
assert.equal(tour.pageSource,'src/frontend/tour/TourPage.js');
assert.equal(tour.definition,'definitions/tour.page.json');
assert.equal(tour.limits.buildingJsonBytes,10*1024*1024);
assert.equal(tour.limits.projectBundleBytes,128*1024*1024);
assert.deepEqual(tour.editing.transformFields,TOUR_TRANSFORM_FIELDS,'capability must declare the actual editable field allowlist');
assert.deepEqual(tour.editing.commands,['addObject','transformObject','delete','toggleAppliance','deviceControl','toggleOpening','material']);
for(const file of [tour.source,tour.pageSource,tour.definition,'src/frontend/tour/tour-input.js','src/frontend/tour/tour-handoff.js','src/frontend/tour/TourTouchControls.js','src/frontend/tour/TourEditor.js','src/frontend/designer/model.js','src/frontend/styles/tour.css'])assert(Object.hasOwn(tour.implementationHashes,file),`missing tour evidence: ${file}`);
for(const file of tour.validation)await readFile(file);

const design=await readJson('capabilities/design-viewport.json');
const designChanges=['src/frontend/designer/DesignViewport.js','src/frontend/designer/model.js','src/frontend/designer/DesignerPage.js','definitions/designer.page.json','src/frontend/styles/designer-workbench.css'];
for(const [file,expected] of [...Object.entries(tour.implementationHashes),...designChanges.map(file=>[file,design.implementationHashes[file]])]){
  assert.match(file,/^(?:src\/frontend\/|definitions\/)[\w./-]+$/);
  assert(!file.split('/').includes('..'),`hash path escapes project: ${file}`);
  assert.match(expected,/^[a-f\d]{64}$/);
  assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),expected,`stale capability hash: ${file}`);
}
console.log('PASS tour capability: project-owned registration, complete viewer source evidence, current workbench hashes and documented validation files.');
