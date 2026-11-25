import {readFile,writeFile} from 'node:fs/promises';
import {packWorkshop,readAppearanceAssets} from '../src/frontend/urban/pack.js';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const dir='src/frontend/urban/station/';
const dest='demos/east-mall-editable/';
const [template,css,code,runtime,data,license,appearance,plazas,plazaGeometry,city]=await Promise.all([
    read(dir+'index.html'),read(dir+'station.css'),read(dir+'station.js'),
    read('src/frontend/tour/standalone-runtime.json'),read(dir+'levels.json'),read('node_modules/three/LICENSE'),
    readAppearanceAssets(name=>read(dir+name)),read('src/frontend/urban/plazas.json'),read('src/frontend/urban/public-plazas.js'),read('src/frontend/urban/fuxing.envelopes.json')
]);
const leasePart=JSON.parse(plazas).plazas.find(p=>p.id==='dinghao')?.parts.find(p=>p.id==='dinghao-lease')??null;
const areas={leasePart,indoorPlaza:JSON.parse(city).plaza??null};
const shell=template.replace('</head>',()=>'<script id="public-area-data" type="application/json">'+JSON.stringify(areas).replaceAll('<','\\u003c')+'</script></head>');
const html=packWorkshop(shell,css,code,JSON.parse(runtime),JSON.parse(data),license,null,'station',null,appearance,plazaGeometry);
await writeFile(new URL(dest+'station-underground.html',root),html);
await writeFile(new URL(dest+'station-underground.json',root),data);

