import * as THREE from '../../../node_modules/three/build/three.module.js';
import {DesignViewport} from '../designer/DesignViewport.js';
import {fromSingle} from '../designer/building-model.js';
import {emptyProject} from '../designer/model.js';
// 重用既有受控 Canvas 視窗；僅顯示經契約驗證的稀疏點，不產生可行走建築。
export class CapturePointCloud extends DesignViewport{
 constructor(options={}){super({...options,mode:'scene'});}
 mount(container){super.mount(container);this.canvas.setAttribute('aria-label','相機座標稀疏點雲預覽');this.allFloors=true;this.interiorMode='full';this.grid.visible=false;const project=emptyProject();this.building=fromSingle(project);this.setDesign(project,null,'select');}
 setResult(result){
  if(this.cloud){this.scene.remove(this.cloud);this.cloud.geometry.dispose();this.cloud.material.dispose();this.cloud=null;}
  const points=result?.points||[];if(!points.length){this.invalidate();return;}
  const positions=new Float32Array(points.length*3),colors=new Float32Array(points.length*3),depths=points.map(p=>p.xyz[2]),min=Math.min(...depths),max=Math.max(...depths);
  for(const [i,p] of points.entries()){positions.set([p.xyz[0],-p.xyz[1],-p.xyz[2]],i*3);const color=new THREE.Color().setHSL(.58-.4*(p.xyz[2]-min)/Math.max(.001,max-min),.7,.48);colors.set([color.r,color.g,color.b],i*3);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeBoundingSphere();
  this.cloud=new THREE.Points(geometry,new THREE.PointsMaterial({size:3,sizeAttenuation:false,vertexColors:true}));this.scene.add(this.cloud);
  const {center,radius}=geometry.boundingSphere,span=Math.max(.1,radius*2.7);this.controls.minDistance=.01;this.controls.maxDistance=Math.max(80,span*10);this.camera.near=Math.max(.001,span/10000);this.camera.far=Math.max(200,span*20);this.camera.updateProjectionMatrix();this.controls.target.copy(center);this.camera.position.set(center.x+span*.15,center.y+span*.15,center.z+span);this.controls.update();this.invalidate();
 }
 destroy(){if(this.cloud){this.scene?.remove(this.cloud);this.cloud.geometry.dispose();this.cloud.material.dispose();this.cloud=null;}super.destroy();}
}
