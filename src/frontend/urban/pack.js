import {fillWorkshopShell} from './standalone.js';

export async function readAppearanceAssets(read) {
    const entries=await Promise.all(['appearance.js','concourse.js','street-entry.js','escalator.js','plaza-interior.js'].map(async name=>[name,await read(name)]));
    return Object.fromEntries(entries);
}
export async function readStationAssets(read) {
    const simulator='../../../demos/east-mall-editable/simulator/';
    const [template,css,code,standalone,plazaGeometry,preview,iwer,...licenses]=await Promise.all([
        'station/index.html','station/station.css','station/station.js','standalone.js','public-plazas.js',
        simulator+'quest-preview.js',simulator+'iwer.module.min.js',
        ...['iwer','gl-matrix','webxr-layers-polyfill'].map(name=>simulator+name+'-LICENSE.txt')
    ].map(read));
    const appearance=await readAppearanceAssets(name=>read('station/'+name));
    return {template,css,code,standalone,plazaGeometry,appearance,preview,iwer,license:licenses.join('\n\n')};
}

export function packWorkshop(template, css, code, runtime, project, license, terrainCode, entry='urban', station=null, appearance=station?.appearance??{}, plazaGeometry=station?.plazaGeometry) {
    const base='lumiere-offline/node_modules/three/';
    const rewrite=code=>code.replace("from 'three'", "from '"+base+"build/three.module.js'")
        .replace("from './terrain.js'", "from 'lumiere-offline/urban/terrain.js'")
        .replace("from './standalone.js'", "from 'lumiere-offline/urban/standalone.js'")
        .replace("from './public-plazas.js'", "from 'lumiere-offline/urban/public-plazas.js'")
        .replace("from '../public-plazas.js'", "from 'lumiere-offline/urban/public-plazas.js'")
        .replace("from './appearance.js'", "from 'lumiere-offline/station/appearance.js'")
        .replace("from './concourse.js'", "from 'lumiere-offline/station/concourse.js'")
        .replace("from './street-entry.js'", "from 'lumiere-offline/station/street-entry.js'")
        .replace("from './escalator.js'", "from 'lumiere-offline/station/escalator.js'")
        .replace("from './plaza-interior.js'", "from 'lumiere-offline/station/plaza-interior.js'")
        .replaceAll("from 'three/addons/","from '"+base+'examples/jsm/');
    const source=rewrite(code);
    const lookup=new Map(runtime.modules.map(m=>[m.id,m.source]));
    if(plazaGeometry)lookup.set('lumiere-offline/urban/public-plazas.js',plazaGeometry);
    for(const [name,code] of Object.entries(appearance))lookup.set('lumiere-offline/station/'+name,rewrite(code));
    lookup.set('lumiere-offline/urban/terrain.js',terrainCode);
    const imports={};
    function gather(text){
        for(const match of text.matchAll(/["'](lumiere-offline\/[^"'\n]+?\.js)["']/g)){
            const id=match[1];if(imports[id])continue;
            const dependency=lookup.get(id);if(!dependency)throw Error('缺少模組 '+id);
            const bytes=new TextEncoder().encode(dependency);let binary='';
            for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
            imports[id]='data:text/javascript;base64,'+btoa(binary);gather(dependency);
        }
    }
    const json=v=>JSON.stringify(v).replaceAll('<','\\u003c');
    let studyEditor='';
    if(station){
        lookup.set('lumiere-offline/urban/standalone.js',station.standalone);
        const preview='lumiere-offline/simulator/quest-preview.js';
        const iwer='lumiere-offline/simulator/iwer.module.min.js';
        lookup.set(preview,station.preview.replace("from './iwer.module.min.js'", "from '"+iwer+"'"));
        lookup.set(iwer,station.iwer);
        gather(JSON.stringify(preview));
        license+='\n\n'+station.license;
        const stationSource=rewrite(station.code);
        gather(stationSource);
        // The child document uses the host import map, so Three.js is shipped once.
        const child=station.template
            .replace('<link rel="stylesheet" href="station.css">',()=>'<style>'+station.css+'</style>')
            .replace(/<script type="importmap">[\s\S]*?<\/script>/,'<!--workspace-imports-->')
            .replace('<script type="module" src="station.js"></script>',()=>'<script type="module">'+stationSource+'</script>');
        studyEditor='<script id="station-editor-data" type="application/json">'+json(child)+'</script>';
    }
    gather(source);
    if(station){
        const shell=template.replace('<link rel="stylesheet" href="urban.css">',()=>'<style>'+css+'</style>')
            .replace(/<script type="importmap">[\s\S]*?<\/script>/,'<!--workshop-imports-->')
            .replace('<script type="module" src="urban.js"></script>',()=>studyEditor+'<!--workshop-payload--><script type="module">'+source+'</script>')
            .replace('</html>',()=>'<!-- '+license.replaceAll('--','—')+' --></html>');
        return fillWorkshopShell(shell,json({imports}),project);
    }
    return template.replace('<link rel="stylesheet" href="'+entry+'.css">',()=>'<style>'+css+'</style>')
        .replace(/<script type="importmap">[\s\S]*?<\/script>/,()=>'<script type="importmap">'+json({imports})+'</script>')
        .replace('<script type="module" src="'+entry+'.js"></script>',()=>studyEditor+'<script id="project-data" type="application/json">'+json(project)+'</script><script type="module">'+source+'</script>')
        .replace('</html>',()=>'<!-- '+license.replaceAll('--','—')+' --></html>');
}
