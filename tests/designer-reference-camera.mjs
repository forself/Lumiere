import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateReferenceCamera} from '../src/frontend/designer/reference-camera.js';
const p=JSON.parse(readFileSync('output/interior-window-validation/camera.json','utf8'));assert.equal(validateReferenceCamera(p).focal,900);
for(const next of [{...p,focal:0},{...p,cx:Infinity},{...p,width:9000},{...p,position:[NaN,0,0]},{...p,target:p.position},{...p,format:'unknown'}])assert.throws(()=>validateReferenceCamera(next));
assert.equal(validateReferenceCamera({...p,untrusted:'ignored'}).untrusted,undefined);
console.log('PASS reference camera validation and allowlisted fields');
