import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sampleProject,validateProject} from '../src/frontend/designer/model.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const frontend=path.join(root,'src','frontend');
const privatePath=relative=>/^scene\/(?:plan-|navigation-spaces\.js|SpaceHotspots\.js|VRNavigation\.js)|^components\/SceneViewport\.js$/.test(relative);

async function publicGraph(entry,read=filename=>readFile(filename,'utf8')){
 const visited=new Set();
 async function visit(file){
  const relative=path.relative(frontend,file).replaceAll('\\','/');
  assert(!privatePath(relative),'公開入口不可依賴個案模組：'+relative);
  if(visited.has(file))return;
  visited.add(file);
  const source=await read(file);
  assert(!/序光寓所|source-plan\.png/.test(source),'公開入口不可讀取私有住宅來源：'+relative);
  for(const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)){
   const specifier=match[1]||match[2];
   if(!specifier.startsWith('.'))continue;
   const dependency=path.resolve(path.dirname(file),specifier);
   if(dependency.startsWith(frontend+path.sep)&&dependency.endsWith('.js'))await visit(dependency);
  }
 }
 await visit(entry);
 return visited;
}

const html=await readFile(path.join(frontend,'index.html'),'utf8');
assert.match(html,/<script type="module" src="public-app\.js"><\/script>/);
assert(!/序光寓所|LUMIÈRE RESIDENCE|src="app\.js"/.test(html));
const app=await readFile(path.join(frontend,'public-app.js'),'utf8');
assert.match(app,/path:'\/',exact:true,component:DesignerPage/);
assert.match(app,/path:'\/capture',exact:true,component:CapturePage/);
assert.match(app,/path:'\/tour',exact:true,component:TourPage/);
const reachable=await publicGraph(path.join(frontend,'public-app.js'));
assert(reachable.has(path.join(frontend,'designer','DesignerPage.js')));
assert(reachable.has(path.join(frontend,'tour','TourPage.js')));
await assert.rejects(()=>publicGraph(path.join(frontend,'public-app.js'),async file=>file.endsWith('public-app.js')?"import {X} from './scene/plan-data.js';":''),/個案模組/);

const sample=validateProject(sampleProject());
assert.equal(sample.rooms.length,1);
assert.equal(sample.vertices.length,4);
assert.equal(Math.max(...sample.vertices.map(p=>p.x))-Math.min(...sample.vertices.map(p=>p.x)),6);
assert.equal(Math.max(...sample.vertices.map(p=>p.z))-Math.min(...sample.vertices.map(p=>p.z)),4);
assert.equal(sample.openings.length,2);
assert.equal(sample.objects.length,2);
const definition=await readFile(path.join(root,'definitions','designer.page.json'),'utf8');
assert(definition.includes('通用設計範例'));
assert(!definition.includes('原始住宅範例'));
console.log(`PASS public default: ${reachable.size} reachable modules, independent 6×4 m sample, private dependency regression rejected.`);
