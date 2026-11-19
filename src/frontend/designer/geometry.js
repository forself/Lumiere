import {buildSurfaceLoad} from './surface-load-geometry.js';
import {instantiateAsset} from './imported-assets.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import {MATERIALS,ASSETS} from './catalog.js';
import {wallFrame,wallSections,objectPose} from './model.js';
import {buildAsset} from './asset-geometry.js';
import {openingParts,openingStyle} from './openings.js';
import {createBuiltInMaterial,createProceduralMaterialTextures} from './material-library.js';

export function scaleMaterialBoxUv(geometry,material,width,height,depth){
  if(material.map?.userData.customCoordinates){const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++){const face=Math.floor(i/4);uv.setXY(i,uv.getX(i)*(face<2?depth:width),uv.getY(i)*(face===2||face===3?depth:height));}}
  return geometry;
}

export function buildDesign(project,{selectedId=null,selectedRoomIds=[],textures={},floorHoles=[],importedAssets=new Map(),visibleObjectIds=null,includeStructure=true,coarse=false,levelHeight=3.2}={}){
  const group=new THREE.Group(),geometries=new Set(),materials=new Map(),byId=new Map(),handles=[];
  const getMaterial=id=>{
    if(!materials.has(id))materials.set(id,createBuiltInMaterial(id,{textures}));
    return materials.get(id);
  };
  const glass=new THREE.MeshStandardMaterial({color:'#9dbbb7',transparent:true,opacity:.5,roughness:.2,side:THREE.DoubleSide});
  const frameMaterial=new THREE.MeshStandardMaterial({color:'#59645f',roughness:.6});
  const handleMaterial=new THREE.MeshBasicMaterial({color:'#c87535',depthTest:false});
  const add=(parent,geometry,material,position,id,kind,wallId)=>{
    geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.userData={id,kind,wallId};parent.add(mesh);return mesh;
  };
  const box=(parent,w,h,d,x,y,z,mat,id,kind,wallId)=>add(parent,scaleMaterialBoxUv(new THREE.BoxGeometry(w,h,d),mat,w,h,d),mat,[x,y,z],id,kind,wallId);
  for(const room of includeStructure?project.rooms:[]){
    const shape=new THREE.Shape();room.vertexIds.forEach((id,i)=>{const v=project.vertices.find(v=>v.id===id);if(i===0)shape.moveTo(v.x,-v.z);else shape.lineTo(v.x,-v.z);});shape.closePath();for(const hole of floorHoles.filter(h=>h.roomId===room.id)){const path=new THREE.Path();hole.points.forEach((v,i)=>i?path.lineTo(v.x,-v.z):path.moveTo(v.x,-v.z));path.closePath();shape.holes.push(path);}
    if(coarse){
      // 開放地坪不是封閉建築，遠距簡化仍須保持平面，不能變成樓高的體塊。
      if(room.boundaryMode==='area'){const floor=add(group,new THREE.ShapeGeometry(shape),getMaterial(room.materialId),[0,.002,0],room.id,'room');floor.rotation.x=-Math.PI/2;byId.set(room.id,floor);continue;}
      shape.holes=[];const mass=add(group,new THREE.ExtrudeGeometry(shape,{depth:room.type==='balcony'?.15:levelHeight,bevelEnabled:false}),getMaterial('plaster'),[0,0,0],room.id,'room');mass.rotation.x=-Math.PI/2;byId.set(room.id,mass);continue;
    }
    const floor=add(group,new THREE.ShapeGeometry(shape),getMaterial(room.materialId),[0,.002,0],room.id,'room');floor.rotation.x=-Math.PI/2;byId.set(room.id,floor);
    if(room.type==='balcony'){
      const slab=add(group,new THREE.ExtrudeGeometry(shape,{depth:.15,bevelEnabled:false}),getMaterial(room.materialId),[0,-.15,0],room.id,'room');slab.rotation.x=-Math.PI/2;
    }
  }
  for(const room of includeStructure&&!coarse?project.rooms:[])buildSurfaceLoad(project,room,group,{add,materials});
  for(const wall of includeStructure&&!coarse?project.walls:[]){
    const f=wallFrame(project,wall),root=new THREE.Group();root.position.set(f.a.x,0,f.a.z);root.rotation.y=-Math.atan2(f.dz,f.dx);group.add(root);byId.set(wall.id,root);
    if(wall.type==='rail'){
      const L=f.length,h=wall.height,t=wall.thickness;
      if(wall.railStyle==='solid')box(root,L+t,h,t,L/2,h/2,0,getMaterial(wall.materialId),wall.id,'wall',wall.id);
      else{
        box(root,L+t,.05,t,L/2,h-.025,0,frameMaterial,wall.id,'wall',wall.id);
        box(root,L,.04,.045,L/2,.06,0,frameMaterial,wall.id,'wall',wall.id);
        const segments=Math.ceil(L/1.2);
        for(let i=0;i<=segments;i++)box(root,.055,h,.055,L*i/segments,h/2,0,frameMaterial,wall.id,'wall',wall.id);
        if(wall.railStyle==='glass')for(let i=0;i<segments;i++)box(root,L/segments-.055,h-.13,.018,L*(i+.5)/segments,(h-.13)/2+.08,0,glass,wall.id,'wall',wall.id);
        else if(wall.railStyle==='horizontal'){for(const y of [.3,.55,.8])box(root,L,.03,.035,L/2,h*y,0,frameMaterial,wall.id,'wall',wall.id);}
        else if(wall.railStyle==='mesh'){const cols=Math.ceil(L/.2),rows=Math.ceil(h/.2);for(let i=1;i<cols;i++)box(root,.012,h-.1,.012,L*i/cols,h/2,0,frameMaterial,wall.id,'wall',wall.id);for(let i=1;i<rows;i++)box(root,L,.012,.012,L/2,h*i/rows,0,frameMaterial,wall.id,'wall',wall.id);}
        else{const bars=Math.ceil(L/.12);for(let i=1;i<bars;i++)box(root,.025,h-.1,.025,L*i/bars,h/2,0,frameMaterial,wall.id,'wall',wall.id);}
      }
      continue;
    }
    for(const s of wallSections(project,wall))box(root,s.to-s.from,s.top-s.bottom,wall.thickness,(s.from+s.to)/2,(s.bottom+s.top)/2,0,getMaterial(wall.materialId),wall.id,'wall',wall.id);
    for(const o of project.openings.filter(o=>o.wallId===wall.id)){
      const opening=new THREE.Group();root.add(opening);byId.set(o.id,opening);
      const center=o.at*f.length,left=center-o.width/2,right=center+o.width/2,mid=o.sill+o.height/2;
      const spec=openingStyle(o);
      if(spec.grid){
        for(const part of openingParts(o,wall).parts){
          const pane=part.role==='grid-pane',key=`grid-${o.id}-${pane?'glass':'frame'}`;
          if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color:part.color,roughness:pane?.2:.6,transparent:pane,opacity:pane?.22:1,side:THREE.DoubleSide}));
          box(opening,part.width,part.height,part.depth,center+part.x,part.y,part.z,materials.get(key),o.id,'window',wall.id).userData.role=part.role;
        }
        continue;
      }
      for(const x of [left+.025,right-.025])box(opening,.05,o.height,wall.thickness+.025,x,mid,0,frameMaterial,o.id,o.kind,wall.id);
      box(opening,o.width,.05,wall.thickness+.025,center,o.sill+o.height-.025,0,frameMaterial,o.id,o.kind,wall.id);
      if(o.kind==='window')box(opening,o.width,.05,wall.thickness+.025,center,o.sill+.025,0,frameMaterial,o.id,o.kind,wall.id);
      if(spec.motion==='rollup')box(opening,o.width+.08,.28,.32,center,o.sill+o.height+.15,o.side*(wall.thickness/2+.16),frameMaterial,o.id,o.kind,wall.id);
      if(spec.motion==='double-slide')box(opening,2*(o.width-.1),.035,.09,center,o.sill+o.height-.03,o.side*(wall.thickness/2+.055),frameMaterial,o.id,o.kind,wall.id);
      if(spec.motion==='slide'||spec.motion==='sash')box(opening,spec.motion==='slide'?2*(o.width-.1):o.width,.035,.09,center+(spec.motion==='slide'?spec.travel*o.side*(o.width-.1)/2:0),o.sill+o.height-.03,o.side*(wall.thickness/2+.055),frameMaterial,o.id,o.kind,wall.id);
      for(const part of openingParts(o,wall).parts){
        const leaf=new THREE.Group();leaf.position.set(center+part.x,part.y,part.z);leaf.rotation.y=part.rotation;leaf.rotation.x=part.rotationX||0;opening.add(leaf);
        leaf.userData={openingLeaf:true,id:o.id,role:part.role};
        box(leaf,part.width,part.height,(o.kind==='window'||spec.glass)?.018:spec.motion==='rollup'?.012:.045,0,0,0,(o.kind==='window'||spec.glass)?glass:spec.motion==='rollup'?frameMaterial:getMaterial('oak'),o.id,o.kind,wall.id);
        if(part.meetingStile){const s=part.meetingStile,strip=box(leaf,s.width,s.height,s.depth,s.x,s.y,s.z,getMaterial('oak'),o.id,o.kind,wall.id);strip.userData.role='meeting-stile';strip.name='雙扇門隨扇蓋縫條';}
        if(part.role==='slat'||part.role==='rolled'){
          if(part.role==='slat')box(leaf,part.width,.008,.05,0,-part.height/2,0,frameMaterial,o.id,o.kind,wall.id);
        }else if(o.kind==='window'||spec.glass){
          for(const x of [-part.width/2+.018,part.width/2-.018])box(leaf,.036,part.height,.04,x,0,0,frameMaterial,o.id,o.kind,wall.id);
          for(const y of [-part.height/2+.018,part.height/2-.018])box(leaf,part.width,.036,.04,0,y,0,frameMaterial,o.id,o.kind,wall.id);
          if(spec.glass)box(leaf,.035,.3,.08,spec.motion==='double-slide'?(part.x<0?part.width/2-.09:-part.width/2+.09):0,1-part.y,.04,frameMaterial,o.id,o.kind,wall.id);
        }else box(leaf,.1,.035,.08,0,Math.min(1,o.height*.5)-part.y,0,frameMaterial,o.id,o.kind,wall.id);
      }
    }
  }
  for(const object of project.objects){
    if(visibleObjectIds&&!visibleObjectIds.has(object.id))continue;
    const pose=objectPose(project,object),spec=ASSETS[object.assetId];
    const root=new THREE.Group();root.position.set(pose.x,pose.elevation,pose.z);root.rotation.order='YXZ';root.rotation.set((object.trace?.pitch||object.prop?.pitch||0)*Math.PI/180,-pose.rotation*Math.PI/180,(object.trace?.roll||object.prop?.roll||0)*Math.PI/180,'YXZ');group.add(root);byId.set(object.id,root);
    const key=`service-${spec.system||spec.shape}-${object.installation}`;
    if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color:({water:'#4887b8',gas:'#c59b38',electricity:'#aa654c',air:'#879b9b',plant:'#68824b',human:'#7793aa',cat:'#b7a390',dog:'#a98d69',cow:'#dedbd0',pig:'#d6a5a0','broadleaf-tree':'#587445','conifer-tree':'#355f46',puddle:'#4e8797',bloodstain:'#762e30','electric-fence':'#d5ad47'})[spec.system||spec.shape]||'#ddd6b3',transparent:object.installation==='concealed'||spec.shape==='puddle',opacity:object.installation==='concealed'?.4:spec.shape==='puddle'?.65:1,roughness:spec.shape==='puddle'?.16:.7}));
    if(object.deviceState){const powerKey=object.deviceState.power?'power-on':'power-off';if(!materials.has(powerKey))materials.set(powerKey,new THREE.MeshStandardMaterial({color:object.deviceState.power?'#76d99a':'#424a48',emissive:object.deviceState.power?'#328153':'#000000',emissiveIntensity:.5}));box(root,Math.min(pose.width*.18,.08),.025,.012,0,pose.height*.8,-pose.depth/2-.015,materials.get(powerKey),object.id,'object');}
    const selectedMaterial=getMaterial(object.materialId),propKey='prop-'+object.id,useLegacyProp=object.prop&&selectedMaterial.userData.legacy;
    if(useLegacyProp)materials.set(propKey,new THREE.MeshStandardMaterial({color:object.prop.color,roughness:.65,side:THREE.DoubleSide}));
    if(importedAssets.has(object.assetId))root.add(instantiateAsset(importedAssets.get(object.assetId),pose));else buildAsset(root,pose,spec,{box,add,mat:useLegacyProp?materials.get(propKey):selectedMaterial,metal:frameMaterial,glass,service:materials.get(key),materials,project});
    buildSurfaceLoad(project,object,root,{add,materials});
  }
  group.updateMatrixWorld(true);
  if(byId.has(selectedId)){
    const outline=new THREE.BoxHelper(byId.get(selectedId),0xc87535);outline.material.depthTest=false;outline.renderOrder=5;outline.userData.ignorePicking=true;group.add(outline);geometries.add(outline.geometry);materials.set('selection',outline.material);
  }
  for(const id of selectedRoomIds){if(id===selectedId||!byId.has(id))continue;const outline=new THREE.BoxHelper(byId.get(id),0xc87535);outline.material.depthTest=false;outline.renderOrder=5;outline.userData.ignorePicking=true;group.add(outline);geometries.add(outline.geometry);materials.set('group-'+id,outline.material);}
  const selectedWall=project.walls.find(w=>w.id===selectedId);
  const selectedArea=project.rooms.find(r=>r.id===selectedId&&r.boundaryMode==='area');
  if(includeStructure&&!coarse&&(selectedWall||selectedArea)){
    for(const vertexId of selectedWall?[selectedWall.startId,selectedWall.endId]:selectedArea.vertexIds){
      const v=project.vertices.find(v=>v.id===vertexId);
      const handle=add(group,new THREE.SphereGeometry(.12,12,8),handleMaterial,[v.x,(selectedWall?.height||0)+.16,v.z],vertexId,'vertex');handle.renderOrder=10;handles.push(handle);
    }
  }
  group.updateMatrixWorld(true);
  return {group,byId,handles,dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());glass.dispose();frameMaterial.dispose();handleMaterial.dispose();}};
}

export function createMaterialTextures(){
  const textures={};
  for(const [id,spec] of Object.entries(MATERIALS)){
    if(!['oak','tatami','stone'].includes(id))continue;
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const c=canvas.getContext('2d');
    c.fillStyle='#ffffff';c.fillRect(0,0,128,128);
    if(spec.texture==='wood'){
      for(let i=0;i<34;i++){c.strokeStyle=`rgba(80,55,25,${.035+i%4*.015})`;c.beginPath();c.moveTo(0,i*4);c.bezierCurveTo(40,i*4+3,90,i*4-3,128,i*4);c.stroke();}
    }else if(spec.texture==='tatami'){
      for(let y=0;y<128;y+=2){c.fillStyle=y%4===0?'#dbdfb2':'#f2f1d5';c.fillRect(0,y,128,1);for(let x=(y%4)*2;x<128;x+=12){c.fillStyle='rgba(78,91,40,.18)';c.fillRect(x,y,1,2);}}
      c.fillStyle='#566245';c.fillRect(0,0,4,128);c.fillRect(124,0,4,128);c.fillStyle='#8a9064';c.fillRect(0,0,128,1);c.fillRect(0,127,128,1);
    }else{
      let seed=17;for(let i=0;i<900;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%128;seed=(Math.imul(seed,1664525)+1013904223)>>>0;c.fillStyle='rgba(80,80,70,.06)';c.fillRect(x,seed%128,2,2);}
    }
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;if(spec.texture==='tatami')texture.repeat.set(1/.9,1/1.8);textures[id]=texture;
  }
  return Object.assign(textures,createProceduralMaterialTextures({size:256}));
}
