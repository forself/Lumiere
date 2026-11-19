import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {captureTourBundle} from '../src/frontend/tour/TourEditor.js';
import {createStandaloneHtml} from '../src/frontend/tour/standalone-export.js';

const [input,output]=process.argv.slice(2);
if(!input||!output||path.extname(output).toLowerCase()!=='.html')throw new Error('使用：node scripts/export-standalone-tour.mjs 輸入.json或.lumiere 輸出.html');
const value=JSON.parse(await readFile(input,'utf8'));
// This command preserves encoded sources without decoding browser-only image APIs.
const project=value.format==='lumiere-project'?value:(await import('../src/frontend/designer/building-model.js')).parseBuilding(JSON.stringify(value));
const bundle=project.format==='lumiere-project'?project:await captureTourBundle(null,project);
const runtime=JSON.parse(await readFile('src/frontend/tour/standalone-runtime.json','utf8'));
const html=await createStandaloneHtml(bundle,{runtime,title:path.basename(input,path.extname(input))});
await writeFile(output,html);console.log(JSON.stringify({output,bytes:Buffer.byteLength(html),offline:true}));
