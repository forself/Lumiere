import * as T from 'three';
import {validateTerrain,groundAt,buildingOffset,terrainSurface} from './terrain.js';
import {fillWorkshopShell,importMapTag} from './standalone.js';
import {ringsOf,netArea,validateOutline,indexPublicPlazas,cornerAt,containsPoint,canTraverse} from './public-plazas.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const shellElement=document.getElementById('workshop-shell');
const exportShell=shellElement?JSON.parse(shellElement.textContent):null;
const packedImports=exportShell?document.querySelector('script[type="importmap"]').textContent:null;
let desktopFrame=0,started=false;
function invalidate(){
    if(started&&!session&&!desktopFrame)desktopFrame=requestAnimationFrame(renderFrame);
}
const $ = id => document.getElementById(id);
const canvas = document.querySelector('canvas');
const simulatorPath=$('station-editor-data')?'lumiere-offline/simulator/quest-preview.js':
    new URL('../../../demos/east-mall-editable/simulator/quest-preview.js',location.href).href;
const headset=new URLSearchParams(location.search).get('headset');
let headsetSimulator=null,simulationError=false;
if(headset==='quest3'){
    try{
        const {installSimulator}=await import(simulatorPath);
        headsetSimulator=installSimulator();
    }catch{simulationError=true;}
}
const renderer = new T.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.xr.enabled = true;
const scene = new T.Scene();
scene.background = new T.Color(0xdce6e5);
scene.add(new T.HemisphereLight(0xfffaf0, 0xa4a99e, 2.1));
const sun = new T.DirectionalLight(0xfff1d7, 2);
sun.position.set(-180, 340, 90); scene.add(sun);
const camera = new T.PerspectiveCamera(55, 1, .09, 3000);
const rig = new T.Group(); scene.add(rig); rig.add(camera);
const orbit = new OrbitControls(camera, canvas);
orbit.addEventListener('change',invalidate);
canvas.addEventListener('webglcontextrestored',invalidate);
orbit.maxPolarAngle = Math.PI * .485;
const group = new T.Group(); scene.add(group);
const normal = new T.MeshStandardMaterial({color:0xc0c0b0,flatShading:true,side:T.DoubleSide});
const pavement = new T.MeshStandardMaterial({color:0x648d89,side:T.DoubleSide});
const uncertain=new T.MeshBasicMaterial({color:0x80563a,wireframe:true,transparent:true,opacity:.34,depthWrite:false});
const asphalt = new T.MeshStandardMaterial({color:0x40464b,roughness:1,side:T.DoubleSide});
const crossing = new T.MeshBasicMaterial({color:0x85a8a6,transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
pavement.polygonOffset=true;pavement.polygonOffsetFactor=-1;pavement.polygonOffsetUnits=-1;
const surfaceLayers = [
    {key:'roads',kind:'roadway',label:'車道路面',material:asphalt,order:0},
    {key:'sidewalks',kind:'sidewalk',label:'人行道',material:pavement,order:1},
    {key:'crosswalks',kind:'crosswalk',label:'行穿線範圍',material:crossing,order:2}
];
const layerOf = item=>surfaceLayers.find(layer=>layer.kind===item?.kind);
const active = new T.MeshStandardMaterial({color:0xcd7643,flatShading:true,side:T.DoubleSide});
const marker = new T.Mesh(new T.SphereGeometry(.8,12,8), new T.MeshBasicMaterial({color:0x174c78}));
scene.add(marker);
const selectedBoundary=new T.Group();
const boundaryMaterial=new T.LineBasicMaterial({color:0xffa43a,depthWrite:false});
scene.add(selectedBoundary);
let publicVenue=null, publicOwners=new Map();
const publicTexture=document.createElement('canvas');
publicTexture.width=publicTexture.height=128;
const gridPaint=publicTexture.getContext('2d');
gridPaint.fillStyle='#7ba9a4';gridPaint.fillRect(0,0,128,128);
gridPaint.fillStyle='#436f70';gridPaint.fillRect(0,0,3,128);gridPaint.fillRect(0,0,128,3);
const metreGrid=new T.CanvasTexture(publicTexture);
metreGrid.wrapS=metreGrid.wrapT=T.RepeatWrapping;metreGrid.colorSpace=T.SRGBColorSpace;
const leaseMaterial=new T.MeshStandardMaterial({map:metreGrid,side:T.DoubleSide,roughness:1});
function publicFloorGeometry(item){
    const rings=ringsOf(item).map(ring=>ring.map(([x,z])=>new T.Vector2(x,z)));
    const vertices=rings.flat();
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(vertices.flatMap(p=>[p.x,0,p.y]),3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(vertices.flatMap(p=>[p.x,p.y]),2));
    geometry.setIndex(T.ShapeUtils.triangulateShape(rings[0],rings.slice(1)).flat());
    geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
function showBoundary(item){
    for(const edge of selectedBoundary.children)edge.geometry.dispose();
    selectedBoundary.clear();
    if(publicOwners.has(item)){
        for(const ring of ringsOf(item)){
            const points=ring.map(([x,z])=>new T.Vector3(x,.016,z));
            selectedBoundary.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(points),boundaryMaterial));
        }
        return;
    }
    if(!layerOf(item))return;
    let index=0;
    for(const count of item.rings){
        const ring=item.footprint.slice(index,index+count);
        index+=count;
        const coords=ring.map(([x,z])=>new T.Vector3(x,item.elevation??groundAt(project.terrain,x,z),z));
        const line=new T.LineLoop(new T.BufferGeometry().setFromPoints(coords),boundaryMaterial);
        line.renderOrder=4;selectedBoundary.add(line);
    }
}
const groundMaterial = new T.MeshStandardMaterial({color:0xb9b5a0,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:3,polygonOffsetUnits:4});
const land=new T.Mesh(new T.BufferGeometry(),groundMaterial);scene.add(land);
function landGeometry(t){
    if(!t){
        const g=new T.PlaneGeometry(5000,5000);g.rotateX(-Math.PI/2);return g;
    }
    const coords=[],index=[];
    for(let j=0;j<t.rows;j++)for(let i=0;i<t.columns;i++){
        const a=j*t.columns+i;coords.push(t.x+i*t.step,t.heights[a],t.z+j*t.step);
        if(i<t.columns-1&&j<t.rows-1)index.push(a,a+t.columns,a+1,a+1,a+t.columns,a+t.columns+1);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(coords,3));g.setIndex(index);g.computeVertexNormals();return g;
}
const meshes = new Map(), ray = new T.Raycaster(), keys = new Set();
// Keep original meshes for picking and edits. The GPU draws a shared mesh
// for nearby opaque objects while their materials match.
const batches=new Map();
function syncBatch(batch){
    if(!batch?.combined)return;
    const sameMaterial=batch.members.children.every(m=>m.material===batch.material);
    batch.members.visible=!sameMaterial;
    batch.combined.visible=sameMaterial&&batch.members.children[0].visible;
}
function rebuildBatch(batch){
    if(!batch||batch.members.children.length<2)return;
    const geometry=mergeGeometries(batch.members.children.map(m=>m.geometry));
    geometry.computeBoundingSphere();
    if(batch.combined){
        batch.combined.geometry.dispose();
        batch.combined.geometry=geometry;
    }else{
        batch.combined=new T.Mesh(geometry,batch.material);
        batch.combined.renderOrder=batch.members.children[0].renderOrder;
        group.add(batch.combined);
    }
    syncBatch(batch);
}
function addToScene(mesh,item){
    if(publicOwners.has(item)||mesh.material.transparent||item.roadOverlapFraction>=.8){
        group.add(mesh);
        return;
    }
    const {x,z}=mesh.geometry.boundingSphere.center;
    const size=isPlaza(item)?8:48;
    const key=[isPlaza(item),mesh.material.id,Math.floor(x/size),Math.floor(z/size)].join('/');
    let batch=batches.get(key);
    if(!batch){
        batch={material:mesh.material,members:new T.Group(),combined:null};
        batches.set(key,batch);
        group.add(batch.members);
    }
    batch.members.add(mesh);
    mesh.userData.renderBatch=batch;
}
let floorPieces=[],obstacles=[];
let walkSurface;
let underground=false, streetReturn=null;
const plazaMaterials=new Map();
const isPlaza=item=>item?.kind==='plaza-piece';
function plazaAltitude(){
    const {anchor,depth}=project.plaza;
    return groundAt(project.terrain,...anchor)-depth;
}
function materialForPlaza(item){
    const key=item.role+' '+item.color;
    if(!plazaMaterials.has(key))plazaMaterials.set(key,new T.MeshStandardMaterial({
        color:item.color,emissive:item.role==='light'?item.color:0,emissiveIntensity:.5,side:T.DoubleSide
    }));
    return plazaMaterials.get(key);
}
function insideOutline(x,z,points){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
        const [ax,az]=points[i],[bx,bz]=points[j];
        if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
    }
    return inside;
}
function floorAt(x,z){
    return floorPieces.find(b=>insideOutline(x,z,b.footprint));
}
function canWalkBelow(x,z){
    const floor=floorAt(x,z);
    if(!floor)return false;
    return !obstacles.some(b=>
        b.base<floor.roof+1.65&&b.roof>floor.roof+.03&&insideOutline(x,z,b.footprint));
}
let project, selected, history=[], walking=false, yaw=0, pitch=0, held, session;
let publicGeometryRevision=0;
const read = id => $(id).valueAsNumber;
function surfaceTriangles(b,footprint=b.footprint){
    let start=0;
    const rings=b.rings.map(n=>{const pts=footprint.slice(start,start+n).map(([x,z])=>new T.Vector2(x,z));start+=n;return pts;});
    return T.ShapeUtils.triangulateShape(rings[0],rings.slice(1));
}
function geometry(b){
    if(publicOwners.has(b))return publicFloorGeometry(b);
    if(layerOf(b)){
        const g=new T.BufferGeometry();
        g.setAttribute('position',new T.Float32BufferAttribute(terrainSurface(project.terrain,b,surfaceTriangles(b)),3));
        g.computeVertexNormals();g.computeBoundingSphere();return g;
    }
    const offset=isPlaza(b)?plazaAltitude():buildingOffset(project.terrain,b);
    const coords=b.footprint.flatMap(([x,z])=>[x,b.base+offset,z,x,b.roof+offset,z]);
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(coords,3));
    g.setIndex(b.faces.flat());g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function valid(p){
    if(p?.format!=='lumiere-urban-envelope'||p.version!==1||p.units!=='m'||!Array.isArray(p.buildings)||!p.buildings.length||p.buildings.length>4000)throw Error('街區專案格式錯誤');
    const ids=new Set();let count=0;
    if(p.plaza){
        const {anchor,depth,items}=p.plaza;
        if(!Array.isArray(anchor)||anchor.length!==2||!anchor.every(Number.isFinite)||!Number.isFinite(depth)||depth<=0||
            !Array.isArray(items)||items.length>3000||!items.some(b=>b.role==='floor'))throw Error('地下層格式錯誤');
        for(const b of items){
            if(!isPlaza(b)||typeof b.name!=='string'||!['floor','wall','column','ceiling','light'].includes(b.role)||!/^#[0-9a-f]{6}$/i.test(b.color))throw Error('廣場構件格式錯誤');
        }
    }
    for(const b of [...p.buildings,...(p.plaza?.items||[])]){
        if(typeof b.id!=='string'||!b.id.length||b.id.length>80||ids.has(b.id)||!Number.isFinite(b.base)||!Number.isFinite(b.roof)||b.roof<=b.base)throw Error('建物編號或標高錯誤');
        ids.add(b.id);
        if(!Array.isArray(b.footprint)||b.footprint.length<3||!b.footprint.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw Error('輪廓資料錯誤');
        if(!Array.isArray(b.faces)||!b.faces.length||(count+=b.faces.length)>350000||!b.faces.every(f=>Array.isArray(f)&&f.length===3&&f.every(i=>Number.isInteger(i)&&i>=0&&i<b.footprint.length*2)))throw Error('構面資料錯誤');
    }
}
function objects(p){return [...p.buildings,...(p.plaza?.items||[]),...surfaceLayers.flatMap(layer=>p[layer.key]||[]),...p.publicPlazas.plazas.flatMap(venue=>venue.parts)];}
function surfaceMaterial(b){
    if(publicOwners.has(b))return leaseMaterial;
    if(isPlaza(b))return materialForPlaza(b);
    if(b.roadOverlapFraction>=.8&&!$('solid-overlaps').checked)return uncertain;
    return layerOf(b)?.material??normal;
}
$('solid-overlaps').onchange=()=>{
    for(const b of project.buildings)if(b.roadOverlapFraction>=.8)meshes.get(b.id).material=surfaceMaterial(b);
    invalidate();
};
function surfaceLabel(b){
    if(b.kind==='roadway'){
        const limits=b.crossStreet?' × '+b.crossStreet:[b.from,b.to].filter(Boolean).join(' → ');
        return b.name+(b.crossStreet?'':'　')+limits+'　'+b.sourceId;
    }
    if(b.kind==='sidewalk')return b.name+'　'+[b.from,b.to].filter(Boolean).join(' → ');
    return b.name+'　'+b.sourceId;
}
function install(p){
    publicGeometryRevision++;
    valid(p);
    if(!Object.hasOwn(p,'publicPlazas'))p.publicPlazas=structuredClone(defaultPlazas);
    if(!p.terrain&&JSON.stringify(p.origin)===JSON.stringify(initialProject.origin))p.terrain=initialProject.terrain;
    validateTerrain(p.terrain);
    const sameOrigin=JSON.stringify(p.origin)===JSON.stringify(initialProject.origin);
    for(const b of p.buildings){
        if(b.sourceBase===undefined)b.sourceBase=(sameOrigin?originalBases.get(b.id):undefined)??b.base;
        if(b.roadOverlapFraction===undefined&&sameOrigin&&originalOverlaps.has(b.id))b.roadOverlapFraction=originalOverlaps.get(b.id);
        if(!Number.isFinite(b.sourceBase))throw Error('建物來源基底標高錯誤。');
    }
    const known=new Set([...p.buildings,...(p.plaza?.items||[])].map(b=>b.id));
    for(const {key,kind,label} of surfaceLayers){
        const items=p[key]??[];
        if(!Array.isArray(items))throw Error(label+'清單格式錯誤');
        for(const item of items){
            if(item.kind!==kind||typeof item.id!=='string'||typeof item.name!=='string'||known.has(item.id))throw Error(label+'識別資料錯誤');
            if(!(item.elevation===null||Number.isFinite(item.elevation))||!Array.isArray(item.rings)||!item.rings.length||!item.rings.every(n=>Number.isInteger(n)&&n>=3)||!Array.isArray(item.footprint)||item.rings.reduce((sum,n)=>sum+n,0)!==item.footprint.length||!item.footprint.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(Number.isFinite)))throw Error(label+'幾何錯誤');
            known.add(item.id);
        }
    }
    const nextOwners=indexPublicPlazas(p.publicPlazas,known);
    publicOwners=nextOwners;publicVenue=null;returnFromPublic=null;
    $('public-plaza').replaceChildren(new Option('街區與第二廣場',''),...p.publicPlazas.plazas.map(v=>new Option(v.name,v.id)));
    for(const batch of batches.values())batch.combined?.geometry.dispose();
    batches.clear();
    floorPieces=(p.plaza?.items??[]).filter(b=>b.role==='floor');
    obstacles=(p.plaza?.items??[]).filter(b=>b.role==='column'||b.role==='wall');
    for(const m of meshes.values())m.geometry.dispose();group.clear();meshes.clear();
    underground=false;walking=false;streetReturn=null;keys.clear();walkSurface=null;
    $('section-view').hidden=!p.plaza;renderer.clippingPlanes=[];
    $('level').hidden=!p.plaza;$('level').textContent='下到第二廣場';canvas.dataset.level='street';
    land.visible=true;
    project=p;land.geometry.dispose();land.geometry=landGeometry(p.terrain);history=[];$('undo').disabled=true;$('building').replaceChildren();
    for(const mat of plazaMaterials.values())mat.dispose();plazaMaterials.clear();
    for(const b of objects(p)){
        const m=new T.Mesh(geometry(b),surfaceMaterial(b));m.name=b.id;m.userData.plaza=isPlaza(b);
        m.userData.publicVenueId=publicOwners.get(b)?.id;
        addToScene(m,b);meshes.set(b.id,m);
        m.renderOrder=isPlaza(b)?-1:(layerOf(b)?.order??0);
    }
    for(const batch of batches.values())rebuildBatch(batch);
    $('road').replaceChildren(new Option('選擇街段或路口',''));
    for(const layer of surfaceLayers){
        const items=(p[layer.key]||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
        if(!items.length)continue;
        const options=document.createElement('optgroup');options.label=layer.label;
        for(const item of items)options.append(new Option(surfaceLabel(item),item.id));
        $('road').append(options);
    }
    refreshLayer();selected=null;
    const initial=p.roads?.find(b=>b.crossStreet==='復興南路一段'&&b.name.startsWith('忠孝東路'));
    select(initial?.id??p.buildings[0].id);
    $('status').textContent=p.buildings.length+' 個建物、'+(p.roads?.length||0)+' 塊車道路面、'+(p.sidewalks?.length||0)+' 段人行道、'+(p.crosswalks?.length||0)+' 個行穿線範圍。';

}
function refreshLayer(){
    const options=document.createDocumentFragment();
    for(const b of objects(project)){
        const owner=publicOwners.get(b);
        const visible=owner?owner===publicVenue:!publicVenue&&isPlaza(b)===underground;
        meshes.get(b.id).visible=visible;
        if(visible){
            const title=owner?b.name:isPlaza(b)?b.name+' · '+b.id:layerOf(b)?layerOf(b).label+' · '+surfaceLabel(b):'建物 '+b.id;
            options.append(new Option(title,b.id));
        }
    }
    for(const batch of batches.values())syncBatch(batch);
    invalidate();
    $('building').replaceChildren(options);
    if(selected&&meshes.get(selected.id)?.visible)$('building').value=selected.id;
    land.visible=!underground&&!publicVenue;
    scene.background.set(underground?0x393939:0xdce6e5);
    $('road').disabled=underground||Boolean(publicVenue);
    $('section-view').hidden=Boolean(publicVenue)||!project.plaza;
    $('level').hidden=!publicVenue&&!project.plaza;
    $('level').textContent=publicVenue?'返回街區':underground?'回到街面':'下到第二廣場';
    $('all').textContent=underground||publicVenue?'廣場全覽':'街區全覽';
    $('public-plaza').value=publicVenue?.id??'';
    $('place-title').textContent=publicVenue?.name??'忠孝東路與復興南北路';
    $('place-caption').textContent=publicVenue?'戶外租借範圍 · 獨立圖面座標':'街面與地下層 · 東區地下街第二廣場';
    $('venue-source').hidden=!publicVenue?.sourceUrl?.startsWith('https://');
    if(!$('venue-source').hidden)$('venue-plan').href=publicVenue.sourceUrl;
    $('x-label').textContent=publicVenue?'圖面 X':'向東 X';$('z-label').textContent=publicVenue?'圖面 Z':'向南 Z';
    $('base').closest('fieldset').hidden=Boolean(publicVenue);
    $('walk').disabled=publicVenue?.walkable===false;
    canvas.dataset.level=publicVenue?.id??(underground?'plaza':'street');
}
function select(id){
    if(selected){
        const previous=meshes.get(selected.id);
        previous.material=surfaceMaterial(selected);
        syncBatch(previous.userData.renderBatch);
    }
    selected=objects(project).find(b=>b.id===id);
    meshes.get(id).material=publicVenue||isPlaza(selected)||layerOf(selected)||selected.roadOverlapFraction>=.8?surfaceMaterial(selected):active;showBoundary(selected);$('building').value=id;$('road').value=layerOf(selected)?id:'';
    syncBatch(meshes.get(id).userData.renderBatch);
    const points=publicVenue?ringsOf(selected).flat():selected.footprint;
    $('corner').replaceChildren(...points.map((_,i)=>new Option('轉折點 '+(i+1),i)));
    sync();
}
function sync(){
    invalidate();
    if(publicVenue){
        const {ring,index}=cornerAt(selected,+$('corner').value);
        const [x,z]=ring[index];$('east').value=x;$('south').value=z;
        marker.position.set(x,.04,z);marker.scale.setScalar(.27);
        $('feature-info').textContent=selected.name+' · 目前圖形 '+netArea(selected).toLocaleString('zh-TW',{maximumFractionDigits:1})+' m²。'+publicVenue.measurementNote;
        return;
    }
    marker.scale.setScalar(1);
    const surface=layerOf(selected);
    $('feature-info').textContent=isPlaza(selected)?selected.name+' · 廣場局部尺寸；街區對位及深度待測。':selected.kind==='roadway'
        ?'銑鋪區塊 '+selected.sourceId+(selected.sourceWidth>0?' · 圖載寬度 '+selected.sourceWidth+' m':'')
        :selected.kind==='crosswalk'?'行穿線範圍 '+selected.sourceId+' · 標線代碼 '+selected.markingCode:
        selected.roadOverlapFraction>=.8?'外殼投影與路面重疊 '+Math.round(selected.roadOverlapFraction*100)+'%，底部淨高待核實。':'';
    $('roof-label').textContent=isPlaza(selected)?'構件頂高':'屋頂標高';
    $('base-label').textContent=isPlaza(selected)?'相對地坪底高':surface?'覆寫鋪面標高':'基底標高';$('roof').disabled=Boolean(surface);$('base').placeholder=surface?'自動貼地':'';
    $('base').value=(surface?selected.elevation:selected.base)??'';$('roof').value=surface?'':selected.roof;
    const [x,z]=selected.footprint[+$('corner').value];
    $('east').value=x;$('south').value=z;marker.position.set(x,surface?(selected.elevation??groundAt(project.terrain,x,z)):meshes.get(selected.id).geometry.attributes.position.getY(1),z);
}
function rebuild(){
    if(isPlaza(selected)||publicOwners.has(selected))publicGeometryRevision++;
    const mesh=meshes.get(selected.id);mesh.geometry.dispose();mesh.geometry=geometry(selected);rebuildBatch(mesh.userData.renderBatch);showBoundary(selected);sync();
}
function message(e){
    const text=e.message||String(e);
    $('status').textContent=text;
    const frame=$('station-frame');
    const studyStatus=frame&&!frame.hidden&&frame.contentDocument?.getElementById('status');
    if(studyStatus)studyStatus.textContent=text;
}
function onGrid(x,z){
    const t=project.terrain;
    return !t||(x>=t.x&&z>=t.z&&x<=t.x+(t.columns-1)*t.step&&z<=t.z+(t.rows-1)*t.step);
}
function area(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
$('apply').onclick=()=>{
    const base=read('base'),roof=read('roof'),x=read('east'),z=read('south'),i=+$('corner').value;
    if(publicVenue){
        const trial=structuredClone(selected), next=cornerAt(trial,i);
        next.ring[next.index]=[x,z];
        try{validateOutline(trial);}catch(error){return message(error);}
        const current=cornerAt(selected,i);
        history.push({id:selected.id,i,p:current.ring[current.index]});if(history.length>100)history.shift();
        current.ring[current.index]=[x,z];rebuild();$('undo').disabled=false;
        if(walking&&!containsPoint(selected,rig.position.x,rig.position.z))overview();
        return message('已更新租借範圍的輪廓。');
    }
    if(layerOf(selected)){
        const elev=$('base').value===''?null:base;
        if(![x,z].every(Number.isFinite)||(elev!==null&&!Number.isFinite(elev)))return message('請輸入有效座標。');
        if(!onGrid(x,z))return message('轉折點超出已載入地形範圍。');
        const next=selected.footprint.slice();next[i]=[x,z];
        const tris=surfaceTriangles(selected,next);
        if(!tris.length)return message('無法產生鋪面。');
        history.push({id:selected.id,i,p:selected.footprint[i],elevation:selected.elevation});if(history.length>100)history.shift();
        selected.footprint=next;selected.elevation=elev;rebuild();$('undo').disabled=false;return message('已更新'+layerOf(selected).label+' '+selected.sourceId);
    }
    if(![base,roof,x,z].every(Number.isFinite)||roof<=base)return message('屋頂必須高於基底，各座標須為有效數值。');
    if(!onGrid(x,z))return message('轉折點超出已載入地形範圍。');
        const next=selected.footprint.slice();next[i]=[x,z];
    for(const face of selected.faces){
        if(!face.every(v=>v%2===1))continue;
        const ids=face.map(v=>Math.floor(v/2));
        if(!ids.includes(i))continue;
        const before=area(...ids.map(j=>selected.footprint[j])),after=area(...ids.map(j=>next[j]));
        if(Math.abs(before)>1e-7&&before*after<=0)return message('此位置會翻轉或壓平屋頂構面，請調整座標。');
    }
    history.push({id:selected.id,i,p:selected.footprint[i],base:selected.base,roof:selected.roof});if(history.length>100)history.shift();
    selected.footprint=next;selected.base=base;selected.roof=roof;rebuild();$('undo').disabled=false;
    message('已更新圖徵 '+selected.id+'，外牆與屋頂已同步。');
};
$('undo').onclick=()=>{const h=history.pop();if(!h)return;
    const other=objects(project).find(b=>b.id===h.id);
    const owner=publicOwners.get(other);
    if(owner!==undefined){
        if(publicVenue!==owner)choosePublicPlaza(owner.id);
        select(h.id);const current=cornerAt(selected,h.i);current.ring[current.index]=h.p;
        $('corner').value=h.i;rebuild();$('undo').disabled=!history.length;
        if(walking&&!containsPoint(selected,rig.position.x,rig.position.z))overview();
        message('已復原租借範圍的輪廓。');return;
    }
    if(publicVenue)choosePublicPlaza('');
    if(isPlaza(other)!==underground){if(underground)leavePlaza();else enterPlaza();}
    select(h.id);selected.footprint[h.i]=h.p;if(layerOf(selected))selected.elevation=h.elevation;else{selected.base=h.base;selected.roof=h.roof;}$('corner').value=h.i;rebuild();$('undo').disabled=!history.length;message('已復原');};
$('road').onchange=()=>{if($('road').value){select($('road').value);focus();}};
$('building').onchange=()=>select($('building').value);$('corner').onchange=sync;
$('save').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(project)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='東區-可編輯街區.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
$('export').onclick=async()=>{
    $('export').disabled=true;
    try{
        let html;
        if(exportShell){
            html=fillWorkshopShell(exportShell,packedImports,project);
        }else{
            const get=async path=>{const res=await fetch(path);if(!res.ok)throw Error('無法載入 '+path);return res.text();};
            const {packWorkshop,readStationAssets}=await import('./pack.js');
            const [template,css,code,runtime,license,terrainCode,station]=await Promise.all([
                ...['index.html','urban.css','urban.js','../tour/standalone-runtime.json','/node_modules/three/LICENSE','terrain.js'].map(get),
                readStationAssets(get)
            ]);
            html=packWorkshop(template,css,code,JSON.parse(runtime),project,license,terrainCode,'urban',station);
        }
        const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
        const a=document.createElement('a');a.href=url;a.download='東區街區-編輯後VR.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
        message('已匯出，可獨立開啟並繼續編輯。');
    }catch(e){message(e);}finally{$('export').disabled=false;}
};
$('load').onchange=async e=>{
    try{
        const f=e.target.files[0];if(!f)return;
        if(f.size>16000000)throw Error('檔案超過 16 MB');
        const next=JSON.parse(await f.text());
        if(!Object.hasOwn(next,'stationStudy'))next.stationStudy=structuredClone(defaultStudy);
        const editor=await ensureStationEditor();
        if(session||xrBusy||editor.isPresenting())throw Error('請先退出 VR 再開啟專案。');
        editor.validateStudy(next.stationStudy);
        install(next);editor.replaceStudy(next.stationStudy);
        overview();message('已開啟 '+f.name);
    }
    catch(err){message(err);}finally{e.target.value='';}
};
function editView(){if(session)return false;renderer.clippingPlanes=[];refreshLayer();walking=false;keys.clear();rig.position.set(0,0,0);orbit.enabled=true;marker.visible=true;selectedBoundary.visible=true;$('help').textContent='點選路面、人行道、行穿線或建物可編輯。拖曳旋轉，滾輪縮放。';return true;}
function overview(){if(!editView())return;const box=new T.Box3();
    for(const mesh of meshes.values())if(mesh.visible)box.expandByObject(mesh);
    const s=box.getBoundingSphere(new T.Sphere());orbit.target.copy(s.center);camera.position.copy(s.center).addScaledVector(new T.Vector3(.42,.89,.79),s.radius*1.68);orbit.update();}
function focus(){if(!editView())return;const s=meshes.get(selected.id).geometry.boundingSphere;orbit.target.copy(s.center);const offset=layerOf(selected)?new T.Vector3(.25,1.8,.52):new T.Vector3(1,.9,1.3);camera.position.copy(s.center).addScaledVector(offset,Math.max(13,s.radius*1.75));orbit.update();}
function showLevels(includeStreet=true){
    renderer.clippingPlanes=[];
    land.visible=!publicVenue&&includeStreet;
    for(const mesh of meshes.values()){
        const owner=mesh.userData.publicVenueId;
        mesh.visible=publicVenue?owner===publicVenue.id:!owner&&(includeStreet||mesh.userData.plaza);
    }
    for(const batch of batches.values())syncBatch(batch);
    invalidate();
}
$('section-view').onclick=()=>{
    if(!project.plaza||!editView())return;
    showLevels();
    const [x,z]=project.plaza.anchor;
    const floor=plazaAltitude();
    renderer.clippingPlanes=[new T.Plane(new T.Vector3(0,0,-1),z+1.5)];
    marker.visible=false;selectedBoundary.visible=false;
    scene.background.set(0xdce6e5);
    orbit.target.set(x,floor+project.plaza.depth/2,z);
    camera.position.set(x+5,floor+project.plaza.depth/2+1.3,z+30);
    orbit.update();
    $('help').textContent='街區剖視｜上方是道路，下方是第二廣場。深度與水平對位為展示設定。';
};
function setWalkPose(x,y,z,heading,tilt){
    showLevels(!underground);scene.background.set(underground?0x393939:0xdce6e5);
    walking=true;orbit.enabled=false;marker.visible=false;selectedBoundary.visible=false;keys.clear();
    rig.position.set(x,y,z);camera.position.set(0,1.65,0);
    yaw=heading;pitch=tilt;camera.rotation.set(pitch,yaw,0,'YXZ');canvas.focus();
}
let returnFromPublic=null;
function choosePublicPlaza(id){
    if(session||xrBusy){$('public-plaza').value=publicVenue?.id??'';return message('退出 VR 後可切換場景。');}
    const venue=project.publicPlazas.plazas.find(item=>item.id===id);
    if(venue===publicVenue||(!venue&&!publicVenue))return;
    if(location.hash.startsWith('#venue-'))window.history.replaceState(null,'',location.pathname+location.search+(venue?'#venue-'+venue.id:''));
    if(!publicVenue){
        returnFromPublic={underground,selectedId:selected.id,walking,yaw,pitch,position:rig.position.clone(),
            camera:camera.position.clone(),target:orbit.target.clone(),surface:walkSurface,streetReturn};
    }
    publicVenue=venue??null;
    underground=false;walkSurface=null;walking=false;keys.clear();rig.position.set(0,0,0);orbit.enabled=true;
    if(publicVenue){
        refreshLayer();select(publicVenue.parts[0].id);overview();
        $('help').textContent='圖面每格 1 公尺。可點選輪廓轉折點，修改公尺座標。';
        message(publicVenue.description||publicVenue.name);
        return;
    }
    const from=returnFromPublic;returnFromPublic=null;
    underground=from.underground;streetReturn=from.streetReturn;walkSurface=from.surface;
    refreshLayer();select(from.selectedId);
    if(from.walking){setWalkPose(from.position.x,from.position.y,from.position.z,from.yaw,from.pitch);}
    else{editView();camera.position.copy(from.camera);orbit.target.copy(from.target);orbit.update();}
    $('help').textContent=from.walking?'WASD 移動，拖曳轉頭。':'點選構件以編輯輪廓。拖曳旋轉，滾輪縮放。';
    message('已返回原場景。');
}
$('public-plaza').onchange=()=>choosePublicPlaza($('public-plaza').value);
function enterPlaza(){
    if(!project.plaza||underground)return;
    if(!walking)walk();
    streetReturn={position:rig.position.clone(),yaw,pitch,surface:walkSurface,selected:selected.id};
    underground=true;refreshLayer();walkSurface=null;
    const floor=project.plaza.items.find(b=>b.role==='floor');
    select(floor.id);
    const [x,z]=project.plaza.anchor;
    const positions=[[rig.position.x,rig.position.z],[x+6,z+7],[x,z],...project.plaza.items.filter(b=>b.role==='floor').map(b=>{
        const center=meshes.get(b.id).geometry.boundingSphere.center;return [center.x,center.z];
    })];
    const spawn=positions.find(([px,pz])=>canWalkBelow(px,pz));
    if(!spawn){leavePlaza();return message('廣場地坪沒有可用的步行位置。');}
    setWalkPose(spawn[0],plazaAltitude()+floorAt(...spawn).roof,spawn[1],1.03,.03);
    $('help').textContent='地下層 · 第二廣場｜WASD 移動，拖曳轉頭；可選取構件編輯。';
    message('地下層 · 第二廣場。租借地坪 13.6 × 17.7 m；柱、格柵與燈具採既有環景估模。街區對位與地表下 '+project.plaza.depth+' m 為展示設定。');
}
function leavePlaza(){
    if(!underground)return;
    underground=false;refreshLayer();walkSurface=null;select(streetReturn.selected);
    const {x,z}=walking?rig.position:streetReturn.position;
    setWalkPose(x,groundAt(project.terrain,x,z),z,streetReturn.yaw,streetReturn.pitch);
    $('help').textContent='街面｜WASD 移動，拖曳轉頭。';message('已回到街面。');
}
$('level').onclick=()=>publicVenue?choosePublicPlaza(''):underground?leavePlaza():enterPlaza();
function walk(){if(walking)return;
    if(publicVenue){
        if(publicVenue.walkable===false)return message('可使用部分仍待核實，請以全覽檢視租借外框。');
        const geometry=meshes.get(selected.id).geometry, coords=geometry.getAttribute('position'),faces=geometry.index;
        let largest=0,spawn;
        for(let i=0;i<faces.count;i+=3){
            const points=[0,1,2].map(j=>{const index=faces.getX(i+j);return [coords.getX(index),coords.getZ(index)];});
            const size=Math.abs(area(...points));
            if(size>largest){largest=size;spawn=[0,1].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/3);}
        }
        if(!spawn)return message('目前的地坪沒有可用的步行位置。');
        setWalkPose(spawn[0],0,spawn[1],.5,-.35);
        $('help').textContent=publicVenue.name+'租借圖｜每格 1 公尺。WASD 在所選輪廓內移動，拖曳轉頭。';
        return;
    }
    if(underground){const [x,z]=project.plaza.anchor;const floor=floorAt(x,z);
        if(floor&&canWalkBelow(x,z)){setWalkPose(x,plazaAltitude()+floor.roof,z,1.03,0);return;}
        leavePlaza();enterPlaza();return;}
    showLevels();walking=true;orbit.enabled=false;marker.visible=false;selectedBoundary.visible=false;const sw=layerOf(selected)?selected:project.sidewalks?.find(b=>b.name.includes('復興南路'))||project.sidewalks?.[0];
    walkSurface=sw;
    if(sw){const triangles=surfaceTriangles(sw);const size=f=>Math.abs(area(...f.map(i=>sw.footprint[i])));const face=triangles.reduce((a,b)=>size(a)>=size(b)?a:b),pts=face.map(i=>sw.footprint[i]);rig.position.set(pts.reduce((n,p)=>n+p[0],0)/3,sw.elevation??0,pts.reduce((n,p)=>n+p[1],0)/3);}else rig.position.set(0,0,0);rig.position.y=walkAltitude();camera.position.set(0,1.65,0);pitch=0;yaw=Math.PI;camera.rotation.set(0,yaw,0,'YXZ');$('help').textContent='WASD 或方向鍵移動，拖曳轉頭。視點沿地形起伏。';canvas.focus();}
function walkAltitude(){
    if(publicVenue)return 0;
    if(underground)return plazaAltitude()+(floorAt(rig.position.x,rig.position.z)?.roof??0);
    if(walkSurface?.elevation!=null){
        const mesh=meshes.get(walkSurface.id);
        if(mesh){
            const ray=new T.Raycaster(new T.Vector3(rig.position.x,walkSurface.elevation+1,rig.position.z),new T.Vector3(0,-1,0));
            if(ray.intersectObject(mesh,false).length)return walkSurface.elevation;
        }
    }
    return groundAt(project.terrain,rig.position.x,rig.position.z);
}
$('all').onclick=overview;$('focus').onclick=focus;$('walk').onclick=walk;
canvas.onpointerdown=e=>{held=[e.clientX,e.clientY,e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(!held)return;if(walking&&!session){invalidate();yaw-=(e.clientX-held[2])*.005;pitch=T.MathUtils.clamp(pitch-(e.clientY-held[3])*.005,-1.35,1.35);camera.rotation.set(pitch,yaw,0,'YXZ');}held[2]=e.clientX;held[3]=e.clientY;};
canvas.onpointerup=e=>{if(held&&!walking&&Math.hypot(e.clientX-held[0],e.clientY-held[1])<4){const r=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);const hits=ray.intersectObjects(Array.from(meshes.values()).filter(m=>m.visible&&m.userData.plaza===underground),false);if(hits.length){const nearest=hits[0].distance;const hit=hits.filter(h=>h.distance-nearest<.0001).sort((a,b)=>b.object.renderOrder-a.object.renderOrder)[0];select(hit.object.name);}}held=null;};
canvas.onpointercancel=()=>{held=null;};
canvas.onkeydown=e=>{if(walking&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());invalidate();}};onkeyup=e=>keys.delete(e.key.toLowerCase());canvas.onblur=()=>keys.clear();
let xrAvailable=false,xrBusy=false,probeNumber=0,xrEyeOffset=0;
const vrButton=$('vr'),vrStatus=$('vr-status');
async function detectXR(){
    if(session||xrBusy)return;
    const probe=++probeNumber;
    let available=false,reason;
    try{
        if(simulationError)reason='未能載入頭顯模擬器，請由本機展示網址開啟。';
        else if(!window.isSecureContext)reason='需要安全連線。請在頭顯瀏覽器以 HTTPS 開啟此頁。';
        else if(!navigator.xr)reason='目前的瀏覽器未提供 WebXR。可用「步行視角」在螢幕上走動。';
        else{
            available=await navigator.xr.isSessionSupported('immersive-vr');
            reason=available?(headsetSimulator?'桌面模擬 · Quest 3 已就緒。按「進入 VR」檢視左右眼。':'頭顯已就緒。'):'目前無法啟動頭顯 VR。可用「步行視角」，或連接頭顯後重新偵測。';
        }
    }catch{reason='目前的瀏覽器無法檢查頭顯權限。可在支援 WebXR 的頭顯瀏覽器開啟此頁。';}
    if(probe!==probeNumber||xrBusy||session)return;
    xrAvailable=available;vrButton.textContent=available?'進入 VR':'重新偵測 VR';vrButton.disabled=false;vrStatus.textContent=reason;
}
function afterXR(xr){
    if(session!==xr)return;
    session=null;renderer.setAnimationLoop(null);invalidate();xrEyeOffset=0;rig.position.y=walkAltitude();camera.position.set(0,1.65,0);camera.rotation.set(pitch,yaw,0,'YXZ');
    vrButton.textContent='進入 VR';vrButton.disabled=false;vrStatus.textContent='已退出 VR，已回到螢幕步行視角。';
}
vrButton.onclick=async()=>{
    if(xrBusy)return;
    if(!session&&publicVenue?.walkable===false)return message('這個廣場的可用範圍待核實，可在圖面全覽檢視。');
    if(!session&&!xrAvailable){
        vrButton.disabled=true;vrStatus.textContent='正在重新偵測頭顯…';await detectXR();
        if(!xrAvailable)vrStatus.textContent='已重新偵測。'+vrStatus.textContent;
        return;
    }
    xrBusy=true;probeNumber++;vrButton.disabled=true;
    let newSession;
    try{
        if(session){await session.end();return;}
        vrStatus.textContent='正在開啟 VR，請查看頭顯內的確認提示。';
        newSession=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});
        walk();cancelAnimationFrame(desktopFrame);desktopFrame=0;session=newSession;
        let floorSpace=true;
        try{await newSession.requestReferenceSpace('local-floor');}catch{floorSpace=false;}
        xrEyeOffset=floorSpace?0:1.65;rig.position.y=walkAltitude()+xrEyeOffset;
        renderer.xr.setReferenceSpaceType(floorSpace?'local-floor':'local');
        newSession.addEventListener('end',()=>afterXR(newSession),{once:true});
        await renderer.xr.setSession(newSession);
        if(session===newSession){renderer.setAnimationLoop(renderFrame);headsetSimulator?.showControls(newSession,canvas);vrButton.textContent='退出 VR';vrStatus.textContent='已進入頭顯 VR。按「退出 VR」或握壓控制器側鍵可離開。';}
    }catch(e){
        if(newSession){await newSession.end().catch(()=>{});afterXR(newSession);}
        if(e.name==='NotAllowedError'||e.name==='SecurityError')vrStatus.textContent='未取得 VR 權限。確認頭顯提示或瀏覽器權限後可再試。';
        else vrStatus.textContent='VR 工作階段未能完成：'+(e.message||e.name);
    }finally{xrBusy=false;vrButton.disabled=false;}
};
navigator.xr?.addEventListener?.('devicechange',detectXR);
window.addEventListener('focus',detectXR);
void detectXR();
for(let i=0;i<2;i++)renderer.xr.getController(i).addEventListener('squeezestart',()=>session?.end());
const observer=new ResizeObserver(()=>{const w=canvas.clientWidth,h=canvas.clientHeight;if(!session&&w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate();}});observer.observe(canvas);
const embedded=$('project-data');
const stationLink=$('station-link');
let editorPromise,signalReady,signalFailure;
function ensureStationEditor(){
    if(editorPromise)return editorPromise;
    const frame=document.createElement('iframe');
    frame.id='station-frame';frame.title='忠孝復興站與東區地下街步行工坊';
    frame.hidden=true;frame.allow='xr-spatial-tracking; fullscreen';
    const ready=new Promise((resolve,reject)=>{
        signalReady=()=>resolve(frame.contentWindow.lumiereStationEditor);
        signalFailure=reason=>reject(Error(reason));
    });
    const timer=setTimeout(()=>signalFailure('地下層編輯器載入逾時，請再試一次。'),30000);
    editorPromise=ready.catch(error=>{
        frame.remove();editorPromise=null;
        throw error;
    }).finally(()=>clearTimeout(timer));
    frame.onerror=()=>signalFailure('無法開啟地下層編輯器。');
    const packed=$('station-editor-data');
    if(packed){
        frame.srcdoc=JSON.parse(packed.textContent).replace('<!--workspace-imports-->',()=>importMapTag(packedImports));
    }else frame.src='station/index.html';
    document.body.append(frame);
    return editorPromise;
}
function returnToStreet(){
    const frame=$('station-frame');
    if(!frame||frame.hidden)return;
    if(frame.contentWindow.lumiereStationEditor?.isPresenting())throw Error('請先退出地下層 VR。');
    frame.hidden=true;$('street-editor').hidden=false;
    if(Object.hasOwn(stationEntries,location.hash))window.history.replaceState(null,'',location.pathname+location.search+(underground?'#plaza':''));
    stationLink.focus();invalidate();
}
async function showStation(enter){
    if(session||xrBusy)return message('請先退出街區 VR 再檢視地下層圖面。');
    const wasOnStreet=!$('street-editor').hidden;
    stationLink.disabled=true;
    try{
        const editor=await ensureStationEditor();
        if(session||xrBusy)throw Error('請先退出街區 VR 再檢視地下層圖面。');
        if(editor.isPresenting())throw Error('請先退出目前的 VR 再切換檢視。');
        keys.clear();$('street-editor').hidden=true;
        const frame=$('station-frame');frame.hidden=false;
        frame.contentWindow.focus();
        editor.resumeWorkshop();
        if(enter)enter(editor);
    }catch(error){
        const frame=$('station-frame');
        if(wasOnStreet&&frame){frame.hidden=true;$('street-editor').hidden=false;stationLink.focus();}
        if(frame&&!frame.hidden)frame.contentWindow.lumiereStationEditor?.showMessage(error.message);
        else message(error);
    }
    finally{stationLink.disabled=false;}
}
window.lumiereStationHost={
    loadStudy:()=>project.stationStudy,
    publicGeometryRevision:()=>publicGeometryRevision,
    loadPublicAreas:()=>structuredClone({
        leasePart:project.publicPlazas.plazas.find(p=>p.id==='dinghao')?.parts.find(p=>p.id==='dinghao-lease')??null,
        indoorPlaza:project.plaza??null
    }),
    editIndoorPlaza(id){
        if(!project.plaza)return;
        returnToStreet();
        if(publicVenue)choosePublicPlaza('');
        if(!underground)enterPlaza();
        const item=project.plaza.items.find(item=>item.id===id)??project.plaza.items.find(item=>item.role==='floor');
        select(item.id);focus();
        window.history.replaceState(null,'',location.pathname+location.search+'#plaza');
    },
    editDinghaoLease(){
        returnToStreet();
        if(location.hash==='#venue-dinghao')choosePublicPlaza('dinghao');
        else location.hash='venue-dinghao';
    },
    updateStudy:study=>{project.stationStudy=study;},
    returnToStreet,
    saveProject:()=>$('save').click(),
    openProject:()=>$('load').click(),
    exportProject:()=>$('export').click(),
    headset,simulatorUrl:simulatorPath,
    editorReady:()=>signalReady?.(),
    editorFailed:reason=>signalFailure?.(reason)
};
async function readModel(file){
    const result=await fetch(file);
    if(!result.ok)throw Error('無法載入 '+file);
    return result.json();
}
const [initialProject,builtInStudy,builtInPlazas]=embedded?[JSON.parse(embedded.textContent),null,null]:
    await Promise.all([readModel('fuxing.envelopes.json'),readModel('station/levels.json'),readModel('plazas.json')]);
const defaultStudy=builtInStudy??structuredClone(initialProject.stationStudy);
const defaultPlazas=builtInPlazas??structuredClone(initialProject.publicPlazas);
if(!Object.hasOwn(initialProject,'stationStudy'))initialProject.stationStudy=structuredClone(defaultStudy);
const originalOverlaps=new Map(initialProject.buildings.filter(b=>b.roadOverlapFraction>=.8).map(b=>[b.id,b.roadOverlapFraction]));
const originalBases=new Map(initialProject.buildings.map(b=>[b.id,b.sourceBase??b.base]));
install(initialProject);if(layerOf(selected))focus();else overview();
stationLink.disabled=false;stationLink.onclick=()=>showStation();
const stationEntries={
    '#station':null,
    '#plaza-walk':editor=>editor.beginPlazaWalk(),
    '#b3-walk':editor=>editor.beginFloorWalk('B3'),
    '#b4-walk':editor=>editor.beginFloorWalk('B4'),
    '#b3-stairs':editor=>editor.beginAtriumWalk('top'),
    '#b4-stairs':editor=>editor.beginAtriumWalk('bottom'),
    '#mall-stairs':editor=>editor.beginStreetEntryWalk('bottom'),
    '#street-stairs':editor=>editor.beginStreetEntryWalk('top'),
    '#b4-escalator':editor=>editor.beginEscalatorWalk('b4-escalator'),
    '#exit14-up':editor=>editor.beginEscalatorWalk('exit14-escalator-left'),
    '#exit14-down':editor=>editor.beginEscalatorWalk('exit14-escalator-right')
};
function openLocation(){
    const hash=location.hash;
    if(Object.hasOwn(stationEntries,hash))return void showStation(stationEntries[hash]);
    const frame=$('station-frame');
    if(frame&&!frame.hidden){
        if(frame.contentWindow.lumiereStationEditor?.isPresenting())return message('退出 VR 後可切換場景。');
        returnToStreet();
    }
    if(hash.startsWith('#venue-'))return choosePublicPlaza(hash.slice(7));
    if(publicVenue)choosePublicPlaza('');
    if(hash==='#plaza')enterPlaza();
    else if(!hash&&underground)leavePlaza();
}
window.addEventListener('hashchange',openLocation);
openLocation();
let last=0;const forward=new T.Vector3(),up=new T.Vector3(0,1,0),right=new T.Vector3();
function renderFrame(t){
    desktopFrame=0;
    const dt=Math.min(.1,(t-last)/1000);
    last=t;
    if(walking&&(keys.size||session)){const has=(a,b)=>Number(keys.has(a)||keys.has(b));let f=has('w','arrowup')-has('s','arrowdown'),s=has('d','arrowright')-has('a','arrowleft');
    if(session){const pad=Array.from(session.inputSources).find(q=>q.gamepad&&q.handedness==='left')?.gamepad;if(pad){s+=pad.axes.at(-2)||0;f-=pad.axes.at(-1)||0;}}
    (session?renderer.xr.getCamera():camera).getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,up);const k=dt*3/Math.max(1,Math.hypot(f,s));const dx=(forward.x*f+right.x*s)*k,dz=(forward.z*f+right.z*s)*k;
    const canMove=(x,z)=>publicVenue?canTraverse(selected,rig.position.x,rig.position.z,x,z):!underground||canWalkBelow(x,z);
    if(canMove(rig.position.x+dx,rig.position.z))rig.position.x+=dx;
    if(canMove(rig.position.x,rig.position.z+dz))rig.position.z+=dz;
    rig.position.y=walkAltitude()+xrEyeOffset;}
    renderer.render(scene,camera);
    canvas.dataset.section=String(renderer.clippingPlanes.length>0);
    canvas.dataset.eyes=String(session?renderer.xr.getCamera().cameras.length:0);
    canvas.dataset.position=rig.position.toArray().join(',');
    if(walking&&keys.size)invalidate();
}
started=true;
invalidate();
document.body.dataset.ready='true';
