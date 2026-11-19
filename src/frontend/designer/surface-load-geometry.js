import * as THREE from '../../../node_modules/three/build/three.module.js';
import {surfaceInfo} from './surface-load.js';
export function buildSurfaceLoad(project,host,parent,{add,materials}){
 const v=host.surfaceLoad,s=surfaceInfo(project,host);if(!v||!s)return;
 const key='surface-load-'+host.id,mat=new THREE.MeshStandardMaterial({color:v.color,roughness:v.kind==='liquid'?.12:.95,transparent:v.kind==='liquid',opacity:v.kind==='liquid'?.78:1,side:THREE.DoubleSide});materials.set(key,mat);
 let g,x=0,z=0,y=0;
 if(s.kind==='cavity'){
  const h=s.capacity*v.fill;y=s.base;
  if(s.shape==='ellipse'){const r=s.r0+(s.r1-s.r0)*v.fill;g=new THREE.CylinderGeometry(r*.995,s.r0*.995,h,48);g.scale(s.width,1,s.depth);y+=h/2;}
  else{g=new THREE.BoxGeometry(s.width*.995,h,s.depth*.995);y+=h/2;}
 }else{x=(s.x||0)+v.x;z=(s.z||0)+v.z;y=s.y+.0002+v.thickness/2;g=v.shape==='ellipse'?new THREE.CylinderGeometry(.5,.5,v.thickness,48):new THREE.BoxGeometry(1,v.thickness,1);g.scale(v.width,1,v.depth);}
 const mesh=add(parent,g,mat,[x,y,z],host.id,host.vertexIds?'room':'object');mesh.userData.surfaceLoad=true;
}
