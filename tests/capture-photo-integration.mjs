import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {newCapture,guide,addSource,addPair,applyPhotoAnalysis,parseCapture} from '../src/frontend/capture/capture-model.js';
import {analysePhotos} from '../scripts/capture-photos.mjs';
const dir='output/vision-test/',fixture=JSON.parse(await readFile(dir+'fixture.json','utf8'));
let s=guide(newCapture(fixture.captureId));
for(const [i,m] of fixture.images.entries())s=addSource(s,{...m,bytes:(await readFile(dir+(i?'B':'A')+'.png')).length,name:(i?'B':'A')+'.png',mime:'image/png',kind:'photo',target:'合成多深度幾何測試',view:i?'B 相機，側移並旋轉':'A 相機',capturedAt:'合成測試，非現場照片'});
s=addPair(s,{sourceIds:['source-1','source-2'],metres:.5,uncertainty:.005,direction:'right',sameLens:true});assert.equal(s.revision,fixture.baseRevision);
await writeFile(dir+'capture.json',JSON.stringify(s,null,2));
const calibration=JSON.parse(await readFile(dir+'calibration.json','utf8'));
const r=await analysePhotos(s,[dir+'A.png',dir+'B.png'],['source-1','source-2'],calibration);assert.equal(r.status,'sparse-metric');assert(r.points.length>=30);
const applied=applyPhotoAnalysis(s,r);assert.deepEqual(parseCapture(JSON.stringify(applied)),applied);assert.equal(applied.scene.levels[0].design.rooms.length,0);
await writeFile(dir+'engine-result.json',JSON.stringify(r,null,2));await writeFile(dir+'applied.json',JSON.stringify(applied,null,2));
await assert.rejects(analysePhotos(s,[dir+'B.png',dir+'A.png'],['source-1','source-2']),/SHA-256/);
const temp=await mkdtemp('output/photo-cli-'),output=temp+'/result.json';
try{const args=['scripts/capture-photos.mjs',dir+'capture.json',dir+'A.png',dir+'B.png','source-1','source-2',output];let run=spawnSync(process.execPath,args,{encoding:'utf8',timeout:65000});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(await readFile(output,'utf8')).status,'needs-calibration');const original=await readFile(output,'utf8');run=spawnSync(process.execPath,args,{encoding:'utf8',timeout:65000});assert.notEqual(run.status,0);assert.equal(await readFile(output,'utf8'),original);}finally{await unlink(output);await rmdir(temp);}
console.log('PASS real image-byte CLI to capture JSON, calibrated reconstruction, uncalibrated feedback, SHA-256 rejection and no-overwrite');
