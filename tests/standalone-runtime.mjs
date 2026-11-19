import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildStandaloneRuntime,moduleReferences,rewriteModule,resolveModule,MODULE_PREFIX,RUNTIME_BYTES,RUNTIME_ENTRY} from '../scripts/build-standalone-runtime.mjs';

let checks=0;const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;},ok=(value,label)=>{assert.ok(value,label);checks++;},reject=(fn,label)=>{assert.throws(fn,label);checks++;};
const source=[
 '// import "./comment.js"; import("./comment-dynamic.js");',
 '/* export * from "./block-comment.js"; */',
 'const text="import(\\\"./string-fake.js\\\")";',
 'const expression=/import\\("fake-regex"\\)/;',
 'if(true)/import("fake-control-regex")/.test(text);',
 'const untouched="./same.js";',
 'const object={import(value){return value;}};object.import("./method.js");',
 'const template=`text import("fake-template") ${import("./inside-template.js")}`;',
 'import {name as renamed} from "./same.js";',
 'import "./side.js";',
 'export {name} from "./export.js";',
 'export * as namespace from "./namespace.js";',
 'export const load=()=>import("./lazy.js?v=42");',
 'export const escaped=()=>import("./\\u0061.js");',
 'export const value=import.meta.url;'
].join('\n');
const refs=moduleReferences(source,'src/frontend/sample.js');
equal(refs.map(r=>r.specifier),['./inside-template.js','./same.js','./side.js','./export.js','./namespace.js','./lazy.js?v=42','./a.js'],'Only real module declarations and dynamic imports have source offsets.');
equal(refs.map(r=>r.dynamic),[true,false,false,false,false,true,true],'Static and dynamic imports remain distinct.');
for(const ref of refs){ok(['"',"'"].includes(source[ref.start]),'String offsets include opening quote.');equal(source[ref.end-1],source[ref.start],'String offsets include matching closing quote.');}
const rewritten=rewriteModule(source,refs,'src/frontend/sample.js');
ok(rewritten.includes('const untouched="./same.js"'),'An identical non-import string remains unchanged.');
ok(rewritten.includes('object.import("./method.js")'),'Object method names cannot masquerade as dynamic imports.');
equal(moduleReferences(rewritten).map(r=>r.specifier),refs.map(r=>MODULE_PREFIX+resolveModule(r.specifier,'src/frontend/sample.js')),'Rewritten modules preserve exact grammar and closed aliases.');
equal(resolveModule('./thing.js?v=20260814-1#cached','lib/ui_components/social/index.js'),'lib/ui_components/social/thing.js','Query/hash do not enter disk paths.');
equal(resolveModule('three','src/frontend/sample.js'),'node_modules/three/build/three.module.js');
equal(resolveModule('three/addons/controls/OrbitControls.js','src/frontend/sample.js'),'node_modules/three/examples/jsm/controls/OrbitControls.js');
for(const spec of ['https://example.test/module.js','//example.test/module.js','node:fs','three-mesh-bvh','../../../../secret.js','./thing.json','./unregistered.mjs','./file\\name.js','./%2e%2e/private.js'])reject(()=>resolveModule(spec,'src/frontend/sample.js'),'External, traversal, encoded or unsupported modules must be rejected.');
reject(()=>moduleReferences('const filename="./a.js"; export const result=import(filename);'),'A computed import cannot escape the embedded allowlist.');
reject(()=>moduleReferences('export const result=import(`./a.js`);'),'Template import arguments require a reviewed explicit constant path.');
reject(()=>moduleReferences('import value from "./broken.js"; const = ;'),'Malformed JavaScript cannot enter the pack.');

const actual=JSON.parse(await readFile('src/frontend/tour/standalone-runtime.json','utf8')),fresh=await buildStandaloneRuntime();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
equal(digest(actual),digest(fresh),'Generated runtime must match the current trusted source tree; rebuild with scripts/build-standalone-runtime.mjs.');
equal(actual.entry,MODULE_PREFIX+RUNTIME_ENTRY,'Dedicated offline entry, not the router or original home, boots the scene.');
ok(Buffer.byteLength(JSON.stringify(actual))<=RUNTIME_BYTES,'Runtime stays within the fixed 32 MB cap.');
ok(actual.modules.length>100&&actual.modules.length<=1000,'Complete B4A/Three dependency closure is embedded.');
const ids=new Set(actual.modules.map(m=>m.id));equal(ids.size,actual.modules.length,'Every canonical module has exactly one alias.');
for(const module of actual.modules){
 equal(module.id,MODULE_PREFIX+module.path,'Aliases match approved canonical local paths.');
 const original=await readFile(module.path);equal(createHash('sha256').update(original).digest('hex'),module.sha256,'Source evidence is current: '+module.path);
 for(const ref of moduleReferences(module.source,module.path)){ok(ref.specifier.startsWith(MODULE_PREFIX),'A rewritten import cannot use the network or a relative file URL.');ok(ids.has(ref.specifier),'Every referenced runtime module is present: '+ref.specifier);}
}
for(const [file,expected]of Object.entries(actual.sourceHashes)){equal(createHash('sha256').update(await readFile(file)).digest('hex'),expected,'All JS, CSS, definition and license hashes remain current: '+file);}
equal(actual.definition,JSON.parse(await readFile('definitions/tour.page.json','utf8')),'The entire trusted B4A tool definition is embedded.');
ok(!/@import\b/i.test(actual.css),'Stylesheet imports are fully expanded.');
for(const m of actual.css.matchAll(/url\(\s*(?:(['"])(.*?)\1|([^)]*))\s*\)/gi))ok(/^(?:data:(?:image|font)\/|#)/i.test((m[2]??m[3]).trim()),'Every CSS asset is self-contained.');
ok(actual.css.includes('--cl-blue-500'),'Theme palette dependency is embedded.');
ok(actual.licenses.some(l=>l.name.includes('Three')&&l.text.includes('Permission is hereby granted')),'Original Three MIT notice is preserved.');
ok(actual.licenses.some(l=>l.name.includes('Bricks4Agent')),'B4A source provenance is retained without inventing a missing global license.');
const entry=actual.modules.find(m=>m.id===actual.entry);ok(entry.source.includes('mountStandaloneTour'),'The native tour mount is available offline.');ok(entry.source.includes('lumiere-standalone-payload'),'The entry consumes inert embedded data.');
console.log(`PASS standalone runtime: ${checks} assertions; lexical/grammar agreement, exact import offsets, rejected computed/external imports, full ${actual.modules.length}-module closure, current hashes, embedded CSS/definition/licenses and offline entry.`);
