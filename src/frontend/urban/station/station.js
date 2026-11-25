import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createStationAppearance} from './appearance.js';
import {blockedByFootprint} from '../public-plazas.js';
import {createStreetEntryKit,defaultStreetEntrySpec,normalizeStreetEntrySpec} from './street-entry.js';
import {attachPlazaInterior} from './plaza-interior.js';

const $=id=>document.getElementById(id);
const embedded=$('project-data');
// The street workshop supplies this bridge only to its same-origin station frame.
// A standalone page (including a cross-origin embed) owns its model and file actions.
function resolveHost(){
    try{
        if(window.parent===window)return null;
        const candidate=window.parent.lumiereStationHost;
        const methods=['loadStudy','updateStudy','returnToStreet','saveProject','openProject','exportProject'];
        return methods.every(key=>typeof candidate?.[key]==='function')?candidate:null;
    }catch{return null;}
}
const host=resolveHost();
const canvas=document.querySelector('canvas');
const status=message=>{$('status').textContent=message;};
const entryId='dinghao-exit14';
const colors={B3:0x397f74,B4:0xb97543,[entryId]:0xaea69c};
const ink={B3:0x143f3a,B4:0x74421f,[entryId]:0x56463e};
const scene=new T.Scene();
scene.background=new T.Color(0xe3ece8);
const exitInterior=new T.Color(0xd2cec1),exitDaylight=new T.Color(0xc7deeb);
const ambient=new T.HemisphereLight(0xfffaf0,0xb0a99e,1.8);
const keyLight=new T.DirectionalLight(0xfff8e9,1.2);keyLight.position.set(1,3,1.3);
scene.add(ambient,keyLight);
const camera=new T.PerspectiveCamera(39,1,.015,45);
const renderer=new T.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.xr.enabled=true;
const orbit=new OrbitControls(camera,canvas);
const stage=new T.Group();
scene.add(stage);
const marker=new T.Mesh(new T.SphereGeometry(.012,12,8),new T.MeshBasicMaterial({color:0xea4d33}));
stage.add(marker);
let model,level,piece,points=[],single=false,session,simulator,frame=0,xrPending=false;
let undo=[];
const levelGroups=new Map();
const previewScale=.0025; // Metres on the VR display table per PDF point, independent of the physical station.
let walk=null,previousTime=0,drag=null;
const keys=new Set(),walkKeys=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const eyePoints=8,pointsPerSecond=20,immersiveMetresPerPoint=.2;
const appearanceCache=new Map();
let entryLevel=null,pendingEntryKit=null,entryHistory=[];
let leasePart=null,indoorPlaza=null,publicRevision=-1;
let appearance=null,appearanceUndo=[];
let stairHistory=[];
let originalEdits=false;
const drawingCaption='地坪格線每格 10 圖點。水平比例待核實，步速及視點高度採相對顯示值。';
const interiorCaption='影像推定的局部空間，構件位置與地坪比例仍待實測。';
function draw(time,xrFrame){
    frame=0;
    if(walk){
        const elapsed=previousTime?Math.min(.4,Math.max(0,(time-previousTime)/1000)):0;
        const seconds=Math.min(.06,elapsed);
        const moving=appearance?.escalators?.length && !window.frameElement?.hidden;
        const riding=walk.onStair?.escalatorId;
        if(moving){
            for(const belt of appearance.escalators)belt.update(elapsed);
            if(riding)carryRider(appearance.carriers.get(riding),elapsed);
            if(time-(walk.lastPhaseTime??-Infinity)>=150){
                const belt=appearance.carriers.get(riding)??appearance.escalators[0];
                canvas.dataset.escalatorPhase=belt.phase.toFixed(4);
                walk.lastPhaseTime=time;
            }
        }
        if(session&&xrFrame)updateImmersiveWalk(xrFrame,seconds);
        else if(!session){
            if(keys.size)moveFromKeys(seconds);
            if(keys.size||riding)placeDesktopEye();
            if(keys.size||moving)invalidate();
        }
    }
    previousTime=time;
    renderer.render(scene,camera);
    canvas.dataset.eyes=String(session?renderer.xr.getCamera().cameras.length:0);
}
function invalidate(){if(!session&&!frame)frame=requestAnimationFrame(draw);}
orbit.addEventListener('change',invalidate);
canvas.addEventListener('webglcontextrestored',invalidate);

function contours(commands){
    const rings=[];
    let path=null;
    const lengths={M:3,L:3,C:7,Z:1};
    if(!Array.isArray(commands)||commands.length>2000)throw Error('輪廓長度無效');
    for(const command of commands){
        if(!Array.isArray(command)||lengths[command[0]]!==command.length||
            !command.slice(1).every(v=>Number.isFinite(v)&&Math.abs(v)<10000))throw Error('輪廓座標無效');
        const [op,...args]=command;
        if(op==='M'){
            if(path)throw Error('輪廓未閉合');
            path=new T.Path();path.moveTo(...args);
        }else{
            if(!path)throw Error('輪廓缺少起點');
            if(op==='L')path.lineTo(...args);
            if(op==='C')path.bezierCurveTo(...args);
            if(op==='Z'){
                path.closePath();
                const ring=path.getPoints(24).filter((v,i,all)=>i===0||!v.equals(all[i-1]));
                if(ring.length&&ring[0].equals(ring.at(-1)))ring.pop();
                if(ring.length<3||Math.abs(T.ShapeUtils.area(ring))<.001)throw Error('輪廓面積不足');
                rings.push(ring);path=null;
            }
        }
    }
    if(path||!rings.length)throw Error('輪廓未閉合');
    return rings.sort((a,b)=>Math.abs(T.ShapeUtils.area(b))-Math.abs(T.ShapeUtils.area(a)));
}
function makePiece(item,id,height){
    const [outer,...holes]=contours(item.path);
    const shape=new T.Shape(outer);
    shape.holes=holes.map(ring=>new T.Path(ring));
    const geometry=new T.ShapeGeometry(shape);
    const position=geometry.getAttribute('position'),index=geometry.index;
    let area=0;
    for(let i=0;i<index.count;i+=3){
        const [a,b,c]=[index.getX(i),index.getX(i+1),index.getX(i+2)];
        area+=Math.abs((position.getX(b)-position.getX(a))*(position.getY(c)-position.getY(a))-
            (position.getY(b)-position.getY(a))*(position.getX(c)-position.getX(a)))/2;
    }
    const expected=Math.abs(T.ShapeUtils.area(outer))-holes.reduce((n,h)=>n+Math.abs(T.ShapeUtils.area(h)),0);
    if(expected<=0||Math.abs(expected-area)>Math.max(.01,expected*.00002)){
        geometry.dispose();throw Error('此輪廓無法形成保留孔洞的地坪');
    }
    geometry.rotateX(Math.PI/2);
    const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({color:colors[id],side:T.DoubleSide,
        polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
    mesh.name=item.id;
    mesh.userData.levelId=id;
    mesh.userData.boundaries=[outer,...holes];
    for(const ring of [outer,...holes]){
        const line=new T.LineLoop(new T.BufferGeometry().setFromPoints(ring.map(v=>new T.Vector3(v.x,0,v.y))),
            new T.LineBasicMaterial({color:ink[id]}));
        mesh.add(line);
    }
    if(id==='B3')clearanceEnvelope(mesh,outer,height);
    return mesh;
}
// A dashed envelope visualizes the photo-derived clearance. It is not a surveyed ceiling or wall.
function clearanceEnvelope(mesh,ring,height){
    const geo=new T.BufferGeometry().setFromPoints([...ring,ring[0]].map(p=>new T.Vector3(p.x,0,p.y)));
    const edge=new T.Line(geo,new T.LineDashedMaterial({color:0x478b80,dashSize:3,gapSize:2}));
    edge.name='clearance';edge.computeLineDistances();
    edge.position.y=height*.05/previewScale;mesh.add(edge);
    const left=ring.reduce((a,b)=>a.x<b.x?a:b),right=ring.reduce((a,b)=>a.x>b.x?a:b);
    const guides=new T.LineSegments(new T.BufferGeometry().setFromPoints([left,right].flatMap(p=>[
        new T.Vector3(p.x,0,p.y),new T.Vector3(p.x,1,p.y)
    ])),new T.LineBasicMaterial({color:0x7ba69c}));
    const cap=new T.Mesh(mesh.geometry,new T.MeshBasicMaterial({color:0x79baae,transparent:true,opacity:.12,
        depthWrite:false,side:T.DoubleSide}));
    cap.name='clearance-cap';cap.position.y=edge.position.y;mesh.add(cap);
    guides.name='height-guides';guides.scale.y=edge.position.y;mesh.add(guides);
}
function heightLabel(caption){
    const sheet=document.createElement('canvas');sheet.width=640;sheet.height=90;
    const ctx=sheet.getContext('2d');ctx.fillStyle='#edf4ef';ctx.fillRect(0,0,640,90);
    ctx.font='bold 42px Microsoft JhengHei, sans-serif';ctx.fillStyle='#214943';ctx.textAlign='center';
    ctx.textBaseline='middle';ctx.fillText(caption,320,45);
    const map=new T.CanvasTexture(sheet);map.colorSpace=T.SRGBColorSpace;
    const label=new T.Sprite(new T.SpriteMaterial({map,depthTest:false}));
    label.scale.set(.37,.052,1);label.center.set(0,.5);label.renderOrder=5;return label;
}
const gauge=new T.Group();stage.add(gauge);
function drawGauge(){
    gauge.visible=!single;
    for(const o of gauge.children){o.material?.map?.dispose();dispose(o);}
    gauge.clear();
    if(single)return;
    const gap=model.heightStudy.floorSeparation.metres,clear=model.heightStudy.concourseClearance.metres;
    const bottom=-gap*.05/2,mid=-bottom,top=mid+clear*.05;
    const points=[new T.Vector3(-.84,bottom,.22),new T.Vector3(-.84,top,.22)];
    for(const y of [bottom,mid,top])points.push(new T.Vector3(-.86,y,.22),new T.Vector3(-.82,y,.22));
    gauge.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0x41645e})));
    for(const [y,title] of [[(bottom+mid)/2,'地坪高差 '+gap+' m'],[(mid+top)/2,'局部淨高 '+clear+' m']]){
        const label=heightLabel(title);label.position.set(-.82,y,.22);gauge.add(label);
    }
}
function dispose(object){
    object.traverse(child=>{child.geometry?.dispose();child.material?.dispose();});
}
function build(data){
    if(data?.format!=='lumiere-drawing-levels'||data.version!==1||data.units!=='PDF points'||
        data.metresPerDrawingUnit!==null||data.levels?.length!==2)throw Error('請選擇此工坊的地下層模型');
    const height=data.heightStudy?.concourseClearance?.metres,rise=data.heightStudy?.floorSeparation?.metres;
    if(!validHeights(height,rise))throw Error('高度參數無效');
    if(Object.hasOwn(data,'atriumStairs')&&!validStairSpec(data.atriumStairs))throw Error('局部樓梯的尺寸參數無效。');
    if(Object.hasOwn(data,'appearanceEdits')){
        const edits=data.appearanceEdits;
        if(!edits||Array.isArray(edits)||typeof edits!=='object'||Object.keys(edits).length>1600||
            !Object.entries(edits).every(([key,value])=>key.length>0&&key.length<=160&&
                !['__proto__','constructor','prototype'].includes(key)&&validAppearancePose(value)))throw Error('局部外觀構件的變更資料無效。');
    }
    const result=new Map(),ids=new Set();
    try{
        for(const l of data.levels){
            if(!['B3','B4'].includes(l.id)||result.has(l.id)||typeof l.name!=='string'||l.surveyElevationMetres!==null||
                !Array.isArray(l.pieces)||!l.pieces.length||l.pieces.length>25)throw Error('樓層格式錯誤');
            const group=new T.Group();result.set(l.id,group);
            for(const item of l.pieces){
                if(typeof item.id!=='string'||ids.has(item.id)||typeof item.name!=='string')throw Error('構件識別資料錯誤');
                ids.add(item.id);group.add(makePiece(item,l.id,height));
            }
            const center=new T.Box3().setFromObject(group).getCenter(new T.Vector3());
            group.scale.setScalar(previewScale);
            group.position.set(-center.x*previewScale,0,-center.z*previewScale);
        }
        return result;
    }catch(e){for(const group of result.values())dispose(group);throw e;}
}
function install(data){
    const next=build(data);
    if(walk)endWalk();
    for(const mesh of [...appearanceCache.keys()])releaseKit(mesh);
    appearanceUndo=[];originalEdits=Object.hasOwn(data,'appearanceEdits');
    for(const group of levelGroups.values()){stage.remove(group);dispose(group);}
    levelGroups.clear();model=data;entryLevel=null;pendingEntryKit=null;entryHistory=[];
    for(const [id,group] of next){stage.add(group);levelGroups.set(id,group);}
    $('level').replaceChildren(...model.levels.map(l=>new Option(l.id+' '+l.name,l.id)));
    $('clear').value=data.heightStudy.concourseClearance.metres;$('rise').value=data.heightStudy.floorSeparation.metres;
    const range=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)?value.join('–')+' m':'範圍未提供';
    $('height-basis').textContent='影像初估的局部淨高 '+range(data.heightStudy.concourseClearance.range)+'，地坪高差 '+range(data.heightStudy.floorSeparation.range)+'。';
    stairHistory=[];showStairSpec();undo=[];$('undo').disabled=true;selectLevel();view(false);
}
function selectLevel(){
    level=model.levels.find(l=>l.id===$('level').value);
    displayStudy(false);
    $('piece').disabled=false;
    $('piece').replaceChildren(...level.pieces.map(item=>new Option(item.name,item.id)));
    selectPiece();layout();
}
function selectPiece(){
    piece=level.pieces.find(i=>i.id===$('piece').value);
    points=[];
    piece.path.forEach((c,index)=>{
        for(let offset=1;offset<c.length;offset+=2){
            const type=c[0]==='C'&&offset<5?'曲線控制點':'輪廓點';
            points.push({index,offset,type});
        }
    });
    $('point').replaceChildren(...points.map((p,i)=>new Option(p.type+' '+(i+1),i)));
    selectPoint();
    if(walk)chooseWalkFloor();
}
function selectPoint(){
    const {index,offset}=points[+$('point').value];
    const cmd=piece.path[index];
    $('x').value=cmd[offset];$('y').value=cmd[offset+1];
    updateMarker();
}
function updateMarker(){
    const [x,y]=[+$('x').value,+$('y').value],group=levelGroups.get(level.id);
    marker.position.set(group.position.x+x*previewScale,group.position.y+.009,group.position.z+y*previewScale);
    marker.visible=!session&&!walk;invalidate();
}
function layout(){
    for(const [id,group] of levelGroups){
        group.visible=id===entryId||level.id===entryId?id===level.id:!single||id===level.id;
        const split=model.heightStudy.floorSeparation.metres*.05/2;
        group.position.y=single?0:id==='B3'?split:-split;
        for(const mesh of group.children){
            mesh.visible=!walk||mesh===walk.mesh;
            for(const child of mesh.children){
                if(child.name==='clearance'||child.name==='clearance-cap'){child.position.y=model.heightStudy.concourseClearance.metres*.05/previewScale;child.visible=!single;}
                if(child.name==='height-guides'){child.scale.y=model.heightStudy.concourseClearance.metres*.05/previewScale;child.visible=!single;}
            }
        }
    }
    drawGauge();updateMarker();
    canvas.dataset.mode=walk?'walk':single?'plan':'overview';
    $('both').setAttribute('aria-pressed',String(!single&&!walk));$('single').setAttribute('aria-pressed',String(single&&!walk));
}
function view(one){
    if(session||xrPending)return;
    if(walk)endWalk();
    single=one;layout();
    const distance=Math.max(1,1/camera.aspect);
    orbit.target.set(0,0,0);
    camera.position.set(...(one?[0,2.6*distance,.0001]:[.42*distance,1.15*distance,2.4*distance]));
    orbit.update();invalidate();
}
// Keep walking coordinates in the same PDF units as the editable triangulated surface.
function interiorPoint(mesh){
    const geometry=mesh.geometry,pos=geometry.attributes.position,indices=geometry.index;
    const vertices=[new T.Vector2(),new T.Vector2(),new T.Vector2()];
    const center=new T.Vector2();let largestRadius=0;
    for(let i=0;i<indices.count;i+=3){
        for(let j=0;j<3;j++){
            const k=indices.getX(i+j);vertices[j].set(pos.getX(k),pos.getZ(k));
        }
        const [a,b,c]=vertices,bc=b.distanceTo(c),ca=c.distanceTo(a),ab=a.distanceTo(b);
        const perimeter=ab+bc+ca;
        const radius=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/perimeter;
        if(radius>largestRadius){
            largestRadius=radius;
            center.copy(a).multiplyScalar(bc).addScaledVector(b,ca).addScaledVector(c,ab).divideScalar(perimeter);
        }
    }
    return center;
}
function distanceToEdge(point,dx,dy){
    let limit=Infinity;
    for(const ring of walk.mesh.userData.boundaries){
        for(let i=0,j=ring.length-1;i<ring.length;j=i++){
            const a=ring[j],b=ring[i],sx=b.x-a.x,sy=b.y-a.y;
            const det=dx*sy-dy*sx;if(Math.abs(det)<1e-10)continue;
            const ax=a.x-point.x,ay=a.y-point.y;
            const along=(ax*sy-ay*sx)/det,edge=(ax*dy-ay*dx)/det;
            if(along>=0&&edge>=-1e-9&&edge<=1+1e-9)limit=Math.min(limit,along);
        }
    }
    return limit;
}
function moveOnFloor(dx,dy){
    const length=Math.hypot(dx,dy);if(!length)return;
    const ux=dx/length,uy=dy/length;
    // Sweep the whole segment: even a long move may not hop a narrow hole.
    const startedOnStair=Boolean(walk.onStair);
    const entryWalk=level.id===entryId&&Boolean(appearance);
    const available=startedOnStair||entryWalk?Infinity:Math.max(0,distanceToEdge(walk.point,ux,uy)-.001);
    const travel=Math.min(length,available);
    if(!appearance){walk.point.x+=ux*travel;walk.point.y+=uy*travel;return;}
    // Check intermediate positions too, including a tracked headset moving quickly.
    const pieces=Math.max(1,Math.ceil(travel/.4));
    for(let i=0;i<pieces;i++){
        if(!entryWalk&&startedOnStair&&!walk.onStair&&distanceToEdge(walk.point,ux,uy)<travel/pieces+.001)break;
        const next=new T.Vector2(walk.point.x+ux*travel/pieces,walk.point.y+uy*travel/pieces);
        if(!canStepTo(next))break;
        walk.point.copy(next);
    }
}
function moveRelative(side,forward,yaw,distance){
    const norm=Math.max(1,Math.hypot(side,forward)),s=Math.sin(yaw),c=Math.cos(yaw);
    moveOnFloor((side*c-forward*s)*distance/norm,(-side*s-forward*c)*distance/norm);
}
function moveFromKeys(seconds){
    const held=(...names)=>Number(names.some(name=>keys.has(name)));
    moveRelative(held('d','arrowright')-held('a','arrowleft'),held('w','arrowup')-held('s','arrowdown'),walk.yaw,seconds*pointsPerSecond);
}
function walkingGrid(){
    const tile=document.createElement('canvas');tile.width=128;tile.height=128;
    const ctx=tile.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,128,128);
    ctx.strokeStyle='#a8b6b2';ctx.lineWidth=2;ctx.strokeRect(0,0,128,128);
    const map=new T.CanvasTexture(tile);map.colorSpace=T.SRGBColorSpace;
    map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(.1,.1);
    map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return map;
}
const grid=walkingGrid();
function validAppearancePose(value){
    return !!value&&['x','y','z'].every(k=>Number.isFinite(value[k])&&Math.abs(value[k])<=1000)&&
        Number.isFinite(value.scale)&&value.scale>=.05&&value.scale<=12;
}
function setAppearancePose(entry,pose=entry.original){
    entry.node.position.set(pose.x,pose.y,pose.z);
    entry.node.scale.copy(entry.baseScale).multiplyScalar(pose.scale);
}
function entryFor(id,name,node,group,sourcePart=null){
    const {x,y,z}=node.position;
    const entry={id,name,node,group,sourcePart,baseScale:node.scale.clone(),original:{x,y,z,scale:1}};
    if(!sourcePart&&Object.hasOwn(model.appearanceEdits??{},id))setAppearancePose(entry,model.appearanceEdits[id]);
    return entry;
}
function releaseKit(mesh){
    const kit=appearanceCache.get(mesh);if(!kit)return;
    kit.root.removeFromParent();const resources=new Set([kit.floorMap]);
    kit.root.traverse(node=>{
        if(node.isInstancedMesh)node.dispose();
        if(node.geometry)resources.add(node.geometry);
        for(const mat of ([]).concat(node.material??[])){
            resources.add(mat);for(const data of Object.values(mat))if(data?.isTexture)resources.add(data);
        }
    });
    for(const resource of resources)resource?.dispose();
    appearanceCache.delete(mesh);
}
function getKit(){
    if(appearanceCache.has(walk.mesh))return appearanceCache.get(walk.mesh);
    const anchor=walk.anchor,angle=walk.entryYaw,c=Math.cos(angle),s=Math.sin(angle);
    const lengths={left:[-c,s],right:[c,-s],forward:[-s,-c],back:[s,c]};
    const bounds=Object.fromEntries(Object.entries(lengths).map(([k,dir])=>[k,distanceToEdge(anchor,...dir)*immersiveMetresPerPoint]));
    bounds.clear=model.heightStudy.concourseClearance.metres;bounds.rise=model.heightStudy.floorSeparation.metres;
    bounds.stairSpec=model.atriumStairs;
    const kit=level.id===entryId?(pendingEntryKit??makeEntryKit()):createStationAppearance(level.id,bounds);
    if(level.id===entryId)pendingEntryKit=null;
    kit.anchor=anchor.clone();kit.c=c;kit.s=s;
    kit.root=new T.Group();kit.root.name='local-image-study';
    kit.root.position.set(anchor.x,0,anchor.y);kit.root.scale.setScalar(1/immersiveMetresPerPoint);kit.root.rotation.y=angle;
    kit.groups=new Map();kit.items=new Map();kit.solids=[];
    for(const spec of kit.objects){
        const sourcePart=spec.canonicalLease?'dinghao-lease':spec.canonicalPlazaId;
        if(!kit.groups.has(spec.group)){
            const node=new T.Group();kit.root.add(node);
            kit.groups.set(spec.group,entryFor('@'+level.id+'/'+spec.group,spec.group,node,spec.group,spec.canonicalPlazaId?'indoor-plaza':sourcePart));
        }
        const entry=entryFor(spec.id,spec.name,spec.mesh,spec.group,sourcePart);
        kit.items.set(entry.id,entry);kit.groups.get(spec.group).node.add(entry.node);
        entry.node.userData.appearanceId=entry.id;if(spec.solid)kit.solids.push(entry);
    }
    const helper=new T.Box3Helper(new T.Box3(),0xf1a32c);helper.visible=false;
    helper.material.depthTest=false;helper.renderOrder=9;kit.root.add(helper);kit.highlight=helper;
    walk.mesh.add(kit.root);
    if(kit.floorMap){
        const texture=kit.floorMap,rx=texture.repeat.x,ry=texture.repeat.y;
        texture.matrixAutoUpdate=false;
        texture.matrix.set(rx*c,-rx*s,-rx*(anchor.x*c-anchor.y*s),ry*s,ry*c,-ry*(anchor.x*s+anchor.y*c),0,0,1);
    }
    appearanceCache.set(walk.mesh,kit);refreshBounds(kit);
    return kit;
}
function validStairSpec(spec){
    const within=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
    return !!spec&&Number.isInteger(spec.steps)&&within(spec.steps,6,128)&&within(spec.treadDepth,.15,.55)&&
        within(spec.middleLength,.3,4)&&within(spec.width,.6,5);
}
function showStairSpec(){
    const spec=model.atriumStairs??{
        steps:Math.min(128,Math.max(6,2*Math.round(model.heightStudy.floorSeparation.metres/.34))),
        treadDepth:.285,middleLength:1.4,width:appearance?.stairs?.width??2.05
    };
    for(const key of Object.keys(spec))if($('stair-'+key))$('stair-'+key).value=spec[key];
    $('stair-undo').disabled=!stairHistory.length;
}
function replaceStairSpec(spec){
    const active=Boolean(appearance?.stairs)&&level.id==='B4';
    const oldStair=active?appearance.stairs:null;
    const traveller=active?captureFooting():null;
    const oldDeck=traveller?.deckId&&appearance.decks.find(d=>d.id===traveller.deckId);
    const oldBelt=traveller?.escalatorId&&appearance.carriers.get(traveller.escalatorId);
    if(active)releaseWalkStyle();
    for(const mesh of [...appearanceCache.keys()])if(mesh.userData.levelId==='B4')releaseKit(mesh);
    if(spec)model.atriumStairs={...spec};else delete model.atriumStairs;
    if(active){
        useWalkStyle();
        if(oldDeck){
            const deck=appearance.decks.find(d=>d.id===traveller.deckId);
            traveller.point.x*=deck.halfWidth/oldDeck.halfWidth;
            traveller.point.z*=deck.halfDepth/oldDeck.halfDepth;
        }else if(oldBelt){
            resizeRiderFooting(traveller,oldBelt);
        }else if(traveller){
            const stair=appearance.stairs,p=traveller.point,d=-p.z;
            const onLanding=d>=oldStair.run;
            const oldWidth=onLanding?(p.x<0?oldStair.topLeft:oldStair.topRight):oldStair.width/2;
            const newWidth=onLanding?(p.x<0?stair.topLeft:stair.topRight):stair.width/2;
            p.x*=newWidth/oldWidth;p.z=onLanding?-stair.run-(d-oldStair.run)/oldStair.landingDepth*stair.landingDepth:-d/oldStair.run*stair.run;
        }
        refreshFooting(traveller);
    }
    showStairSpec();syncProject();
}
$('stair-apply').onclick=()=>{
    if(session||xrPending)return;
    const spec=Object.fromEntries(['steps','treadDepth','middleLength','width'].map(k=>[k,$('stair-'+k).valueAsNumber]));
    if(!validStairSpec(spec))return status('請輸入 6–128 級、踏深 0.15–0.55 m、平台 0.3–4 m、梯寬 0.6–5 m。');
    stairHistory.push(model.atriumStairs);if(stairHistory.length>60)stairHistory.shift();
    replaceStairSpec(spec);status('樓梯網格與行走面已依尺寸重建。');
};
$('stair-undo').onclick=()=>{
    if(!stairHistory.length||session||xrPending)return;
    replaceStairSpec(stairHistory.pop());status('已復原局部樓梯尺寸。');
};
function localBounds(node,kit){
    const inverse=kit.root.matrixWorld.clone().invert(),result=new T.Box3();
    node.traverse(child=>{
        if(!child.geometry)return;
        const shape=child.isInstancedMesh?child:child.geometry;
        if(!shape.boundingBox)shape.computeBoundingBox();
        result.union(shape.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,child.matrixWorld)));
    });
    return result;
}
function refreshBounds(kit){
    kit.root.updateWorldMatrix(true,true);
    kit.barriers=[];
    for(const entry of kit.solids){
        const {barriers:segments,obstacleFootprint}=entry.node.userData;
        if(obstacleFootprint){
            const {rings,bottom,top}=obstacleFootprint;
            const matrix=kit.root.matrixWorld.clone().invert().multiply(entry.node.matrixWorld);
            const box=new T.Box3(),v=new T.Vector3();
            for(const ring of rings)for(const [x,z] of ring){
                box.expandByPoint(v.set(x,bottom,z));box.expandByPoint(v.set(x,top,z));
            }
            box.applyMatrix4(matrix);
            box.obstacle={part:{footprint:rings[0],holes:rings.slice(1)},inverse:matrix.clone().invert(),
                clearance:.07/Math.hypot(matrix.elements[0],matrix.elements[2])};
            kit.barriers.push(box);
        }else if(segments){
            const matrix=kit.root.matrixWorld.clone().invert().multiply(entry.node.matrixWorld);
            kit.barriers.push(...segments.map(b=>b.clone().applyMatrix4(matrix)));
        }else kit.barriers.push(localBounds(entry.node,kit));
    }
    if(kit.stairs){
        const node=kit.items.get(kit.stairs.objectId).node;
        kit.stairMatrix=kit.root.matrixWorld.clone().invert().multiply(node.matrixWorld);
        kit.inverseStairMatrix=kit.stairMatrix.clone().invert();
    }
    kit.carriers=new Map();
    for(const belt of kit.escalators??[]){
        const node=kit.items.get(belt.objectId).node;
        belt.matrix=kit.root.matrixWorld.clone().invert().multiply(node.matrixWorld);
        belt.inverse=belt.matrix.clone().invert();
        kit.carriers.set(belt.objectId,belt);
    }
    for(const deck of kit.decks??[]){
        const node=kit.items.get(deck.objectId??deck.id).node;
        deck.matrix=kit.root.matrixWorld.clone().invert().multiply(node.matrixWorld);
        if(deck.centerX||deck.centerY||deck.centerZ){
            deck.matrix.multiply(new T.Matrix4().makeTranslation(deck.centerX??0,deck.centerY??0,deck.centerZ??0));
        }
        deck.inverse=deck.matrix.clone().invert();
    }
}
function toKit(point){
    const dx=(point.x-appearance.anchor.x)*immersiveMetresPerPoint,dy=(point.y-appearance.anchor.y)*immersiveMetresPerPoint;
    return new T.Vector3(appearance.c*dx-appearance.s*dy,0,appearance.s*dx+appearance.c*dy);
}
function fromKit(local){
    return new T.Vector2(appearance.anchor.x+(appearance.c*local.x+appearance.s*local.z)/immersiveMetresPerPoint,
        appearance.anchor.y+(-appearance.s*local.x+appearance.c*local.z)/immersiveMetresPerPoint);
}
function stairSurface(local){
    const stair=appearance.stairs;if(!stair)return null;
    const p=local.clone().applyMatrix4(appearance.inverseStairMatrix);
    const d=-p.z;
    const halfWidth=d>=stair.terraceStart?stair.terraceHalfWidth??stair.width/2:stair.width/2;
    const left=d>=stair.run?stair.topLeft??halfWidth:halfWidth;
    const right=d>=stair.run?stair.topRight??halfWidth:halfWidth;
    if(p.x < -left||p.x>right||d<0||d>stair.run+stair.landingDepth)return null;
    p.y=d>=stair.run?stair.rise:stair.heightAt(d);
    return {distance:d,elevation:p.applyMatrix4(appearance.stairMatrix).y,landing:d>=stair.run};
}
function deckSurface(local,deck,previous){
    const p=local.clone().applyMatrix4(deck.inverse);
    if(deck.contains){
        if(!deck.contains(p.x,p.z))return null;
        if(previous&&walk.onStair?.deckId===deck.id){
            const start=previous.clone().applyMatrix4(deck.inverse);
            if(!deck.traversable(start.x,start.z,p.x,p.z))return null;
        }
    }else if(Math.abs(p.x)>deck.halfWidth||Math.abs(p.z)>deck.halfDepth)return null;
    p.y=0;
    return {deckId:deck.id,label:deck.label??('B3 端 · '+deck.side+'上層走道'),
        surface:deck.surface??'gallery',elevation:p.applyMatrix4(deck.matrix).y};
}
function captureFooting(){
    if(!walk.onStair)return null;
    const belt=appearance.carriers.get(walk.onStair.escalatorId);
    if(belt)return {escalatorId:belt.objectId,point:toKit(walk.point).applyMatrix4(belt.inverse)};
    const deck=appearance.decks?.find(d=>d.id===walk.onStair.deckId);
    return {deckId:deck?.id,point:toKit(walk.point).applyMatrix4(deck?.inverse??appearance.inverseStairMatrix)};
}
function resizeRiderFooting(traveller,oldBelt){
    const belt=appearance.carriers.get(traveller.escalatorId);
    traveller.point.x*=belt.width/oldBelt.width;
    traveller.point.z*=belt.run/oldBelt.run;
}
const beltPoint=new T.Vector3(),oldBeltPoint=new T.Vector3();
function beltSurface(belt,p){
    const distance=T.MathUtils.clamp(-p.z,0,belt.run);
    p.y=belt.heightAt(distance);
    return {escalatorId:belt.objectId,distance,elevation:p.applyMatrix4(belt.matrix).y,
        label:belt.direction===1?'電扶梯 · 上行':'電扶梯 · 下行'};
}
function carryRider(belt,seconds){
    if(!seconds)return;
    const local=toKit(walk.point).applyMatrix4(belt.inverse);
    // Follow the very same phase increment as the treads in editable-object coordinates.
    local.z-=belt.direction*belt.speed*seconds;
    const next=fromKit(local.applyMatrix4(belt.matrix));
    moveOnFloor(next.x-walk.point.x,next.y-walk.point.y);
}
// Test the open intervals between actual outline crossings. Even a sub-step
// gap or a narrow courtyard cutout must still have a supporting floor.
function connectedGroundStep(start,end,fromDeck,toDeck){
    const cuts=[0,1],ground=appearance.floorBounds;
    const regions=[fromDeck,toDeck].map(deck=>{
        const a=start.clone(),b=end.clone();
        if(deck){a.applyMatrix4(deck.inverse);b.applyMatrix4(deck.inverse);}
        const x0=deck?-deck.halfWidth:ground.minX,x1=deck?deck.halfWidth:ground.maxX;
        const z0=deck?-deck.halfDepth:ground.minZ,z1=deck?deck.halfDepth:ground.maxZ;
        const rings=deck?.rings??[[[x0,z0],[x1,z0],[x1,z1],[x0,z1]]];
        const dx=b.x-a.x,dz=b.z-a.z;
        for(const ring of rings){
            for(let i=0,j=ring.length-1;i<ring.length;j=i++){
                const [x,z]=ring[j],ex=ring[i][0]-x,ez=ring[i][1]-z,det=dx*ez-dz*ex;
                if(Math.abs(det)<1e-12)continue;
                const t=((x-a.x)*ez-(z-a.z)*ex)/det,u=((x-a.x)*dz-(z-a.z)*dx)/det;
                if(t>0&&t<1&&u>=-1e-8&&u<=1+1e-8)cuts.push(t);
            }
        }
        return t=>{
            const x=a.x+t*dx,z=a.z+t*dz;
            return deck?.contains?deck.contains(x,z):x>=x0-1e-7&&x<=x1+1e-7&&z>=z0-1e-7&&z<=z1+1e-7;
        };
    });
    cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
        if(cuts[i]-cuts[i-1]<1e-7)continue;
        const t=(cuts[i]+cuts[i-1])/2;
        if(!regions.some(contains=>contains(t)))return false;
    }
    return true;
}
function canStepTo(point){
    const local=toKit(point),previous=toKit(walk.point);
    const oldBelt=appearance.carriers.get(walk.onStair?.escalatorId);
    const tolerance=1e-6;
    let surface=null;
    for(const belt of appearance.carriers.values()){
        const p=beltPoint.copy(local).applyMatrix4(belt.inverse),d=-p.z;
        if(d<-tolerance||d>belt.run+tolerance||Math.abs(p.x)>belt.outerWidth/2+tolerance)continue;
        if(oldBelt!==belt){
            const treadY=belt.heightAt(d)*belt.matrix.elements[5]+belt.matrix.elements[13];
            // A person on an independently supported upper slab may pass above a buried flight.
            if(walk.elevation>treadY+.30||walk.elevation+1.70<treadY-.45)continue;
        }
        // Neither a step nor the person riding it can pass through a side skirt.
        if(Math.abs(p.x)>belt.width/2)return false;
        if(oldBelt!==belt){
            const oldD=-oldBeltPoint.copy(previous).applyMatrix4(belt.inverse).z;
            if(belt.direction===1?oldD>tolerance:oldD<belt.run-tolerance)return false;
        }
        surface=beltSurface(belt,p);
        if(oldBelt!==belt&&Math.abs(surface.elevation-walk.elevation)>.23)return false;
        break;
    }
    if(!surface&&oldBelt){
        const p=beltPoint.copy(local).applyMatrix4(oldBelt.inverse);
        if(-p.z>=0&&-p.z<=oldBelt.run)return false;
    }
    surface??=stairSurface(local);
    const oldDeck=walk.onStair?.deckId&&appearance.decks?.find(deck=>deck.id===walk.onStair.deckId);
    if(appearance.decks){
        if(surface&&oldDeck&&Math.abs(surface.elevation-walk.elevation)>.23)surface=null;
        if(!surface){
            for(const deck of appearance.decks){
                if(!walk.onStair&&!deck.connectsToGround)continue;
                if(deck.connectsToGround&&Math.abs(walk.elevation)<.03&&onDrawingFloor(point))continue;
                const adjacent=deckSurface(local,deck,previous);
                const onGround=deck.connectsToGround&&(!walk.onStair||oldDeck?.connectsToGround);
                const tolerance=onGround ? .03 : .23;
                if(!adjacent||Math.abs(adjacent.elevation-walk.elevation)>tolerance)continue;
                if(deck.connectsToGround&&deck!==oldDeck&&(!walk.onStair||oldDeck?.connectsToGround)&&
                    !connectedGroundStep(previous,local,oldDeck,deck))continue;
                surface=adjacent;break;
            }
        }
    }
    const newElevation=surface?.elevation??0;
    if(oldBelt&&!surface?.escalatorId){
        if(Math.abs(walk.elevation-newElevation)>.23||(!surface&&!onDrawingFloor(point)))return false;
    }else if(surface&&!walk.onStair&&!surface.escalatorId&&!surface.deckId){
        const previousZ=previous.clone().applyMatrix4(appearance.inverseStairMatrix).z;
        if(previousZ<-.001||newElevation>.32||Math.abs(appearance.stairMatrix.elements[13])>.32)return false;
    }else if(!surface&&walk.onStair){
        if(!onDrawingFloor(point))return false;
        if(oldDeck){
            if(!oldDeck.connectsToGround||Math.abs(walk.elevation)>.03||!connectedGroundStep(previous,local,oldDeck,null))return false;
        }else if(walk.elevation>.32||local.clone().applyMatrix4(appearance.inverseStairMatrix).z<0||Math.abs(appearance.stairMatrix.elements[13])>.32)return false;
    }else if(!surface&&level.id===entryId&&!onDrawingFloor(point))return false;
    for(const b of appearance.barriers){
        if(b.max.y<=newElevation+.12||b.min.y>=newElevation+1.65)continue;
        if(b.obstacle){
            if(Math.max(local.x,previous.x)<b.min.x-.07||Math.min(local.x,previous.x)>b.max.x+.07||
                Math.max(local.z,previous.z)<b.min.z-.07||Math.min(local.z,previous.z)>b.max.z+.07)continue;
            const {part,inverse,clearance}=b.obstacle;
            const a=oldBeltPoint.copy(previous).applyMatrix4(inverse),p=beltPoint.copy(local).applyMatrix4(inverse);
            if(blockedByFootprint(part,[a.x,a.z],[p.x,p.z],clearance))return false;
            continue;
        }
        const inside=p=>p.x>=b.min.x-.07&&p.x<=b.max.x+.07&&p.z>=b.min.z-.07&&p.z<=b.max.z+.07;
        if(inside(local)&&!inside(previous))return false;
    }
    walk.onStair=surface;walk.elevation=newElevation;return true;
}
function onDrawingFloor(point){
    const contains=ring=>{
        let inside=false;
        for(let i=0,j=ring.length-1;i<ring.length;j=i++){
            const a=ring[j],b=ring[i];
            if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
        }
        return inside;
    };
    const [outer,...holes]=walk.mesh.userData.boundaries;
    return contains(outer)&&!holes.some(contains);
}
function selectedAppearance(){
    if(!appearance)return null;
    return appearance.items.get($('appearance-object').value)??appearance.groups.get($('appearance-group').value)??null;
}
function showAppearanceFields(){
    const entry=selectedAppearance();$('appearance-fields').hidden=!entry||Boolean(entry.sourcePart);
    $('lease-fields').hidden=!entry?.sourcePart;
    $('edit-lease').hidden=!host;
    if(entry?.sourcePart==='dinghao-lease'&&leasePart){
        $('edit-lease').textContent='編輯租借地坪頂點';
        const area=ring=>Math.abs(ring.reduce((sum,[x,z],i)=>{
            const [nextX,nextZ]=ring[(i+1)%ring.length];return sum+x*nextZ-z*nextX;
        },0))/2;
        const net=area(leasePart.footprint)-(leasePart.holes??[]).reduce((sum,ring)=>sum+area(ring),0);
        $('lease-outline').textContent='目前租借地坪 '+net.toLocaleString('zh-TW',{maximumFractionDigits:2})+' m²，採用頂好廣場編輯器的輪廓。';
    }else if(entry?.sourcePart){
        const item=indoorPlaza?.items.find(item=>item.id===entry.sourcePart);
        $('lease-outline').textContent=item?item.name+' · 相對底高 '+item.base+' m，頂高 '+item.roof+' m。':'此群組與第二廣場編輯器共用幾何。';
        $('edit-lease').textContent='開啟第二廣場構件編輯器';
    }
    if(!appearance)return;
    appearance.highlight.visible=Boolean(entry)&&!session;
    if(entry){
        const pose=model.appearanceEdits?.[entry.id]??entry.original;
        for(const key of ['x','y','z','scale'])$('appearance-'+key).value=+pose[key].toFixed(6);
        appearance.root.updateWorldMatrix(true,true);
        appearance.highlight.box.copy(localBounds(entry.node,appearance));
    }
    $('appearance-undo').disabled=!appearanceUndo.length;invalidate();
}
function selectAppearanceGroup(itemId=''){
    const group=$('appearance-group').value,items=appearance?.objects??[];
    const options=items.filter(item=>item.group===group).map(item=>new Option(item.name,item.id));
    $('appearance-object').replaceChildren(new Option(group?'整組構件':'先選群組',''),...options);
    $('appearance-object').disabled=!group;$('appearance-object').value=itemId;showAppearanceFields();
}
function releaseWalkStyle(){
    if(!walk?.mesh)return;
    walk.mesh.material.color.setHex(colors[walk.mesh.userData.levelId]);walk.mesh.material.map=null;walk.mesh.material.needsUpdate=true;
    if(appearance){appearance.root.visible=false;appearance.highlight.visible=false;appearance=null;}
    walk.elevation=0;walk.onStair=null;walk.lastPhaseTime=null;
    for(const attr of ['walkEscalator','walkDirection','escalatorPhase'])delete canvas.dataset[attr];
    scene.background.setHex(0xe3ece8);
}
function useWalkStyle(){
    releaseWalkStyle();
    const available=piece===level.pieces[0];$('walk-appearance').hidden=!available;
    const streetEntry=level.id===entryId;
    $('walk-style').disabled=streetEntry;
    $('entry-settings').hidden=!streetEntry;
    $('stair-settings').hidden=streetEntry;
    if(streetEntry)showEntrySpec();
    const photograph=available&&$('walk-style').value==='appearance';
    if(photograph){
        appearance=getKit();appearance.root.visible=true;scene.background.setHex(0x6b6c68);
        walk.mesh.material.color.set(appearance.floorColor??0xffffff);walk.mesh.material.map=appearance.floorMap;
        $('appearance-group').replaceChildren(new Option('選取群組',''),...Array.from(appearance.groups.keys(),name=>new Option(name,name)));
        selectAppearanceGroup();$('appearance-source').textContent=appearance.sources??'';
    }else{walk.mesh.material.map=grid;}
    $('appearance-editor').hidden=!photograph;
    $('walk-scale').textContent=streetEntry?'頂好廣場 14 號出口 · 改造前影像推估，局部模型以公尺表示。':photograph?interiorCaption:drawingCaption;
    canvas.dataset.walkStyle=photograph?'appearance':'drawing';
    walk.mesh.material.needsUpdate=true;walk.lastX=null;showStairSpec();invalidate();
}
function saveAppearanceField(id,pose){
    if(pose){model.appearanceEdits??={};model.appearanceEdits[id]={...pose};}
    else if(model.appearanceEdits){
        delete model.appearanceEdits[id];
        if(!originalEdits&&!Object.keys(model.appearanceEdits).length)delete model.appearanceEdits;
    }
}
$('walk-style').onchange=()=>{if(walk){useWalkStyle();drawWalkMap();placeDesktopEye();}};
$('appearance-group').onchange=()=>selectAppearanceGroup();
$('appearance-object').onchange=showAppearanceFields;
$('appearance-apply').onclick=()=>{
    const entry=selectedAppearance();if(!entry||entry.sourcePart||session)return;
    const keys=['x','y','z','scale'];
    const pose=Object.fromEntries(keys.map(k=>[k,$('appearance-'+k).valueAsNumber]));
    if(!validAppearancePose(pose))return status('位置請輸入 ±1000 以內的數值，縮放範圍為 0.05 到 12。');
    const previous=model.appearanceEdits?.[entry.id],current=previous??entry.original;
    if(keys.every(k=>Math.abs(current[k]-pose[k])<1e-6))return;
    appearanceUndo.push({id:entry.id,group:entry.group,level:level.id,previous});
    if(appearanceUndo.length>60)appearanceUndo.shift();
    const stationPoint=captureFooting();
    setAppearancePose(entry,pose);saveAppearanceField(entry.id,pose);
    refreshBounds(appearance);refreshFooting(stationPoint);showAppearanceFields();syncProject();status('已調整 '+entry.name+'。');
};
$('appearance-undo').onclick=()=>{
    if(session||!appearanceUndo.length)return;
    const h=appearanceUndo.pop();beginFloorWalk(h.level);
    const entry=appearance.items.get(h.id)??appearance.groups.get(h.group);
    const stationPoint=captureFooting();
    setAppearancePose(entry,h.previous);saveAppearanceField(entry.id,h.previous);refreshBounds(appearance);refreshFooting(stationPoint);
    $('appearance-group').value=h.group;selectAppearanceGroup(appearance.items.has(h.id)?h.id:'');
    syncProject();status('已復原 '+entry.name+' 的位置與縮放。');
};
function refreshFooting(stationPoint){
    const deck=stationPoint?.deckId&&appearance.decks.find(d=>d.id===stationPoint.deckId);
    const belt=stationPoint?.escalatorId&&appearance.carriers.get(stationPoint.escalatorId);
    if(stationPoint)walk.point=fromKit(stationPoint.point.clone().applyMatrix4(belt?.matrix??deck?.matrix??appearance.stairMatrix));
    if(belt)walk.onStair=beltSurface(belt,stationPoint.point);
    else walk.onStair=stationPoint?(deck?deckSurface(toKit(walk.point),deck):stairSurface(toKit(walk.point))):null;
    walk.elevation=walk.onStair?.elevation??0;
    walk.lastX=null;placeDesktopEye();drawWalkMap();invalidate();
}
function drawWalkMap(){
    const rings=walk.mesh.userData.boundaries,box=new T.Box2().setFromPoints(rings[0]);
    const surfaces=[];
    const rectangle=(left,right,a,b)=>[[[left,a],[right,a],[right,b],[left,b]]];
    if(appearance?.stairs){
        const {width,run,landingDepth,topLeft=width/2,topRight=width/2}=appearance.stairs;
        const add=(paths,matrix,color)=>surfaces.push({color,rings:paths.map(r=>r.map(([x,z])=>fromKit(new T.Vector3(x,0,z).applyMatrix4(matrix))))});
        add(rectangle(-width/2,width/2,0,-run),appearance.stairMatrix,'#a07c58');
        add(rectangle(-topLeft,topRight,-run,-run-landingDepth),appearance.stairMatrix,'#8eab92');
        for(const deck of appearance.decks??[])add(deck.rings??rectangle(-deck.halfWidth,deck.halfWidth,-deck.halfDepth,deck.halfDepth),
            deck.matrix,deck.surface==='plaza-lease'?'#c8ae82':'#8eab92');
        for(const surface of surfaces)for(const point of surface.rings[0])box.expandByPoint(point);
    }
    const sheet=document.createElement('canvas');sheet.width=380;sheet.height=170;
    const scale=Math.min(350/Math.max(.001,box.max.x-box.min.x),140/Math.max(.001,box.max.y-box.min.y));
    const center=box.getCenter(new T.Vector2());
    walk.mapX=190-center.x*scale;walk.mapY=85-center.y*scale;walk.mapScale=scale;
    const ctx=sheet.getContext('2d');ctx.beginPath();
    for(const ring of rings){
        ring.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](walk.mapX+v.x*scale,walk.mapY+v.y*scale));ctx.closePath();
    }
    ctx.fillStyle=level.id==='B3'?'#b5d6cc':'#edd2ba';ctx.strokeStyle='#38564d';ctx.lineWidth=2;
    ctx.fill('evenodd');ctx.stroke();
    for(const surface of surfaces){
        ctx.beginPath();
        for(const ring of surface.rings){
            ring.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](walk.mapX+v.x*scale,walk.mapY+v.y*scale));ctx.closePath();
        }
        ctx.fillStyle=surface.color;ctx.fill('evenodd');
    }
    $('walk-map').querySelector('img').src=sheet.toDataURL();
}
function showWalkPosition(yaw=walk.yaw){
    const {point,mapX,mapY,mapScale}=walk;
    const x=point.x.toFixed(4),y=point.y.toFixed(4),heading=yaw.toFixed(5);
    if(walk.lastX===x&&walk.lastY===y&&walk.lastYaw===heading)return;
    walk.lastX=x;walk.lastY=y;walk.lastYaw=heading;
    canvas.dataset.walkX=x;canvas.dataset.walkY=y;canvas.dataset.walkYaw=heading;
    canvas.dataset.walkElevation=walk.elevation.toFixed(4);
    if(level.id===entryId&&appearance?.stairs){
        const daylight=T.MathUtils.smoothstep(walk.elevation/appearance.stairs.terraceHeight,.45,.95);
        scene.background.copy(exitInterior).lerp(exitDaylight,daylight);
    }
    const belt=appearance?.carriers.get(walk.onStair?.escalatorId);
    const surface=belt?'escalator':walk.onStair?.surface??(walk.onStair?.deckId?'gallery':walk.onStair?.landing?'landing':walk.onStair?'stairs':'floor');
    canvas.dataset.walkSurface=surface;
    if(belt){
        canvas.dataset.walkEscalator=belt.objectId;
        canvas.dataset.walkDirection=belt.direction===1?'up':'down';
    }else if(canvas.dataset.walkEscalator){
        delete canvas.dataset.walkEscalator;delete canvas.dataset.walkDirection;
    }
    const arrow=$('walk-map').querySelector('span');
    arrow.style.left=((point.x*mapScale+mapX)/380*100)+'%';
    arrow.style.top=((point.y*mapScale+mapY)/170*100)+'%';
    arrow.style.transform='translate(-50%, -50%) rotate('+(-yaw)+'rad)';
    const site=walk.onStair?.label??(level.id===entryId?entryLocation(walk.onStair):surface==='landing'?'B3 端 · 挑空區局部平台':surface==='stairs'?'B4 至 B3 · 挑空區樓梯':level.id+' '+piece.name);
    const coords=level.id===entryId?'':'　圖面 ('+point.x.toFixed(1)+', '+point.y.toFixed(1)+')';
    const text=site+coords+(walk.onStair?'　相對高度 '+walk.elevation.toFixed(2)+' m':'');
    if($('walk-readout').textContent!==text)$('walk-readout').textContent=text;
}
function placeDesktopEye(){
    const group=levelGroups.get(level.id);
    camera.position.set(group.position.x+walk.point.x*previewScale,group.position.y+(eyePoints+walk.elevation/immersiveMetresPerPoint)*previewScale,group.position.z+walk.point.y*previewScale);
    camera.rotation.set(walk.pitch,walk.yaw,0,'YXZ');showWalkPosition();
}
function appearanceAnchor(){
    const start=walk.point.clone();
    if(level.id!=='B4'||piece!==level.pieces[0])return start;
    // Leave visible platform on both sides of the locally modelled stairs.
    const forward=new T.Vector2(-Math.sin(walk.entryYaw),-Math.cos(walk.entryYaw));
    const lateral=new T.Vector2(-forward.y,forward.x);
    const reach=distanceToEdge(start,forward.x,forward.y);
    const distance=Math.min(18/immersiveMetresPerPoint,Math.max(0,reach-18/immersiveMetresPerPoint));
    for(let shift=distance;shift>0;shift-=1/immersiveMetresPerPoint){
        const point=start.clone().addScaledVector(forward,shift);
        if(onDrawingFloor(point)&&distanceToEdge(point,lateral.x,lateral.y)*immersiveMetresPerPoint>=1.3&&
            distanceToEdge(point,-lateral.x,-lateral.y)*immersiveMetresPerPoint>=1.3)return point;
    }
    return start;
}
function chooseWalkFloor(){
    releaseWalkStyle();
    walk.mesh=levelGroups.get(level.id).children.find(mesh=>mesh.name===piece.id);
    walk.point=interiorPoint(walk.mesh);walk.yaw=0;walk.pitch=-.15;walk.lastX=null;
    let farthest=-1;
    for(let i=0;i<32;i++){
        const angle=i*Math.PI/16;
        const reach=distanceToEdge(walk.point,-Math.sin(angle),-Math.cos(angle));
        if(reach>farthest){walk.yaw=angle;farthest=reach;}
    }
    if(level.id===entryId){walk.point.set(0,0);walk.yaw=0;}
    walk.entryYaw=walk.yaw;walk.anchor=appearanceAnchor();
    if($('walk-style').value==='appearance')walk.point.copy(walk.anchor);
    canvas.dataset.walkPiece=piece.id;canvas.dataset.walkLevel=level.id;
    keys.clear();layout();useWalkStyle();drawWalkMap();placeDesktopEye();invalidate();
}
function setWalkControls(active){
    $('walk-map').hidden=$('walk-help').hidden=!active;$('orbit-help').hidden=active;
    $('walk-floor').setAttribute('aria-pressed',String(active));$('walk-floor').textContent=active?'結束步行':'地坪步行';
    for(const fieldset of document.querySelectorAll('fieldset:not(#appearance-editor):not(#atrium-entries):not(#entry-entries)'))fieldset.disabled=active;
    if(!active)$('walk-appearance').hidden=true;
}
function startWalk(){
    if(session||xrPending||walk)return;
    walk={previousSingle:single,pos:camera.position.clone(),rotation:camera.quaternion.clone(),target:orbit.target.clone()};
    orbit.enabled=false;single=true;camera.near=.0006;camera.fov=70;camera.updateProjectionMatrix();
    setWalkControls(true);chooseWalkFloor();canvas.focus();
}
function beginFloorWalk(levelId){
    if(!model)throw Error('地下層模型尚未載入。');
    if(session||xrPending)throw Error('請先退出 VR 再選擇步行樓層。');
    if(levelId===entryId){
        if(!walk||level.id!==entryId)beginStreetEntryWalk('bottom');
        return;
    }
    const target=model.levels.find(entry=>entry.id===levelId);
    if(!target)throw Error('找不到指定的步行樓層。');
    if(level!==target||piece!==target.pieces[0]){
        $('level').value=target.id;selectLevel();
    }
    if(!walk)startWalk();
    canvas.focus();
}
function beginAtriumWalk(end){
    if(end!=='top'&&end!=='bottom')throw Error('請指定大廳端或月台端。');
    $('walk-style').value='appearance';beginFloorWalk('B4');
    if(!appearance)useWalkStyle();
    const stair=appearance?.stairs;if(!stair)throw Error('目前模型沒有局部樓梯。');
    placeOnStair(end);
}
function placeOnStair(end){
    const stair=appearance.stairs;
    const isExit=level.id===entryId;
    const z=end==='top'?-stair.run-stair.landingDepth*(isExit?.84:.5):isExit?3.45:.45;
    const x=stair.spawnX??0;
    const start=new T.Vector3(x,0,z).applyMatrix4(appearance.stairMatrix);
    const point=fromKit(start);
    if(end==='bottom'&&!onDrawingFloor(point))throw Error('樓梯起點已移至所選地坪之外。');
    const ahead=fromKit(new T.Vector3(x,0,z+(end==='top'?1:-1)).applyMatrix4(appearance.stairMatrix)).sub(point);
    walk.point=point;walk.onStair=stairSurface(start);walk.elevation=walk.onStair?.elevation??0;
    walk.yaw=Math.atan2(-ahead.x,-ahead.y);walk.pitch=end==='top'?(isExit?.07:-.32):.11;
    walk.lastX=null;keys.clear();placeDesktopEye();drawWalkMap();canvas.focus();invalidate();
}
for(const end of ['bottom','top'])$('stairs-'+end).onclick=()=>{
    try{beginAtriumWalk(end);}catch(error){status(error.message);}
};
function entryLocation(surface){
    if(!surface)return '14 號出口 · 地下街梯前';
    if(surface.landing)return '頂好廣場 · 街面人行道';
    if(surface.distance>=appearance.stairs.terraceEnd)return '頂好廣場 · 室外短階';
    if(surface.distance>=appearance.stairs.terraceStart)return '頂好廣場 · 雨棚平台';
    return '14 號出口 · 中央固定樓梯';
}
function displayStudy(streetEntry){
    canvas.setAttribute('aria-label',streetEntry?'東區地下街第二廣場、14 號出口與街面頂好廣場':'B3 大廳與 B4 月台可編輯地坪');
    $('study-title').replaceChildren(streetEntry?'東區地下街':'忠孝復興站',document.createElement('br'),streetEntry?'第二廣場・14 號出口':'地下層');
    $('study-caption').textContent=streetEntry?'東區地下街 · 改造前影像重建':'板南線旅客區 · 地坪與局部淨高';
    for(const node of document.querySelectorAll('.station-plan'))node.hidden=streetEntry;
    $('entry-links').hidden=!streetEntry;
    if(!streetEntry){$('entry-level-option')?.remove();return;}
    if(!$('entry-level-option')){
        const option=new Option('地下街至 1F 人行道',entryId);option.id='entry-level-option';option.disabled=true;
        $('level').add(option);
    }
    $('level').value=entryId;
}
function makeEntryKit(){
    const kit=createStreetEntryKit({spec:model.streetEntryStudy?.spec,leasePart});
    if(indoorPlaza)attachPlazaInterior(kit,indoorPlaza);
    return kit;
}
function readPublicAreas(){
    if(!host||publicRevision===host.publicGeometryRevision())return false;
    ({leasePart,indoorPlaza}=host.loadPublicAreas());
    publicRevision=host.publicGeometryRevision();
    return true;
}
function resumeWorkshop(){
    previousTime=0;invalidate();
    if(!readPublicAreas()||!entryLevel)return;
    const active=Boolean(walk)&&level===entryLevel;
    if(active)endWalk();
    const group=levelGroups.get(entryId);
    for(const mesh of group.children)releaseKit(mesh);
    group.removeFromParent();dispose(group);levelGroups.delete(entryId);entryLevel=null;
    if(active)beginStreetEntryWalk('top');
}
$('edit-lease').onclick=()=>{
    if(!host||session||xrPending)return;
    const sourcePart=selectedAppearance()?.sourcePart;
    if(sourcePart==='dinghao-lease')host.editDinghaoLease();
    else if(sourcePart)host.editIndoorPlaza(sourcePart);
};
function prepareStreetEntryWalk(){
    if(!model||session||xrPending)throw Error('請等待模型載入並退出 VR。');
    if(!entryLevel){
        pendingEntryKit=makeEntryKit();
        const {minX,maxX,minZ,maxZ}=pendingEntryKit.floorBounds;
        const path=[['M',minX,minZ],['L',maxX,minZ],['L',maxX,maxZ],['L',minX,maxZ]].map(([op,x,z])=>[op,x/immersiveMetresPerPoint,z/immersiveMetresPerPoint]);
        path.push(['Z']);
        entryLevel={id:entryId,name:'頂好廣場 14 號出口',pieces:[{id:'exit14-approach',name:'地下街梯前',path}]};
        const group=new T.Group();group.scale.setScalar(previewScale);
        group.add(makePiece(entryLevel.pieces[0],entryId,0));
        stage.add(group);levelGroups.set(entryId,group);
    }
    const switching=level!==entryLevel;
    level=entryLevel;piece=level.pieces[0];displayStudy(true);
    $('piece').replaceChildren(new Option('頂好廣場 14 號出口 · 局部剖面',piece.id));
    $('piece').disabled=true;$('walk-style').value='appearance';
    if(!walk)startWalk();else if(switching||!appearance)chooseWalkFloor();
}
function beginStreetEntryWalk(end){
    if(end!=='top'&&end!=='bottom')throw Error('請選擇地下街端或街面端。');
    prepareStreetEntryWalk();
    placeOnStair(end);
}
function beginPlazaWalk(){
    prepareStreetEntryWalk();
    const start=appearance.plazaStart;
    if(!start)throw Error('這份模型缺少可站立的第二廣場地坪。');
    const local=new T.Vector3(start.x,0,start.z);
    const footing=appearance.decks.filter(d=>d.connectsToGround).map(d=>deckSurface(local,d)).find(Boolean);
    if(!footing)throw Error('目前的第二廣場起點不在可站立的地坪上。');
    walk.point=fromKit(local);walk.onStair=footing;walk.elevation=footing.elevation;
    walk.yaw=start.yaw??0;walk.pitch=0;walk.lastX=null;keys.clear();
    placeDesktopEye();drawWalkMap();canvas.focus();invalidate();
}
$('entry-plaza').onclick=()=>{try{beginPlazaWalk();}catch(error){status(error.message);}};
for(const end of ['bottom','top'])$('entry-'+end).onclick=()=>{
    try{beginStreetEntryWalk(end);}catch(error){status(error.message);}
};
function beginEscalatorWalk(id){
    if(id==='b4-escalator'){
        $('walk-style').value='appearance';beginFloorWalk('B4');if(!appearance)useWalkStyle();
    }else if(id==='exit14-escalator-left'||id==='exit14-escalator-right')prepareStreetEntryWalk();
    else throw Error('找不到指定的電扶梯。');
    const belt=appearance?.carriers.get(id);
    if(!belt)throw Error('此模型未提供指定的電扶梯。');
    const up=belt.direction===1,z=up ? .36 : -belt.run-.36;
    const start=new T.Vector3(0,0,z).applyMatrix4(belt.matrix);
    const point=fromKit(start);
    const footing=up?null:stairSurface(start);
    const combElevation=belt.matrix.elements[13]+(up?0:belt.rise)*belt.matrix.elements[5];
    if((up?!onDrawingFloor(point):!footing)||Math.abs(combElevation-(footing?.elevation??0))>.23)
        throw Error('這部電扶梯的入口與目前編輯的地坪未相連。');
    const intake=fromKit(new T.Vector3(0,0,z-belt.direction).applyMatrix4(belt.matrix)).sub(point);
    walk.point=point;walk.onStair=footing;walk.elevation=footing?.elevation??0;
    walk.yaw=Math.atan2(-intake.x,-intake.y);walk.pitch=up ? .16 : -.23;
    walk.lastX=null;keys.clear();placeDesktopEye();drawWalkMap();canvas.focus();invalidate();
}
const rideStarts={'ride-b4-up':'b4-escalator','ride-exit-up':'exit14-escalator-left','ride-exit-down':'exit14-escalator-right'};
for(const [button,belt] of Object.entries(rideStarts)){
    $(button)?.addEventListener('click',()=>{
        try{beginEscalatorWalk(belt);}catch(error){status(error.message);}
    });
}
const entryLabels={steps:'室內梯級數',treadDepth:'室內踏深',width:'固定梯寬',middleLength:'室內平台長',rise:'地下至雨棚平台高差',
    terraceDepth:'雨棚平台深',streetSteps:'室外梯級數',streetRiser:'室外級高',streetTread:'室外踏深',sidewalkDepth:'人行道可見段深'};
for(const [key,label] of Object.entries(entryLabels)){
    const field=document.createElement('label'),input=document.createElement('input');
    const count=key==='steps'||key==='streetSteps';input.type='number';input.step=count?'1':'any';input.id='entry-'+key;
    field.append(label+(count?'':'（m）'),input);$('entry-fields').append(field);
}
function showEntrySpec(){
    const spec=normalizeStreetEntrySpec(model.streetEntryStudy?.spec??defaultStreetEntrySpec);
    for(const key of Object.keys(entryLabels))$('entry-'+key).value=spec[key];
    $('entry-undo').disabled=entryHistory.length===0;
}
function replaceEntrySpec(spec){
    const old=appearance.stairs,d=walk.onStair?.distance??null,nearTop=d!==null&&d>=old.terraceStart;
    const belt=appearance.carriers.get(walk.onStair?.escalatorId);
    const rider=belt&&captureFooting(),yaw=walk.yaw,pitch=walk.pitch;
    releaseWalkStyle();
    const group=levelGroups.get(entryId);
    for(const mesh of group.children)releaseKit(mesh);
    group.removeFromParent();dispose(group);levelGroups.delete(entryId);entryLevel=null;
    if(spec)model.streetEntryStudy={...model.streetEntryStudy,spec:{...spec}};
    else if(model.streetEntryStudy){delete model.streetEntryStudy.spec;if(!Object.keys(model.streetEntryStudy).length)delete model.streetEntryStudy;}
    beginStreetEntryWalk(nearTop?'top':'bottom');
    if(rider){
        resizeRiderFooting(rider,belt);
        walk.yaw=yaw;walk.pitch=pitch;refreshFooting(rider);
    }
    syncProject();
}
$('entry-apply').onclick=()=>{
    if(level!==entryLevel||session||xrPending)return;
    const spec=Object.fromEntries(Object.keys(entryLabels).map(key=>[key,$('entry-'+key).valueAsNumber]));
    const validated=normalizeStreetEntrySpec(spec);
    const invalid=Object.keys(spec).find(k=>!Number.isFinite(spec[k])||spec[k]!==validated[k]);
    if(invalid)return status(entryLabels[invalid]+'超出模型可用範圍，請調整數值。');
    const current=normalizeStreetEntrySpec(model.streetEntryStudy?.spec??defaultStreetEntrySpec);
    if(Object.keys(spec).every(k=>spec[k]===current[k]))return;
    entryHistory.push(model.streetEntryStudy?.spec);if(entryHistory.length>60)entryHistory.shift();
    replaceEntrySpec(spec);status('已重建出口階梯及可行走表面。');
};
$('entry-undo').onclick=()=>{
    if(!entryHistory.length||level!==entryLevel||session||xrPending)return;
    replaceEntrySpec(entryHistory.pop());status('已復原出口樓梯尺寸。');
};
function endWalk(){
    if(!walk||session||xrPending)return;
    const saved=walk;releaseWalkStyle();
    walk=null;keys.clear();drag=null;single=saved.previousSingle;orbit.enabled=true;
    for(const key of ['walkX','walkY','walkYaw','walkPiece','walkLevel','walkStyle','walkElevation','walkSurface'])delete canvas.dataset[key];
    camera.near=.015;camera.fov=39;camera.updateProjectionMatrix();orbit.target.copy(saved.target);
    camera.position.copy(saved.pos);camera.quaternion.copy(saved.rotation);orbit.update();
    if(level.id===entryId){$('level').value=model.levels[0].id;selectLevel();}
    $('entry-settings').hidden=true;$('stair-settings').hidden=false;$('walk-style').disabled=false;
    setWalkControls(false);layout();invalidate();
}
$('walk-floor').onclick=()=>{if(walk)endWalk();else startWalk();};
canvas.addEventListener('keydown',event=>{
    if(!walk||session)return;
    const key=event.key.toLowerCase();
    if(key==='escape'){event.preventDefault();endWalk();return;}
    if(walkKeys.has(key)){event.preventDefault();keys.add(key);invalidate();}
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
canvas.addEventListener('blur',()=>keys.clear());
window.addEventListener('blur',()=>{keys.clear();drag=null;});
canvas.addEventListener('pointerdown',event=>{
    if(!walk||session||event.button!==0)return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};canvas.setPointerCapture(event.pointerId);canvas.focus();
});
canvas.addEventListener('pointermove',event=>{
    if(!walk||!drag||drag.id!==event.pointerId)return;
    walk.yaw-=(event.clientX-drag.x)*.005;walk.pitch=T.MathUtils.clamp(walk.pitch-(event.clientY-drag.y)*.005,-1.3,1.3);
    drag.x=event.clientX;drag.y=event.clientY;placeDesktopEye();invalidate();
});
canvas.addEventListener('lostpointercapture',()=>{drag=null;});
canvas.addEventListener('pointerup',event=>{
    if(!appearance||session||!drag||Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)return;
    const box=canvas.getBoundingClientRect();
    const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2),camera);
    const hit=ray.intersectObjects(appearance.objects.map(o=>o.mesh),true)[0];
    let node=hit?.object;while(node&&!node.userData.appearanceId)node=node.parent;
    const entry=appearance.items.get(node?.userData.appearanceId);if(!entry)return;
    $('appearance-group').value=entry.group;selectAppearanceGroup(entry.id);
});
for(const button of document.querySelectorAll('.walk-pad button')){
    button.addEventListener('pointerdown',event=>{
        if(!walk||session)return;
        event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(button.dataset.key);invalidate();
    });
    button.addEventListener('lostpointercapture',()=>keys.delete(button.dataset.key));
}
function validHeights(clear,rise){return Number.isFinite(clear)&&clear>=.1&&clear<=20&&Number.isFinite(rise)&&rise>=.1&&rise<=30;}
function syncProject(){
    // Keep the host snapshot detached from this editor's mutable undo history.
    if(host)host.updateStudy(structuredClone(model));
}
$('height-apply').onclick=()=>{
    const clear=$('clear').valueAsNumber,rise=$('rise').valueAsNumber;
    if(!validHeights(clear,rise))return status('請輸入有效的正高度。');
    for(const mesh of [...appearanceCache.keys()])releaseKit(mesh);
    model.heightStudy.concourseClearance.metres=clear;model.heightStudy.floorSeparation.metres=rise;
    layout();showStairSpec();syncProject();status('已套用建模高度，可儲存到模型。');
};
$('level').onchange=selectLevel;$('piece').onchange=selectPiece;$('point').onchange=selectPoint;
$('both').onclick=()=>view(false);$('single').onclick=()=>view(true);
function swapPath(item,lid,next){
    const replacement=makePiece({...item,path:next},lid,model.heightStudy.concourseClearance.metres);
    const group=levelGroups.get(lid),old=group.children.find(c=>c.name===item.id);
    releaseKit(old);
    group.remove(old);dispose(old);group.add(replacement);
    item.path=next;invalidate();
}
$('apply').onclick=()=>{
    const x=$('x').valueAsNumber,y=$('y').valueAsNumber;
    if(!Number.isFinite(x)||!Number.isFinite(y))return status('請輸入有效的圖面座標。');
    const {index,offset}=points[+$('point').value],previous=piece.path;
    if(previous[index][offset]===x&&previous[index][offset+1]===y)return;
    const next=previous.map(c=>c.slice());next[index][offset]=x;next[index][offset+1]=y;
    // Some source paths explicitly repeat the starting vertex before closing.
    let first=index;while(first>0&&previous[first][0]!=='M')first--;
    let last=index;while(last+1<previous.length&&previous[last+1][0]!=='Z')last++;
    if((index===first||index===last&&offset===previous[last].length-2)&&
        previous[first][1]===previous[last].at(-2)&&previous[first][2]===previous[last].at(-1)){
        next[first][1]=x;next[first][2]=y;next[last].splice(-2,2,x,y);
    }
    try{
        swapPath(piece,level.id,next);
        undo.push({piece,level:level.id,previous,point:$('point').value});
        if(undo.length>60)undo.shift();
        $('undo').disabled=false;updateMarker();syncProject();status('已更新 '+level.id+' 的'+piece.name+'。');
    }catch(e){selectPoint();status(e.message);}
};
$('undo').onclick=()=>{
    const h=undo.pop();if(!h)return;
    swapPath(h.piece,h.level,h.previous);
    $('level').value=h.level;selectLevel();$('piece').value=h.piece.id;selectPiece();
    $('point').value=h.point;selectPoint();$('undo').disabled=!undo.length;syncProject();status('已復原輪廓。');
};
$('save').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(model,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='忠孝復興站-地下層.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
};
$('file').onchange=async e=>{
    try{
        const file=e.target.files[0];if(!file)return;
        if(session||xrPending||file.size>2000000)throw Error('請先退出 VR，並選擇 2 MB 以內的模型。');
        install(JSON.parse(await file.text()));syncProject();status('已開啟 '+file.name);
    }catch(error){status(error.message);}finally{e.target.value='';}
};
const observer=new ResizeObserver(()=>{
    if(session)return;
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);const was=camera.aspect;camera.aspect=w/h;camera.updateProjectionMatrix();
    if(model&&!walk&&Math.abs(was-camera.aspect)>.05)view(single);else invalidate();
});
observer.observe(canvas);
async function probe(){
    let supported=false;
    try{supported=!!navigator.xr&&await navigator.xr.isSessionSupported('immersive-vr');}catch{}
    if(session||xrPending)return;
    $('vr').disabled=!supported;$('vr').textContent=supported?'進入 VR':'目前無可用頭顯';
}
const xrAngles=new T.Euler(0,0,0,'YXZ'),xrRotation=new T.Quaternion();
function updateImmersiveWalk(xrFrame,seconds){
    const space=renderer.xr.getReferenceSpace();if(!space)return;
    const pose=xrFrame.getViewerPose(space);if(!pose)return;
    const head=pose.transform.position,orientation=pose.transform.orientation;
    const c=Math.cos(walk.yaw),s=Math.sin(walk.yaw);
    if(walk.lastHead){
        const dx=head.x-walk.lastHead.x,dz=head.z-walk.lastHead.z;
        moveOnFloor((dx*c+dz*s)/immersiveMetresPerPoint,(-dx*s+dz*c)/immersiveMetresPerPoint);
    }
    walk.lastHead={x:head.x,z:head.z};
    xrRotation.set(orientation.x,orientation.y,orientation.z,orientation.w);
    const heading=walk.yaw+xrAngles.setFromQuaternion(xrRotation).y;
    for(const source of session.inputSources){
        const axes=source.gamepad?.axes;if(!axes||axes.length<2)continue;
        const ax=axes.length>=4?axes[2]:axes[0],ay=axes.length>=4?axes[3]:axes[1];
        if(Math.hypot(ax,ay)>.15){moveRelative(ax,-ay,heading,seconds*pointsPerSecond);break;}
    }
    const group=levelGroups.get(level.id);
    const x=(group.position.x/previewScale+walk.point.x)*immersiveMetresPerPoint;
    const z=(group.position.z/previewScale+walk.point.y)*immersiveMetresPerPoint;
    stage.position.set(head.x-(c*x-s*z),(walk.xrFloor?0:-eyePoints*immersiveMetresPerPoint)-walk.elevation,head.z-(s*x+c*z));
    showWalkPosition(heading);
}
function lockXRControls(locked){
    for(const id of ['walk-floor','both','single','level','piece','walk-style','appearance-editor','atrium-entries','entry-entries'])$(id).disabled=locked;
    if(level.id===entryId){$('piece').disabled=true;$('walk-style').disabled=true;}
    if(appearance)appearance.highlight.visible=!locked&&Boolean(selectedAppearance());
}
$('vr').onclick=async()=>{
    if(xrPending)return;
    xrPending=true;$('vr').disabled=true;
    try{
        if(session){await session.end();return;}
        const xr=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});
        session=xr;
        const savedPos=camera.position.clone(),savedQ=camera.quaternion.clone(),savedNear=camera.near,savedFov=camera.fov;
        keys.clear();drag=null;lockXRControls(true);
        xr.addEventListener('end',()=>{
            session=null;renderer.setAnimationLoop(null);stage.position.set(0,0,0);stage.rotation.set(0,0,0);stage.scale.setScalar(1);
            camera.near=savedNear;camera.far=45;camera.fov=savedFov;camera.updateProjectionMatrix();
            orbit.enabled=!walk;
            if(walk){walk.lastHead=null;placeDesktopEye();}
            else{camera.position.copy(savedPos);camera.quaternion.copy(savedQ);orbit.update();}
            marker.visible=!walk;lockXRControls(false);$('vr').textContent='進入 VR';$('vr').disabled=false;invalidate();
        },{once:true});
        let floor=true;try{await xr.requestReferenceSpace('local-floor');}catch{floor=false;}
        renderer.xr.setReferenceSpaceType(floor?'local-floor':'local');
        if(walk){
            walk.lastHead=null;walk.xrFloor=floor;
            stage.scale.setScalar(immersiveMetresPerPoint/previewScale);stage.rotation.y=-walk.yaw;
            camera.near=.04;camera.far=250;camera.updateProjectionMatrix();camera.position.set(0,0,0);camera.quaternion.identity();
        }else{stage.rotation.x=.32;stage.position.set(0,floor?1.32:-.26,-1.75);}
        orbit.enabled=false;marker.visible=false;cancelAnimationFrame(frame);frame=0;
        await renderer.xr.setSession(xr);
        if(session===xr){
            if(walk){
                const reference=renderer.xr.getReferenceSpace();
                // Recentring changes the headset origin without moving the visitor on the drawing.
                const recenter=()=>{if(walk)walk.lastHead=null;};
                reference.addEventListener('reset',recenter);
                xr.addEventListener('end',()=>reference.removeEventListener('reset',recenter),{once:true});
            }
            renderer.setAnimationLoop(draw);$('vr').textContent='退出 VR';$('vr').disabled=false;simulator?.showControls(xr,canvas);
        }
    }catch(e){if(session)await session.end().catch(()=>{});status('無法啟動 VR：'+e.message);}
    finally{xrPending=false;if(!session)await probe();}
};
for(let i=0;i<2;i++)renderer.xr.getController(i).addEventListener('squeezestart',()=>session?.end());
if(host){
    for(const id of ['return-street','open-project','export-project'])$(id).hidden=false;
    $('open-study').hidden=true;$('save').textContent='儲存完整專案';
    $('return-street').onclick=async()=>{
        if(xrPending)return status('頭顯正在切換，請稍候。');
        try{
            if(session)await session.end();
            host.returnToStreet();
        }catch(e){status('無法返回街區：'+e.message);}
    };
    for(const [id,method] of [['save','saveProject'],['open-project','openProject'],['export-project','exportProject']]){
        $(id).onclick=async()=>{
            try{await host[method]();}catch(e){status(e.message);}
        };
    }
}
try{
    if(host)readPublicAreas();
    else if($('public-area-data'))({leasePart,indoorPlaza}=JSON.parse($('public-area-data').textContent));
    else if(!embedded){
        const [response,street]=await Promise.all([fetch('../plazas.json'),fetch('../fuxing.envelopes.json')]);
        if(response.ok)leasePart=(await response.json()).plazas.find(p=>p.id==='dinghao')?.parts.find(p=>p.id==='dinghao-lease')??null;
        if(street.ok)indoorPlaza=(await street.json()).plaza??null;
    }
    const initial=host?.loadStudy()??(embedded?JSON.parse(embedded.textContent):await (await fetch('levels.json')).json());
    install(structuredClone(initial));
}catch(error){
    status('無法開啟地下層模型：'+error.message);
    host?.editorFailed?.(error.message);
    throw error;
}
if(host){
    window.lumiereStationEditor={
        beginFloorWalk,beginAtriumWalk,beginStreetEntryWalk,beginEscalatorWalk,beginPlazaWalk,resumeWorkshop,
        showMessage:status,
        isPresenting:()=>Boolean(session||xrPending),
        validateStudy(data){
            const groups=build(data);
            for(const group of groups.values())dispose(group);
            return true;
        },
        replaceStudy(data){
            if(session||xrPending)throw Error('請先退出地下層 VR。');
            readPublicAreas();
            install(structuredClone(data));
        }
    };
    host.editorReady?.();
}else{
    const openFragment=()=>{
        try{
            if(location.hash==='#plaza-walk')beginPlazaWalk();
            else if(location.hash==='#b3-walk'||location.hash==='#b4-walk')beginFloorWalk(location.hash.slice(1,3).toUpperCase());
            else if(location.hash==='#b3-stairs'||location.hash==='#b4-stairs')beginAtriumWalk(location.hash==='#b3-stairs'?'top':'bottom');
            else if(location.hash==='#mall-stairs'||location.hash==='#street-stairs')beginStreetEntryWalk(location.hash==='#street-stairs'?'top':'bottom');
            else if(location.hash==='#b4-escalator')beginEscalatorWalk('b4-escalator');
            else if(location.hash==='#exit14-up')beginEscalatorWalk('exit14-escalator-left');
            else if(location.hash==='#exit14-down')beginEscalatorWalk('exit14-escalator-right');
        }catch(error){status(error.message);}
    };
    openFragment();window.addEventListener('hashchange',openFragment);
}
if((host?.headset??new URLSearchParams(location.search).get('headset'))==='quest3'){
    try{
        const path=host?.simulatorUrl??(embedded?'./simulator/quest-preview.js':'../../../../demos/east-mall-editable/simulator/quest-preview.js');
        simulator=(await import(path)).installSimulator();
    }catch(e){status('無法載入模擬器：'+e.message);}
}
navigator.xr?.addEventListener?.('devicechange',probe);
await probe();document.body.dataset.ready='true';

