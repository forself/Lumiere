import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {packWorkshop,readStationAssets} from '../src/frontend/urban/pack.js';
const root = new URL('../',import.meta.url);
const read = p=>readFile(new URL(p,root),'utf8');
const dir = 'src/frontend/urban/';
const [template,css,code,runtime,data,license,terrainCode,station,study,plazas]=await Promise.all([
    read(dir+'index.html'),read(dir+'urban.css'),read(dir+'urban.js'),read('src/frontend/tour/standalone-runtime.json'),
    process.argv[2]?readFile(process.argv[2],'utf8'):read(dir+'fuxing.envelopes.json'),read('node_modules/three/LICENSE'),read(dir+'terrain.js'),
    readStationAssets(path=>read(dir+path)),read(dir+'station/levels.json'),read(dir+'plazas.json')
]);
const project=JSON.parse(data);
if(!Object.hasOwn(project,'stationStudy'))project.stationStudy=JSON.parse(study);
if(!Object.hasOwn(project,'publicPlazas'))project.publicPlazas=JSON.parse(plazas);
const html=packWorkshop(template,css,code,JSON.parse(runtime),project,license,terrainCode,'urban',station);
await writeFile(process.argv[3]||fileURLToPath(new URL('demos/east-mall-editable/street-workshop.html',root)),html);
