import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {DesignViewport,presetViewBounds,framePresetCamera} from '../src/frontend/designer/DesignViewport.js';

const corners=b=>[...new Set([b.min.x,b.max.x])].flatMap(x=>[...new Set([b.min.y,b.max.y])].flatMap(y=>[...new Set([b.min.z,b.max.z])].map(z=>new THREE.Vector3(x,y,z))));
const contains=(camera,bounds)=>{camera.updateProjectionMatrix();camera.updateMatrixWorld(true);for(const corner of corners(bounds)){const p=corner.clone().project(camera);assert(Math.abs(p.x)<=1+1e-7&&Math.abs(p.y)<=1+1e-7&&p.z>=-1-1e-7&&p.z<=1+1e-7,`world corner must be visible: ${p.toArray()}`);}};
const extent=bounds=>bounds.getSize(new THREE.Vector3());
for(const shape of [[34,9,.7],[8,35,6],[12,.2,45],[80,180,30],[.1,.2,.1]])for(const aspect of [16/9,1,375/812])for(const value of ['front','side','top']){
 const bounds=new THREE.Box3(new THREE.Vector3(-shape[0]/2,-2,-shape[2]/2),new THREE.Vector3(shape[0]/2,shape[1]-2,shape[2]/2)),camera=new THREE.PerspectiveCamera(45,aspect,.1,200),controls={target:new THREE.Vector3(),minDistance:3,maxDistance:80,update(){camera.lookAt(this.target);}};
 assert(framePresetCamera(camera,controls,bounds,value));contains(camera,bounds);const distance=camera.position.distanceTo(controls.target);assert(distance>=3-1e-7&&distance<=controls.maxDistance+1e-7);
 if(value==='front'){assert.equal(camera.position.x,controls.target.x);assert(camera.position.z>controls.target.z);}
 if(value==='side'){assert.equal(camera.position.z,controls.target.z);assert(camera.position.x>controls.target.x);}
 if(value==='top')assert(camera.position.y>controls.target.y);
 if(shape[0]===34&&aspect===16/9&&value==='front'){const left=new THREE.Vector3(bounds.min.x,2,0).project(camera),right=new THREE.Vector3(bounds.max.x,2,0).project(camera);assert(right.x-left.x>1.55,'wide charts should use at least 77.5% of screen width');}
}
const group=new THREE.Group(),floor=new THREE.Mesh(new THREE.BoxGeometry(80,.1,80));floor.userData.kind='room';group.add(floor);
const subject=new THREE.Mesh(new THREE.BoxGeometry(6,4,2));subject.position.set(3,4,1);subject.userData.kind='object';group.add(subject);
const hiddenGroup=new THREE.Group(),hidden=new THREE.Mesh(new THREE.BoxGeometry(200,200,200));hiddenGroup.visible=false;hiddenGroup.add(hidden);group.add(hiddenGroup);
const helper=new THREE.Mesh(new THREE.BoxGeometry(300,300,300));helper.userData.kind='vertex';group.add(helper);
const primary=presetViewBounds(group);assert.deepEqual(extent(primary).toArray(),[6,4,2]);assert.deepEqual(primary.getCenter(new THREE.Vector3()).toArray(),[3,4,1]);
group.remove(subject);const floorSize=extent(presetViewBounds(group));assert.equal(floorSize.x,80);assert.equal(floorSize.z,80);assert(Math.abs(floorSize.y-.1)<1e-6,'floor-only scene falls back to visible floor geometry');
const mass=new THREE.Mesh(new THREE.BoxGeometry(8,20,6));mass.userData.kind='room';group.add(mass);assert.deepEqual(extent(presetViewBounds(group)).toArray(),[8,20,6],'coarse building masses remain meaningful');
const viewport=Object.assign(new DesignViewport({mode:'scene'}),{walk:{stop(){this.stopped=true;}},design:{group},camera:new THREE.PerspectiveCamera(45,16/9,.1,200),controls:{target:new THREE.Vector3(),minDistance:3,maxDistance:80,update(){}},fit(){this.fitCalls=(this.fitCalls||0)+1;},invalidate(){this.invalidated=true;}});
viewport.preset('front');assert(viewport.walk.stopped);assert.equal(viewport.fitCalls,undefined,'geometry presets do not reuse distant overview fit');assert(viewport.invalidated);viewport.preset('overview');assert.equal(viewport.fitCalls,1,'existing overview fit remains in use');
for(const mesh of [floor,subject,hidden,helper,mass]){mesh.geometry.dispose();mesh.material.dispose();}
console.log('PASS preset framing: wide/tall/deep/portrait bounds fit the camera frustum, broad floors and hidden/helpers do not dilute subjects, floor-only/coarse mass fallback, camera distance and overview compatibility.');
